---
name: clawminer_claim
description: Step 4 of miner loop. Run hourly polling over committed/revealed tasks and execute reveal/claim on time.
---

# ClawMiner Claim (Reveal + Claim)

## Time Display Rule
- Display `revealEndTime` and current decision time in OpenClaw local timezone.
- Include raw unix seconds in debug-style outputs when helpful.
- Eligibility comparisons remain chain-time based.

## Tool Invocation Contract
- Use `clawtools` for command syntax and payload validation.
- Canonical format: `node dist/cli.js call <tool_name> --json '{...}'`

## Goal
Process pending local tasks and finalize lifecycle:
`committed -> revealed -> claimed`

## Runtime Requirement (Critical)
- This skill requires an external scheduler for periodic execution.
- It should run one cycle every 1 hour, then exit.
- If no scheduler exists, tell the user to configure one; do not pretend continuous background polling is active.

## Polling
Run every 1 hour (`3600s`):
1. `load_mining_profile` (`auto_claim` gate)
2. `get_miner_poll_actions`
3. Execute high-priority actions first

## Reveal Decision Rule
For each `committed` task:
1. `get_task_status(taskId)`
2. If unresolved: wait
3. If resolved:
   - reveal immediately (mandatory for reward eligibility)
   - if `requiredStake > 0`, this is also stake-loss prevention
4. Submit `reveal_prediction(taskId, questionIndex, outcomeIndex, salt)`
5. `update_task_status(..., "revealed")`

## Claim Rule
For each `revealed` task:
1. `get_task_status(taskId)`
2. If `now <= revealEndTime`: wait
3. If `now > revealEndTime`: `claim_reward(taskId)`
4. `update_task_status(..., "claimed")`

## Notes
- Reveal is mandatory for claiming rewards after settlement.
- Claim is only valid after reveal window ends.
- One task is complete only after successful claim update.
