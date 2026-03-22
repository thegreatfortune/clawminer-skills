---
name: clawsponsor_create_task
description: Use when the user has decided to create a bounty task. Resolves conditionId/marketId from a URL or search, collects parameters interactively or via fast-path, checks balances, then submits the on-chain transaction.
---

# ClawSponsor Task Creation

## Language Rule

**Always respond in the same language the user is writing in.** Chinese input → Chinese reply. English input → English reply. Never switch languages unless the user does first.

## Time Display Rule

- All user-facing time display must use OpenClaw runtime local timezone.
- Do not present UTC-only time in normal UX output.
- When showing critical times (`commitEndTime`, `eventEndTime`, `revealEndTime`), include:
  - local datetime string
  - raw unix seconds (for audit/debug)
- Time comparisons must still use chain/on-chain timestamps.

## Tool Invocation Contract
- Use `clawtools` for exact CLI command syntax and payload fields.
- Canonical format: `node dist/cli.js call <tool_name> --json '{...}'`

---

## createTask Parameter Reference

| Parameter           | Contract field           | Effect                                                                                                                                            |
| ------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `targetId`          | `task.targetId`          | bytes32. **NegRisk task**: Polymarket `negRiskMarketId`. **Non-NegRisk**: CTF `conditionId`.                                                      |
| `isNegRisk`         | `task.isNegRisk`         | `true` = Polymarket NegRisk multi-question market (multiple mutually exclusive binary questions). `false` = single binary Gnosis CTF condition.   |
| `bountyToken`       | `task.bountyToken`       | Whitelisted: USDT or USDC (activate CLAW + Auto-LP). Non-whitelisted tokens accepted — miners get 100% bounty, no CLAW minted. Default: USDT.     |
| `bountyAmount`      | `task.bountyAmount`      | ERC-20 amount transferred from sponsor into the contract at creation. Irreversible until refund conditions are met.                               |
| `commitEndTime`     | `task.commitEndTime`     | Unix timestamp (seconds). **Contract hard rule:** must be strictly in the future (`> block.timestamp`) or tx reverts `InvalidTime`. **Compute from chain time, not AI local/system time**: first read latest chain block timestamp, then set `commitEndTime = chainNow + N`. |
| `minMiners`         | `task.minMiners`         | If `currentMiners < minMiners` when window closes, sponsor can `refundCreator` for full bounty.                                                   |
| `maxMiners`         | `task.maxMiners`         | Hard cap on commits. 0 = unlimited.                                                                                                               |
| `minCommits`        | `task.minCommits`        | Minimum historical commits a miner must have. 0 = open to all. Combine with `minWinRateBps` — win rate alone is gameable by single-commit sybils. |
| `minWinRateBps`     | `task.minWinRateBps`     | Minimum historical win rate in basis points (e.g. 5000 = 50%). Default 0 = no filter. AND-gated with `minCommits`.                                |
| `requiredStake`     | `task.requiredStake`     | Optional **bountyToken stake** miners must lock. Forfeited to winner pool if they commit but don't reveal. Default 0.                             |
| `maxInvalidCommits` | `task.maxInvalidCommits` | Maximum invalid commit history allowed. 0 = zero tolerance (default). Filters out low-quality miners.                                             |
| `creatorPubKeyX/Y`  | `task.creatorPubKeyX/Y`  | Sponsor Baby Jubjub public key. Miners encrypt their predictions with it — only the sponsor can decrypt before market resolves.                   |

---

## Goal

Resolve the Polymarket targetId, collect task parameters (interactively, fast-path, or batch), pre-flight balance check, confirm, submit `create_task`.

## Amount Input Rule (create_task)

- `bountyAmount` and `requiredStake` must be entered in **human token units**.
- Example:
  - USDT/USDC: `bountyAmount: "1"` means 1 token (tool converts to raw with token decimals).
  - WETH: `bountyAmount: "0.05"` means 0.05 WETH.
- Do **not** pre-convert to smallest-unit raw values in the skill flow.

---

## Batch Mode Detection

Detect batch intent before Step 1. User is in batch mode if they:

- Provide multiple URLs
- Describe a filter query implying multiple markets
- Say "batch", "bulk", "multiple tasks", "all matching"

**If batch mode:**

