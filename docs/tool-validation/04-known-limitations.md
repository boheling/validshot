# Known limitations: validshot {{version}}

| | |
|---|---|
| Document no. | {{doc-no}} |
| Version | {{doc-version}} |
| Tool and version | validshot {{version}} (list prepared for 0.2.0) |

Each limitation states its effect and the control it requires. **Status**: *by
design* (intended, will not change), *open* (could be improved) or *environment*
(belongs to your infrastructure or procedures). For each one, confirm before go-live
that the control exists, or restrict the intended use.

Limitations marked ⚠ can hide a defect (false PASS) or weaken evidence integrity if
the control is missing.

## Compliance and records

| ID | Limitation | Effect | Required control | Status |
|---|---|---|---|---|
| L-01 ⚠ | No electronic signatures. The protocol lock is a review record, not a 21 CFR Part 11 / Annex 11 signature. | Records are not signed by the tool | Sign `record.pdf`, the summary report and the review copy in {{eQMS}} or with wet ink (URS-VS-25) | by design |
| L-02 ⚠ | No user authentication. `--approver` and `--initiator` are free text; the operating-system user is recorded as well. Anyone with write access can create a lock file. | Approval and execution cannot be attributed reliably by the tool alone | Restrict who can access the execution host and protocol storage; approval in {{eQMS}} references the protocol sha256 (URS-VS-24) | environment |
| L-03 ⚠ | The hash chain is local. Someone with write access can rewrite all files, the audit log and the manifest consistently. | Altered evidence could pass `verify-run` | Enter the manifest sha256 on the signed record; store run directories in WORM or access-controlled storage (URS-VS-25/26) | environment |
| L-04 | Read-only file permissions do not protect against the file owner or an administrator. | Accidental change is prevented, deliberate change is not | As L-03 | by design |
| L-05 | Times come from the host clock. Synchronisation is not verified, and there is no trusted timestamp (e.g. RFC 3161). | Times could be wrong | Synchronise the host clock (URS-VS-27, IQ-07) | open |
| L-06 | PDFs are not PDF/A, and fonts come from the host. | Long-term rendering may differ | Archive `record.json`/`record.html` with the PDF; convert to PDF/A in {{document system}} if required | open |
| L-07 | Deviation handling is not part of the tool. The report lists deviations but does not track their resolution. | — | Deviation system of {{organisation}}; enter references in the summary report | by design |

## What the checks can and cannot see

| ID | Limitation | Effect | Required control | Status |
|---|---|---|---|---|
| L-08 ⚠ | The display-integrity check is a heuristic. It samples 5 points of the element. **Overlays with `pointer-events: none` are not detected** (verified: a fully covering white overlay passes). Partly transparent covers count as covering. Colour, contrast and font size are not checked. Truncation is detected for overflow, ellipsis and ancestor clipping, not for transforms or masks. | A covered value could PASS | The reviewer looks at the step screenshots, which are the evidence, not just the PASS column. Add a requirement-specific check where obscuring is a known risk. | open |
| L-09 | Only text in the page DOM can be checked. Content in `<canvas>`, images of text, embedded PDFs and downloaded files cannot. | Charts and exported files are not verifiable | Manual steps, or checks on underlying values the page displays as text | by design |
| L-10 | Content inside `<iframe>`s cannot be targeted (verified: "target not found"). | Embedded components are not testable | Test the embedded page directly by its own URL | open |
| L-11 | Comparison is exact on displayed text with whitespace collapsed. Locale-dependent formatting (decimal comma, dates) must be written exactly as displayed. | False FAIL if written differently | Fix the locale in the protocol; use `matches` for dynamic values (dates, IDs) | by design |
| L-12 | Time limits use the host's wall clock with 50 ms polling. They include network and host load, and cover one user. | Not suitable for sub-100 ms requirements, load or performance testing | Use load-testing tools for capacity; treat `within_ms` as single-user response time | by design |
| L-13 ⚠ | The system version is what the application reports (endpoint or page). The tool cannot verify the build itself. | Evidence could be attributed to the wrong build if the application reports a wrong version | Deployment records / configuration management confirm what is installed at the address tested | environment |

## Execution

| ID | Limitation | Effect | Required control | Status |
|---|---|---|---|---|
| L-14 | Chromium only, at fixed viewport sizes. No Firefox, WebKit/Safari, Edge-specific behaviour, real mobile devices or zoom levels. | Browser-specific defects are not covered | Restrict the intended use to the supported browser, or test other browsers separately | open |
| L-15 ⚠ | The summary report covers the run directories it is given. A run that is not given is not detected. | A failed run could be left out | Give the whole campaign folder; keep a run register; the record's run ID is unique | by design |
| L-16 | Nine actions only. No file upload or download, drag-and-drop, multiple tabs or windows, or changing user role within one protocol. Browser dialogs (`alert`, `confirm`) are dismissed automatically. | Some workflows cannot be automated; an app depending on `confirm()` would behave as if the user cancelled | Manual steps for these; split protocols per role (one login state each) | open |
| L-17 | No retries. Environmental instability produces failures. | Extra deviations, re-executions | A stable test environment; timeouts set in the protocol | by design |
| L-18 | Screenshots depend on host fonts and rendering. There is no pixel comparison between runs. | Screenshots from different hosts look slightly different | Execute formal runs on the qualified host type | by design |
| L-19 | A saved login (`--storage-state`) is a credential. A session that expires during a run causes failures. | Credential exposure; failed runs | Handle the file as a secret, use a test account, and log in shortly before the run | environment |
| L-20 | Timezone and locale are emulated in the browser only; the server's settings are unaffected. | Server-side formatting may differ from expectations | Use server settings that match the test environment specification | by design |

## Authoring and review

| ID | Limitation | Effect | Required control | Status |
|---|---|---|---|---|
| L-21 ⚠ | The tool cannot know whether an expected value is right. A protocol that encodes the application's wrong behaviour passes. This includes protocols drafted by AI agents. | False PASS | Expected values come from requirements or independent calculation; review with the checklist in the review copy; conversion report for converted scripts (URS-VS-30) | by design |
| L-22 | The review copy is generated. The YAML file governs; the copy is identified by the file's sha256. | — | Compare the sha256 when approving (review checklist) | by design |
| L-23 | Annotated screenshots are a reading aid. Labels may overlap other content. The raw screenshot is the evidence. | — | Use the raw image when in doubt | by design |
| L-24 | Accessibility, security, back-end/API behaviour and data stored in databases are out of scope. | — | Other test methods | by design |

## Supplier

| ID | Limitation | Effect | Required control | Status |
|---|---|---|---|---|
| L-25 | Open source (MIT), maintained by an individual, without support agreement or SLA. | No vendor to rely on for fixes or qualification documents | Supplier assessment based on the public source code, tests and this pack; pin the version; review release notes before updating (URS-VS-28) | environment |

## Confirmation

| Role | Name | Signature | Date |
|---|---|---|---|
| Validation lead | | | |
| QA | | | |
