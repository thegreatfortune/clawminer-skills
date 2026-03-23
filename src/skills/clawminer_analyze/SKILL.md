---
name: clawminer_analyze
description: Persistent analyze worker step. Process one candidate per cycle using resolution-first research, route to a domain analysis template, decide SUBMIT/SKIP, then hand off to clawminer_execute.
---

# ClawMiner Analyze

## Language Rule

- Always respond in the same language as the user.

## Time Display Rule

- Render `eventEndTime` and any timing hints in OpenClaw local timezone.
- Keep raw unix seconds in payload/storage for deterministic follow-up steps.

## Tool Invocation Contract

- Follow `clawtools` for all tool call syntax and payload fields.
- Canonical format: `node dist/cli.js call <tool_name> --json '{...}'`
- Do not call plugin runtime tools directly.

## Runtime Mode

- This skill is intended to run in a persistent single-thread loop.
- Process one candidate per cycle.
- If no candidate is available, sleep 60 seconds and retry.

## Mission

Turn a shortlisted task into a disciplined prediction decision.
This skill must do more than check PM price. It must:

- understand how the market resolves
- form an independent thesis before using market price as calibration
- classify the event by industry and event type before analysis
- apply an industry-specific template for politics, finance, sports, crypto, entertainment, tech, science, legal/regulatory, or other events
- decide whether the expected edge justifies stake and execution risk

## Input

Candidate task context from `clawminer_explore`:

- `taskId`, `targetId`, `isNegRisk`
- one or more candidate `conditionId`s (for NegRisk)
- `questionIndex` proposal (NegRisk) or `0` (non-NegRisk)
- `bountyAmount`, `requiredStake`, miner counts
- `eventSlug`, `eventEndTime`
- optional event title, question text, event metadata, shortlist ranking hints

## Hard Rules

- Do not rely on PM odds alone.
- Do not `SUBMIT` unless you can explain the event in plain language, summarize the resolution rule, and produce an independent view.
- Use PM market price only after independent reasoning, as calibration and disagreement check.
- If the event wording is materially ambiguous, resolution risk is high, or evidence quality is weak, prefer `SKIP`.
- First classify the event by `industry` and `eventType`, then analyze.
- If no domain-specific template clearly fits, use the `other` template instead of forcing a weak classification.

## Mandatory Classification Layer

Before analysis, classify the candidate into exactly one `industry`:

- `politics`
- `finance`
- `sports`
- `crypto`
- `entertainment`
- `tech`
- `science`
- `legal/regulatory`
- `other`

Then classify it into exactly one primary `eventType`:

- `binary statement`
- `scheduled event`
- `numeric threshold`
- `market price trigger`
- `election / appointment`
- `sports outcome`
- `policy / regulation`
- `product / protocol launch`

Suggested industry routing rules:

- Elections, leaders, legislation, geopolitics, speeches, appointments -> `politics`
- Macro, stocks, rates, CPI, payrolls, earnings, FX, commodities -> `finance`
- Match results, player stats, league outcomes, transfers, injuries -> `sports`
- Tokens, chains, protocols, governance, listings, airdrops, exploits -> `crypto`
- Films, TV, music, awards, celebrity, streaming, culture -> `entertainment`
- Consumer tech, AI launches, hardware, product releases, platform changes -> `tech`
- Space, biotech, medicine, climate science, academic research milestones -> `science`
- Courts, regulators, legislation, agency rulings, enforcement, compliance -> `legal/regulatory`
- Weather, mixed public-interest topics, unusual one-offs, unclear fits -> `other`

Suggested event-type rules:

- Use `binary statement` for wording, mention, quote, or speech-count markets.
- Use `scheduled event` for outcomes tied to a known date, hearing, debate, launch window, release, or meeting.
- Use `numeric threshold` for count-, level-, or score-based triggers.
- Use `market price trigger` for asset price, market cap, yield, FX, or index level triggers.
- Use `election / appointment` for elections, nominations, confirmations, leadership changes, and cabinet roles.
- Use `sports outcome` for match winners, qualification, player props, league placement, and game results.
- Use `policy / regulation` for laws, rulemaking, court rulings, enforcement actions, and official policy changes.
- Use `product / protocol launch` for product releases, feature rollouts, chain launches, upgrades, listings, and protocol deployments.

## Industry Skill Routing

After classification, route by `industry` to the matching subskill:

