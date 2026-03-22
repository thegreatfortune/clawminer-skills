import {
  createPublicClient,
  http,
  formatEther,
  formatUnits,
  parseAbi,
  type PublicClient,
} from 'viem'
import { polygon } from 'viem/chains'
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'
import Database from 'better-sqlite3'
import path from 'path'
import os from 'os'
import fs from 'fs'

// ─── DB helpers ───────────────────────────────────────────────────────────────

function getDataDir(): string {
  return process.env.CLAWMINER_DATA_DIR || path.join(os.homedir(), '.clawminer')
}

function getDbPath(): string {
  return path.join(getDataDir(), 'tasks.db')
}

function getRuntimeConfigPath(): string {
  return path.join(getDataDir(), 'runtime.config.json')
}

type RuntimeConfig = {
  globalRpcUrl?: string
  rpcByWallet?: Record<string, string>
}

function openDb(): Database.Database {
  const dataDir = getDataDir()
  fs.mkdirSync(dataDir, { recursive: true })
  const db = new Database(getDbPath())
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}

// ─── Schema init (noop — schema handled by db.ts initDb) ──────────────────────

export function initWalletTable(): void {
  // noop: wallet table is created by db.ts initDb()
}

// ─── RPC / client helpers ─────────────────────────────────────────────────────

function normalizeRpcUrl(url: string): string {
  return String(url ?? '').trim()
}

function isValidHttpUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function readRuntimeConfig(): RuntimeConfig {
  try {
    const p = getRuntimeConfigPath()
    if (!fs.existsSync(p)) return {}
    const raw = fs.readFileSync(p, 'utf-8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return {
      globalRpcUrl:
        typeof parsed.globalRpcUrl === 'string' ? parsed.globalRpcUrl : undefined,
      rpcByWallet:
        parsed.rpcByWallet && typeof parsed.rpcByWallet === 'object'
          ? parsed.rpcByWallet
          : {},
    }
  } catch {
    return {}
  }
}

function writeRuntimeConfig(cfg: RuntimeConfig): void {
  const dataDir = getDataDir()
  fs.mkdirSync(dataDir, { recursive: true })
  const p = getRuntimeConfigPath()
  fs.writeFileSync(
    p,
    JSON.stringify(
      {
        globalRpcUrl: cfg.globalRpcUrl,
        rpcByWallet: cfg.rpcByWallet ?? {},
      },
      null,
      2,
    ),
    'utf-8',
  )
}

function getStoredWalletAddress(): string | null {
  try {
    const db = openDb()
    const row = db
      .prepare('SELECT address FROM wallet ORDER BY id DESC LIMIT 1')
      .get() as { address: string } | undefined
    db.close()
    return row?.address?.toLowerCase() ?? null
  } catch {
    return null
  }
}

export function getRpcUrl(): string | undefined {
  // Priority:
  // 1) explicit env var
  // 2) per-wallet local persisted config
  // 3) global local persisted config
  // 4) viem chain default endpoint
  const envRpc = normalizeRpcUrl(process.env.POLYGON_RPC_URL ?? '')
  if (envRpc) return envRpc

  const cfg = readRuntimeConfig()
  const wallet = getStoredWalletAddress()
  if (wallet) {
    const walletRpc = cfg.rpcByWallet?.[wallet]
    if (walletRpc) return normalizeRpcUrl(walletRpc)
  }
  if (cfg.globalRpcUrl) return normalizeRpcUrl(cfg.globalRpcUrl)
  return undefined
}

export function getPublicClient(): PublicClient {
  return createPublicClient({ chain: polygon, transport: http(getRpcUrl()) })
}

// ─── Internal: used by contract.ts, never exposed as a tool ──────────────────

/**
 * Reads the stored private key from SQLite and returns a viem PrivateKeyAccount.
 * This function must NEVER be exposed as a tool — the private key must not
 * appear in any conversation turn.
 */
export async function getSignerAccount(): Promise<PrivateKeyAccount> {
  const db = openDb()
  const row = db
    .prepare('SELECT private_key FROM wallet ORDER BY id DESC LIMIT 1')
    .get() as { private_key: string } | undefined
  db.close()

  if (!row) {
    throw new Error('No wallet found. Run clawcore setup first.')
  }

  return privateKeyToAccount(row.private_key as `0x${string}`)
}

// ─── Tool: generate_burner_wallet ────────────────────────────────────────────

/**
 * Generates a new random Ethereum wallet and persists the private key to SQLite.
 * The private key is NEVER returned in the response — only the address is shown.
 */
