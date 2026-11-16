# Known limitations: validshot {{version}}

| | |
|---|---|
| Document no. | {{doc-no}} |
| Version | {{doc-version}} |
| Tool and version | validshot {{version}} (list prepared for 0.3.0) |

Each limitation states its effect and the control it requires. **Status**: *by
design* (intended, will not change), *open* (could be improved) or *environment*
(belongs to your infrastructure or procedures). For each one, confirm before go-live
that the control exists, or restrict the intended use.

Limitations marked ⚠ can hide a defect (false PASS) or weaken evidence integrity if
the control is missing.

## Compliance and records

| ID | Limitation | Effect | Required control | Status |
|---|---|---|---|---|
| L-01 ⚠ | No 21 CFR Part 11 / Annex 11 electronic signatures. The protocol lock is a review record. A key signature (`validshot sign`, `--sign-key`) proves that the holder of a private key signed a manifest or a protocol; it does not authenticate a person, has no password or session control, and is not printed on the PDF. | Records are not signed by the tool in the regulatory sense | Sign `record.pdf`, the summary report and the review copy in {{eQMS}} or with wet ink (URS-VS-25). If key signatures are used, a procedure assigns keys to people (see L-26) | by design |
| L-02 ⚠ | No user authentication. `--approver` and `--initiator` are free text; the operating-system user is recorded as well. Anyone with write access can create an unsigned lock file. With `--sign-key`, an approval or a run is bound to a key, and `verify-run --trust <public key>` rejects evidence not signed by that key. | Without key signatures, approval and execution cannot be attributed reliably by the tool alone | Restrict who can access the execution host and protocol storage; approval in {{eQMS}} references the protocol sha256 (URS-VS-24). Optionally: signed locks and runs, verified against a register of public keys (URS-VS-31) | environment |
| L-03 ⚠ | The hash chain is local. Someone with write access can rewrite all files, the audit log and the manifest consistently. A key signature or an RFC 3161 timestamp over the manifest does not survive that: the rewritten manifest has another hash. This only helps if the private key is not readable by that person, and if verification demands the signature (`--trust`) or the timestamp (`--require-timestamp`); otherwise the sidecar files can simply be deleted. | Altered evidence could pass a plain `verify-run` | Enter the manifest sha256 on the signed record; store run directories in WORM or access-controlled storage (URS-VS-25/26). Optionally: sign and timestamp every formal run and verify with `--trust` and `--require-timestamp` (URS-VS-31/32) | environment |
| L-04 | Read-only file permissions do not protect against the file owner or an administrator. | Accidental change is prevented, deliberate change is not | As L-03 | by design |
| L-05 | Times in the record and the audit trail come from the host clock; synchronisation is not verified. With `--tsa`, an RFC 3161 token states when the sealed manifest existed, and the difference between the host clock and the TSA's time is recorded (to about ±1 s). The token is checked against the manifest by `verify-run`; its issuer is only verified with `--tsa-ca` (which calls OpenSSL). The step times inside the record remain host times. | Times could be wrong; an unverified token proves nothing about who issued it | Synchronise the host clock (URS-VS-27, IQ-07). If trusted time is required: `--tsa {{TSA URL}}` on every formal run and `--tsa-ca` at verification (URS-VS-32). Only the manifest hash leaves the network | open |
| L-06 | PDFs are not PDF/A, and fonts come from the host. | Long-term rendering may differ | Archive `record.json`/`record.html` with the PDF; convert to PDF/A in {{document system}} if required | open |
| L-07 | Deviation handling is not part of the tool. The report lists deviations but does not track their resolution. | — | Deviation system of {{organisation}}; enter references in the summary report | by design |

## What the checks can and cannot see

