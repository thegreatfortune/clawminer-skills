---
name: clawminer_analyze_legal_regulatory
description: Industry analysis template for legal and regulatory prediction tasks, with emphasis on formal process, jurisdiction, source hierarchy, and enforceable milestones.
---

# ClawMiner Analyze Legal Regulatory

## Mission

Use this skill for legal and regulatory prediction events, especially:

- court rulings
- agency decisions and rulemaking
- enforcement actions
- compliance deadlines
- legislation or formal policy milestones where legal process is central

Always pair the legal/regulatory analysis with the `eventType` selected by `clawminer_analyze`, especially:

- `scheduled event`
- `election / appointment`
- `policy / regulation`

## Core Rule

Legal and regulatory markets require process discipline.
Do not collapse a formal proceeding into a headline impression.

## Event-Type Lens

Adapt the analysis to the selected `eventType`:

- `scheduled event` -> focus on hearing dates, filing deadlines, comment periods, decision windows, and procedural sequencing.
- `election / appointment` -> focus on confirmation mechanics, agency leadership changes, judicial appointments, and institutional incentives.
- `policy / regulation` -> focus on rulemaking, jurisdiction, enforceability, publication standards, and when a policy change becomes legally real.
- For any other `eventType`, state why legal/regulatory remains the correct `industry` and adapt the closest framework honestly.

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

Special attention for legal/regulatory:

- proposal versus final rule
- filing versus decision
- oral argument versus ruling
- district court versus appeals court versus supreme court
- press release versus formally effective action
- jurisdiction and source-of-truth hierarchy

## Legal Regulatory Analysis Framework

Build the view using these factors:

1. Formal process map
2. Decision-maker and jurisdiction
3. Procedural timeline and gating steps
4. Legal standard or policy threshold
5. Political and institutional incentives
6. Counter-case and appeal or delay risk

## Evidence Priorities

Prefer:

- court dockets and orders
- regulator notices and official publications
- legislative calendars and official bill text
- formal agency statements and enforcement documents
- credible legal reporting tied to primary sources

Use caution with:

- pundit reactions without docket support
- speculative legal commentary presented as outcome probability
- media shorthand that blurs proposal versus final action

## Legal Regulatory Domain Template Output

In addition to the shared output fields, explicitly include:

- `jurisdictionAndDecisionMaker`
- `proceduralStage`
- `formalTrigger`
- `keyDeadlineOrHearingWindow`
- `sourceHierarchy`
- `appealOrDelayRisk`
- `enforcementOrImplementationRisk`

## Output Requirements

Return:

- `industry = legal/regulatory`
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

- the procedural path is clear
- the authoritative source is formal and unambiguous
- your thesis is grounded in process and institutional behavior rather than headlines
- market pricing appears to misunderstand timing, jurisdiction, or process thresholds

Lean `SKIP` when:

- the event depends on vague media framing
- there is major ambiguity about what legally counts
- appeal, delay, or procedural complexity overwhelms edge
- the thesis rests on political intuition without formal process support
