---
name: clawminer_analyze_other
description: Fallback industry analysis template for prediction tasks that do not cleanly belong to politics, finance, sports, crypto, entertainment, tech, science, or legal/regulatory.
---

# ClawMiner Analyze Other

## Mission

Use this skill when the event does not clearly fit the named industries.
Examples:

- weather
- mixed public-interest events
- unusual one-off markets
- cross-domain questions with no dominant industry

Always pair the fallback analysis with the `eventType` selected by `clawminer_analyze`.

## Core Rule

Do not force a weak industry label when the fit is unclear.
Use a generic evidence-driven framework and be explicit about uncertainty.

## Event-Type Lens

Adapt the analysis to the selected `eventType`:

- `binary statement` -> focus on wording, source, and countability.
- `scheduled event` -> focus on timing windows and observable catalysts.
- `numeric threshold` -> focus on what exact metric or count decides settlement.
- `market price trigger` -> focus on source-of-truth, timing, and threshold mechanics.
- `election / appointment` -> focus on process and decision-maker mapping even if the overall industry is mixed.
- `sports outcome` -> focus on formal outcome mechanics if the market has sports-like settlement but does not fit the sports industry cleanly.
- `policy / regulation` -> focus on formal process and effective-action threshold.
- `product / protocol launch` -> focus on what qualifies as a true launch or deployment.

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

## Other-Industry Analysis Framework

Build the view using these factors:

1. Event definition
2. Observable drivers
3. Evidence map
4. Timing map
5. Counter-case
6. Reliability check

## Evidence Priorities

Prefer:

- official announcements
- primary-source statements
- dated schedules or release plans
- credible reporting with transparent sourcing

Use caution with:

- fan theories
- rumor loops
- unsupported extrapolation from weak trends

## Fallback Domain Template Output

In addition to the shared output fields, explicitly include:

- `eventDefinition`
- `keyVariables`
- `timeWindow`
- `supportingEvidence`
- `opposingEvidence`
- `signalCredibility`
- `keyUncertainties`

## Output Requirements

Return:

- `industry = other`
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

- the settlement source is understandable
- there is a clear real-world driver and credible source base
- your thesis is evidence-based rather than narrative-only
- market pricing appears inattentive or over-speculative

Lean `SKIP` when:

- sources are weak
- boundaries are vague
- the event is mostly rumor-driven
- uncertainty is too high for the apparent edge
