import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TaskRecord {
  taskId: string;
  targetId: string;
  isNegRisk: boolean;
  conditionId: string;
  questionIndex: number;
  outcomeIndex: number;
  salt: string;
  commitHash: string;
  commitTxHash?: string;
  revealTxHash?: string;
  claimTxHash?: string;
  status: "committed" | "revealed" | "claimed" | "failed";
  committedAt: number;
  bountyAmount: string;
  eventSlug?: string;
  eventEndTime?: number;
  eventData?: string; // Raw JSON string of the Polymarket event
  analysisResult?: string; // JSON string of the AI's analysis and reasoning
}

export interface MiningProfile {
  topics: string[];
  min_reputation: number;
  min_win_rate_bps: number;
  auto_claim: boolean;
}

export interface CreatorTaskRecord {
  taskId: string;
  targetId: string;   // negRiskMarketId (isNegRisk=true) or conditionId (isNegRisk=false)
  isNegRisk: boolean;
  createdBlock?: string;
  commitEndTime?: number;
  bountyAmount?: string;
  bountyToken?: string;
  fundsSettled?: boolean;
  postCommitAnalyzed?: boolean;
  postCommitAnalyzedAt?: number;
  postCommitAnalysis?: string;
}

export interface CreatorTaskRow {
  taskId: string;
  targetId: string;
  isNegRisk: boolean;
  createdBlock: string | null;
  commitEndTime: number | null;
  bountyAmount: string | null;
  bountyToken: string | null;
  fundsSettled: boolean;
  postCommitAnalyzed: boolean;
  postCommitAnalyzedAt: number | null;
  postCommitAnalysis: string | null;
  createdAt: number;
}

export interface CreatorTaskCommitLog {
  taskId: string;
  committerAddress: string;
  agentId: string;
  ephPubX: string;
  ephPubY: string;
  commitHash: string;
  cipher0: string;
  cipher1: string;
  blockNumber: string;
  logIndex: string;
  txHash: string;
}

export interface ScanCursor {
  key: string;
  blockNumber: string;
  updatedAt: number;
}

export interface DecryptedSignal {
  taskId: string;
  agentId: string;
  committerAddr: string;
  questionIndex: number;
  outcomeIndex: number;
  salt: string;
}

export interface CreatorProvenAgent {
  taskId: string;
  agentId: string;
  txHash: string;
  provenAt: number;
}

// ─── Connection ───────────────────────────────────────────────────────────────

function getDataDir(): string {
  return process.env.CLAWMINER_DATA_DIR || path.join(os.homedir(), ".clawminer");
}

function getDbPath(): string {
  return path.join(getDataDir(), "tasks.db");
}

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  const dataDir = getDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  _db = new Database(getDbPath());
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  return _db;
}

// ─── Schema Init ──────────────────────────────────────────────────────────────

