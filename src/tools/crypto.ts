import { keccak256, encodePacked } from "viem"
import crypto from "crypto"
import path from "path"
import { fileURLToPath } from "url"
import Database from "better-sqlite3"
import os from "os"
import fs from "fs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── Constants ────────────────────────────────────────────────────────────────

const SNARK_SCALAR_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n

// ─── DB helpers ───────────────────────────────────────────────────────────────

function getDataDir(): string {
  return process.env.CLAWMINER_DATA_DIR || path.join(os.homedir(), ".clawminer")
}

function getDbPath(): string {
  return path.join(getDataDir(), "tasks.db")
}

function openDb(): Database.Database {
  const dataDir = getDataDir()
  fs.mkdirSync(dataDir, { recursive: true })
  const db = new Database(getDbPath())
  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")
  return db
}

// ─── Random field element helper ──────────────────────────────────────────────

function randomFieldElement(): bigint {
  while (true) {
    const buf = crypto.randomBytes(32)
    const n = BigInt("0x" + buf.toString("hex"))
    if (n < SNARK_SCALAR_FIELD) return n
  }
}

function to32ByteHex(n: bigint): string {
  return n.toString(16).padStart(64, "0")
}

// ─── Tool: generate_commit_proof ──────────────────────────────────────────────

interface GenerateCommitProofArgs {
  taskId: bigint
  questionIndex: number
  walletAddress: string
  outcomeIndex: number
  creatorPubKeyX: bigint
  creatorPubKeyY: bigint
  chainId: number
}

/**
 * Generates a ZK proof for committing to a prediction outcome using the
 * CommitReveal circuit. Returns all fields needed for the commitTask contract call.
 */
export async function generateCommitProof(
  args: GenerateCommitProofArgs,
): Promise<string> {
  try {
    const {
      taskId,
      questionIndex,
      walletAddress,
      outcomeIndex,
      creatorPubKeyX,
      creatorPubKeyY,
      chainId,
    } = args

    if (!Number.isInteger(questionIndex) || questionIndex < 0) {
      return JSON.stringify({
        error: "questionIndex must be an integer >= 0",
      })
    }
    if (
      !Number.isInteger(outcomeIndex) ||
      (outcomeIndex !== 0 && outcomeIndex !== 1)
    ) {
      return JSON.stringify({
        error: "outcomeIndex must be 0 or 1",
      })
    }

    // Dynamically import snarkjs to avoid top-level ESM issues
    const { groth16 } = await import("snarkjs")

    // Derive domain
    const domain =
      BigInt(
        keccak256(
          encodePacked(
            ["string", "uint256"],
            ["CLAWMINER_COMMIT_V1", BigInt(chainId)],
          ),
        ),
      ) % SNARK_SCALAR_FIELD

    // minerAddr = uint160(walletAddress)
    const minerAddr = BigInt(walletAddress)

    // Random private inputs
    const salt = randomFieldElement()
    const ephPriv = randomFieldElement()

    // Circuit input (all as decimal strings per snarkjs convention)
    const input = {
      domain: domain.toString(),
      taskId: taskId.toString(),
      minerAddr: minerAddr.toString(),
      creatorPubKeyX: creatorPubKeyX.toString(),
      creatorPubKeyY: creatorPubKeyY.toString(),
      questionIndex: questionIndex.toString(),
      outcomeIndex: outcomeIndex.toString(),
      salt: salt.toString(),
      ephPriv: ephPriv.toString(),
    }

    const wasmPath = path.join(__dirname, "../circuits/CommitReveal.wasm")
    const zkeyPath = path.join(__dirname, "../circuits/CommitReveal_final.zkey")

    const { proof, publicSignals } = await groth16.fullProve(
      input,
      wasmPath,
      zkeyPath,
    )

    // Extract cipher fields from publicSignals
    // [0]=commitHash, [1]=ephPubX, [2]=ephPubY, [3]=cipher0, [4]=cipher1
    const commitHash = publicSignals[0] as string
    const ephPubX = publicSignals[1] as string
    const ephPubY = publicSignals[2] as string
    const cipher0 = publicSignals[3] as string
    const cipher1 = publicSignals[4] as string

    // Convert Groth16 proof to Solidity calldata format
    // pB needs column-major swap: [[b[0][1], b[0][0]], [b[1][1], b[1][0]]]
    const piB = proof.pi_b as string[][]
    const pA: [string, string] = [proof.pi_a[0]!, proof.pi_a[1]!]
    const pB: [[string, string], [string, string]] = [
      [piB[0]![1]!, piB[0]![0]!],
      [piB[1]![1]!, piB[1]![0]!],
    ]
    const pC: [string, string] = [proof.pi_c[0]!, proof.pi_c[1]!]

    return JSON.stringify({
      commitHash,
      ephPubX,
      ephPubY,
      cipher0,
      cipher1,
      salt: salt.toString(),
      pA,
      pB,
      pC,
      pubSignals: publicSignals as string[],
    })
  } catch (err: any) {
    return JSON.stringify({
      error: `generateCommitProof failed: ${err.message}`,
    })
  }
}

