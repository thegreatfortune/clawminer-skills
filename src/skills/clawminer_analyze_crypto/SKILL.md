---
name: clawminer_analyze_crypto
description: Domain analysis template for crypto prediction tasks, with emphasis on tokenomics, governance, on-chain behavior, protocol risk, and narrative-versus-fundamental gaps.
---

# ClawMiner Analyze Crypto

## Mission

Use this skill for crypto prediction events, especially:

- token price or market-cap thresholds
- governance proposals
- protocol launches or upgrades
- listings, airdrops, unlocks, and emissions events
- exploit, outage, or regulation-driven outcomes

Always pair the crypto analysis with the `eventType` selected by `clawminer_analyze`, especially:

- `market price trigger`
- `numeric threshold`
- `policy / regulation`
- `product / protocol launch`
- `scheduled event`

## Core Rule

Crypto markets move fast and narratives can outrun fundamentals.
Do not assume price, sentiment, or social attention is sufficient analysis.

## Event-Type Lens

Adapt the analysis to the selected `eventType`:

- `market price trigger` -> focus on exact asset source, exchange or oracle source, liquidity, and path-to-trigger dynamics.
- `numeric threshold` -> focus on supply, activity, governance counts, user counts, TVL levels, or threshold mechanics depending on settlement.
- `policy / regulation` -> focus on regulator announcements, exchange responses, compliance effects, and second-order impact on the asset or protocol.
- `product / protocol launch` -> focus on mainnet versus testnet, governance approval, deployment reality, and authoritative source-of-truth.
- `scheduled event` -> focus on unlock date, upgrade schedule, vote deadline, or listing timetable.
- For any other `eventType`, state why crypto remains the correct `industry` and adapt the closest crypto framework honestly.

## Resolution-First Checklist

Always state:

- `resolutionRuleSummary`
- `ambiguousTerms`
- `whatCounts`
- `whatDoesNotCount`
- `timeBoundary`
- `dataSourceForSettlement`
- `invalidityRisk`
- `ambiguityNotes`

Special attention for crypto:

- which chain, token contract, oracle, or exchange price source is authoritative
- spot price versus fully diluted valuation interpretation
- snapshot time and timezone
- governance proposal status required for “passed” or “launched”
- testnet versus mainnet ambiguity

## Crypto Analysis Framework

Build the view using these factors:

1. Protocol or asset definition
   - what exact asset, chain, or proposal determines settlement
2. Fundamental driver map
   - TVL, fees, activity, governance traction, emissions, unlocks, treasury, or security posture
3. Event catalyst
   - upgrade date, unlock schedule, listing rumor versus confirmed listing, governance deadline, regulator action
4. On-chain versus off-chain narrative
   - what the chain data says versus what the crowd is saying
5. Liquidity and reflexivity
   - whether price can overshoot because of thin liquidity or leveraged narrative flows
6. Counter-case
   - what could delay, invalidate, or reverse the expected outcome

## Evidence Priorities

Prefer:

- official governance forums and vote pages
- token documentation and unlock schedules
- official protocol announcements
- on-chain observable behavior when accessible
- exchange or regulator announcements

Use caution with:

- anonymous rumor accounts
- engagement-driven narratives with no primary source
- unsupported roadmap assumptions

## Crypto Domain Template Output

In addition to the shared output fields, explicitly include:

- `protocolOrAssetFundamentals`
- `onchainIndicators`
- `governanceUpgradeOrUnlockState`
- `regulatoryOrExchangeFactors`
- `securityRisk`
- `narrativeStrength`
- `priceVsFundamentalsDislocation`

## Output Requirements

Return:

- `industry = crypto`
- `eventType`
- `resolutionRuleSummary`, `ambiguousTerms`
- `whatCounts`, `whatDoesNotCount`
- `timeBoundary`, `dataSourceForSettlement`, `invalidityRisk`
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

## Decision Guidance

Lean `SUBMIT` when:

- settlement source is precise
- the catalyst is concrete and time-bounded
- there is a clear mismatch between narrative, fundamentals, and market pricing
- your thesis survives reflexivity and liquidity-risk review

Lean `SKIP` when:

- the market depends on vague roadmap promises
- settlement is unclear on source or chain
- the thesis is only “crypto is hot” or “everyone expects a pump”
- exploit, governance, or listing assumptions are too rumor-driven
