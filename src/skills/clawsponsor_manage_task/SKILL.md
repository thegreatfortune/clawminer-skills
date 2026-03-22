---
name: clawsponsor_manage_task
description: Sponsor task-management skill for periodic polling. Every active task is processed each cycle with task-level branching: decrypt/persist before commitEndTime, signal analysis after commitEndTime, and refund eligibility checks.
---

# ClawSponsor — Manage Tasks (Polling Runtime)

## Language Rule
Always reply in the same language as the user.

## Time Display Rule
- Show all task times in OpenClaw local timezone in cycle output.
- For `commitEndTime` / `revealEndTime`, output both:
  - local datetime string
  - raw unix seconds
- Internal branch checks still use chain timestamp semantics.

## Tool Invocation Contract
- Follow `clawtools` for every tool call syntax and payload shape.
- Canonical format: `node dist/cli.js call <tool_name> --json '{...}'`

## What This Skill Does
This skill is a scheduler-driven sponsor runtime. It manages all saved sponsor tasks in periodic cycles and applies per-task branching logic.

Core responsibilities:
1. Poll and process **every active task** each cycle.
2. Before `commitEndTime`: decrypt and persist all newly committed signals.
3. After `commitEndTime`: analyze full signal set and output PM decision guidance.
4. After analysis: prioritize `creator_prove_all_lost` when applicable, otherwise check `refund_creator`.

## Runtime Contract
- This skill does not run as a background daemon by itself.
- External scheduler must trigger it every 5 minutes.
- One trigger = one full cycle over all active tasks, then exit.
- Scheduler job should be ensured by `clawcore` unified runtime bootstrap (single source of truth).
- Do not create duplicate sponsor-manage jobs from multiple skills/sessions.
- Scheduler only triggers this cycle; delivery mode/channel must be explicitly configured by bootstrap.
- Do not assume `announce` delivery is always available.

---

## Cycle Definition (every 5 minutes)

### Step A: Build Active Task Set
If `taskId` is explicitly provided:
1. Set `activeTaskIds = [taskId]`.

If no explicit `taskId` (scheduler mode):
1. Call `list_creator_tasks(fundsSettled=false)`.
2. Build `activeTaskIds` from returned task IDs.
3. Process every task independently in Step B.

If `activeTaskIds` is empty:
- Return: `no active sponsor tasks`.

---

### Step B: Process Each Active Task (task-level branch)
For each `taskId` in `activeTaskIds`, run all substeps below independently.

#### B1) Load per-task context
Always call:
1. `get_task_status(taskId)`
2. `get_creator_task_record(taskId)` (read local flags: `fundsSettled`, `postCommitAnalyzed`)
3. `get_decrypted_signals(taskId)`

Use fields:
- `commitEndTime`, `revealEndTime`, `marketSettled`, `fundsSettled`, `postCommitAnalyzed`
- `currentMiners`, `minMiners`, `totalRevealed`
- `bountyAmountRaw`, `bountyAmount`, `bountyToken`, `isResolved`

If `fundsSettled == true` OR `bountyAmountRaw == "0"`:
- call `update_creator_task_funds_settled(taskId, true)` (local archive flag)
- mark this task as `archived`
- skip B2/B3/B4 and continue to next task.

#### B2) Sync / Decrypt / Persist Pass
Run decrypt+persist based on time branch:

1. If `now <= commitEndTime`:
   - Call `get_task_committed_logs(taskId)` once (incremental sync).
   - Compare with `get_decrypted_signals(taskId)`.
   - Decrypt and persist all `pending` commits (`commits - decrypted`).

2. If `now > commitEndTime && postCommitAnalyzed == false`:
   - Call `get_task_committed_logs(taskId)` once as final sync.
   - Compare with `get_decrypted_signals(taskId)`.
   - Run one final decrypt for all `pending` commits.
   - After this final pass, do not keep retrying failed decrypts.

3. If `now > commitEndTime && postCommitAnalyzed == true`:
   - Skip `get_task_committed_logs`.
   - Do not decrypt again.

