import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  formatUnits,
  parseAbi,
  decodeEventLog,
  pad,
  maxUint256,
  zeroAddress,
  type Abi,
  type PublicClient,
  type WalletClient,
} from "viem"
import { polygon } from "viem/chains"
import type { PrivateKeyAccount } from "viem/accounts"
import * as dotenv from "dotenv"
import { getSignerAccount, getRpcUrl } from "./wallet.js"
import {
  getCreatorTaskRecord,
  updateCreatorTaskCreatedBlock,
  getCreatorTaskCommitCursor,
  saveCreatorTaskCommits,
  getCreatorTaskCommittedLogs,
  getDecryptedSignals,
  saveCreatorProvenAgents,
} from "./db.js"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── Protocol Addresses (Polygon Mainnet) ─────────────────────────────────────
// ClawIdentity and ClawToken are resolved on-chain via ClawCore view functions.

const PROTOCOL_ADDRESSES = {
  clawCore: "0x26dC6463d492E39D02441cE942c03a4d72D958bE" as `0x${string}`,
  clawToken: "0x5a4027C8EB7bc069FC8C208107e83d433f4D4452" as `0x${string}`,
  clawIdentity: "0xB0a6D8c766003dEB11293d17895540358525d835" as `0x${string}`,
  network: "Polygon Mainnet",
  chainId: 137,
} as const

const CORE_ADDRESS = PROTOCOL_ADDRESSES.clawCore
const CORE_DEPLOY_BLOCK = 84489707n

/** Returns protocol addresses as a JSON string. Exposed as a tool. */
export function getProtocolAddresses(): string {
  return JSON.stringify(PROTOCOL_ADDRESSES)
}

export async function getLatestBlockNumber(): Promise<string> {
  try {
    const publicClient = getPublicClient()
    const [blockNumber, block] = await Promise.all([
      publicClient.getBlockNumber(),
      publicClient.getBlock(),
    ])
    const blockTimestamp = Number(block.timestamp)
    return JSON.stringify({
      blockNumber: blockNumber.toString(),
      blockTimestamp,
      blockTimestampIso: new Date(blockTimestamp * 1000).toISOString(),
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return JSON.stringify({ error: `getLatestBlockNumber failed: ${msg}` })
  }
}

// ─── ABI Loading ──────────────────────────────────────────────────────────────

const CORE_ABI_PATH = path.resolve(__dirname, "../contracts/ClawCore.json")
const IDENTITY_ABI_PATH = path.resolve(
  __dirname,
  "../contracts/ClawIdentity.json",
)

function loadAbiFromArtifact(filePath: string): Abi {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"))
  if (Array.isArray(parsed)) return parsed as Abi
  if (parsed && Array.isArray(parsed.abi)) return parsed.abi as Abi
  throw new Error(`Invalid ABI artifact: ${filePath}`)
}

const CORE_ABI = loadAbiFromArtifact(CORE_ABI_PATH)
const IDENTITY_ABI = loadAbiFromArtifact(IDENTITY_ABI_PATH)

const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
])
const CTF_ABI = parseAbi([
  "function payoutDenominator(bytes32 conditionId) view returns (uint256)",
  "function payoutNumerators(bytes32 conditionId, uint256 index) view returns (uint256)",
])
const NEGRISK_ADAPTER_ABI = parseAbi([
  "function getQuestionCount(bytes32 marketId) view returns (uint256)",
  "function getConditionId(bytes32 questionId) view returns (bytes32)",
  "function getDetermined(bytes32 marketId) view returns (bool)",
  "function getResult(bytes32 marketId) view returns (uint256)",
])

async function getTokenDecimals(
  publicClient: PublicClient,
  tokenAddress: `0x${string}`,
): Promise<number> {
  try {
    const d = (await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "decimals",
    })) as number
    return Number(d)
  } catch {
    return 6
  }
}

async function formatTokenAmount(
  publicClient: PublicClient,
  tokenAddress: `0x${string}`,
  amount: bigint,
): Promise<string> {
  const decimals = await getTokenDecimals(publicClient, tokenAddress)
  return formatUnits(amount, decimals)
}

// ─── Client helpers ───────────────────────────────────────────────────────────

function getPublicClient(): PublicClient {
  return createPublicClient({ chain: polygon, transport: http(getRpcUrl()) })
}

type WriteClients = {
  account: PrivateKeyAccount
  publicClient: PublicClient
  walletClient: WalletClient
}

async function getWriteClients(): Promise<WriteClients> {
  const account = await getSignerAccount()
  const transport = http(getRpcUrl())
  return {
    account,
    publicClient: createPublicClient({ chain: polygon, transport }),
    walletClient: createWalletClient({ account, chain: polygon, transport }),
  }
}

// ─── ERC-20 auto-approve helper ───────────────────────────────────────────────

async function ensureErc20Allowance(
  tokenAddress: `0x${string}`,
  spender: `0x${string}`,
  requiredAmount: bigint,
  account: PrivateKeyAccount,
  publicClient: PublicClient,
  walletClient: WalletClient,
): Promise<void> {
  const allowance = (await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [account.address, spender],
  })) as bigint

  if (allowance < requiredAmount) {
    const { request } = await publicClient.simulateContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [spender, maxUint256],
      account,
    })
    const hash = await walletClient.writeContract(request)
    await publicClient.waitForTransactionReceipt({ hash })
  }
}

// ─── Misc helpers ─────────────────────────────────────────────────────────────

/** Normalises a hex string to a 32-byte (bytes32) `0x…` value. */
function toBytes32(value: string): `0x${string}` {
  const hex = (value.startsWith("0x") ? value : `0x${value}`) as `0x${string}`
  return hex.length === 66 ? hex : pad(hex, { size: 32 })
}

function addToBytes32(value: `0x${string}`, offset: bigint): `0x${string}` {
  const v = BigInt(value) + offset
  return pad(`0x${v.toString(16)}` as `0x${string}`, { size: 32 })
}