| ID | Limitation | Effect | Required control | Status |
|---|---|---|---|---|
| L-08 ⚠ | The display-integrity check is a heuristic with two parts. (1) Hit-testing at 5 points of the element finds ordinary covers; partly transparent covers count as covering. (2) Legibility is judged on the rendered pixels of each line of text: the contrast between the background and what stands out from it must reach `min_contrast` (default 2:1), for the line and for each third of a line 30 px or wider. This finds what hit-testing cannot see: overlays with `pointer-events: none`, text in the background colour, near-opaque veils, masks. **Not found:** a cover over less than a third of a line that hit-testing also misses; a cover that itself shows something of enough contrast (a picture, other text) and is invisible to hit-testing; text replaced by other legible text; wrong colours of equal legibility; font size. Colours of equal luminance (e.g. red on green) measure as low contrast. Lines with preserved whitespace (`white-space: pre`) are judged whole, not in thirds. The default of 2:1 is a floor for "can be read at all", not an accessibility criterion (WCAG AA asks for 4.5:1). A web font is reported when none of its faces is loaded although the element shows text; a font whose `unicode-range` does not cover the text shown could be reported wrongly. | A covered or illegible value could PASS in the cases listed; a legitimately pale text could FAIL | The reviewer looks at the step screenshots, which are the evidence, not just the PASS column. Set `min_contrast` in the protocol where a requirement states one. Use `display_check: false` with a reason where the check does not fit. | open |
| L-09 | Only text in the page DOM can be checked. Content in `<canvas>`, images of text, embedded PDFs and downloaded files cannot. | Charts and exported files are not verifiable | Manual steps, or checks on underlying values the page displays as text | by design |
| L-10 | Content inside `<iframe>`s cannot be targeted (verified: "target not found"). | Embedded components are not testable | Test the embedded page directly by its own URL | open |
| L-11 | Comparison is exact on displayed text with whitespace collapsed. Locale-dependent formatting (decimal comma, dates) must be written exactly as displayed. | False FAIL if written differently | Fix the locale in the protocol; use `matches` for dynamic values (dates, IDs) | by design |
| L-12 | Time limits use the host's wall clock with 50 ms polling. They include network and host load, and cover one user. | Not suitable for sub-100 ms requirements, load or performance testing | Use load-testing tools for capacity; treat `within_ms` as single-user response time | by design |
| L-13 ⚠ | The system version is what the application reports (endpoint or page). The tool cannot verify the build itself. | Evidence could be attributed to the wrong build if the application reports a wrong version | Deployment records / configuration management confirm what is installed at the address tested | environment |

## Execution

| ID | Limitation | Effect | Required control | Status |
|---|---|---|---|---|
| L-14 | One browser engine per protocol, at a fixed viewport size: Chromium (default), Firefox or WebKit as pinned by Playwright, or the Chrome / Edge installed on the host (`environment.browser`). Playwright's Firefox and WebKit are builds of those engines, not the Firefox and Safari releases users install; host Chrome and Edge are not version-pinned by the tool. No real mobile devices or zoom levels. PDFs are always rendered by Chromium. | Defects specific to a released browser version may not be covered | Qualify each engine used (OQ-14); one protocol per engine where several are in scope; for host Chrome/Edge, control the browser version by {{software distribution}} and check it on the record | open |
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

## Signatures, trusted time and video

| ID | Limitation | Effect | Required control | Status |
|---|---|---|---|---|
| L-26 ⚠ | A signing key is a file. The private key is stored unencrypted; whoever can read it can sign as its owner. The tool does not issue, expire or revoke keys. | A signature shows which key signed, not which person | Key procedure of {{organisation}}: one key per person, private key on that person's account or token only, a register of public-key fingerprints, replacement on suspicion of disclosure (URS-VS-31) | environment |
| L-27 | Signatures and the timestamp are files next to the manifest (`manifest.sig.json`, `manifest.tsr`), added after sealing. They are not in the manifest, not in the audit trail and not on the PDF. | Removing them leaves a run that still verifies as intact, unless verification demands them | Verify with `--trust` and `--require-timestamp`; the summary report then lists runs lacking them as not intact | by design |
| L-28 | The video is what the browser recorded of the test page: real time, no edits. It does not show browser dialogs, the address bar, other tabs or the mouse pointer, and its frame rate and compression are the browser's. Step positions in the video are host-clock offsets, accurate to a few tenths of a second. | The video is supplementary; it cannot replace the step screenshots, on which the verdicts are based | Use the raw screenshots as evidence; keep the video as supporting material. Mind storage: about {{size}} per minute | by design |
| L-29 | The legibility check reads the pixels with a screenshot of the area of the text. In WebKit a screenshot resets the reported status of web fonts that failed to load; the tool accounts for this, and a screenshot does not change what is displayed. | — | — | by design |

## Supplier

| ID | Limitation | Effect | Required control | Status |
|---|---|---|---|---|
| L-25 | Open source (MIT), maintained by an individual, without support agreement or SLA. | No vendor to rely on for fixes or qualification documents | Supplier assessment based on the public source code, tests and this pack; pin the version; review release notes before updating (URS-VS-28) | environment |

## Confirmation

| Role | Name | Signature | Date |
|---|---|---|---|
| Validation lead | | | |
| QA | | | |
