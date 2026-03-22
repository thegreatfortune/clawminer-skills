---
name: clawminer
description: Miner master entry. Orchestrates a decoupled 3-worker runtime: discover (5m), analyze+commit (persistent), claim (1h).
---

# ClawMiner Master Skill (Miner Loop)

## Language Rule
Always respond in the same language as the user.

## Time Display Rule
- All displayed task/event times should be in OpenClaw local timezone.
- Keep raw unix seconds in structured outputs for deterministic processing.

## Tool Invocation Contract
- Use `clawtools` as the single CLI invocation contract.
- Do not call plugin runtime tools directly.
- Canonical format: `node dist/cli.js call <tool_name> --json '{...}'`

## Mission
Run a decoupled autonomous miner runtime:
1. Discover worker (every 5 minutes): find/update candidates
2. Analyze+commit worker (persistent): process one candidate per cycle, then sleep 60s when idle
3. Claim worker (every 1 hour): process reveal/claim queue

Recommended first run:
- Prefer running `clawcore` first to perform unified runtime bootstrap (sponsor + miner in one pass).
- Use `clawminer_bootstrap` only when you intentionally want miner-only bootstrap.

## Runtime Requirement (Critical)
- This skill **does not create background timers by itself**.
- External scheduler/runtime is required.
- Do not claim autonomous operation unless all 3 workers are active.
- If scheduler/process tools are missing, tell the user to run `clawminer_bootstrap` and fix environment capabilities.
- Cron delivery mode/channel must be explicit and environment-compatible.
- Do not assume `announce` is available unless channel capability is confirmed.

## Mandatory Startup Checks
1. `get_wallet_info`
2. `load_mining_profile`

Stop if wallet/profile is missing.

## Worker Routing
1. `clawminer_explore` (5m cron): discover tasks + basic filtering + DB updates
2. `clawminer_analyze` (persistent loop): pick one candidate, deep analysis, decide `SUBMIT/SKIP`
3. `clawminer_execute` (called by analyze worker): commit + local record save
4. `clawminer_claim` (1h cron): reveal/claim queue processing

## Reveal/Claim Policy
- If task is settled on-chain, reveal is mandatory for reward eligibility.
- If you do not reveal, `claim_reward` will return zero token/CLAW rewards even when your prediction is correct.
- If `requiredStake > 0`, reveal is also high priority for stake-loss prevention.
- Claim only after `revealEndTime` has passed.

Use `get_miner_poll_actions` in each cycle to generate actionable queue:
- `reveal_ready`
- `claim_ready`
- `wait_*`
