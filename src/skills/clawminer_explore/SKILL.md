---
name: clawminer_explore
description: Step 1 of miner loop. Poll tasks, resolve target metadata, and shortlist viable candidates every 5 minutes.
---

# ClawMiner Explore

## Time Display Rule
- Any displayed time (for example `eventEndTime`, commit deadlines) must be shown in OpenClaw local timezone.
- Keep raw unix timestamp alongside local display when persisting/reporting shortlist rows.

## Tool Invocation Contract
- Follow `clawtools` for CLI call syntax and payload structure.
- Canonical format: `node dist/cli.js call <tool_name> --json '{...}'`

## Goal
Find viable tasks for this cycle and persist/update candidate shortlist for `clawminer_analyze`.

## Steps
1. Incremental scan with cursor:
   - `get_scan_cursor(key=\"task_created\")`
   - `get_latest_block()`
   - choose `fromBlock = cursor+1` (or a safe backtrack window if cursor null)
   - `fetch_task_created_logs(fromBlock, latest)`
   - on success: `set_scan_cursor(key=\"task_created\", blockNumber=latest)`
2. `get_wallet_info` + `load_mining_profile` + `get_miner_reputation`
3. For each task:
   - `get_task_status(taskId)`
   - Skip if commit window closed or task full
   - Check profile gates (`minCommits`, `minWinRateBps`)
   - `resolve_task_target(targetId, isNegRisk)`:
     - Non-NegRisk: targetId is conditionId
     - NegRisk: targetId is negRiskMarketId; resolve question list + conditionIds
4. Build shortlist with fields:
   - `taskId`, `targetId`, `isNegRisk`
   - selected `conditionId` candidate(s)
   - `eventSlug`, `eventEndTime`
   - `bountyAmount`, `requiredStake`, `currentMiners`, `maxMiners`
5. Rank by expected quality:
   - Higher bounty
   - Lower stake risk
   - Better topic fit
   - More reasonable competition level

If none qualifies, terminate this cycle and wait next poll.
