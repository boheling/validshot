# User requirements specification: validshot as a validation evidence tool

| | |
|---|---|
| Document no. | {{doc-no}} |
| Version | {{doc-version}} |
| Organisation | {{organisation}} |
| Tool and version | validshot {{version}} (open source, MIT) with Playwright and Chromium as pinned by that version |
| Author / reviewer / approver | {{author}} / {{reviewer}} / {{QA approver}} |

## 1. Purpose

This document states the intended use of validshot in {{organisation}}. It lists what
the tool must do to be fit for that use, and which requirements are met by procedures
or infrastructure instead of the tool. It is the basis for the risk assessment
({{RA doc-no}}) and the IQ/OQ ({{OQ doc-no}}).

## 2. Intended use

validshot is used to execute approved, scripted test protocols against the
browser-based user interface of {{systems in scope}}. It produces execution records
(results, screenshots and an audit trail) that are reviewed and signed as validation
evidence, for example OQ/PQ test executions and regression testing of releases.

It is **not** used for:
- processing GxP data or making release decisions;
- electronic signatures, record retention or access control, which are provided by
  {{eQMS / document system}};
- testing anything outside the browser page, such as printing, interfaces, databases
  or instruments.

AI coding agents may help **author** protocols. They do not approve or formally execute
them.

## 3. Roles

| Role | Does |
|---|---|
| Author (a person, optionally assisted by an AI agent) | Writes and dry-runs protocols; renders the review copy |
| Reviewer / approver | Reviews the protocol (review copy plus file hash) and records approval (`validshot lock`) |
| Initiator (tester) | Starts formal runs (`validshot run --initiator`) and reviews the execution record |
| QA | Approves records and the summary report; owns deviations |
| Administrator | Installs and maintains the tool and the execution host |

## 4. Requirements

Criticality reflects the effect of a failure on the evidence: **H** means it could
produce a false PASS or undetected altered evidence. *Fulfilled by*: **T** = tool,
**P** = procedure, **I** = infrastructure.

### 4.1 Protocol control

| ID | Requirement | Crit. | By | Verified in |
|---|---|---|---|---|
| URS-VS-01 | Protocols are structured, human-readable files. They identify the protocol (ID, version, title) and link every step to at least one requirement ID. Malformed protocols are rejected with an explanation. | M | T | OQ-01 |
| URS-VS-02 | A formal run executes only a protocol whose approval matches its exact content. | H | T | OQ-02 |
| URS-VS-03 | Any change to an approved protocol invalidates the approval until it is re-approved. | H | T | OQ-02 |
| URS-VS-04 | The approval records who approved, in what role, when and why, and which approval it supersedes. | M | T | OQ-02 |
| URS-VS-05 | Reviewers can review a protocol without reading code. The review document identifies the exact file it was generated from. | M | T | OQ-10 |

### 4.2 Execution and judgement

| ID | Requirement | Crit. | By | Verified in |
|---|---|---|---|---|
| URS-VS-06 | Formal execution is deterministic: no AI, no automatic retries and no automatic change of targets ("self-healing"). | H | T | OQ-03, OQ-04, OQ-12 |
| URS-VS-07 | When the application behaves as specified, every check passes. | H | T | OQ-03 |
| URS-VS-08 | When a displayed value differs from the expected value, the check fails and the actual value is recorded. | H | T | OQ-04 |
| URS-VS-09 | A value that is in the page but not visible to the user (covered, cut off or outside the screen) fails its check. | H | T | OQ-04, OQ-05 |
| URS-VS-10 | A check whose target matches more than one element fails as ambiguous. The tool never chooses one. | H | T | OQ-06 |
| URS-VS-11 | A failed check is recorded and the run continues. A failed action fails its step, and every later step is recorded as not executed (BLOCKED). No step is silently skipped. | H | T | OQ-06 |
| URS-VS-12 | Where a protocol states a time limit, the elapsed time is measured and recorded, and exceeding the limit fails the check. | M | T | OQ-07 |
| URS-VS-13 | The run records the system version (read from the system where possible), the system address (flagged if it differs from the protocol), the initiator, start and end times, and tool, browser and environment details. | H | T | OQ-03, OQ-09 |
| URS-VS-14 | If the system version read from the system differs from the one stated by the initiator, the run is aborted, and the abort is recorded. | M | T | OQ-11 |

### 4.3 Evidence

| ID | Requirement | Crit. | By | Verified in |
|---|---|---|---|---|
| URS-VS-15 | Screenshots are stored unmodified. Any annotation is a separate file. | H | T | OQ-08 |
| URS-VS-16 | Evidence files are written once. Every file has a recorded hash, and every event is recorded in an append-only, hash-chained audit trail. | H | T | OQ-08 |
| URS-VS-17 | Any alteration, replacement or removal of an evidence file or audit entry is detected by verification. | H | T | OQ-08, OQ-11 |
| URS-VS-18 | Output of authoring (dry) runs is marked as not being evidence on every page, and is excluded from summary reports. | H | T | OQ-06, OQ-11 |

### 4.4 Records and reporting

| ID | Requirement | Crit. | By | Verified in |
|---|---|---|---|---|
| URS-VS-19 | The execution record shows, per step: the action, each expected result, the actual result, pass/fail and the screenshot with its hash. It also shows requirement traceability, the deviations, and fields for signatures. | M | T | OQ-09 |
| URS-VS-20 | Every failed check is listed as a deviation with its expected and actual values. | H | T | OQ-04, OQ-09 |
| URS-VS-21 | A summary report over several runs re-verifies each run's evidence and keeps failed and aborted runs in the history. It lists open items such as earlier failures, uncovered requirements, overridden addresses and differing system versions. | H | T | OQ-11 |
| URS-VS-22 | The summary report does not conclude fitness for use. The conclusion is written by the signatories. | M | T | OQ-11 |

### 4.5 Boundaries, procedures and infrastructure

| ID | Requirement | Crit. | By | Verified in |
|---|---|---|---|---|
| URS-VS-23 | Tools offered to AI agents cannot approve protocols, start formal runs or build summary reports. | H | T | OQ-12 |
| URS-VS-24 | Only authorised persons approve protocols and start formal runs. (The tool records names but does not authenticate users.) | H | P/I | {{SOP / access control}} |
| URS-VS-25 | Execution records and summary reports are signed in {{eQMS}}, and the manifest hash is entered on the signed record. | H | P | {{SOP}} |
| URS-VS-26 | Run directories are retained in protected (WORM or access-controlled) storage for {{retention period}}. | H | I | {{infrastructure qualification}} |
| URS-VS-27 | The execution host's clock is synchronised to a reference time source. | M | I | IQ-07 |
| URS-VS-28 | Tool, Playwright, Chromium and Node versions are under change control. A change triggers an assessment and, where needed, re-execution of the OQ. | H | P | 03 §10 |
| URS-VS-29 | Authors, reviewers and initiators are trained in the protocol format, the review checklist and the deviation process. | M | P | {{training records}} |
| URS-VS-30 | Expected values in protocols come from requirements or independent calculation, not from the application. AI-assisted protocols are reviewed against requirements before approval. | H | P | {{SOP}}, review checklist in the review copy |

## 5. Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Author | | | |
| Reviewer | | | |
| QA approver | | | |
