---
name: clawtools
description: Canonical CLI invocation contract for ClawMiner tools. Use this skill before calling any tool command from other ClawMiner skills.
---

# ClawTools (CLI Invocation Contract)

## Goal
Provide one canonical way to call ClawMiner tools in script mode (non-plugin mode).

## Runtime
- Runtime repo (fixed): `https://github.com/thegreatfortune/clawminer-skills.git`
- Recommended local path: `~/clawminer-skills`
- First-run bootstrap:
  - `git clone https://github.com/thegreatfortune/clawminer-skills.git ~/clawminer-skills` (if missing)
  - `cd ~/clawminer-skills && pnpm install`
- Build first: `pnpm run build`
- Tool calls always use:
  - `node dist/cli.js call <tool_name> --json '<json_payload>'`
- List tools:
  - `node dist/cli.js list`

## Non-Negotiable Rules
1. Never call old plugin registration APIs from skills.
2. Every tool call must pass a JSON object with correct field names.
3. Numeric-like on-chain values should be sent as strings when large (`taskId`, `bountyAmount`, hashes, bigints).
4. On command failure, surface raw JSON error text and stop the current action.

## Minimal Examples

```bash
node dist/cli.js call get_task_status --json '{"taskId":"1"}'
node dist/cli.js call check_event_resolution --json '{"eventId":"291778"}'
node dist/cli.js call check_event_resolution --json '{"eventId":"btc-updown-4h-1774152000"}'
```

## High-Risk Calls (Use Exact Field Names)

### create_task
```bash
node dist/cli.js call create_task --json '{
  "targetId":"0x...",
  "isNegRisk":false,
  "bountyToken":"0x...",
  "commitEndTime":1775000000,
  "maxMiners":0,
  "minMiners":2,
  "minCommits":0,
  "minWinRateBps":0,
  "requiredStake":"0",
  "bountyAmount":"1",
  "maxInvalidCommits":0,
  "creatorPubKeyX":"...",
  "creatorPubKeyY":"...",
  "creatorPubKey":"0x..."
}'
```

### commit_task
```bash
node dist/cli.js call commit_task --json '{
  "taskId":"1",
  "commitHash":"...",
  "ephPubX":"...",
  "ephPubY":"...",
  "cipher0":"...",
  "cipher1":"...",
  "pA":["...","..."],
  "pB":[["...","..."],["...","..."]],
  "pC":["...","..."],
  "pubSignals":["...","..."]
}'
```

### reveal_prediction / claim_reward
```bash
node dist/cli.js call reveal_prediction --json '{"taskId":"1","questionIndex":0,"outcomeIndex":1,"salt":"..."}'
node dist/cli.js call claim_reward --json '{"taskId":"1"}'
```

## Tool Parameter Contract (Source of Truth)
`src/cli.ts` is authoritative for:
- supported tool names
- required payload field names
- argument ordering adapted to each internal function

When in doubt, read `src/cli.ts` first, then update skill docs.