- `clawminer_analyze_politics`
- `clawminer_analyze_finance`
- `clawminer_analyze_sports`
- `clawminer_analyze_crypto`
- `clawminer_analyze_entertainment`
- `clawminer_analyze_tech`
- `clawminer_analyze_science`
- `clawminer_analyze_legal_regulatory`
- `clawminer_analyze_other`

The chosen subskill must incorporate the selected `eventType` into its reasoning.

Example:

- `politics` + `binary statement` -> speech, quote, or wording analysis
- `finance` + `market price trigger` -> threshold, catalyst, and settlement-source analysis
- `sports` + `sports outcome` -> lineup, matchup, and competition-context analysis
- `crypto` + `product / protocol launch` -> governance, deployment, and source-of-truth analysis
- `legal/regulatory` + `policy / regulation` -> court, regulator, and formal-rule analysis

## Required Analysis Sequence

1. Resolve the exact prediction object:

- Non-NegRisk: single `conditionId`
- NegRisk: choose one `questionIndex -> conditionId`

2. Classify the event:

- choose exactly one `industry`
- choose exactly one `eventType`
- explain briefly why this classification is appropriate

3. Run resolution-first review:

- summarize what counts for settlement
- identify what does not count
- identify time boundary, timezone boundary, and source-of-truth boundary
- identify ambiguity or invalidity risk

4. Build an independent view before reading odds deeply:

- what outcome is more likely
- why
- what evidence supports it
- what evidence argues against it

5. Route into the matching industry skill and apply the event-type lens.
6. Read PM market signals using `get_market_by_condition_id` and optional event context using `get_event_details`.
7. Compare your independent view against market-implied probability.
8. Evaluate operational fit:

- bounty share estimate
- stake loss risk
- reveal timing burden
- competition level

9. Decide:

- `SUBMIT` only if thesis, resolution clarity, confidence, and reward/risk all justify participation
- otherwise `SKIP`

## Mandatory Resolution-First Output

Every analysis must explicitly state:

- `resolutionRuleSummary`
- `ambiguousTerms`
- `whatCounts`
- `whatDoesNotCount`
- `timeBoundary`
- `dataSourceForSettlement`
- `invalidityRisk`

`ambiguousTerms` should list the specific words, phrases, or boundary concepts most likely to create settlement confusion.

## Mandatory Research Output

Every analysis must explicitly state:

- `industry`
- `eventType`
- `thesis`
- `antiThesis`
- `keyDrivers`
- `evidenceFor`
- `evidenceAgainst`
- `subjectiveProbability`
- `marketImpliedProbability`
- `edge`
- `confidence`
- `timingRisk`
- `competitionRisk`
- `decision`
- `decisionReason`

## Probability and Confidence Rules

- `subjectiveProbability` must come from your own reasoning, not copied from market price.
- `marketImpliedProbability` should be derived from PM pricing for the chosen outcome.
- `edge = subjectiveProbability - marketImpliedProbability`.
- `confidence` must reflect evidence quality and resolution clarity, not personal tone.
- If confidence is low, edge is unclear, or invalidity risk is elevated, prefer `SKIP`.

## Decision Standards

Use these principles when deciding `SUBMIT` vs `SKIP`:

- `SUBMIT` only when resolution is sufficiently clear and your view has identifiable edge.
- `SKIP` when thesis depends mainly on narrative vibes, crowd follow, or unsupported intuition.
- `SKIP` when payout is attractive but analysis quality is weak.
- `SKIP` when there is no durable reason that the market may be mispriced.

## Output Contract

Return a structured payload that remains compatible with `clawminer_execute` handoff.

Minimum output fields:

- `decision`
- `taskId`, `targetId`, `isNegRisk`
- `conditionId`, `questionIndex`, `outcomeIndex`
- `bountyAmount`, `requiredStake`
- `eventSlug`, `eventEndTime`
- `industry`, `eventType`
- `resolutionRuleSummary`, `ambiguousTerms`
- `whatCounts`, `whatDoesNotCount`
- `timeBoundary`, `dataSourceForSettlement`, `invalidityRisk`
- `thesis`, `antiThesis`, `keyDrivers`
- `subjectiveProbability`, `marketImpliedProbability`, `edge`, `confidence`
- `timingRisk`, `competitionRisk`, `decisionReason`
- `analysisResult`
- optional `raw_event_data`

`analysisResult` should be a structured JSON string or object-like record suitable for persistence in `save_task_record`.

## Handoff Rule

On `SUBMIT`, immediately call `clawminer_execute` with the selected payload.
On `SKIP`, persist or return enough analysis detail that future cycles can understand why the task was rejected.
