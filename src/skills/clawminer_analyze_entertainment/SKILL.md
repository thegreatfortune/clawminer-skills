---
name: clawminer_analyze_entertainment
description: Industry analysis template for entertainment prediction tasks, with emphasis on release schedules, publicity cycles, awards dynamics, and source credibility.
---

# ClawMiner Analyze Entertainment

## Mission

Use this skill for entertainment prediction events, especially:

- film and TV releases
- streaming launches and renewals
- music releases and chart events
- awards and nominations
- celebrity or culture events with clear settlement rules

Always pair the entertainment analysis with the `eventType` selected by `clawminer_analyze`, especially:

- `binary statement`
- `scheduled event`
- `numeric threshold`
- `product / protocol launch`

## Core Rule

Do not confuse publicity noise with reliable evidence.
Entertainment markets often move on fandom, rumor, and engagement farming before facts are confirmed.

## Event-Type Lens

Adapt the analysis to the selected `eventType`:

- `binary statement` -> focus on whether the quote, interview, appearance, or public statement will clearly happen and how it would be counted.
- `scheduled event` -> focus on release date, premiere window, ceremony date, announcement timing, and official distribution channel.
- `numeric threshold` -> focus on chart, box office, viewership, nominations, or count-based mechanics and the authority of the source.
- `product / protocol launch` -> focus on title release, trailer launch, season drop, platform launch, or official availability event.
- For any other `eventType`, state why entertainment remains the correct `industry` and adapt the closest framework honestly.

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

Special attention for entertainment:

- official release versus rumor or leak
- festival premiere versus wide release
- teaser versus full trailer
- nomination versus win
- chart source or box-office source used for settlement

## Entertainment Analysis Framework

Build the view using these factors:

1. Release or event calendar
2. Studio, platform, label, or organizer incentives
3. Marketing and publicity cadence
4. Official confirmation strength
5. Audience traction versus industry reality
6. Counter-case and delay risk

## Evidence Priorities

Prefer:

- official studio, streamer, label, or organizer announcements
- official award bodies and chart providers
- confirmed release calendars
- credible trade reporting

Use caution with:

- fan rumors
- engagement-driven leak accounts
- recycled speculation without primary sourcing

## Entertainment Domain Template Output

In addition to the shared output fields, explicitly include:

- `releaseOrCeremonyContext`
- `publicityCycle`
- `officialConfirmationStatus`
- `platformOrDistributorContext`
- `chartAwardsOrViewershipMechanics`
- `audienceSentimentVsIndustryReality`
- `delayOrRumorRisk`

## Output Requirements

Return:

- `industry = entertainment`
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

- the official source chain is clear
- there is a concrete date or credible catalyst
- your thesis is based on production, release, or awards mechanics rather than fandom energy
- market pricing looks too rumor-driven

Lean `SKIP` when:

- the event depends mainly on gossip
- settlement boundaries are vague
- release timing is unstable with weak confirmation
- the crowd is trading hype without durable evidence
