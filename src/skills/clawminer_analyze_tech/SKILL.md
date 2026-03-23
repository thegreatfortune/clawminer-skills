---
name: clawminer_analyze_tech
description: Industry analysis template for technology prediction tasks, with emphasis on product timelines, launch mechanics, platform adoption, and official source validation.
---

# ClawMiner Analyze Tech

## Mission

Use this skill for technology prediction events, especially:

- AI model or product releases
- hardware launches
- software or platform rollouts
- app-store or ecosystem distribution events
- company product announcements with clear resolution conditions

Always pair the tech analysis with the `eventType` selected by `clawminer_analyze`, especially:

- `scheduled event`
- `numeric threshold`
- `policy / regulation`
- `product / protocol launch`

## Core Rule

Do not mistake product hype for evidence of delivery.
Tech markets often overprice announcements and underprice operational delays, staged rollout constraints, and scope caveats.

## Event-Type Lens

Adapt the analysis to the selected `eventType`:

- `scheduled event` -> focus on launch calendar, keynote, developer event, roadmap timing, and likely slippage.
- `numeric threshold` -> focus on shipment, user, ranking, or adoption thresholds and whether the metric source is authoritative.
- `policy / regulation` -> focus on platform rules, antitrust, export controls, privacy rules, or AI governance that may shape the outcome.
- `product / protocol launch` -> focus on what qualifies as launch, GA versus beta, regional rollout, feature gating, and source-of-truth.
- For any other `eventType`, state why tech remains the correct `industry` and adapt the closest framework honestly.

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

Special attention for tech:

- preview versus full launch
- limited beta versus general availability
- announced capability versus shipped capability
- platform-specific release versus global release
- official blog, keynote, docs, or app-store record as source-of-truth

## Tech Analysis Framework

Build the view using these factors:

1. Product definition and launch threshold
2. Roadmap realism and shipping history
3. Technical or operational dependencies
4. Distribution channel and rollout scope
5. Demand and adoption driver map
6. Counter-case and delay risk

## Evidence Priorities

Prefer:

- official product blogs, docs, keynotes, release notes, and app-store listings
- company filings or investor materials when relevant
- credible developer or platform reporting with primary sourcing

Use caution with:

- rumor aggregators
- screenshot leaks without provenance
- promotional hype presented as evidence of launch readiness

## Tech Domain Template Output

In addition to the shared output fields, explicitly include:

- `productOrPlatformDefinition`
- `launchCriteria`
- `rolloutScope`
- `roadmapOrShippingHistory`
- `technicalOrOperationalDependencies`
- `adoptionDrivers`
- `executionOrDelayRisks`

## Output Requirements

Return:

- `industry = tech`
- `eventType`
- `resolutionRuleSummary`
- `ambiguousTerms`
- `whatCounts`
- `whatDoesNotCount`
- `timeBoundary`
- `dataSourceForSettlement`
- `invalidityRisk`
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

- launch or rollout criteria are clearly defined
- there is a concrete timeline and credible shipping path
- your thesis identifies delivery friction or adoption drivers the market may be missing
- market pricing looks too hype-driven or too anchored to stale roadmap assumptions

Lean `SKIP` when:

- “launch” is undefined
- evidence is mostly rumor or keynote wish-casting
- rollout scope is unclear enough to create settlement ambiguity
- the expected edge depends only on brand narrative
