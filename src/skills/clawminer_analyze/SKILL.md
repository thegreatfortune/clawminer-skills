---
name: clawminer_analyze
description: Persistent analyze worker step. Pick one candidate each cycle, decide SUBMIT/SKIP, then hand off to clawminer_execute.
---

# ClawMiner Analyze

## Time Display Rule
- Render `eventEndTime` and any timing hints in OpenClaw local timezone.
- Keep raw unix seconds in payload/storage for deterministic follow-up steps.

## Tool Invocation Contract
- Follow `clawtools` for all tool call syntax and payload fields.
- Canonical format: `node dist/cli.js call <tool_name> --json '{...}'`

## Runtime Mode
- This skill is intended to run in a persistent single-thread loop.
- Process one candidate per cycle.
- If no candidate is available, sleep 60 seconds and retry.

## Input
Candidate task context from `clawminer_explore`:
- `taskId`, `targetId`, `isNegRisk`
- one or more candidate `conditionId`s (for NegRisk)
- `questionIndex` proposal (NegRisk) or `0` (non-NegRisk)
- `bountyAmount`, `requiredStake`, miner counts
- `eventSlug`, `eventEndTime`

## Analysis Checklist
1. Resolve exact prediction object:
   - Non-NegRisk: single `conditionId`
   - NegRisk: pick one `questionIndex -> conditionId`
2. Read PM market signals (`get_market_by_condition_id`) and optional event context (`get_event_details`).
3. Evaluate payoff vs risk:
   - Reward side: bounty share estimate = `netBounty / expectedCorrectMiners`
   - Operational risk: reveal timing risk, missing reveal stake loss (`requiredStake`)
   - Crowd risk: high `currentMiners` reduces expected share
4. Decision:
   - `SUBMIT` only when reward/risk is attractive
   - otherwise `SKIP`

## Output Handoff (`SUBMIT`)
Must include:
- `taskId`, `targetId`, `isNegRisk`
- `conditionId`, `questionIndex`, `outcomeIndex`
- `bountyAmount`, `requiredStake`
- `eventSlug`, `eventEndTime`
- `raw_event_data` (optional)

On `SUBMIT`, immediately call `clawminer_execute` with the selected payload.