1. Search/filter all candidate markets.
2. Show candidate list with question, volume, liquidity, resolution time.
3. Ask: "Shall I create tasks for all [N]? Or pick specific ones?"
4. Collect **shared parameters once** for all tasks.
5. Show Batch Preview before any transaction:

   ```
   📋 Batch Task Preview — [N] tasks

   #  Market                          Bounty    Commit Closes
   ─────────────────────────────────────────────────────────
   1  [question truncated]            5 USDT    [datetime]
   2  [question truncated]            5 USDT    [datetime]
   ─────────────────────────────────────────────────────────
   Total bounty locked: [N × amount] USDT
   Wallet balance: [balance] USDT   [✅ / ⚠️ insufficient]
   ```

6. Single pre-flight balance check for total bounty.
7. Ask: "Shall I submit all [N] tasks?"
8. Execute sequentially, log each:
   ```
   [1/N] ✅ Task [id] created — [question] | Tx: 0x...
   [2/N] ❌ Failed — [reason]
   ```
9. Batch Summary at end.

**If NOT batch mode**, use single-task flow below.

---

## Step 1: Resolve targetId and isNegRisk

**Path A — URL provided:**

1. Extract event slug (path after `/event/`, ignore anything after next `/`).
   - `https://polymarket.com/event/fed-rate-cut-march-2025/will-the-fed-cut` → slug = `fed-rate-cut-march-2025`
2. Call `get_event_details(slug)`.
3. If multiple markets, list them with questions and ask user to pick.
4. Determine `isNegRisk`:
   - Event has `negRisk=true` and a non-empty `negRiskMarketId` → `isNegRisk = true`, `targetId = negRiskMarketId`
   - Otherwise use selected market `conditionId` → `isNegRisk = false`, `targetId = conditionId`
5. If `negRisk=true` but `negRiskMarketId` is missing, stop and ask user to provide on-chain `negRiskMarketId` manually before creating task.

**Path B — No URL:**

1. Ask: "Which Polymarket event? Describe it or paste a URL."
2. `search_events` or `public_search`.
3. Present up to 5 matches. Once user picks, call `get_event_details` and extract targetId.

Confirm aloud:

> "Got it — [NegRisk multi-question market / binary market]: **[question]**. Is this correct?"

Wait for confirmation before continuing.

---

## Step 2: Load Sponsor Keypair

Call `get_creator_keypair`. Extract `keypair.pubKeyX`, `keypair.pubKeyY`, `keypair.pubKeyHex`.

- Not found → stop: "Please run `clawsponsor` first to generate your keypair."

---

## Step 3: Parameter Collection

Show the fast-path hint **once**:

```
💡 Experienced user? Provide all at once:

  bounty: 5 USDT
  window: 2h
  min-miners: 2
  max-miners: 0
  min-commits: 0
  win-rate: 0%
  stake: 0
  max-invalid: 0

`max-miners: 0` = unlimited. `stake: 0` = no stake. `max-invalid: 0` = zero tolerance.
Or answer the questions below one by one.
```

If user provides fast-path block, parse all values, fill missing with defaults, skip to Step 4.

---

### Q1 — Bounty Amount _(required)_

> **What's the prize pool?**
> Winners split this equally (after 10% total fee: 5% protocol + 5% Auto-LP for whitelisted tokens).
> e.g. `50 USDT`, `100 USDC`
>
> Which token? **USDT** (default) / USDC — both are whitelisted and activate CLAW mining + Auto-LP.
> Non-whitelisted tokens are accepted but no CLAW is minted.

---

### Q2 — Commit Window _(default: 2h)_

> **How long should miners have to join?**
> Contract checks only one hard condition: `commitEndTime` must be in the future at execution time.
> Operationally, it should also close before Polymarket resolves.
> Default: **2 hours from now**. Enter `30min`, `24h`, `3 days`, or a specific datetime.
>
> Safety note:
> - Use Unix timestamp in **seconds** (not milliseconds).
> - Keep at least 15–30 minutes buffer from "now" to avoid `InvalidTime` due to execution delay/timezone mistakes.
> - **Always use chain time as source of truth**:
>   1) call `get_latest_block` (or read chain timestamp via task-status flow),
>   2) set `commitEndTime = chainNow + durationSeconds`.
> - Do **not** rely on AI session clock or manually typed "current UTC" as authoritative.

---

### Q3 — Min Miners _(default: 2)_

> **Minimum miners required?**
> Below this threshold at window close → you can claim a full refund.
> Default: **2**.

