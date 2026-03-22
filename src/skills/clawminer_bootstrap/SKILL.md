---
name: clawminer_bootstrap
description: One-click runtime bootstrap for miner automation. Auto-configures discover/claim schedules and starts a persistent analyze+commit loop. Falls back to explicit environment setup guidance when scheduler tools are unavailable.
---

# ClawMiner Bootstrap (Auto Runtime Setup)

## Language Rule
Always reply in the same language as the user.

## Tool Invocation Contract
- Bootstrap must call tools through `clawtools` CLI contract.
- Canonical format: `node dist/cli.js call <tool_name> --json '{...}'`

## Goal
Configure miner runtime **without manual day-to-day operations**:
1. `clawminer_explore` every 5 minutes
2. `clawminer_claim` every 1 hour
3. `analyze+commit` as a persistent loop (`sleep 60s` when no task)

This skill is idempotent:
- Existing jobs/processes should be updated/reused.
- Do not create duplicate schedules/workers.

---

## Step 0: Preflight
Always run:
1. `get_wallet_info`
2. `load_mining_profile`
3. `get_rpc_config`

If either is missing, stop and ask user to complete wallet/profile first.

RPC preflight rule:
- If `get_rpc_config.source == "chain_default"`:
  - Warn user that default shared/public endpoints can be rate-limited under high load.
  - Recommend setting a dedicated RPC (Alchemy/Infura/self-hosted).
  - Provide a short setup wizard:
    1. "Create Polygon RPC app on Alchemy (or equivalent provider)"
    2. "Copy HTTPS endpoint URL"
    3. "Call `set_rpc_config(rpcUrl, scope='wallet')`"
  - After setting, call `get_rpc_config` again and confirm source is `wallet_local`.
- If source is `wallet_local` / `global_local` / `env`, proceed directly.

---

## Step 1: Detect Scheduler Capability
Try to use OpenClaw scheduling tools (names depend on gateway plugin set), such as:
- list jobs
- create/update jobs
- start/stop jobs

If scheduling tools are available:
- continue to Step 2.

If scheduling tools are not available:
- stop bootstrap and return a clear environment setup message:
  - "Your OpenClaw runtime does not expose scheduler tools yet."
  - "Enable Gateway cron/automation tools, then rerun `clawminer_bootstrap`."
  - "Required capabilities: list/create/update cron jobs and inspect running jobs."

Do not pretend setup succeeded when scheduler capability is absent.

---

## Step 2: Resolve Delivery Profile (Mandatory Before Creating Jobs)
Scheduler triggers execution; delivery defines where results are posted.

Before creating/updating any cron:
1. Detect whether a usable message channel exists in current runtime.
2. Build one `deliveryProfile` and reuse it for all miner jobs in this bootstrap run.
3. Selection rule:
   - If channel is available: allow `announce`.
   - If channel is not available: use non-announce compatible delivery mode.
4. Never leave delivery implicit.

Return chosen profile in bootstrap output:
- `deliveryProfile.mode`
- `deliveryProfile.channel` (if any)

---

## Step 3: Ensure Miner Cron Jobs
Create or update (idempotent) two jobs:

### Job A: `clawminer-explore-5m`
- Interval: every 5 minutes
- Action: run `clawminer_explore` one cycle
- Expected behavior: incremental discovery only

### Job B: `clawminer-claim-1h`
- Interval: every 1 hour
- Action: run `clawminer_claim` one cycle
- Expected behavior: reveal/claim queue processing

Rules:
- If a job with same logical purpose exists, update it instead of creating a duplicate.
- Record final job IDs in output.
- Apply the same `deliveryProfile` to both jobs.

---

## Step 4: Ensure Analyze Worker (Persistent)
Create or start a persistent worker loop:

Pseudo behavior:
1. run analyze candidate selection + commit attempt for exactly one task
2. if no task selected, `sleep 60`
3. repeat

Rules:
- Single instance only (no duplicate worker processes).
- If already running, keep it and return its identity.
- If restart is needed, perform graceful restart.

---

## Step 5: Health Check
Return:
- discover cron status
- claim cron status
- analyze worker status
- delivery profile actually applied to each cron
- next trigger times (if scheduler provides them)
- any blocker

If any component failed, mark overall status `partial` and include exact fix action.

---

## Output Format
Return concise JSON-style summary:

```json
{
  "bootstrapStatus": "ok | partial | failed",
  "deliveryProfile": { "mode": "...", "channel": "..." },
  "discoverJob": { "status": "...", "id": "...", "schedule": "*/5 * * * *" },
  "claimJob": { "status": "...", "id": "...", "schedule": "0 * * * *" },
  "analyzeWorker": { "status": "...", "id": "...", "mode": "persistent-60s-sleep" },
  "notes": ["..."]
}
```

---

## Non-Negotiable Rules
1. Never claim "fully automated" unless all 3 components are active.
2. Never create duplicate explore/claim jobs on repeated runs.
3. Never run multiple analyze workers concurrently.
4. If scheduler tools are missing, fail fast with environment setup guidance.
5. Do not silently ignore RPC quality: if still on `chain_default`, keep warning in health output.
6. Never assume announce delivery; set explicit delivery profile before creating jobs.
