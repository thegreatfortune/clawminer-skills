---
name: clawsponsor
description: Master skill for Task Sponsors. Use when the user wants to fund a Polymarket prediction bounty — including when they paste a Polymarket URL — or wants to decrypt miner predictions after they commit, or needs to refund a task.
---

# ClawSponsor Master Skill (Bounty Sponsor)

## Language Rule
**Always respond in the same language the user is writing in.** Chinese input → Chinese reply. English input → English reply. Never switch languages unless the user does first.

## Time Display Rule
- Display all timestamps in OpenClaw local timezone by default.
- Do not show UTC-only output unless user explicitly asks for UTC.
- For key fields (`commitEndTime`, `revealEndTime`, market end/resolution times), show:
  - local datetime
  - raw unix seconds
- Settlement/eligibility checks must still rely on chain timestamps and on-chain conditions.

## Tool Invocation Contract
- This repo uses script mode; follow `clawtools` for all command calls.
- Canonical format: `node dist/cli.js call <tool_name> --json '{...}'`

---

## Protocol Context

Fully decentralized — no server, no dashboard. Everything runs through the ClawCore smart contract on Polygon. For full protocol details see the `clawcore` skill.

**Whitelisted Bounty Tokens (activate CLAW mining + Auto-LP):**
- USDT `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` — LP base token
- USDC `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`

Non-whitelisted tokens are accepted but miners receive 100% bounty with no CLAW minted and no Auto-LP.

**Commit Window Timing:** Set `commitEndTime` from **chain block time** (`chainNow + N`) and keep it at least **1–4 hours before** Polymarket resolves.

---

## Full Task Lifecycle

```
Sponsor: createTask(targetId, isNegRisk, bountyToken, bountyAmount, commitEndTime, ...)
         ↓  [bounty locked; fee rates snapshotted; sponsor Baby Jubjub pubkey embedded]

Miner:   commitTask(taskId, commitHash, ephPubX, ephPubY, cipher0, cipher1, zkProof)
         ↓  [Groth16 proof verified on-chain; agentId auto-minted if new miner]
         ↓  [cipher0 = pack(questionIndex, outcomeIndex) + shared.out[0] — ElGamal encrypted]

         — commit window closes —
         — Polymarket CTF condition(s) settle —

Path A — Miners reveal normally:
Miner:   revealPrediction(taskId, questionIndex, outcomeIndex, salt)
Miner:   claimReward(taskId)

Path B — Sponsor proves all lost (instant refund, no reveal window needed):
Sponsor: decrypt_miner_prediction × N  → get questionIndex, outcomeIndex, salt per miner
Sponsor: creator_prove_all_lost(taskId, agentIds[], questionIndices[], outcomeIndices[], salts[])
         ↓  [contract verifies Poseidon hash for each; refunds bounty + forfeited stakes]

Path C — Standard refund after reveal window:
Sponsor: refundCreator(taskId)
         ↓  [Condition 1: minMiners not reached → full bounty, no fees]
         ↓  [Condition 2: no correct miners → protocol fee + Auto-LP, net returned]
         ↓  [Condition 3: n≥2 No-only → full bounty returned; No miners CLAW-only]
```

**Sponsor Privacy Advantage:** Each miner's `(questionIndex, outcomeIndex)` is ElGamal-encrypted with the sponsor's Baby Jubjub public key. Only the sponsor — with the matching private key — can decrypt before Polymarket settles.

---

## Session Startup Sequence

Runtime note:
- Do not create ad-hoc sponsor cron jobs manually in this skill.
- Use `clawcore` unified runtime bootstrap as the default way to ensure scheduler jobs.
- This skill focuses on sponsor execution logic after runtime jobs are already ensured.

### Check 1: Wallet
Call `get_wallet_info`.
- Error or no wallet → stop, tell user to run `clawcore` first.
- Save wallet address and POL balance for later pre-flight check.

### Check 2: Sponsor Keypair
Call `get_creator_keypair`.
- Found → load silently, continue.
- Not found → inform user, then call `generate_creator_keypair`:
  > "You don't have a Sponsor Keypair yet. I'll generate one now — it lets you decrypt miner predictions before Polymarket settles. The private key never leaves your machine."

### Check 3: Determine User Intent

**If user pasted a Polymarket URL:**
- Extract slug (path segment after `/event/`).
- Go directly to `clawsponsor_create_task` with slug pre-filled.

**Otherwise ask:**
- **A) Create a Bounty Task** → `clawsponsor_create_task`
- **B) Decrypt miner predictions** → Decrypt Predictions Flow
- **C) Prove all miners lost** → Prove All Lost Flow
- **D) Refund a failed task** → call `refund_creator`

---

## Decrypt Predictions Flow

Use after commit window closes, before Polymarket settles.

1. Ask for `taskId` if not provided.
2. Call `get_task_committed_logs(taskId)` → list of `{agentId, ephPubX, ephPubY, cipher0, cipher1}`.
3. For each miner call `decrypt_miner_prediction(ephPubX, ephPubY, cipher0, cipher1)` → `{questionIndex, outcomeIndex, salt}`.
4. Tally results and display:

```
📊 Miner Signal Summary — Task [taskId]
Commit window: [closed/closes at time]

Question breakdown (NegRisk tasks — skip for binary):
  Q0: YES [n] | NO [n]
  Q1: YES [n] | NO [n]
  ...

Overall YES (outcomeIndex=0): [n] miners  ████████░░  [pct]%
Overall NO  (outcomeIndex=1): [n] miners  ██░░░░░░░░  [pct]%

Consensus: [YES/NO] ([pct]% agreement)
Failed to decrypt: [n]  ← should be 0 if keypair is correct

💡 Polymarket hasn't settled yet — this is your private signal.
```

5. Display immediately — no confirmation needed.

---

## Prove All Lost Flow

Use when CTF has settled and you know all miners predicted wrong. This skips the reveal window entirely.

**Preconditions:** commit window closed + CTF settled + no reveals yet + minMiners reached.

1. Ask for `taskId` if not provided.
2. Call `get_task_committed_logs(taskId)` → list of miners.
3. For each miner call `decrypt_miner_prediction` → `{questionIndex, outcomeIndex, salt}`.
4. Verify each decrypted outcome is indeed a loser (optional sanity check you can describe to user).
5. Call `creator_prove_all_lost(taskId, agentIds, questionIndices, outcomeIndices, salts)`.
   - If there are many miners (>20), batch into groups and call sequentially.
6. On success: bounty + all forfeited stakes returned to sponsor in the same transaction.

> ⚠️ If any miner actually won, the contract will revert with `HasWinners`. Use `refund_creator` instead after the reveal window.

---

## Example Self-Execution Log
"User pasted https://polymarket.com/event/fed-rate-cut-march-2025. Slug: fed-rate-cut-march-2025. Keypair loaded. Going to clawsponsor_create_task."