export function initDb(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS miner_tasks (
      task_id         TEXT PRIMARY KEY,
      target_id       TEXT    NOT NULL DEFAULT '',
      is_neg_risk     INTEGER NOT NULL DEFAULT 0,
      condition_id    TEXT    NOT NULL,
      question_index  INTEGER NOT NULL DEFAULT 0,
      outcome_index   INTEGER NOT NULL,
      salt            TEXT    NOT NULL,
      commit_hash     TEXT    NOT NULL,
      commit_tx_hash  TEXT,
      reveal_tx_hash  TEXT,
      claim_tx_hash   TEXT,
      status          TEXT    NOT NULL DEFAULT 'committed',
      committed_at    INTEGER NOT NULL,
      bounty_amount   TEXT    NOT NULL DEFAULT '0',
      event_slug      TEXT,
      event_end_time  INTEGER,
      event_data      TEXT,
      analysis_result TEXT
    );

    CREATE TABLE IF NOT EXISTS wallet (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      address     TEXT    NOT NULL UNIQUE,
      private_key TEXT    NOT NULL,
      mnemonic    TEXT,
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mining_profiles (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_json TEXT    NOT NULL,
      created_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS creator_tasks (
      task_id         TEXT PRIMARY KEY,
      target_id       TEXT    NOT NULL,
      is_neg_risk     INTEGER NOT NULL DEFAULT 0,
      created_block   TEXT,
      commit_end_time INTEGER,
      bounty_amount   TEXT,
      bounty_token    TEXT,
      funds_settled   INTEGER NOT NULL DEFAULT 0,
      post_commit_analyzed    INTEGER NOT NULL DEFAULT 0,
      post_commit_analyzed_at INTEGER,
      post_commit_analysis    TEXT,
      created_at      INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS creator_keypairs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      pub_key_x    TEXT    NOT NULL,
      pub_key_y    TEXT    NOT NULL,
      pub_key_hex  TEXT    NOT NULL DEFAULT '',
      priv_key_hex TEXT    NOT NULL,
      created_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS creator_decrypted_signals (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id         TEXT    NOT NULL,
      agent_id        TEXT    NOT NULL,
      committer_addr  TEXT    NOT NULL,
      question_index  INTEGER NOT NULL,
      outcome_index   INTEGER NOT NULL,
      salt            TEXT    NOT NULL,
      decrypted_at    INTEGER NOT NULL,
      UNIQUE(task_id, agent_id)
    );

    CREATE TABLE IF NOT EXISTS creator_task_commits (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id           TEXT    NOT NULL,
      committer_address TEXT    NOT NULL,
      agent_id          TEXT    NOT NULL,
      eph_pub_x         TEXT    NOT NULL,
      eph_pub_y         TEXT    NOT NULL,
      commit_hash       TEXT    NOT NULL,
      cipher0           TEXT    NOT NULL,
      cipher1           TEXT    NOT NULL,
      block_number      TEXT    NOT NULL,
      log_index         TEXT    NOT NULL,
      tx_hash           TEXT    NOT NULL,
      synced_at         INTEGER NOT NULL,
      UNIQUE(task_id, block_number, log_index)
    );

    CREATE TABLE IF NOT EXISTS creator_proven_agents (
      task_id    TEXT    NOT NULL,
      agent_id   TEXT    NOT NULL,
      tx_hash    TEXT    NOT NULL,
      proven_at  INTEGER NOT NULL,
      PRIMARY KEY (task_id, agent_id)
    );

    CREATE TABLE IF NOT EXISTS scan_cursors (
      key          TEXT PRIMARY KEY,
      block_number TEXT    NOT NULL,
      updated_at   INTEGER NOT NULL
    );
  `);

  // Lightweight forward-compatible migrations for existing local DBs.
  const cols = db
    .prepare(`PRAGMA table_info(miner_tasks)`)
    .all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));

  if (!names.has("target_id")) {
    db.exec(
      `ALTER TABLE miner_tasks ADD COLUMN target_id TEXT NOT NULL DEFAULT ''`,
    );
  }
  if (!names.has("is_neg_risk")) {
    db.exec(
      `ALTER TABLE miner_tasks ADD COLUMN is_neg_risk INTEGER NOT NULL DEFAULT 0`,
    );
  }
  if (!names.has("question_index")) {
    db.exec(
      `ALTER TABLE miner_tasks ADD COLUMN question_index INTEGER NOT NULL DEFAULT 0`,
    );
  }
  if (!names.has("event_slug")) {
    db.exec(`ALTER TABLE miner_tasks ADD COLUMN event_slug TEXT`);
  }
  if (!names.has("event_end_time")) {
    db.exec(`ALTER TABLE miner_tasks ADD COLUMN event_end_time INTEGER`);
  }

  const keyCols = db
    .prepare(`PRAGMA table_info(creator_keypairs)`)
    .all() as Array<{ name: string }>;
  const keyNames = new Set(keyCols.map((c) => c.name));
  if (!keyNames.has("pub_key_hex")) {
    db.exec(
      `ALTER TABLE creator_keypairs ADD COLUMN pub_key_hex TEXT NOT NULL DEFAULT ''`,
    );
  }

  const creatorTaskCols = db
    .prepare(`PRAGMA table_info(creator_tasks)`)
    .all() as Array<{ name: string }>;
  const creatorTaskNames = new Set(creatorTaskCols.map((c) => c.name));
  if (!creatorTaskNames.has("created_block")) {
    db.exec(
      `ALTER TABLE creator_tasks ADD COLUMN created_block TEXT`,
    );
  }
  if (!creatorTaskNames.has("funds_settled")) {
    db.exec(
      `ALTER TABLE creator_tasks ADD COLUMN funds_settled INTEGER NOT NULL DEFAULT 0`,
    );
  }
  if (!creatorTaskNames.has("post_commit_analyzed")) {
    db.exec(
      `ALTER TABLE creator_tasks ADD COLUMN post_commit_analyzed INTEGER NOT NULL DEFAULT 0`,
    );
  }
  if (!creatorTaskNames.has("post_commit_analyzed_at")) {
    db.exec(
      `ALTER TABLE creator_tasks ADD COLUMN post_commit_analyzed_at INTEGER`,
    );
  }
  if (!creatorTaskNames.has("post_commit_analysis")) {
    db.exec(
      `ALTER TABLE creator_tasks ADD COLUMN post_commit_analysis TEXT`,
    );
  }
}

// ─── Task Records ─────────────────────────────────────────────────────────────

export async function saveTaskRecord(record: TaskRecord): Promise<string> {
  const maxAttempts = 3;
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const db = getDb();
      db.prepare(
        `
        INSERT INTO miner_tasks
          (task_id, target_id, is_neg_risk, condition_id, question_index, outcome_index,
           salt, commit_hash, commit_tx_hash, status, committed_at, bounty_amount,
           event_slug, event_end_time, event_data, analysis_result)
        VALUES
          (@taskId, @targetId, @isNegRisk, @conditionId, @questionIndex, @outcomeIndex,
           @salt, @commitHash, @commitTxHash, @status, @committedAt, @bountyAmount,
           @eventSlug, @eventEndTime, @eventData, @analysisResult)
        ON CONFLICT(task_id) DO UPDATE SET
          target_id       = excluded.target_id,
          is_neg_risk     = excluded.is_neg_risk,
          condition_id    = excluded.condition_id,
          question_index  = excluded.question_index,
          commit_tx_hash  = excluded.commit_tx_hash,
          status          = excluded.status,
          bounty_amount   = excluded.bounty_amount,
          event_slug      = excluded.event_slug,
          event_end_time  = excluded.event_end_time,
          event_data      = excluded.event_data,
          analysis_result = excluded.analysis_result
      `,
      ).run({
        taskId: record.taskId,
        targetId: record.targetId,
        isNegRisk: record.isNegRisk ? 1 : 0,
        conditionId: record.conditionId,
        questionIndex: record.questionIndex,
        outcomeIndex: record.outcomeIndex,
        salt: record.salt,
        commitHash: record.commitHash,
        commitTxHash: record.commitTxHash ?? null,
        status: record.status,
        committedAt: record.committedAt,
        bountyAmount: record.bountyAmount,
        eventSlug: record.eventSlug ?? null,
        eventEndTime: record.eventEndTime ?? null,
        eventData: record.eventData ?? null,
        analysisResult: record.analysisResult ?? null,
      });
      return JSON.stringify({
        success: true,
        taskId: record.taskId,
        attempts: attempt,
      });
    } catch (err: any) {
      lastError = err?.message ?? String(err);
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 100));
      }
    }
  }

  return JSON.stringify({
    error: `saveTaskRecord failed after ${maxAttempts} attempts: ${lastError}`,
    taskId: record.taskId,
    attempts: maxAttempts,
  });
}

/**
 * Get tasks that need revealing or claiming.
 */
export async function getPendingTasks(): Promise<string> {
  try {
    const db = getDb();
    const rows = db
      .prepare(
        `
      SELECT task_id, condition_id, outcome_index, salt, commit_hash,
             target_id, is_neg_risk, question_index,
             commit_tx_hash, reveal_tx_hash, claim_tx_hash, status, committed_at, bounty_amount,
             event_slug, event_end_time,
             event_data, analysis_result
      FROM   miner_tasks
      WHERE  status IN ('committed', 'revealed')
      ORDER  BY committed_at ASC
    `,
      )
      .all() as any[];

    const tasks = rows.map(row => ({
      taskId: row.task_id,
      targetId: row.target_id,
      isNegRisk: Number(row.is_neg_risk) === 1,
      conditionId: row.condition_id,
      questionIndex: row.question_index,
      outcomeIndex: row.outcome_index,
      salt: row.salt,
      commitHash: row.commit_hash,
      commitTxHash: row.commit_tx_hash,
      revealTxHash: row.reveal_tx_hash,
      claimTxHash: row.claim_tx_hash,
      status: row.status,
      committedAt: row.committed_at,
      bountyAmount: row.bounty_amount,
      eventSlug: row.event_slug,
      eventEndTime: row.event_end_time,
      eventData: row.event_data,
      analysisResult: row.analysis_result,
    }));

    return JSON.stringify({ tasks });
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

export async function updateTaskStatus(
  taskId: string,
  status: "revealed" | "claimed" | "failed",
  txHash?: string,
): Promise<string> {
  try {
    const db = getDb();

    let query = `UPDATE miner_tasks SET status = @status`;
    if (status === "revealed") query += `, reveal_tx_hash = @txHash`;
    if (status === "claimed") query += `, claim_tx_hash = @txHash`;
    query += ` WHERE task_id = @taskId`;

    const result = db.prepare(query).run({ status, txHash: txHash ?? null, taskId });

    if (result.changes === 0) {
      return JSON.stringify({ error: `No task found for taskId: ${taskId}` });
    }
    return JSON.stringify({ success: true, taskId, status });
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

// ─── Mining Profile ───────────────────────────────────────────────────────────

export async function saveMiningProfile(profile: MiningProfile): Promise<string> {
  try {
    const db = getDb();
    db.prepare(
      `
      INSERT INTO mining_profiles (profile_json, created_at)
      VALUES (?, strftime('%s', 'now'))
    `,
    ).run(JSON.stringify(profile));
    return JSON.stringify({ success: true });
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

export async function loadMiningProfile(): Promise<string> {
  try {
    const db = getDb();
    const row = db
      .prepare(
        `
      SELECT profile_json FROM mining_profiles ORDER BY id DESC LIMIT 1
    `,
      )
      .get() as { profile_json: string } | undefined;

    if (!row) {
      return JSON.stringify({ profile: null });
    }
    return JSON.stringify({ profile: JSON.parse(row.profile_json) });
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

// ─── Creator Task Records ─────────────────────────────────────────────────────

export async function saveCreatorTaskRecord(record: CreatorTaskRecord): Promise<string> {
  try {
    const db = getDb();
    db.prepare(
      `
      INSERT INTO creator_tasks
        (task_id, target_id, is_neg_risk, created_block, commit_end_time, bounty_amount, bounty_token, funds_settled, post_commit_analyzed, post_commit_analyzed_at, post_commit_analysis, created_at)
      VALUES
        (@taskId, @targetId, @isNegRisk, @createdBlock, @commitEndTime, @bountyAmount, @bountyToken, @fundsSettled, @postCommitAnalyzed, @postCommitAnalyzedAt, @postCommitAnalysis, strftime('%s', 'now'))
      ON CONFLICT(task_id) DO UPDATE SET
        target_id       = excluded.target_id,
        is_neg_risk     = excluded.is_neg_risk,
        created_block   = COALESCE(excluded.created_block, creator_tasks.created_block),
        commit_end_time = excluded.commit_end_time,
        bounty_amount   = excluded.bounty_amount,
        bounty_token    = excluded.bounty_token,
        funds_settled   = excluded.funds_settled,
        post_commit_analyzed = excluded.post_commit_analyzed,
        post_commit_analyzed_at = excluded.post_commit_analyzed_at,
        post_commit_analysis = COALESCE(excluded.post_commit_analysis, creator_tasks.post_commit_analysis)
    `,
    ).run({
      taskId: record.taskId,
      targetId: record.targetId,
      isNegRisk: record.isNegRisk ? 1 : 0,
      createdBlock: record.createdBlock ?? null,
      commitEndTime: record.commitEndTime ?? null,
      bountyAmount: record.bountyAmount ?? null,
      bountyToken: record.bountyToken ?? null,
      fundsSettled: record.fundsSettled ? 1 : 0,
      postCommitAnalyzed: record.postCommitAnalyzed ? 1 : 0,
      postCommitAnalyzedAt: record.postCommitAnalyzedAt ?? null,
      postCommitAnalysis: record.postCommitAnalysis ?? null,
    });
    return JSON.stringify({ success: true, taskId: record.taskId });
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

export async function listCreatorTasks(
  fundsSettled?: boolean,
  postCommitAnalyzed?: boolean,
): Promise<string> {
  try {
    const db = getDb();
    const filters: string[] = []
    const params: Record<string, unknown> = {}
    if (typeof fundsSettled === "boolean") {
      filters.push("funds_settled = @fundsSettled")
      params.fundsSettled = fundsSettled ? 1 : 0
    }
    if (typeof postCommitAnalyzed === "boolean") {
      filters.push("post_commit_analyzed = @postCommitAnalyzed")
      params.postCommitAnalyzed = postCommitAnalyzed ? 1 : 0
    }
    const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : ""
    const rows = db
      .prepare(
        `
      SELECT task_id, target_id, is_neg_risk, created_block, commit_end_time, bounty_amount, bounty_token, funds_settled, post_commit_analyzed, post_commit_analyzed_at, post_commit_analysis, created_at
      FROM   creator_tasks
      ${whereClause}
      ORDER  BY created_at DESC
    `,
      )
      .all(params) as any[];

    const tasks: CreatorTaskRow[] = rows.map((r) => ({
      taskId: r.task_id,
      targetId: r.target_id,
      isNegRisk: Number(r.is_neg_risk) === 1,
      createdBlock: r.created_block ?? null,
      commitEndTime: r.commit_end_time ?? null,
      bountyAmount: r.bounty_amount ?? null,
      bountyToken: r.bounty_token ?? null,
      fundsSettled: Number(r.funds_settled) === 1,
      postCommitAnalyzed: Number(r.post_commit_analyzed) === 1,
      postCommitAnalyzedAt: r.post_commit_analyzed_at ?? null,
      postCommitAnalysis: r.post_commit_analysis ?? null,
      createdAt: r.created_at,
    }));

    return JSON.stringify({
      tasks,
      filteredBy: {
        ...(typeof fundsSettled === "boolean" ? { fundsSettled } : {}),
        ...(typeof postCommitAnalyzed === "boolean"
          ? { postCommitAnalyzed }
          : {}),
      },
    });
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

export async function getCreatorTaskRecord(taskId: string): Promise<string> {
  try {
    const db = getDb();
    const row = db
      .prepare(
        `
      SELECT task_id, target_id, is_neg_risk, commit_end_time, bounty_amount, bounty_token, created_at
           , funds_settled
           , created_block
           , post_commit_analyzed
           , post_commit_analyzed_at
           , post_commit_analysis
      FROM   creator_tasks
      WHERE  task_id = ?
      LIMIT  1
    `,
      )
      .get(taskId) as any | undefined;

    if (!row) {
      return JSON.stringify({ task: null });
    }

    const task: CreatorTaskRow = {
      taskId: row.task_id,
      targetId: row.target_id,
      isNegRisk: Number(row.is_neg_risk) === 1,
      createdBlock: row.created_block ?? null,
      commitEndTime: row.commit_end_time ?? null,
      bountyAmount: row.bounty_amount ?? null,
      bountyToken: row.bounty_token ?? null,
      fundsSettled: Number(row.funds_settled) === 1,
      postCommitAnalyzed: Number(row.post_commit_analyzed) === 1,
      postCommitAnalyzedAt: row.post_commit_analyzed_at ?? null,
      postCommitAnalysis: row.post_commit_analysis ?? null,
      createdAt: row.created_at,
    };

    return JSON.stringify({ task });
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

export async function updateCreatorTaskFundsSettled(
  taskId: string,
  fundsSettled: boolean,
): Promise<string> {
  try {
    const db = getDb();
    const result = db
      .prepare(
        `
      UPDATE creator_tasks
      SET funds_settled = @fundsSettled
      WHERE task_id = @taskId
    `,
      )
      .run({
        taskId,
        fundsSettled: fundsSettled ? 1 : 0,
      });

    if (result.changes === 0) {
      return JSON.stringify({ error: `No creator task found for taskId: ${taskId}` });
    }
    return JSON.stringify({ success: true, taskId, fundsSettled });
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

export async function updateCreatorTaskCreatedBlock(
  taskId: string,
  createdBlock: string,
): Promise<string> {
  try {
    const db = getDb();
    const result = db
      .prepare(
        `
      UPDATE creator_tasks
      SET created_block = @createdBlock
      WHERE task_id = @taskId
    `,
      )
      .run({ taskId, createdBlock });

    if (result.changes === 0) {
      return JSON.stringify({ error: `No creator task found for taskId: ${taskId}` });
    }
    return JSON.stringify({ success: true, taskId, createdBlock });
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

export async function updateCreatorTaskPostCommitAnalyzed(
  taskId: string,
  postCommitAnalyzed: boolean,
  postCommitAnalysis?: string,
): Promise<string> {
  try {
    const db = getDb();
    const result = db
      .prepare(
        `
      UPDATE creator_tasks
      SET post_commit_analyzed = @postCommitAnalyzed,
          post_commit_analyzed_at = CASE
            WHEN @postCommitAnalyzed = 1 THEN strftime('%s', 'now')
            ELSE NULL
          END,
          post_commit_analysis = CASE
            WHEN @postCommitAnalyzed = 1 THEN @postCommitAnalysis
            ELSE NULL
          END
      WHERE task_id = @taskId
    `,
      )
      .run({
        taskId,
        postCommitAnalyzed: postCommitAnalyzed ? 1 : 0,
        postCommitAnalysis: postCommitAnalysis ?? null,
      });

    if (result.changes === 0) {
      return JSON.stringify({ error: `No creator task found for taskId: ${taskId}` });
    }
    return JSON.stringify({
      success: true,
      taskId,
      postCommitAnalyzed,
      postCommitAnalysis: postCommitAnalysis ?? null,
    });
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

export async function getCreatorTaskCommitCursor(
  taskId: string,
): Promise<string> {
  try {
    const db = getDb();
    const row = db
      .prepare(
        `
      SELECT block_number, log_index
      FROM   creator_task_commits
      WHERE  task_id = ?
      ORDER  BY CAST(block_number AS INTEGER) DESC, CAST(log_index AS INTEGER) DESC
      LIMIT  1
    `,
      )
      .get(taskId) as any | undefined;

    if (!row) return JSON.stringify({ cursor: null });
    return JSON.stringify({
      cursor: {
        taskId,
        blockNumber: String(row.block_number),
        logIndex: String(row.log_index),
      },
    });
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

export async function saveCreatorTaskCommits(
  taskId: string,
  commits: CreatorTaskCommitLog[],
): Promise<string> {
  try {
    if (commits.length === 0) {
      return JSON.stringify({ success: true, taskId, inserted: 0 });
    }
    const db = getDb();
    const stmt = db.prepare(
      `
      INSERT INTO creator_task_commits
        (task_id, committer_address, agent_id, eph_pub_x, eph_pub_y, commit_hash, cipher0, cipher1, block_number, log_index, tx_hash, synced_at)
      VALUES
        (@taskId, @committerAddress, @agentId, @ephPubX, @ephPubY, @commitHash, @cipher0, @cipher1, @blockNumber, @logIndex, @txHash, strftime('%s', 'now'))
      ON CONFLICT(task_id, block_number, log_index) DO UPDATE SET
        committer_address = excluded.committer_address,
        agent_id          = excluded.agent_id,
        eph_pub_x         = excluded.eph_pub_x,
        eph_pub_y         = excluded.eph_pub_y,
        commit_hash       = excluded.commit_hash,
        cipher0           = excluded.cipher0,
        cipher1           = excluded.cipher1,
        tx_hash           = excluded.tx_hash,
        synced_at         = excluded.synced_at
    `,
    );

    const tx = db.transaction((rows: CreatorTaskCommitLog[]) => {
      for (const c of rows) {
        stmt.run({
          taskId,
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
        });
      }
    });

    tx(commits);
    return JSON.stringify({ success: true, taskId, inserted: commits.length });
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

export async function getCreatorTaskCommittedLogs(taskId: string): Promise<string> {
  try {
    const db = getDb();
    const rows = db
      .prepare(
        `
      SELECT task_id, committer_address, agent_id, eph_pub_x, eph_pub_y, commit_hash, cipher0, cipher1, block_number, log_index, tx_hash
      FROM   creator_task_commits
      WHERE  task_id = ?
      ORDER  BY CAST(block_number AS INTEGER) ASC, CAST(log_index AS INTEGER) ASC
    `,
      )
      .all(taskId) as any[];

    const commits: CreatorTaskCommitLog[] = rows.map((r) => ({
      taskId: r.task_id,
      committerAddress: r.committer_address,
      agentId: r.agent_id,
      ephPubX: r.eph_pub_x,
      ephPubY: r.eph_pub_y,
      commitHash: r.commit_hash,
      cipher0: r.cipher0,
      cipher1: r.cipher1,
      blockNumber: r.block_number,
      logIndex: r.log_index,
      txHash: r.tx_hash,
    }));

    return JSON.stringify({ commits });
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

export async function saveCreatorProvenAgents(
  taskId: string,
  agentIds: string[],
  txHash: string,
): Promise<string> {
  try {
    if (agentIds.length === 0) {
      return JSON.stringify({ success: true, taskId, inserted: 0 });
    }
    const db = getDb();
    const stmt = db.prepare(
      `
      INSERT INTO creator_proven_agents (task_id, agent_id, tx_hash, proven_at)
      VALUES (@taskId, @agentId, @txHash, strftime('%s', 'now'))
      ON CONFLICT(task_id, agent_id) DO UPDATE SET
        tx_hash = excluded.tx_hash,
        proven_at = excluded.proven_at
    `,
    );
    const tx = db.transaction((ids: string[]) => {
      for (const agentId of ids) {
        stmt.run({ taskId, agentId: String(agentId), txHash });
      }
    });
    tx(agentIds);
    return JSON.stringify({ success: true, taskId, inserted: agentIds.length });
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

export async function getCreatorProvenAgents(taskId: string): Promise<string> {
  try {
    const db = getDb();
    const rows = db
      .prepare(
        `
      SELECT task_id, agent_id, tx_hash, proven_at
      FROM creator_proven_agents
      WHERE task_id = ?
      ORDER BY proven_at ASC
    `,
      )
      .all(taskId) as any[];

    const agents: CreatorProvenAgent[] = rows.map((r) => ({
      taskId: r.task_id,
      agentId: r.agent_id,
      txHash: r.tx_hash,
      provenAt: Number(r.proven_at),
    }));

    return JSON.stringify({ taskId, agents });
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

// ─── Creator Decrypted Signals ────────────────────────────────────────────────

/**
 * Saves one decrypted miner signal for a sponsor task.
 * UPSERT on (task_id, agent_id) — safe to call multiple times.
 */
export async function saveDecryptedSignal(signal: DecryptedSignal): Promise<string> {
  try {
    const db = getDb();
    db.prepare(
      `
      INSERT INTO creator_decrypted_signals
        (task_id, agent_id, committer_addr, question_index, outcome_index, salt, decrypted_at)
      VALUES
        (@taskId, @agentId, @committerAddr, @questionIndex, @outcomeIndex, @salt, strftime('%s', 'now'))
      ON CONFLICT(task_id, agent_id) DO UPDATE SET
        question_index = excluded.question_index,
        outcome_index  = excluded.outcome_index,
        salt           = excluded.salt,
        decrypted_at   = excluded.decrypted_at
    `,
    ).run({
      taskId: signal.taskId,
      agentId: signal.agentId,
      committerAddr: signal.committerAddr,
      questionIndex: signal.questionIndex,
      outcomeIndex: signal.outcomeIndex,
      salt: signal.salt,
    });
    return JSON.stringify({ success: true });
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

/**
 * Returns all saved decrypted signals for a task, ready for creator_prove_all_lost.
 */
export async function getDecryptedSignals(taskId: string): Promise<string> {
  try {
    const db = getDb();
    const rows = db
      .prepare(
        `
      SELECT agent_id, committer_addr, question_index, outcome_index, salt
      FROM   creator_decrypted_signals
      WHERE  task_id = ?
      ORDER  BY id ASC
    `,
      )
      .all(taskId) as any[];

    const signals = rows.map((r) => ({
      agentId: r.agent_id,
      committerAddress: r.committer_addr,
      // Backward-compat alias (deprecated)
      committerAddr: r.committer_addr,
      questionIndex: r.question_index,
      outcomeIndex: r.outcome_index,
      salt: r.salt,
    }));

    return JSON.stringify({ taskId, signals });
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

// ─── Scan Cursors ─────────────────────────────────────────────────────────────

export async function getScanCursor(
  key = "task_created",
): Promise<string> {
  try {
    const db = getDb();
    const row = db
      .prepare(
        `
      SELECT key, block_number, updated_at
      FROM   scan_cursors
      WHERE  key = ?
      LIMIT  1
    `,
      )
      .get(key) as any | undefined;

    if (!row) return JSON.stringify({ cursor: null });
    const cursor: ScanCursor = {
      key: row.key,
      blockNumber: row.block_number,
      updatedAt: row.updated_at,
    };
    return JSON.stringify({ cursor });
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

export async function setScanCursor(
  key: string,
  blockNumber: string,
): Promise<string> {
  try {
    const db = getDb();
    db.prepare(
      `
      INSERT INTO scan_cursors (key, block_number, updated_at)
      VALUES (?, ?, strftime('%s', 'now'))
      ON CONFLICT(key) DO UPDATE SET
        block_number = excluded.block_number,
        updated_at   = excluded.updated_at
    `,
    ).run(key, blockNumber);
    return JSON.stringify({ success: true, key, blockNumber });
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}