#### B3) Time branch per task
- Fast path first (Condition 1 shortcut):
  - If `now > commitEndTime && currentMiners < minMiners`:
    - Call `check_refund_creator_eligibility(taskId)`.
    - If `eligible == true` and `eligibleCondition == 1`:
      - Call `refund_creator(taskId)` immediately.
      - On success: `update_creator_task_funds_settled(taskId, true)` and mark `archived`.
      - Skip post-commit analysis and settlement routing for this task.
    - If not eligible due to transient reasons, continue normal branches below.

- If `now <= commitEndTime`:
  - Status = `pre_commit_monitoring`
  - Output this cycle decrypt progress only.

- If `now > commitEndTime && postCommitAnalyzed == false`:
  - Status = `post_commit_analysis`
  - Re-load `get_decrypted_signals(taskId)` and produce final signal summary from successful decrypts:
    - total decrypted miners
    - YES/NO split (or per-question split for NegRisk)
    - consensus strength and confidence label
  - Output PM decision guidance:
    - `bet / no-bet`
    - suggested side/outcome
    - confidence rationale
  - Persist analysis conclusion into your run output/state payload.
  - Mark analysis complete:
    - `update_creator_task_post_commit_analyzed(taskId, true, postCommitAnalysis)`
  - Note: even if some decrypts failed in this final pass, still mark analyzed and continue to settlement actions.

- If `now > commitEndTime && postCommitAnalyzed == true`:
  - Status = `post_commit_analyzed`
  - Skip log sync/decrypt/analysis in this cycle.

#### B4) Settlement routing (after analysis or when already analyzed)
Run when:
- `postCommitAnalyzed == true`, or
- this cycle just finished post-commit analysis in B3.

1. First call `check_creator_prove_all_lost_eligibility(taskId)`.
2. If `readyToCall == true`:
   - Prefer `creator_prove_all_lost_auto(taskId, batchSize=50)`.
   - The auto tool applies exponential backoff on revert (50 → 25 → 12 → ...), supports multi-round calls, and records successful agents.
   - (Optional manual mode) Use returned `payload` arrays with `creator_prove_all_lost(...)`.
   - If tx succeeds, call `update_creator_task_funds_settled(taskId, true)` (archive locally).
   - Skip refund path for this cycle.
3. If `readyToCall == false`:
   - Call `check_refund_creator_eligibility(taskId)`.
   - If `eligible == true`:
     - Call `refund_creator(taskId)`.
     - If refund succeeds, call `update_creator_task_funds_settled(taskId, true)` (archive locally).
   - If `eligible == false`:
     - Output blockers and continue next cycle.

Important correctness note:
- Do **not** use `fundsSettled` alone as a proxy for "refund impossible".
- In contract logic, refund may still be valid in specific branches even when settlement-related flags are set.
- The authoritative gate is `check_refund_creator_eligibility`.
- For "all miners lost and no reveal", authoritative gate is `check_creator_prove_all_lost_eligibility`.
- Contract guardrails are authoritative: if not truly all-lost, `creator_prove_all_lost` will revert and no incorrect settlement is applied.

---

## Per-Cycle Output Requirements
For each processed task, return a structured line item:
- `taskId`
- `phase`: `pre_commit_monitoring | post_commit_analysis | post_commit_analyzed | archived`
- `commitsTotal`
- `decryptedTotal`
- `newlyDecrypted`
- `failedDecryptAgentIds`
- `pmDecision` (only meaningful after commitEndTime)
- `analysisRecorded` (`true/false`)
- `settlementAction`: `prove_all_lost_executed | refund_executed | eligible_not_executed | not_eligible`
- `nextAction`

Also return cycle summary:
- `activeTasksProcessed`
- `archivedSkipped`
- `refundExecutedCount`

---

## Non-Negotiable Rules
1. Do not process only one global branch for the whole batch.
2. Do not skip decrypt-persist pass for any active task.
3. Do not stop at commit window close; continue per-task cycles until settlement/archive.
4. Do not claim background polling is active unless an external scheduler is configured.
5. Do not assume announce delivery; use the runtime-compatible delivery profile set by bootstrap.
