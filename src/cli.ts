#!/usr/bin/env node
import {
  generateBurnerWallet,
  getWalletInfo,
  getTokenBalance,
  getRpcConfig,
  setRpcConfig,
} from "./tools/wallet.js"
import {
  getEventDetails,
  searchEvents,
  getTopEvents,
  getTags,
  checkEventResolution,
  getMarketByConditionId,
  publicSearch,
  resolveTaskTarget,
} from "./tools/polymarket.js"
import {
  createTaskTx,
  creatorProveAllLostTx,
  creatorProveAllLostAutoTx,
  fetchTaskCreatedLogs,
  fetchTaskCommittedLogs,
  commitTaskTx,
  revealPredictionTx,
  claimRewardTx,
  refundCreatorTx,
  checkRefundCreatorEligibility,
  checkCreatorProveAllLostEligibility,
  getMinerReputation,
  getTaskStatus,
  getProtocolAddresses,
  getLatestBlockNumber,
} from "./tools/contract.js"
import {
  saveTaskRecord,
  getPendingTasks,
  updateTaskStatus,
  saveMiningProfile,
  loadMiningProfile,
  saveCreatorTaskRecord,
  listCreatorTasks,
  getCreatorTaskRecord,
  updateCreatorTaskFundsSettled,
  updateCreatorTaskPostCommitAnalyzed,
  saveDecryptedSignal,
  getDecryptedSignals,
  getCreatorProvenAgents,
  getScanCursor,
  setScanCursor,
  initDb,
  type MiningProfile,
  type CreatorTaskRecord,
  type TaskRecord,
} from "./tools/db.js"
import {
  generateCommitProof,
  encryptBountyPayload,
  generateCreatorKeypair,
  getCreatorKeypair,
  decryptMinerPrediction,
} from "./tools/crypto.js"

type ToolFn = (args: Record<string, any>) => Promise<string> | string