// ─── Tool: generate_creator_keypair ───────────────────────────────────────────

/**
 * Generates a Baby Jubjub keypair for the task creator.
 * The private key is stored in the DB and never returned.
 * Returns { pubKeyX, pubKeyY, pubKeyHex } — the public key fields needed for createTask.
 */
export async function generateCreatorKeypair(): Promise<string> {
  try {
    const { buildBabyjub } = await import("circomlibjs")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const babyjub: any = await buildBabyjub()

    // Generate random private key, reduced mod babyjub order
    let privKeyBig: bigint
    const order: bigint = babyjub.order as bigint
    while (true) {
      const buf = crypto.randomBytes(32)
      privKeyBig = BigInt("0x" + Buffer.from(buf).toString("hex")) % order
      if (privKeyBig > 0n) {
        break
      }
    }

    const privKeyHex = to32ByteHex(privKeyBig)

    // Compute public key: pubKey = privKey * Base8
    const pubKey = babyjub.mulPointEscalar(babyjub.Base8, privKeyBig)
    const pubKeyX: bigint = babyjub.F.toObject(pubKey[0]) as bigint
    const pubKeyY: bigint = babyjub.F.toObject(pubKey[1]) as bigint
    // Store full public key as x||y bytes for createTask creatorPubKey.
    const pubKeyHex = "0x" + to32ByteHex(pubKeyX) + to32ByteHex(pubKeyY)

    // Store in DB
    const db = openDb()
    db.exec(
      `CREATE TABLE IF NOT EXISTS creator_keypairs (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        pub_key_x    TEXT    NOT NULL,
        pub_key_y    TEXT    NOT NULL,
        pub_key_hex  TEXT    NOT NULL DEFAULT '',
        priv_key_hex TEXT    NOT NULL,
        created_at   INTEGER NOT NULL
      )`,
    )
    const cols = db
      .prepare(`PRAGMA table_info(creator_keypairs)`)
      .all() as Array<{ name: string }>
    if (!cols.some((c) => c.name === "pub_key_hex")) {
      db.exec(
        `ALTER TABLE creator_keypairs ADD COLUMN pub_key_hex TEXT NOT NULL DEFAULT ''`,
      )
    }
    db.prepare(
      `INSERT INTO creator_keypairs (pub_key_x, pub_key_y, pub_key_hex, priv_key_hex, created_at)
       VALUES (?, ?, ?, ?, strftime('%s', 'now'))`,
    ).run(pubKeyX.toString(), pubKeyY.toString(), pubKeyHex, privKeyHex)
    db.close()

    return JSON.stringify({
      pubKeyX: pubKeyX.toString(),
      pubKeyY: pubKeyY.toString(),
      pubKeyHex,
    })
  } catch (err: any) {
    return JSON.stringify({
      error: `generateCreatorKeypair failed: ${err.message}`,
    })
  }
}

