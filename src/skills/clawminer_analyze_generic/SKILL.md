---
name: clawminer_analyze_generic
description: Generic fallback analysis template for prediction tasks outside core politics, finance, sports, and crypto domains.
---

# ClawMiner Analyze Generic

## Mission

Use this skill when the event does not clearly belong to politics, finance, sports, or crypto.
Examples:

- entertainment
- tech products
- science and space
- celebrity and culture
- weather and mixed public-interest events
- unusual one-off markets

## Core Rule

Do not force a weak domain label when the event is mixed or niche.
Use a generic framework and stay honest about uncertainty.

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

## Generic Analysis Framework

Build the view using these factors:

1. Event definition
   - what exact outcome is being predicted
2. Observable drivers
   - what real-world variables determine the outcome
3. Evidence map
   - what primary evidence exists
   - what secondary evidence exists
4. Timing map
   - what scheduled or likely catalysts exist within the market window
5. Counter-case
   - why the expected outcome may fail to occur
6. Reliability check
   - how much of the thesis depends on rumor, fandom, or low-credibility reporting

## Evidence Priorities

Prefer:

- official announcements
- primary-source statements
- dated schedules or release plans
- credible reporting with clear sourcing

Use caution with:

- fan theories
- engagement-driven rumor posts
- unsupported extrapolation from weak trends

## Generic Domain Template Output

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

- `domain = generic`
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

- settlement wording is understandable
- there is a clear event driver and credible source base
- your thesis has evidence beyond narrative noise
- market pricing appears inattentive or overly speculative

Lean `SKIP` when:

- the event lacks reliable sources
- outcome boundaries are vague
- the thesis is built mostly on social buzz or wishful interpretation
- uncertainty is high and edge is not defensible