type NormalizedTaskData = {
  creator: string
  commitEndTime: bigint
  revealEndTime: bigint
  isResolved: boolean
  targetId: string
  bountyToken: `0x${string}`
  maxMiners: bigint
  minMiners: bigint
  minCommits: bigint
  currentMiners: bigint
  totalRevealed: bigint
  totalCorrectYes: bigint
  totalCorrectNo: bigint
  minWinRateBps: bigint
  settledEmissionRate: bigint
  snapshotProtocolFeeBps: bigint
  snapshotAutoLpFeeBps: bigint
  maxInvalidCommits: bigint
  fundsSettled: boolean
  isWhitelistedToken: boolean
  isNegRisk: boolean
  provenLostCount: bigint
  bountyAmount: bigint
  requiredStake: bigint
  settledNetBounty: bigint
  settledMinerClawOutput: bigint
  creatorPubKeyX: bigint
  creatorPubKeyY: bigint
  questionCount: bigint
}

function normalizeTaskData(raw: unknown): NormalizedTaskData {
  const rec =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null
  const tuple = Array.isArray(raw) ? (raw as unknown[]) : null

  const pick = (key: string, index: number): unknown => {
    const v = rec?.[key]
    if (v !== undefined) return v
    return tuple?.[index]
  }

  const creator = pick("creator", 0)
  const bountyToken = pick("bountyToken", 5)
  if (typeof creator !== "string" || typeof bountyToken !== "string") {
    throw new Error("InvalidTaskShape")
  }

  return {
    creator,
    commitEndTime: BigInt(pick("commitEndTime", 1) as bigint | number | string),
    revealEndTime: BigInt(pick("revealEndTime", 2) as bigint | number | string),
    isResolved: Boolean(pick("isResolved", 3)),
    targetId: String(pick("targetId", 4)),
    bountyToken: bountyToken as `0x${string}`,
    maxMiners: BigInt(pick("maxMiners", 6) as bigint | number | string),
    minMiners: BigInt(pick("minMiners", 7) as bigint | number | string),
    minCommits: BigInt(pick("minCommits", 8) as bigint | number | string),
    currentMiners: BigInt(pick("currentMiners", 9) as bigint | number | string),
    totalRevealed: BigInt(
      pick("totalRevealed", 10) as bigint | number | string,
    ),
    totalCorrectYes: BigInt(
      pick("totalCorrectYes", 11) as bigint | number | string,
    ),
    totalCorrectNo: BigInt(
      pick("totalCorrectNo", 12) as bigint | number | string,
    ),
    minWinRateBps: BigInt(
      pick("minWinRateBps", 13) as bigint | number | string,
    ),
    settledEmissionRate: BigInt(
      pick("settledEmissionRate", 14) as bigint | number | string,
    ),
    snapshotProtocolFeeBps: BigInt(
      pick("snapshotProtocolFeeBps", 15) as bigint | number | string,
    ),
    snapshotAutoLpFeeBps: BigInt(
      pick("snapshotAutoLpFeeBps", 16) as bigint | number | string,
    ),
    maxInvalidCommits: BigInt(
      pick("maxInvalidCommits", 17) as bigint | number | string,
    ),
    fundsSettled: Boolean(pick("fundsSettled", 18)),
    isWhitelistedToken: Boolean(pick("isWhitelistedToken", 19)),
    isNegRisk: Boolean(pick("isNegRisk", 20)),
    provenLostCount: BigInt(
      pick("provenLostCount", 21) as bigint | number | string,
    ),
    bountyAmount: BigInt(pick("bountyAmount", 22) as bigint | number | string),
    requiredStake: BigInt(
      pick("requiredStake", 23) as bigint | number | string,
    ),
    settledNetBounty: BigInt(
      pick("settledNetBounty", 24) as bigint | number | string,
    ),
    settledMinerClawOutput: BigInt(
      pick("settledMinerClawOutput", 25) as bigint | number | string,
    ),
    creatorPubKeyX: BigInt(
      pick("creatorPubKeyX", 26) as bigint | number | string,
    ),
    creatorPubKeyY: BigInt(
      pick("creatorPubKeyY", 27) as bigint | number | string,
    ),
    questionCount: BigInt(pick("questionCount", 28) as bigint | number | string),
  }
}

async function isTaskMarketSettled(
  publicClient: PublicClient,
  taskData: { targetId: string; isNegRisk: boolean },
): Promise<boolean> {
  const ctfAddress = (await publicClient.readContract({
    address: CORE_ADDRESS,
    abi: CORE_ABI,
    functionName: "ctf",
  })) as `0x${string}`

  const targetId = toBytes32(taskData.targetId as string)
  if (!taskData.isNegRisk) {
    const denom = (await publicClient.readContract({
      address: ctfAddress,
      abi: CTF_ABI,
      functionName: "payoutDenominator",
      args: [targetId],
    })) as bigint
    return denom > 0n
  }

  const negRiskAdapter = (await publicClient.readContract({
    address: CORE_ADDRESS,
    abi: CORE_ABI,
    functionName: "negRiskAdapter",
  })) as `0x${string}`

  const qCount = (await publicClient.readContract({
    address: negRiskAdapter,
    abi: NEGRISK_ADAPTER_ABI,
    functionName: "getQuestionCount",
    args: [targetId],
  })) as bigint
  if (qCount === 0n) return false

  for (let i = 0n; i < qCount; i++) {
    const questionId = addToBytes32(targetId, i)
    const conditionId = (await publicClient.readContract({
      address: negRiskAdapter,
      abi: NEGRISK_ADAPTER_ABI,
      functionName: "getConditionId",
      args: [questionId],
    })) as `0x${string}`
    const denom = (await publicClient.readContract({
      address: ctfAddress,
      abi: CTF_ABI,
      functionName: "payoutDenominator",
      args: [conditionId],
    })) as bigint
    if (denom === 0n) return false
  }
  return true
}