// ─── Tool: get_creator_keypair ────────────────────────────────────────────────

/**
 * Loads the most recent creator keypair from the DB.
 * Returns { keypair: null } if none exists.
 */
export async function getCreatorKeypair(): Promise<string> {
  try {
    const { buildBabyjub } = await import("circomlibjs")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const babyjub: any = await buildBabyjub()

    const db = openDb()
    db.exec(
      `CREATE TABLE IF NOT EXISTS creator_keypairs (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        pub_key_x    TEXT    NOT NULL,
        pub_key_y    TEXT    NOT NULL,
        pub_key_hex  TEXT    NOT NULL DEFAULT '',
        priv_key_hex TEXT    NOT NULL,
        created_at   INTEGER NOT NULL
      )`,
    )
    const cols = db
      .prepare(`PRAGMA table_info(creator_keypairs)`)
      .all() as Array<{ name: string }>
    if (!cols.some((c) => c.name === "pub_key_hex")) {
      db.exec(
        `ALTER TABLE creator_keypairs ADD COLUMN pub_key_hex TEXT NOT NULL DEFAULT ''`,
      )
    }
    const row = db
      .prepare(
        `SELECT pub_key_x, pub_key_y, pub_key_hex FROM creator_keypairs ORDER BY id DESC LIMIT 1`,
      )
      .get() as
      | { pub_key_x: string; pub_key_y: string; pub_key_hex?: string }
      | undefined
    db.close()

    if (!row) {
      return JSON.stringify({ keypair: null })
    }

    let pubKeyHex = row.pub_key_hex ?? ""
    if (!pubKeyHex || pubKeyHex === "0x") {
      const x = babyjub.F.e(row.pub_key_x)
      const y = babyjub.F.e(row.pub_key_y)
      const pubX: bigint = babyjub.F.toObject(x) as bigint
      const pubY: bigint = babyjub.F.toObject(y) as bigint
      pubKeyHex = "0x" + to32ByteHex(pubX) + to32ByteHex(pubY)
    }

    return JSON.stringify({
      keypair: {
        pubKeyX: row.pub_key_x,
        pubKeyY: row.pub_key_y,
        pubKeyHex,
      },
    })
  } catch (err: any) {
    return JSON.stringify({ error: `getCreatorKeypair failed: ${err.message}` })
  }
}

// ─── Tool: decrypt_miner_prediction ───────────────────────────────────────────

/**
 * Decrypts a miner's committed prediction using the creator's Baby Jubjub private key.
 * Recovers outcomeIndex and salt from the on-chain cipher fields.
 */
export async function decryptMinerPrediction(
  ephPubX: string,
  ephPubY: string,
  cipher0: string,
  cipher1: string,
): Promise<string> {
  try {
    const db = openDb()
    const row = db
      .prepare(
        `SELECT priv_key_hex FROM creator_keypairs ORDER BY id DESC LIMIT 1`,
      )
      .get() as { priv_key_hex: string } | undefined
    db.close()

    if (!row) {
      return JSON.stringify({
        error: "No creator keypair found. Run generate_creator_keypair first.",
      })
    }

    const { buildBabyjub } = await import("circomlibjs")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const babyjub: any = await buildBabyjub()

    const privKey = BigInt("0x" + row.priv_key_hex)

    // Reconstruct ephemeral public key point from field elements
    const ephPubPoint = [babyjub.F.e(ephPubX), babyjub.F.e(ephPubY)]

    // sharedSecret = privKey * ephPub
    const sharedSecret = babyjub.mulPointEscalar(ephPubPoint, privKey)
    const sharedX: bigint = babyjub.F.toObject(sharedSecret[0]) as bigint
    const sharedY: bigint = babyjub.F.toObject(sharedSecret[1]) as bigint

    // cipher0 = (questionIndex * 2 + outcomeIndex) + shared.out[0]
    // cipher1 = salt + shared.out[1]
    const c0 = BigInt(cipher0)
    const c1 = BigInt(cipher1)

    const packed =
      (((c0 - sharedX) % SNARK_SCALAR_FIELD) + SNARK_SCALAR_FIELD) %
      SNARK_SCALAR_FIELD
    const questionIndex = Number(packed >> 1n)
    const outcomeIndex = Number(packed & 1n)

    const saltBig =
      (((c1 - sharedY) % SNARK_SCALAR_FIELD) + SNARK_SCALAR_FIELD) %
      SNARK_SCALAR_FIELD

    if (outcomeIndex !== 0 && outcomeIndex !== 1) {
      return JSON.stringify({
        error: `Decrypted outcomeIndex must be binary (0/1), got ${outcomeIndex}. Wrong keypair or corrupted data.`,
      })
    }

    return JSON.stringify({
      questionIndex,
      outcomeIndex,
      salt: saltBig.toString(),
    })
  } catch (err: any) {
    return JSON.stringify({
      error: `decryptMinerPrediction failed: ${err.message}`,
    })
  }
}