export async function generateBurnerWallet(): Promise<string> {
  try {
    const privateKey = generatePrivateKey()
    const account = privateKeyToAccount(privateKey)
    const db = openDb()

    const existing = db
      .prepare('SELECT address FROM wallet ORDER BY id DESC LIMIT 1')
      .get() as { address: string } | undefined

    if (existing) {
      db.close()
      return JSON.stringify({
        error: `A wallet already exists at address ${existing.address}. Use the existing wallet or delete the database to start fresh.`,
        existingAddress: existing.address,
      })
    }

    db.prepare(
      `INSERT INTO wallet (address, private_key, mnemonic, created_at)
       VALUES (?, ?, ?, strftime('%s', 'now'))`,
    ).run(account.address, privateKey, null)
    db.close()

    return JSON.stringify(
      {
        address: account.address,
        instruction: [
          `Wallet generated and stored securely in local database at ${getDbPath()}.`,
          `Address: ${account.address}`,
          `Next step: Fund this address with at least 1 POL on Polygon to cover gas fees.`,
          `Do NOT store large amounts of funds in this wallet.`,
          `The private key is stored locally and will never appear in this conversation.`,
        ].join('\n'),
      },
      null,
      2,
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return JSON.stringify({ error: msg })
  }
}

// ─── Tool: get_wallet_info ────────────────────────────────────────────────────

/**
 * Returns the stored wallet address and its current POL balance on Polygon.
 * Safe to call at any time — reads address from DB, never touches the private key.
 */
export async function getWalletInfo(): Promise<string> {
  try {
    const db = openDb()
    const row = db
      .prepare('SELECT address FROM wallet ORDER BY id DESC LIMIT 1')
      .get() as { address: string } | undefined
    db.close()

    if (!row) {
      return JSON.stringify({ error: 'No wallet found. Run clawcore setup first.' })
    }

    const client = getPublicClient()
    const balance = await client.getBalance({ address: row.address as `0x${string}` })

    return JSON.stringify({
      address: row.address,
      balancePOL: formatEther(balance),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return JSON.stringify({ error: msg })
  }
}

// ─── Tool: get_token_balance ──────────────────────────────────────────────────

const ERC20_READ_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
])

/**
 * Returns the ERC-20 token balance of the stored wallet for a given token address.
 */
export async function getTokenBalance(tokenAddress: string): Promise<string> {
  try {
    const db = openDb()
    const row = db
      .prepare('SELECT address FROM wallet ORDER BY id DESC LIMIT 1')
      .get() as { address: string } | undefined
    db.close()

    if (!row) {
      return JSON.stringify({ error: 'No wallet found. Run clawcore setup first.' })
    }

    const client = getPublicClient()
    const token = tokenAddress as `0x${string}`
    const wallet = row.address as `0x${string}`

    const [rawBalance, decimals, symbol] = await Promise.all([
      client.readContract({ address: token, abi: ERC20_READ_ABI, functionName: 'balanceOf', args: [wallet] }),
      client.readContract({ address: token, abi: ERC20_READ_ABI, functionName: 'decimals' }),
      client.readContract({ address: token, abi: ERC20_READ_ABI, functionName: 'symbol' }),
    ])

    return JSON.stringify({
      address: row.address,
      tokenAddress,
      symbol,
      balance: formatUnits(rawBalance as bigint, decimals as number),
      rawBalance: (rawBalance as bigint).toString(),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return JSON.stringify({ error: msg })
  }
}

// ─── Tool: runtime RPC config ────────────────────────────────────────────────

export async function getRpcConfig(): Promise<string> {
  try {
    const envRpc = normalizeRpcUrl(process.env.POLYGON_RPC_URL ?? '')
    const cfg = readRuntimeConfig()
    const wallet = getStoredWalletAddress()
    const walletRpcRaw = wallet ? cfg.rpcByWallet?.[wallet] : undefined
    const walletRpc = walletRpcRaw ? normalizeRpcUrl(walletRpcRaw) : ''
    const globalRpc = normalizeRpcUrl(cfg.globalRpcUrl ?? '')
    const effectiveRpc = getRpcUrl()
    const source = envRpc
      ? 'env'
      : walletRpc
        ? 'wallet_local'
        : globalRpc
          ? 'global_local'
          : 'chain_default'

    return JSON.stringify({
      effectiveRpcUrl: effectiveRpc ?? null,
      source,
      defaultRpcUrl: null,
      isPublicDefault: false,
      walletAddress: wallet,
      walletRpcUrl: walletRpc || null,
      globalRpcUrl: globalRpc || null,
      guidance:
        source === 'chain_default'
          ? 'Using viem chain default RPC endpoint(s). For better reliability and rate limits, configure a private RPC (e.g., Alchemy/Infura).'
          : 'RPC override configured.',
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return JSON.stringify({ error: msg })
  }
}

export async function setRpcConfig(
  rpcUrl: string,
  scope: 'wallet' | 'global' = 'wallet',
): Promise<string> {
  try {
    const normalized = normalizeRpcUrl(rpcUrl)
    if (!normalized || !isValidHttpUrl(normalized)) {
      return JSON.stringify({
        error: 'Invalid RPC URL. Must be http(s) URL.',
      })
    }

    const cfg = readRuntimeConfig()
    cfg.rpcByWallet = cfg.rpcByWallet ?? {}

    if (scope === 'wallet') {
      const wallet = getStoredWalletAddress()
      if (!wallet) {
        return JSON.stringify({
          error:
            'No wallet found. Run generate_burner_wallet first, then set wallet-scoped RPC.',
        })
      }
      cfg.rpcByWallet[wallet] = normalized
      writeRuntimeConfig(cfg)
      return JSON.stringify({
        success: true,
        scope,
        walletAddress: wallet,
        rpcUrl: normalized,
        message: 'Wallet-scoped RPC saved and will be reused in future sessions.',
      })
    }

    cfg.globalRpcUrl = normalized
    writeRuntimeConfig(cfg)
    return JSON.stringify({
      success: true,
      scope,
      rpcUrl: normalized,
      message: 'Global RPC saved and will be reused in future sessions.',
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return JSON.stringify({ error: msg })
  }
}
