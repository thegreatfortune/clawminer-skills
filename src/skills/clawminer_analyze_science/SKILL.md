---
name: clawminer_analyze_science
description: Industry analysis template for science prediction tasks, with emphasis on formal milestones, evidence quality, timelines, and institutional source-of-truth.
---

# ClawMiner Analyze Science

## Mission

Use this skill for science prediction events, especially:

- space launches and missions
- clinical, biotech, or medical milestones
- research publication or approval events
- climate or environmental science milestones
- institutional science outcomes with clear settlement rules

Always pair the science analysis with the `eventType` selected by `clawminer_analyze`, especially:

- `scheduled event`
- `numeric threshold`
- `policy / regulation`
- `product / protocol launch`

## Core Rule

Science prediction should be evidence-led and timeline-aware.
Do not confuse aspirational announcements or media simplification with a real milestone being reached.

## Event-Type Lens

Adapt the analysis to the selected `eventType`:

- `scheduled event` -> focus on mission window, trial readout timing, conference timing, or agency calendar.
- `numeric threshold` -> focus on measurable criteria, scientific endpoint, or count threshold and the authority defining it.
- `policy / regulation` -> focus on FDA, EMA, agency, ethics board, or scientific regulator process and formal approval standards.
- `product / protocol launch` -> focus on whether the event is a true deployment, mission start, publication, or operational milestone rather than a teaser.
- For any other `eventType`, state why science remains the correct `industry` and adapt the closest framework honestly.

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

Special attention for science:

- preprint versus peer-reviewed publication
- launch attempt versus successful mission milestone
- interim data versus final endpoint
- approval submission versus approval grant
- agency or institutional source-of-truth

## Science Analysis Framework

Build the view using these factors:

1. Milestone definition
2. Institutional process and gating steps
3. Timeline realism
4. Technical risk and failure modes
5. Quality of primary evidence
6. Counter-case and delay risk

## Evidence Priorities

Prefer:

- official agency, mission, company, or institution announcements
- clinical registries and regulator notices
- peer-reviewed or primary scientific sources where relevant
- credible science reporting with source transparency

Use caution with:

- sensationalized summaries
- speculative interpretation of early-stage data
- social-media overclaiming without source documentation

## Science Domain Template Output

In addition to the shared output fields, explicitly include:

- `milestoneDefinition`
- `institutionalProcess`
- `keyTimeline`
- `evidenceQualityAssessment`
- `technicalOrClinicalRisks`
- `gatingDependencies`
- `headlineVsEvidenceGap`

## Output Requirements

Return:

- `industry = science`
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

- the milestone is operationally well-defined
- the authoritative source is clear
- your thesis is rooted in process, evidence, and timeline realism
- market pricing appears to overreact to headlines or underprice execution risk

Lean `SKIP` when:

- the event hinges on vague scientific interpretation
- the timeline is speculative with weak institutional confirmation
- the media narrative is much stronger than the underlying evidence
- settlement criteria are too ambiguous