const tools: Record<string, ToolFn> = {
  generate_burner_wallet: async () => generateBurnerWallet(),
  get_wallet_info: async () => getWalletInfo(),
  get_token_balance: async (a) => getTokenBalance(a.tokenAddress),
  get_rpc_config: async () => getRpcConfig(),
  set_rpc_config: async (a) => setRpcConfig(a.rpcUrl, a.scope ?? "wallet"),

  save_mining_profile: async (a) => saveMiningProfile(a as MiningProfile),
  load_mining_profile: async () => loadMiningProfile(),

  generate_commit_proof: async (a) => generateCommitProof(a as any),
  encrypt_bounty_payload: async (a) =>
    encryptBountyPayload(a.summary, a.bountyCreatorPubkey),
  generate_creator_keypair: async () => generateCreatorKeypair(),
  get_creator_keypair: async () => getCreatorKeypair(),
  decrypt_miner_prediction: async (a) =>
    decryptMinerPrediction(a.ephPubX, a.ephPubY, a.cipher0, a.cipher1),

  search_events: async (a) => searchEvents(a.query, a.limit),
  get_event_details: async (a) => getEventDetails(a.eventId),
  get_top_events: async (a) =>
    getTopEvents(a.limit, a.order, a.tagId, a.minLiquidityUsd),
  get_tags: async () => getTags(),
  check_event_resolution: async (a) => checkEventResolution(a.eventId),
  get_market_by_condition_id: async (a) => getMarketByConditionId(a.conditionId),
  public_search: async (a) => publicSearch(a.query, a.limit),
  resolve_task_target: async (a) => resolveTaskTarget(a.targetId, a.isNegRisk),

  get_protocol_addresses: async () => getProtocolAddresses(),
  get_latest_block: async () => getLatestBlockNumber(),
  create_task: async (a) =>
    createTaskTx(
      a.targetId,
      a.isNegRisk,
      a.bountyToken,
      a.commitEndTime,
      a.maxMiners,
      a.minMiners,
      a.minCommits,
      a.minWinRateBps,
      a.requiredStake,
      a.bountyAmount,
      a.maxInvalidCommits,
      a.creatorPubKeyX,
      a.creatorPubKeyY,
      a.creatorPubKey,
    ),
  get_task_committed_logs: async (a) => fetchTaskCommittedLogs(a.taskId),
  save_creator_task_record: async (a) =>
    saveCreatorTaskRecord(a as CreatorTaskRecord),
  list_creator_tasks: async (a) =>
    listCreatorTasks(
      a?.fundsSettled === undefined ? undefined : Boolean(a.fundsSettled),
    ),
  update_creator_task_funds_settled: async (a) =>
    updateCreatorTaskFundsSettled(a.taskId, Boolean(a.fundsSettled)),
  update_creator_task_post_commit_analyzed: async (a) =>
    updateCreatorTaskPostCommitAnalyzed(
      a.taskId,
      Boolean(a.postCommitAnalyzed),
      a.postCommitAnalysis,
    ),
  get_creator_task_record: async (a) => getCreatorTaskRecord(a.taskId),
  save_decrypted_signal: async (a) =>
    saveDecryptedSignal({
      taskId: a.taskId,
      agentId: a.agentId,
      committerAddr: a.committerAddr,
      questionIndex: a.questionIndex,
      outcomeIndex: a.outcomeIndex,
      salt: a.salt,
    }),
  get_decrypted_signals: async (a) => getDecryptedSignals(a.taskId),
  get_creator_proven_agents: async (a) => getCreatorProvenAgents(a.taskId),
  check_creator_prove_all_lost_eligibility: async (a) =>
    checkCreatorProveAllLostEligibility(a.taskId),
  check_refund_creator_eligibility: async (a) =>
    checkRefundCreatorEligibility(a.taskId),
  refund_creator: async (a) => refundCreatorTx(a.taskId),
  creator_prove_all_lost: async (a) =>
    creatorProveAllLostTx(
      a.taskId,
      a.agentIds,
      a.questionIndices,
      a.outcomeIndices,
      a.salts,
    ),
  creator_prove_all_lost_auto: async (a) =>
    creatorProveAllLostAutoTx(a.taskId, a.initialBatchSize),
  fetch_task_created_logs: async (a) =>
    fetchTaskCreatedLogs(a.fromBlock, a.toBlock ?? "latest"),
  get_task_status: async (a) => getTaskStatus(a.taskId),
  commit_task: async (a) =>
    commitTaskTx(
      a.taskId,
      a.commitHash,
      a.ephPubX,
      a.ephPubY,
      a.cipher0,
      a.cipher1,
      a.pA,
      a.pB,
      a.pC,
      a.pubSignals,
    ),
  reveal_prediction: async (a) =>
    revealPredictionTx(a.taskId, a.questionIndex, a.outcomeIndex, a.salt),
  claim_reward: async (a) => claimRewardTx(a.taskId),
  get_miner_reputation: async (a) => getMinerReputation(a.walletAddress),
  save_task_record: async (a) => saveTaskRecord(a as TaskRecord),
  get_pending_tasks: async () => getPendingTasks(),
  get_scan_cursor: async (a) => getScanCursor(a.key),
  set_scan_cursor: async (a) => setScanCursor(a.key, a.blockNumber),
  update_task_status: async (a) =>
    updateTaskStatus(a.taskId, a.status, a.txHash ?? ""),
}

function usage() {
  console.error(
    [
      "Usage:",
      "  clawminer list",
      "  clawminer call <tool_name> --json '{...}'",
      "",
      "Examples:",
      "  clawminer call get_task_status --json '{\"taskId\":\"1\"}'",
      "  clawminer call check_event_resolution --json '{\"eventId\":\"291778\"}'",
    ].join("\n"),
  )
}

function parseArgs(argv: string[]): {
  command: string | undefined
  tool: string | undefined
  json: any
} {
  const [command, tool, ...rest] = argv
  let json: any = {}
  const jsonIdx = rest.indexOf("--json")
  if (jsonIdx >= 0 && rest[jsonIdx + 1]) {
    json = JSON.parse(rest[jsonIdx + 1] as string)
  }
  return { command, tool, json }
}

async function main() {
  initDb()
  const { command, tool, json } = parseArgs(process.argv.slice(2))

  if (!command || command === "help" || command === "--help") {
    usage()
    process.exit(0)
  }

  if (command === "list") {
    console.log(JSON.stringify({ tools: Object.keys(tools).sort() }, null, 2))
    return
  }

  if (command !== "call" || !tool) {
    usage()
    process.exit(1)
  }

  const fn = tools[tool]
  if (!fn) {
    console.error(JSON.stringify({ error: `Unknown tool: ${tool}` }))
    process.exit(1)
  }

  const out = await fn(json ?? {})
  if (typeof out === "string") {
    console.log(out)
  } else {
    console.log(JSON.stringify(out))
  }
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e)
  console.error(JSON.stringify({ error: msg }))
  process.exit(1)
})