/**
 * Iterates receipt logs and returns the decoded args of the first matching event,
 * or null if the event is not found.
 */
function findEventArgs(
  logs: readonly { data: `0x${string}`; topics: readonly string[] }[],
  eventName: string,
): Record<string, unknown> | null {
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: CORE_ABI,
        data: log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      })
      if ((decoded as any).eventName === eventName) {
        return (decoded as any).args as Record<string, unknown>
      }
    } catch {
      // not this event — skip
    }
  }
  return null
}

// ─── Sponsor Tools ────────────────────────────────────────────────────────────

/**
 * Creates a new prediction task on ClawCore.
 * Auto-approves bountyToken ERC-20 transfer for bountyAmount before calling.
 */
export async function createTaskTx(
  targetId: string,
  isNegRisk: boolean,
  bountyToken: string,
  commitEndTime: number,
  maxMiners: number,
  minMiners: number,
  minCommits: number,
  minWinRateBps: number,
  requiredStake: string,
  bountyAmount: string,
  maxInvalidCommits: number,
  creatorPubKeyX: string,
  creatorPubKeyY: string,
  creatorPubKey: string,
): Promise<string> {
  try {
    const { account, publicClient, walletClient } = await getWriteClients()
    const latestBlock = await publicClient.getBlock()
    const chainNowTs = Number(latestBlock.timestamp)

    const targetIdBytes32 = toBytes32(targetId)
    const bountyAmountBig = BigInt(bountyAmount)
    const requiredStakeBig = BigInt(requiredStake)

    if (bountyAmountBig > 0n) {
      await ensureErc20Allowance(
        bountyToken as `0x${string}`,
        CORE_ADDRESS,
        bountyAmountBig,
        account,
        publicClient,
        walletClient,
      )
    }

    const { request } = await publicClient.simulateContract({
      address: CORE_ADDRESS,
      abi: CORE_ABI,
      functionName: "createTask",
      args: [
        targetIdBytes32,
        isNegRisk,
        bountyToken as `0x${string}`,
        BigInt(commitEndTime),
        BigInt(maxMiners),
        BigInt(minMiners),
        BigInt(minCommits),
        BigInt(minWinRateBps),
        requiredStakeBig,
        bountyAmountBig,
        maxInvalidCommits,
        BigInt(creatorPubKeyX),
        BigInt(creatorPubKeyY),
        creatorPubKey as `0x${string}`,
      ],
      account,
    })

    const hash = await walletClient.writeContract(request)
    const receipt = await publicClient.waitForTransactionReceipt({ hash })

    let taskId = "0"
    const args = findEventArgs(receipt.logs as any, "TaskCreated")
    if (args) taskId = (args.taskId as bigint).toString()

    return JSON.stringify({
      success: true,
      txHash: hash,
      taskId,
      blockNumber: receipt.blockNumber.toString(),
      debug: {
        commitEndTime,
        chainNowTs,
        secondsAhead: commitEndTime - chainNowTs,
      },
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    try {
      const publicClient = getPublicClient()
      const latestBlock = await publicClient.getBlock()
      const chainNowTs = Number(latestBlock.timestamp)
      return JSON.stringify({
        error: `createTaskTx failed: ${msg}`,
        debug: {
          commitEndTime,
          chainNowTs,
          secondsAhead: commitEndTime - chainNowTs,
        },
      })
    } catch {
      return JSON.stringify({
        error: `createTaskTx failed: ${msg}`,
        debug: { commitEndTime },
      })
    }
  }
}

// ─── Miner Tools ──────────────────────────────────────────────────────────────

/**
 * Commits a ZK proof and encrypted prediction to ClawCore.
 * If the task has a requiredStake > 0, auto-approves the stake token first.
 */
export async function commitTaskTx(
  taskId: string,
  commitHash: string,
  ephPubX: string,
  ephPubY: string,
  cipher0: string,
  cipher1: string,
  pA: [string, string],
  pB: [[string, string], [string, string]],
  pC: [string, string],
  pubSignals: string[],
): Promise<string> {
  try {
    const { account, publicClient, walletClient } = await getWriteClients()

    // Check requiredStake from on-chain task data
    const taskRaw = await publicClient.readContract({
      address: CORE_ADDRESS,
      abi: CORE_ABI,
      functionName: "tasks",
      args: [BigInt(taskId)],
    })
    const taskData = normalizeTaskData(taskRaw)

    if (taskData.requiredStake > 0n) {
      await ensureErc20Allowance(
        taskData.bountyToken,
        CORE_ADDRESS,
        taskData.requiredStake,
        account,
        publicClient,
        walletClient,
      )
    }

    const { request } = await publicClient.simulateContract({
      address: CORE_ADDRESS,
      abi: CORE_ABI,
      functionName: "commitTask",
      args: [
        BigInt(taskId),
        BigInt(commitHash),
        BigInt(ephPubX),
        BigInt(ephPubY),
        BigInt(cipher0),
        BigInt(cipher1),
        pA.map((v) => BigInt(v)) as [bigint, bigint],
        pB.map((row) => row.map((v) => BigInt(v))) as [
          [bigint, bigint],
          [bigint, bigint],
        ],
        pC.map((v) => BigInt(v)) as [bigint, bigint],
        pubSignals.map((v) => BigInt(v)),
      ],
      account,
    })

    const hash = await walletClient.writeContract(request)
    const receipt = await publicClient.waitForTransactionReceipt({ hash })

    return JSON.stringify({
      success: true,
      txHash: hash,
      blockNumber: receipt.blockNumber.toString(),
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return JSON.stringify({ error: `commitTaskTx failed: ${msg}` })
  }
}

/**
 * Reveals the miner's prediction after the commit window closes and the CTF resolves.
 */
export async function revealPredictionTx(
  taskId: string,
  questionIndex: number,
  outcomeIndex: number,
  salt: string,
): Promise<string> {
  try {
    const { account, publicClient, walletClient } = await getWriteClients()

    const { request } = await publicClient.simulateContract({
      address: CORE_ADDRESS,
      abi: CORE_ABI,
      functionName: "revealPrediction",
      args: [BigInt(taskId), questionIndex, outcomeIndex, BigInt(salt)],
      account,
    })

    const hash = await walletClient.writeContract(request)
    const receipt = await publicClient.waitForTransactionReceipt({ hash })

    return JSON.stringify({
      success: true,
      txHash: hash,
      blockNumber: receipt.blockNumber.toString(),
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return JSON.stringify({ error: `revealPredictionTx failed: ${msg}` })
  }
}

/**
 * Claims the bounty and CLAW rewards for a resolved task.
 */
export async function claimRewardTx(taskId: string): Promise<string> {
  try {
    const { account, publicClient, walletClient } = await getWriteClients()
    const taskRaw = await publicClient.readContract({
      address: CORE_ADDRESS,
      abi: CORE_ABI,
      functionName: "tasks",
      args: [BigInt(taskId)],
    })
    const taskData = normalizeTaskData(taskRaw)

    const { request } = await publicClient.simulateContract({
      address: CORE_ADDRESS,
      abi: CORE_ABI,
      functionName: "claimReward",
      args: [BigInt(taskId)],
      account,
    })

    const hash = await walletClient.writeContract(request)
    const receipt = await publicClient.waitForTransactionReceipt({ hash })

    let isWinner = false
    let tokenReward = "0"
    let clawReward = "0"

    const args = findEventArgs(receipt.logs as any, "RewardClaimed")
    if (args) {
      isWinner = args.isWinner as boolean
      tokenReward = await formatTokenAmount(
        publicClient,
        taskData.bountyToken,
        args.tokenReward as bigint,
      )
      clawReward = formatEther(args.clawReward as bigint)
    }

    return JSON.stringify({
      success: true,
      txHash: hash,
      isWinner,
      tokenReward,
      clawReward,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return JSON.stringify({ error: `claimRewardTx failed: ${msg}` })
  }
}

/**
 * Refunds the sponsor if the task did not reach minMiners or had no winners.
 */
export async function refundCreatorTx(taskId: string): Promise<string> {
  try {
    const { account, publicClient, walletClient } = await getWriteClients()

    const { request } = await publicClient.simulateContract({
      address: CORE_ADDRESS,
      abi: CORE_ABI,
      functionName: "refundCreator",
      args: [BigInt(taskId)],
      account,
    })

    const hash = await walletClient.writeContract(request)
    const receipt = await publicClient.waitForTransactionReceipt({ hash })

    let tokenRefunded = "0"
    let bountyToken = ""

    const args = findEventArgs(receipt.logs as any, "CreatorRefunded")
    if (args) {
      bountyToken = args.bountyToken as string
      tokenRefunded = await formatTokenAmount(
        publicClient,
        bountyToken as `0x${string}`,
        args.tokenRefunded as bigint,
      )
    }

    return JSON.stringify({
      success: true,
      txHash: hash,
      bountyToken,
      tokenRefunded,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return JSON.stringify({ error: `refundCreatorTx failed: ${msg}` })
  }
}

/**
 * Read-only eligibility checker for refundCreator().
 * Mirrors on-chain branch conditions and returns which condition (if any) is currently executable.
 */
export async function checkRefundCreatorEligibility(
  taskId: string,
): Promise<string> {
  try {
    const publicClient = getPublicClient()
    const latestBlock = await publicClient.getBlock()
    const nowTs = Number(latestBlock.timestamp)

    const taskRaw = await publicClient.readContract({
      address: CORE_ADDRESS,
      abi: CORE_ABI,
      functionName: "tasks",
      args: [BigInt(taskId)],
    })
    const taskData = normalizeTaskData(taskRaw)

    const creator = taskData.creator
    let callerAddress: string | null = null
    try {
      const signer = await getSignerAccount()
      callerAddress = signer.address
    } catch {
      callerAddress = null
    }
    const isCreator =
      callerAddress !== null
        ? callerAddress.toLowerCase() === creator.toLowerCase()
        : null
    const bountyAmount = taskData.bountyAmount
    const commitEndTime = Number(taskData.commitEndTime)
    const revealEndTime = Number(taskData.revealEndTime)
    const currentMiners = Number(taskData.currentMiners)
    const minMiners = Number(taskData.minMiners)
    const totalCorrectYes = Number(taskData.totalCorrectYes)
    const totalCorrectNo = Number(taskData.totalCorrectNo)
    const questionCount = Number(taskData.questionCount)

    const baseBlockers: string[] = []
    if (isCreator === false) baseBlockers.push("NotCreator")
    if (bountyAmount === 0n) baseBlockers.push("NoBountyLeft")
    if (nowTs <= commitEndTime) baseBlockers.push("CommitWindowStillOpen")

    const condition1 = currentMiners === 0 || currentMiners < minMiners
    const condition2 =
      taskData.isResolved &&
      nowTs > revealEndTime &&
      totalCorrectYes === 0 &&
      totalCorrectNo === 0
    const condition3 =
      taskData.isResolved &&
      nowTs > revealEndTime &&
      totalCorrectYes === 0 &&
      totalCorrectNo > 0 &&
      questionCount >= 2

    let eligibleCondition: 1 | 2 | 3 | null = null
    if (baseBlockers.length === 0) {
      if (condition1) eligibleCondition = 1
      else if (condition2) eligibleCondition = 2
      else if (condition3) eligibleCondition = 3
    }

    const eligible = eligibleCondition !== null
    const blockers = [...baseBlockers]
    if (!eligible && baseBlockers.length === 0) {
      blockers.push("HasWinnersOrNotReady")
    }

    return JSON.stringify({
      taskId,
      nowTs,
      account: callerAddress,
      creator,
      isCreator,
      callerCheckSkipped: callerAddress === null,
      bountyAmount: bountyAmount.toString(),
      fundsSettled: taskData.fundsSettled,
      branchSignals: {
        condition1,
        condition2,
        condition3,
      },
      eligible,
      eligibleCondition,
      blockers,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return JSON.stringify({
      error: `checkRefundCreatorEligibility failed: ${msg}`,
    })
  }
}

/**
 * Read-only precheck for creatorProveAllLost().
 * Validates the callable preconditions and tries to verify "all decrypted signals are losing".
 * Returns readyToCall + prepared arrays for creator_prove_all_lost when possible.
 */
export async function checkCreatorProveAllLostEligibility(
  taskId: string,
): Promise<string> {
  try {
    const publicClient = getPublicClient()
    const latestBlock = await publicClient.getBlock()
    const nowTs = Number(latestBlock.timestamp)

    const taskRaw = await publicClient.readContract({
      address: CORE_ADDRESS,
      abi: CORE_ABI,
      functionName: "tasks",
      args: [BigInt(taskId)],
    })
    const taskData = normalizeTaskData(taskRaw)

    const ctfAddress = (await publicClient.readContract({
      address: CORE_ADDRESS,
      abi: CORE_ABI,
      functionName: "ctf",
    })) as `0x${string}`
    const negRiskAdapter = (await publicClient.readContract({
      address: CORE_ADDRESS,
      abi: CORE_ABI,
      functionName: "negRiskAdapter",
    })) as `0x${string}`

    const creator = taskData.creator
    let callerAddress: string | null = null
    try {
      const signer = await getSignerAccount()
      callerAddress = signer.address
    } catch {
      callerAddress = null
    }
    const isCreator =
      callerAddress !== null
        ? callerAddress.toLowerCase() === creator.toLowerCase()
        : null
    const currentMiners = Number(taskData.currentMiners)
    const minMiners = Number(taskData.minMiners)
    const totalRevealed = Number(taskData.totalRevealed)
    const qCount = taskData.isNegRisk
      ? Number(
          (await publicClient.readContract({
            address: negRiskAdapter,
            abi: NEGRISK_ADAPTER_ABI,
            functionName: "getQuestionCount",
            args: [toBytes32(taskData.targetId)],
          })) as bigint,
        )
      : 1

    const marketSettled = await isTaskMarketSettled(publicClient, {
      targetId: taskData.targetId,
      isNegRisk: taskData.isNegRisk,
    })

    const blockers: string[] = []
    if (isCreator === false) blockers.push("NotCreator")
    if (taskData.bountyAmount === 0n) blockers.push("NoBountyLeft")
    if (nowTs <= Number(taskData.commitEndTime))
      blockers.push("CommitWindowStillOpen")
    if (!marketSettled) blockers.push("MarketNotDetermined")
    if (totalRevealed > 0) blockers.push("AlreadyRevealed")
    if (currentMiners < minMiners) blockers.push("MinMinersNotReached")

    const commitsRaw = await getCreatorTaskCommittedLogs(taskId)
    const commits = (JSON.parse(commitsRaw)?.commits ?? []) as Array<{
      agentId: string
    }>
    const signalsRaw = await getDecryptedSignals(taskId)
    const signals = (JSON.parse(signalsRaw)?.signals ?? []) as Array<{
      agentId: string
      questionIndex: number
      outcomeIndex: number
      salt: string
    }>

    const committedAgentIds = new Set(commits.map((c) => String(c.agentId)))
    if (committedAgentIds.size < currentMiners) {
      blockers.push("MissingCommittedLogs")
    }
    const signalByAgent = new Map(signals.map((s) => [String(s.agentId), s]))
    const alreadyProvenAgentIds: string[] = []
    for (const id of committedAgentIds) {
      const state = (await publicClient.readContract({
        address: CORE_ADDRESS,
        abi: CORE_ABI,
        functionName: "minerTaskStates",
        args: [BigInt(taskId), BigInt(id)],
      })) as any
      const provenLost = Boolean(state?.provenLost ?? state?.[7] ?? false)
      if (provenLost) alreadyProvenAgentIds.push(id)
    }

    const pendingAgentIds = [...committedAgentIds].filter(
      (id) => !alreadyProvenAgentIds.includes(id),
    )
    if (pendingAgentIds.length === 0) {
      blockers.push("AllAlreadyProven")
    }

    const missingSignalAgentIds = pendingAgentIds.filter(
      (id) => !signalByAgent.has(id),
    )
    if (missingSignalAgentIds.length > 0) blockers.push("MissingDecryptedSignals")

    let hasAnyWinnerSignal = false
    if (blockers.length === 0) {
      if (!taskData.isNegRisk) {
        const target = toBytes32(taskData.targetId)
        const p0 = (await publicClient.readContract({
          address: ctfAddress,
          abi: CTF_ABI,
          functionName: "payoutNumerators",
          args: [target, 0n],
        })) as bigint
        const p1 = (await publicClient.readContract({
          address: ctfAddress,
          abi: CTF_ABI,
          functionName: "payoutNumerators",
          args: [target, 1n],
        })) as bigint
        for (const id of pendingAgentIds) {
          const s = signalByAgent.get(id)!
          const o = Number(s.outcomeIndex)
          const isWinner =
            (p0 > p1 && o === 0) || (p1 > p0 && o === 1) ? true : false
          if (isWinner) {
            hasAnyWinnerSignal = true
            break
          }
        }
      } else {
        const target = toBytes32(taskData.targetId)
        const determined = (await publicClient.readContract({
          address: negRiskAdapter,
          abi: NEGRISK_ADAPTER_ABI,
          functionName: "getDetermined",
          args: [target],
        })) as boolean
        const winnerIdx = determined
          ? Number(
              (await publicClient.readContract({
                address: negRiskAdapter,
                abi: NEGRISK_ADAPTER_ABI,
                functionName: "getResult",
                args: [target],
              })) as bigint,
            )
          : -1

        for (const id of pendingAgentIds) {
          const s = signalByAgent.get(id)!
          const q = Number(s.questionIndex)
          const o = Number(s.outcomeIndex)
          if (q >= qCount || o > 1) continue

          const isWinner = determined
            ? (q === winnerIdx && o === 0) || (q !== winnerIdx && o === 1)
            : o === 1
          if (isWinner) {
            hasAnyWinnerSignal = true
            break
          }
        }
      }
      if (hasAnyWinnerSignal) blockers.push("HasWinners")
    }

    const readyToCall = blockers.length === 0
    const preparedSignals = [...pendingAgentIds]
      .map((id) => signalByAgent.get(id))
      .filter((s): s is NonNullable<typeof s> => Boolean(s))

    return JSON.stringify({
      taskId,
      nowTs,
      account: callerAddress,
      creator,
      isCreator,
      callerCheckSkipped: callerAddress === null,
      preconditions: {
        marketSettled,
        currentMiners,
        minMiners,
        totalRevealed,
        committedSignalsCount: preparedSignals.length,
      },
      readyToCall,
      blockers,
      hasAnyWinnerSignal,
      alreadyProvenAgentIds,
      missingSignalAgentIds,
      payload: readyToCall
        ? {
            agentIds: preparedSignals.map((s) => String(s.agentId)),
            questionIndices: preparedSignals.map((s) =>
              Number(s.questionIndex),
            ),
            outcomeIndices: preparedSignals.map((s) =>
              Number(s.outcomeIndex),
            ),
            salts: preparedSignals.map((s) => String(s.salt)),
          }
        : null,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return JSON.stringify({
      error: `checkCreatorProveAllLostEligibility failed: ${msg}`,
    })
  }
}

/**
 * Allows the sponsor to prove every committed miner lost (without waiting for reveals).
 * Decrypts each miner's cipher using the sponsor private key, then submits the plaintext
 * values on-chain. The contract verifies Poseidon hashes and refunds the bounty + stakes
 * once all miners are proven.
 * Can be called in batches — pass a subset of agentIds each time.
 */
export async function creatorProveAllLostTx(
  taskId: string,
  agentIds: string[],
  questionIndices: number[],
  outcomeIndices: number[],
  salts: string[],
): Promise<string> {
  try {
    const { account, publicClient, walletClient } = await getWriteClients()

    const { request } = await publicClient.simulateContract({
      address: CORE_ADDRESS,
      abi: CORE_ABI,
      functionName: "creatorProveAllLost",
      args: [
        BigInt(taskId),
        agentIds.map((id) => BigInt(id)),
        questionIndices,
        outcomeIndices,
        salts.map((s) => BigInt(s)),
      ],
      account,
    })

    const hash = await walletClient.writeContract(request)
    const receipt = await publicClient.waitForTransactionReceipt({ hash })

    let tokenRefunded = "0"
    const args = findEventArgs(receipt.logs as any, "CreatorRefunded")
    if (args) {
      tokenRefunded = await formatTokenAmount(
        publicClient,
        (args.bountyToken as string) as `0x${string}`,
        args.tokenRefunded as bigint,
      )
    }

    await saveCreatorProvenAgents(taskId, agentIds, hash)
    return JSON.stringify({ success: true, txHash: hash, tokenRefunded })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return JSON.stringify({ error: `creatorProveAllLostTx failed: ${msg}` })
  }
}

/**
 * Auto-batched creatorProveAllLost execution with exponential backoff on batch revert.
 * Starts from initialBatchSize (default 50), halves on failure, records successful agents.
 */
export async function creatorProveAllLostAutoTx(
  taskId: string,
  initialBatchSize = 50,
): Promise<string> {
  try {
    const preRaw = await checkCreatorProveAllLostEligibility(taskId)
    const pre = JSON.parse(preRaw)
    if (pre?.error) return preRaw
    if (!pre?.readyToCall || !pre?.payload) {
      return JSON.stringify({
        success: false,
        taskId,
        readyToCall: false,
        blockers: pre?.blockers ?? ["NotReady"],
      })
    }

    const agentIds = (pre.payload.agentIds ?? []) as string[]
    const questionIndices = (pre.payload.questionIndices ?? []) as number[]
    const outcomeIndices = (pre.payload.outcomeIndices ?? []) as number[]
    const salts = (pre.payload.salts ?? []) as string[]

    let i = 0
    let batchSize = Math.max(1, Math.floor(initialBatchSize))
    const successes: Array<{ from: number; to: number; txHash: string }> = []
    const failures: Array<{ index: number; agentId: string; error: string }> = []

    while (i < agentIds.length) {
      const remaining = agentIds.length - i
      const size = Math.min(batchSize, remaining)
      const end = i + size
      const a = agentIds.slice(i, end)
      const q = questionIndices.slice(i, end)
      const o = outcomeIndices.slice(i, end)
      const s = salts.slice(i, end)

      const txRaw = await creatorProveAllLostTx(taskId, a, q, o, s)
      const tx = JSON.parse(txRaw)

      if (tx?.success) {
        successes.push({ from: i, to: end - 1, txHash: String(tx.txHash) })
        i = end
        batchSize = Math.max(1, Math.floor(initialBatchSize))
        continue
      }

      const errMsg = String(tx?.error ?? "creatorProveAllLost batch failed")
      if (size === 1) {
        failures.push({ index: i, agentId: String(agentIds[i]), error: errMsg })
        i = end
        batchSize = Math.max(1, Math.floor(initialBatchSize))
      } else {
        batchSize = Math.max(1, Math.floor(size / 2))
      }
    }

    return JSON.stringify({
      success: failures.length === 0,
      taskId,
      requested: agentIds.length,
      succeeded: successes.reduce((acc, it) => acc + (it.to - it.from + 1), 0),
      failed: failures.length,
      successes,
      failures,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return JSON.stringify({ error: `creatorProveAllLostAutoTx failed: ${msg}` })
  }
}

// ─── Query / Log Tools ────────────────────────────────────────────────────────

/**
 * Fetches TaskCreated events and enriches each with on-chain task data.
 */
export async function fetchTaskCreatedLogs(
  fromBlock: number,
  toBlock: number | "latest" = "latest",
): Promise<string> {
  try {
    const publicClient = getPublicClient()

    const taskCreatedEvent = (CORE_ABI as any[]).find(
      (item: any) => item.type === "event" && item.name === "TaskCreated",
    )

    const logs = await publicClient.getLogs({
      address: CORE_ADDRESS,
      event: taskCreatedEvent,
      fromBlock: BigInt(fromBlock),
      toBlock: toBlock === "latest" ? "latest" : BigInt(toBlock),
    })

    const tokenDecimals = new Map<string, number>()
    const tasks = await Promise.all(
      logs.map(async (log) => {
        try {
          const decoded = decodeEventLog({
            abi: CORE_ABI,
            data: log.data,
            topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
          })
          const a = (decoded as any).args

          const taskRaw = await publicClient.readContract({
            address: CORE_ADDRESS,
            abi: CORE_ABI,
            functionName: "tasks",
            args: [a.taskId as bigint],
          })
          const taskData = normalizeTaskData(taskRaw)

          const token = (a.bountyToken as string) as `0x${string}`
          const tokenKey = token.toLowerCase()
          let decimals = tokenDecimals.get(tokenKey)
          if (decimals === undefined) {
            decimals = await getTokenDecimals(publicClient, token)
            tokenDecimals.set(tokenKey, decimals)
          }

          return {
            taskId: (a.taskId as bigint).toString(),
            creator: a.creator as string,
            targetId: a.targetId as string,
            isNegRisk: a.isNegRisk as boolean,
            bountyToken: token,
            bountyAmount: formatUnits(a.bountyAmount as bigint, decimals),
            commitEndTime: Number(taskData.commitEndTime),
            maxMiners: Number(taskData.maxMiners),
            minMiners: Number(taskData.minMiners),
            minCommits: Number(taskData.minCommits),
            currentMiners: Number(taskData.currentMiners),
            minWinRateBps: Number(taskData.minWinRateBps),
            maxInvalidCommits: Number(taskData.maxInvalidCommits),
            requiredStake: taskData.requiredStake.toString(),
            isResolved: taskData.isResolved,
          }
        } catch {
          return null
        }
      }),
    )

    return JSON.stringify({ tasks: tasks.filter((t) => t !== null) })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return JSON.stringify({ error: `fetchTaskCreatedLogs failed: ${msg}` })
  }
}

/**
 * Fetches TaskCommitted events for a specific taskId.
 */
export async function fetchTaskCommittedLogs(taskId: string): Promise<string> {
  try {
    const publicClient = getPublicClient()

    const taskCommittedEvent = (CORE_ABI as any[]).find(
      (item: any) => item.type === "event" && item.name === "TaskCommitted",
    )

    const cursorRaw = await getCreatorTaskCommitCursor(taskId)
    const cursorParsed = JSON.parse(cursorRaw)
    const cursor = cursorParsed?.cursor as
      | { blockNumber: string; logIndex: string }
      | null

    let fromBlock = CORE_DEPLOY_BLOCK
    if (cursor?.blockNumber) {
      fromBlock = BigInt(cursor.blockNumber)
    } else {
      const taskRowRaw = await getCreatorTaskRecord(taskId)
      const taskRow = JSON.parse(taskRowRaw)?.task as { createdBlock?: string } | null
      if (taskRow?.createdBlock) {
        fromBlock = BigInt(taskRow.createdBlock)
      } else {
        // One-time fallback: resolve TaskCreated block for this task.
        const taskCreatedEvent = (CORE_ABI as any[]).find(
          (item: any) => item.type === "event" && item.name === "TaskCreated",
        )
        const createdLogs = await publicClient.getLogs({
          address: CORE_ADDRESS,
          event: taskCreatedEvent,
          args: { taskId: BigInt(taskId) } as any,
          fromBlock: CORE_DEPLOY_BLOCK,
          toBlock: "latest",
        })
        const firstCreatedLog = createdLogs[0]
        if (firstCreatedLog) {
          fromBlock = firstCreatedLog.blockNumber ?? CORE_DEPLOY_BLOCK
          await updateCreatorTaskCreatedBlock(taskId, fromBlock.toString())
        }
      }
    }

    const logs = await publicClient.getLogs({
      address: CORE_ADDRESS,
      event: taskCommittedEvent,
      args: { taskId: BigInt(taskId) } as any,
      fromBlock,
      toBlock: "latest",
    })

    const decodedCommits = logs.map((log) => {
      try {
        const decoded = decodeEventLog({
          abi: CORE_ABI,
          data: log.data,
          topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        })
        const a = (decoded as any).args
        const committerAddress = a.miner as string
        return {
          taskId: (a.taskId as bigint).toString(),
          committerAddress,
          // Backward-compat alias for older skill docs/flows.
          committerAddr: committerAddress,
          agentId: (a.agentId as bigint).toString(),
          ephPubX: (a.ephPubX as bigint).toString(),
          ephPubY: (a.ephPubY as bigint).toString(),
          commitHash: (a.commitHash as bigint).toString(),
          cipher0: (a.cipher0 as bigint).toString(),
          cipher1: (a.cipher1 as bigint).toString(),
          blockNumber: String(log.blockNumber ?? 0n),
          logIndex: String(log.logIndex ?? 0),
          txHash: String(log.transactionHash ?? ""),
        }
      } catch {
        return null
      }
    }).filter((c) => c !== null) as Array<{
      taskId: string
      committerAddress: string
      committerAddr: string
      agentId: string
      ephPubX: string
      ephPubY: string
      commitHash: string
      cipher0: string
      cipher1: string
      blockNumber: string
      logIndex: string
      txHash: string
    }>

    const newCommits =
      cursor && cursor.blockNumber != null && cursor.logIndex != null
        ? decodedCommits.filter((c) => {
            const bn = BigInt(c.blockNumber)
            const li = BigInt(c.logIndex)
            const cbn = BigInt(cursor.blockNumber)
            const cli = BigInt(cursor.logIndex)
            return bn > cbn || (bn === cbn && li > cli)
          })
        : decodedCommits

    if (newCommits.length > 0) {
      await saveCreatorTaskCommits(
        taskId,
        newCommits.map((c) => ({
          taskId: c.taskId,
          committerAddress: c.committerAddress,
          agentId: c.agentId,
          ephPubX: c.ephPubX,
          ephPubY: c.ephPubY,
          commitHash: c.commitHash,
          cipher0: c.cipher0,
          cipher1: c.cipher1,
          blockNumber: c.blockNumber,
          logIndex: c.logIndex,
          txHash: c.txHash,
        })),
      )
    }

    const localRaw = await getCreatorTaskCommittedLogs(taskId)
    const local = JSON.parse(localRaw)
    if (local?.error) return localRaw
    return JSON.stringify({
      commits: (local.commits ?? []).map((c: any) => ({
        ...c,
        // Backward-compat alias for older skill docs/flows.
        committerAddr: c.committerAddress,
      })),
      sync: {
        fromBlock: fromBlock.toString(),
        fetched: logs.length,
        inserted: newCommits.length,
      },
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return JSON.stringify({ error: `fetchTaskCommittedLogs failed: ${msg}` })
  }
}

/**
 * Returns reputation data for a miner.
 * Resolves the ClawIdentity contract address via ClawCore.identity() view.
 */
export async function getMinerReputation(
  walletAddress: string,
): Promise<string> {
  try {
    const publicClient = getPublicClient()

    const identityAddress = (await publicClient.readContract({
      address: CORE_ADDRESS,
      abi: CORE_ABI,
      functionName: "identity",
    })) as `0x${string}`

    if (!identityAddress || identityAddress === zeroAddress) {
      throw new Error("ClawCore.identity() returned zero address")
    }

    const result = (await publicClient.readContract({
      address: identityAddress,
      abi: IDENTITY_ABI,
      functionName: "getMinerReputation",
      args: [walletAddress as `0x${string}`],
    })) as {
      totalCommits: bigint
      correctPredictions: bigint
      winRateBps: bigint
      totalClawEarned: bigint
    }

    const totalCommitsNum = Number(result.totalCommits)
    const correctPredictionsNum = Number(result.correctPredictions)
    // Minimal deterministic score for profile gating.
    // Defined as historical correct predictions count.
    const reputationScore = correctPredictionsNum

    return JSON.stringify({
      miner: walletAddress,
      totalCommits: result.totalCommits.toString(),
      correctPredictions: result.correctPredictions.toString(),
      totalCommitsNum,
      correctPredictionsNum,
      winRatePct: (Number(result.winRateBps) / 100).toFixed(2) + "%",
      winRateBps: Number(result.winRateBps),
      totalClawEarned: formatEther(result.totalClawEarned),
      reputationScore,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return JSON.stringify({ error: `getMinerReputation failed: ${msg}` })
  }
}

/**
 * Returns full on-chain task status from tasks() view.
 */
export async function getTaskStatus(taskId: string): Promise<string> {
  try {
    const publicClient = getPublicClient()

    const taskRaw = await publicClient.readContract({
      address: CORE_ADDRESS,
      abi: CORE_ABI,
      functionName: "tasks",
      args: [BigInt(taskId)],
    })
    const taskData = normalizeTaskData(taskRaw)

    const bountyToken = taskData.bountyToken as `0x${string}`
    const bountyTokenDecimals = await getTokenDecimals(publicClient, bountyToken)
    const bountyAmountFormatted = await formatTokenAmount(
      publicClient,
      bountyToken,
      taskData.bountyAmount,
    )
    const requiredStakeFormatted = formatUnits(
      taskData.requiredStake,
      bountyTokenDecimals,
    )
    const marketSettled = await isTaskMarketSettled(publicClient, {
      targetId: taskData.targetId,
      isNegRisk: taskData.isNegRisk,
    })

    return JSON.stringify({
      taskId,
      creator: taskData.creator,
      targetId: taskData.targetId,
      isNegRisk: taskData.isNegRisk,
      bountyToken: bountyToken,
      bountyTokenDecimals,
      bountyAmountRaw: taskData.bountyAmount.toString(),
      bountyAmount: bountyAmountFormatted,
      requiredStake: taskData.requiredStake.toString(),
      requiredStakeFormatted,
      commitEndTime: Number(taskData.commitEndTime),
      revealEndTime: Number(taskData.revealEndTime),
      maxMiners: Number(taskData.maxMiners),
      minMiners: Number(taskData.minMiners),
      minCommits: Number(taskData.minCommits),
      currentMiners: Number(taskData.currentMiners),
      totalRevealed: Number(taskData.totalRevealed),
      totalCorrectYes: Number(taskData.totalCorrectYes),
      totalCorrectNo: Number(taskData.totalCorrectNo),
      minWinRateBps: Number(taskData.minWinRateBps),
      maxInvalidCommits: Number(taskData.maxInvalidCommits),
      questionCount: Number(taskData.questionCount),
      snapshotProtocolFeeBps: Number(taskData.snapshotProtocolFeeBps),
      snapshotAutoLpFeeBps: Number(taskData.snapshotAutoLpFeeBps),
      isResolved: taskData.isResolved,
      marketSettled,
      fundsSettled: taskData.fundsSettled,
      isWhitelistedToken: taskData.isWhitelistedToken,
      creatorPubKeyX: taskData.creatorPubKeyX.toString(),
      creatorPubKeyY: taskData.creatorPubKeyY.toString(),
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return JSON.stringify({ error: `getTaskStatus failed: ${msg}` })
  }
}
