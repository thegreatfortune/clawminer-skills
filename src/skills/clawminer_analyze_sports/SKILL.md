---
name: clawminer_analyze_sports
description: Domain analysis template for sports prediction tasks, with emphasis on lineups, injuries, schedule density, matchups, and competition context.
---

# ClawMiner Analyze Sports

## Mission

Use this skill for sports prediction events, especially:

- match winners
- totals and score-related thresholds
- player props
- league placements and qualification outcomes
- transfer, injury, or award-related outcomes

Always pair the sports analysis with the `eventType` selected by `clawminer_analyze`, especially:

- `sports outcome`
- `numeric threshold`
- `scheduled event`

## Core Rule

Do not let bookmaker-like market price replace sports analysis.
Sports prediction should be driven by team and player fundamentals first.

## Event-Type Lens

Adapt the analysis to the selected `eventType`:

- `sports outcome` -> focus on winner, qualification, advancement, player outcome, and competition context.
- `numeric threshold` -> focus on score, total, stat, or count conditions and how game state affects the threshold path.
- `scheduled event` -> focus on lineup timing, rest, travel, and known timing windows before the event starts.
- For any other `eventType`, state why sports remains the correct `industry` and adapt the closest sports framework honestly.

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

Special attention for sports:

- regulation time versus extra time versus penalties
- official league/stat provider for settlement
- player must start versus simply appear
- void conditions for postponement or cancellation

## Sports Analysis Framework

Build the view using these factors:

1. Competition context
   - league, cup, playoff, group stage, elimination stakes
2. Team or player fundamentals
   - recent form
   - home and away split
   - attack versus defense profile
3. Availability
   - injuries
   - suspensions
   - rotation risk
   - expected lineup
4. Schedule pressure
   - travel
   - fixture congestion
   - rest disadvantage
5. Matchup factors
   - tactical fit
   - pace control
   - set-piece or transition edges
6. Motivation and incentives
   - relegation fight
   - title race
   - qualification pressure
   - rest incentives
7. Counter-case
   - what makes the obvious angle weaker than it looks

## Evidence Priorities

Prefer:

- official injury reports and lineup news
- credible beat reporting
- competition schedule and travel context
- underlying performance indicators when relevant

Use caution with:

- raw headline win streaks without opponent context
- small-sample historical head-to-head records
- fan sentiment and narrative bias

## Sports Domain Template Output

In addition to the shared output fields, explicitly include:

- `matchupFundamentals`
- `recentForm`
- `homeAwayContext`
- `lineupInjuriesAndAvailability`
- `scheduleDensity`
- `motivation`
- `matchupAnalysis`
- `contrarianRiskPoints`

## Output Requirements

Return:

- `industry = sports`
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

- settlement mechanics are clear
- lineup and motivation picture is sufficiently stable
- your edge comes from matchup or availability analysis, not vibes
- market seems slow to reflect team news or context

Lean `SKIP` when:

- key lineup uncertainty remains unresolved
- settlement depends on unclear stat attribution
- your thesis is mostly brand strength or public sentiment
- randomness dominates and edge is not durable