---

### Q4 — Max Miners _(default: 0 = unlimited)_

> **Maximum miners allowed?**
> 0 = no cap. Default: **0**.

---

### Q5 — Min Commits _(default: 0)_

> **Require participation history?**
> Minimum past commits a miner must have. 0 = open to all including new miners.
> Tip: combine with min win-rate — win rate alone is gameable by sybils with one lucky commit.
> Default: **0**.

---

### Q6 — Min Win Rate _(default: 0%)_

> **Minimum historical win rate?**
> 0% = no filter. 50% = only miners with at least 50% historical accuracy.
> Default: **0%**.

---

### Q7 — Max Invalid Commits _(default: 0)_

> **Maximum invalid commit history allowed?**
> 0 = zero tolerance (filters out miners who submitted bad ZK proofs historically).
> Default: **0**.

---

### Q8 — Required Stake _(default: 0)_

> **Should miners stake bounty token to prevent spam?**
> Miners who commit but don't reveal by deadline forfeit their stake to the winner pool.
> Default: **0 (no stake)**.

---

## Step 4: Pre-Flight Balance Check

**1. Gas (POL)**
`get_wallet_info` → use returned `address` and `balancePOL`. Require `balancePOL` ≥ `0.05 POL` (single) or `0.05 × N POL` (batch).

- Insufficient → block and wait:
  > ⚠️ Low POL: you have `[balance]` but need `[required]`. Send POL to: `[walletAddress]`

**2. Bounty Token**
`get_token_balance(tokenAddress)` → use returned `balance`, `rawBalance`, `symbol`, `address`. Require token balance ≥ bountyAmount (or total for batch).

- Insufficient → block and wait:
  > ⚠️ Insufficient `[token]`: shortfall `[amount]`. Send to: `[walletAddress]`

Re-check when user says topped up. Only proceed when both pass.

---

## Step 5: Confirmation

```
📋 Task Configuration

Market:         [event question]
Task Type:      [NegRisk multi-question / Binary]
Target ID:      0x[...]
─────────────────────────────────────────
Bounty:         [amount] [token]
  → Winners share this equally (after 10% fee for whitelisted tokens)
Commit Closes:  [datetime] (in [X] hours)
Min Miners:     [n]    → Refund available if not reached
Max Miners:     [n]    → 0 = unlimited
Min Commits:    [n]    → 0 = open to all
Min Win Rate:   [n]%   → Combine with Min Commits for real quality signal
Max Invalid:    [n]    → 0 = zero tolerance
Required Stake: [amount] [bounty token]
─────────────────────────────────────────
Sponsor PubKey: [pubKeyX first 16 chars]...
  → Miners encrypt predictions with this; only you can decrypt

💰 Wallet:
   POL:      [balance] ✅
   [token]:  [balance] ✅
```

Ask: **"Shall I submit this to the blockchain?"**

---

## Step 6: Execute

On confirmation, call `create_task` with all parameters including `creatorPubKeyX`, `creatorPubKeyY`, `creatorPubKey`.

Parameter mapping note:

- `creatorPubKeyX = keypair.pubKeyX`
- `creatorPubKeyY = keypair.pubKeyY`
- `creatorPubKey = keypair.pubKeyHex`

On success:

- Read `taskId`, `txHash`, `blockNumber` from `create_task` result.
- Call `save_creator_task_record(taskId, targetId, isNegRisk, createdBlock=blockNumber, commitEndTime, bountyAmount, bountyToken)`.
- Output:

```
✅ Task [taskId] is live!
   Tx: [txHash]
   Created Block: [blockNumber]

Next steps:
   • Decrypt miner predictions anytime before Polymarket settles:
     run clawsponsor → "Decrypt predictions" → task [taskId]
   • Prove-all-lost shortcut (strict conditions):
     only if market is settled, no miner has revealed yet, minMiners is reached,
     and decrypted signals show every committed miner is losing.
     Then run clawsponsor → "Prove all lost" (or "Prove all lost auto").
   • If < [minMiners] miners joined:
     run clawsponsor → "Refund" → task [taskId]
```

On failure:

- Show revert reason.
- `ContractPaused` → "The protocol is paused. New tasks cannot be created. Try again later."
- `InvalidTime` → "commitEndTime must be strictly in the future at tx execution time (`> block.timestamp`). Check seconds vs milliseconds and timezone, then retry with larger buffer."
