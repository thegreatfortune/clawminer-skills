---
name: clawminer_execute
description: Step 3 of miner loop. Commit prediction on-chain and persist everything needed for reveal/claim polling.
---

# ClawMiner Execute (Commit)

## Time Display Rule
- Show commit/reveal/event timing in OpenClaw local timezone in user-facing output.
- Persist raw unix timestamps (`eventEndTime`, etc.) for polling logic.

## Tool Invocation Contract
- Use `clawtools` for all command examples and payload schemas.
- Canonical format: `node dist/cli.js call <tool_name> --json '{...}'`

## Goal
Take a `SUBMIT` decision and complete commit safely.

## Steps
1. `get_task_status(taskId)`:
   - ensure commit window open
   - ensure task not full
   - read `creatorPubKeyX/Y`
2. `generate_commit_proof` with:
   - `taskId`, `questionIndex`, `outcomeIndex`, `walletAddress`, `creatorPubKeyX/Y`, `chainId=137`
3. `commit_task(...)` using proof outputs.
4. Persist local record via `save_task_record` with:
   - `taskId`, `targetId`, `isNegRisk`
   - `conditionId`, `questionIndex`, `outcomeIndex`
   - `salt`, `commitHash`, `commitTxHash`
   - `bountyAmount`
   - `eventSlug`, `eventEndTime`
   - optional `eventData`, `analysisResult`

`eventEndTime` must be saved so periodic polling can prioritize reveal timing.