// ─── ECIES helpers ────────────────────────────────────────────────────────────

/**
 * Parses an secp256k1 public key from a hex string.
 * Accepts uncompressed (65 bytes, prefix 04) or compressed (33 bytes, prefix 02/03).
 */
function parsePublicKey(hex: string): Buffer {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex
  const buf = Buffer.from(clean, "hex")

  if (buf.length === 65 && buf[0] === 0x04) return buf
  if (buf.length === 33 && (buf[0] === 0x02 || buf[0] === 0x03)) return buf

  throw new Error(
    `Invalid public key: expected 33 bytes (compressed) or 65 bytes (uncompressed), ` +
      `got ${buf.length} bytes`,
  )
}

/**
 * Encrypts `plaintext` to `recipientPubkey` using ECIES over secp256k1.
 *
 * Wire format (hex-encoded):
 *   ephemeralPubkey (65 bytes) | iv (12 bytes) | authTag (16 bytes) | encrypted (n bytes)
 */
function eciesEncrypt(recipientPubkeyHex: string, plaintext: Buffer): string {
  const recipientPub = parsePublicKey(recipientPubkeyHex)

  const ephemeral = crypto.createECDH("secp256k1")
  ephemeral.generateKeys()

  const sharedSecret = ephemeral.computeSecret(recipientPub)
  const encKey = crypto.createHash("sha256").update(sharedSecret).digest()

  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", encKey, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()

  const result = Buffer.concat([
    ephemeral.getPublicKey(),
    iv,
    authTag,
    encrypted,
  ])
  return result.toString("hex")
}

// ─── Tool: encrypt_bounty_payload ─────────────────────────────────────────────

/**
 * For bounty events: generates a one-time AES-256-GCM session key K, encrypts
 * the prediction summary, then wraps K for both the bounty creator and the protocol
 * using ECIES (secp256k1).
 */
export async function encryptBountyPayload(
  summary: string,
  bountyCreatorPubkey: string,
): Promise<string> {
  try {
    const protocolPubkey = process.env.CLAWMINER_PROTOCOL_PUBKEY
    if (!protocolPubkey) {
      return JSON.stringify({
        error: "CLAWMINER_PROTOCOL_PUBKEY not set in environment",
      })
    }

    const K = crypto.randomBytes(32)

    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv("aes-256-gcm", K, iv)
    const encrypted = Buffer.concat([
      cipher.update(Buffer.from(summary, "utf8")),
      cipher.final(),
    ])
    const authTag = cipher.getAuthTag()
    const ciphertext = Buffer.concat([iv, authTag, encrypted]).toString("hex")

    const encKForCreator = eciesEncrypt(bountyCreatorPubkey, K)
    const encKForProtocol = eciesEncrypt(protocolPubkey, K)

    return JSON.stringify({ ciphertext, encKForCreator, encKForProtocol })
  } catch (err: any) {
    return JSON.stringify({ error: err.message })
  }
}
