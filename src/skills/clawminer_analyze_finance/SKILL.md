---
name: clawminer_analyze_finance
description: Domain analysis template for finance prediction tasks, with emphasis on macro catalysts, earnings, consensus expectations, and market pricing gaps.
---

# ClawMiner Analyze Finance

## Mission

Use this skill for financial prediction events, especially:

- macro data releases
- central bank decisions and speeches
- earnings outcomes and guidance
- stock, index, FX, commodity, or rate thresholds
- regulatory or policy actions with market impact

Always pair the finance analysis with the `eventType` selected by `clawminer_analyze`, especially:

- `scheduled event`
- `numeric threshold`
- `market price trigger`
- `policy / regulation`
- `product / protocol launch` when the market is primarily about a public company or technology release with financial impact

## Core Rule

Do not treat price action or PM odds as the thesis.
Finance analysis must separate:

- what the event is
- what consensus expects
- what is already priced in
- where the mispricing may be

## Event-Type Lens

Adapt the analysis to the selected `eventType`:

- `scheduled event` -> focus on the calendar, release mechanics, consensus, and event timing.
- `numeric threshold` -> focus on threshold mechanics, path dependency, and what real-world drivers control the variable.
- `market price trigger` -> focus on exact source price, timing window, liquidity, and whether the trigger depends on transient moves or durable repricing.
- `policy / regulation` -> focus on regulator timing, legal process, compliance scope, and transmission into financial outcomes.
- `product / protocol launch` -> focus on whether the launch has direct financial relevance through revenue, adoption, guidance, cost structure, or market sentiment.
- For any other `eventType`, state why finance remains the correct `industry` and adapt the closest finance framework honestly.

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

Special attention for finance:

- exact release source
- close price versus intraday touch
- regular session versus after-hours inclusion
- revised data versus first print
- company guidance versus analyst interpretation

## Financial Analysis Framework

Build the view using these factors:

1. Event definition
   - what exact variable or threshold decides the market
2. Consensus and expectation gap
   - what market participants likely expect now
3. Catalyst calendar
   - CPI, payrolls, FOMC, earnings date, product launch, regulatory deadline, or other dated triggers
4. Transmission path
   - why the outcome should happen in the real world, not just on the chart
5. Positioning and sentiment
   - whether the crowd is one-sided
6. Counter-case
   - what would invalidate the thesis or keep the event from triggering

## Evidence Priorities

Prefer:

- official economic calendars and releases
- company filings, investor relations, earnings transcripts
- central bank statements
- exchange and regulator notices
- direct price definition from the settlement rule

Use caution with:

- financial social media narratives
- post-hoc chart storytelling
- unsupported “whisper numbers”

## Finance Domain Template Output

In addition to the shared output fields, explicitly include:

- `relatedAssetsOrCompanies`
- `coreCatalyst`
- `keyTimingPoints`
- `currentConsensus`
- `expectationGapSource`
- `keyDataCalendar`
- `pricedInAssessment`
- `upsideAndDownsideScenarios`

## Output Requirements

Return:

- `industry = finance`
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

- settlement mechanics are precise
- the catalyst is time-bounded and observable
- you can explain why consensus may be wrong or incomplete
- edge survives after considering uncertainty and market pricing

Lean `SKIP` when:

- the market is almost entirely a price-momentum chase
- settlement wording is unclear on source or time window
- there is no identifiable fundamental or macro edge
- event risk is binary but evidence quality is low
