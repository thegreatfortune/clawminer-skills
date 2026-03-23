---
name: clawminer_analyze_politics
description: Domain analysis template for politics prediction tasks, with emphasis on resolution wording, speaker behavior, policy catalysts, and event timing.
---

# ClawMiner Analyze Politics

## Mission

Use this skill for political prediction events, especially:

- elections
- speeches and wording markets
- appointments and cabinet selections
- legislation and executive actions
- diplomacy, sanctions, tariffs, and geopolitical moves

Always pair the political analysis with the `eventType` selected by `clawminer_analyze`, especially:

- `binary statement`
- `scheduled event`
- `election / appointment`
- `policy / regulation`

## Core Rule

Do not reduce political analysis to PM odds.
Political markets often move on narrative and headlines before resolution details are fully understood.
You must build an independent view first.

## Event-Type Lens

Adapt the analysis to the selected `eventType`:

- `binary statement` -> focus on wording rules, speaking venues, transcript boundaries, and historical phrasing habits.
- `scheduled event` -> focus on the known calendar window, appearance likelihood, and catalyst timing.
- `election / appointment` -> focus on coalition math, nomination mechanics, incentives, vote timing, and institutional process.
- `policy / regulation` -> focus on formal process, court or agency steps, announcement threshold, and legal enforceability.
- For any other `eventType`, state why politics remains the correct `industry` and then adapt the closest political framework honestly.

## Resolution-First Checklist

Always state:

- `resolutionRuleSummary`
- `ambiguousTerms`
- `whatCounts`
- `whatDoesNotCount`
- `timeBoundary`
- `dataSourceForSettlement`
- `invalidityRisk`

Special attention for politics:

- whether written posts count or only spoken remarks count
- whether partial wording, synonyms, plurals, or quotations count
- whether official announcement, media leak, or nomination counts
- whether local timezone, ET, UTC, or election authority time controls settlement

## Political Analysis Framework

Build the view using these factors:

1. Actor map
   - who is the decision-maker or speaker
   - who can influence the outcome indirectly
2. Incentive map
   - what political or media incentive would push the actor toward the outcome
3. Schedule map
   - what public appearances, debates, votes, interviews, hearings, or diplomatic meetings are inside the market window
4. Historical behavior
   - prior phrasing habits
   - prior policy positioning
   - tendency to repeat certain talking points
5. Catalyst map
   - breaking news
   - polling changes
   - court rulings
   - legislative deadlines
   - geopolitical events
6. Counter-case
   - why the expected event might not happen even if narrative says it should

## Evidence Priorities

Prefer higher-weight evidence:

- official schedules
- primary-source transcripts
- direct statements
- official filings or agency releases
- vote calendars
- reliable major reporting with named sourcing

Lower-weight evidence:

- social media speculation
- partisan clipping without source context
- recycled narratives without a dated catalyst

## Politics Domain Template Output

In addition to the shared output fields, explicitly include:

- `keyFigures`
- `weeklyScheduleOrPublicActivityWindow`
- `recentTalkingPoints`
- `historicalPhrasingHabits`
- `eventTriggerConditions`
- `primarySupportingEvidence`
- `primaryContraryEvidence`
- `semanticOrSettlementBoundaryRisk`

## Output Requirements

Return:

- `industry = politics`
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

- resolution wording is clear
- political schedule or catalyst is concrete
- your view is grounded in identifiable evidence
- market pricing appears stale, overreactive, or too narrative-driven

Lean `SKIP` when:

- the market depends on vague wording interpretation
- there is no reliable event window or catalyst
- your thesis depends mostly on “this sounds like something they would say”
- evidence quality is weak or contradictory
