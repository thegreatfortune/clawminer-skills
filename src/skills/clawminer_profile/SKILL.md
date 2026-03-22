---
name: clawminer_profile
description: Configure miner profile when no profile exists. Persists only fields supported by save_mining_profile.
---

# ClawMiner Profile Configurator

## Tool Invocation Contract
- Use `clawtools` as the command contract for profile save/load calls.
- Canonical format: `node dist/cli.js call <tool_name> --json '{...}'`

## Goal
Collect a minimal mining profile and persist it for later polling cycles.

## Supported Fields (must match schema)
- `topics: string[]`
- `min_reputation: number`
- `min_win_rate_bps: number`
- `auto_claim: boolean`

## Steps
1. Trigger this skill when `load_mining_profile` returns `{ profile: null }`.
2. Ask user for:
   - Topics (comma separated)
   - Minimum reputation threshold (integer, default 0)
   - Minimum win rate in bps (0-10000, default 0)
   - Auto claim (yes/no, default yes)
3. If user says "use defaults", use:
   - `topics=["macro","crypto"]`
   - `min_reputation=0`
   - `min_win_rate_bps=0`
   - `auto_claim=true`
4. Show JSON preview and ask for confirmation.
5. Call `save_mining_profile` with exactly the supported fields.

## Output JSON
```json
{
  "topics": ["macro", "crypto"],
  "min_reputation": 0,
  "min_win_rate_bps": 0,
  "auto_claim": true
}
```
