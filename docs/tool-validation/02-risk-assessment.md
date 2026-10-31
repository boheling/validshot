# Risk assessment: validshot as a validation evidence tool

| | |
|---|---|
| Document no. | {{doc-no}} |
| Version | {{doc-version}} |
| Tool and version | validshot {{version}} |
| Based on | URS {{URS doc-no}} |
| Team | {{QA}}, {{validation lead}}, {{tool administrator}} |

## 1. Method

The assessment follows {{organisation's risk procedure; e.g. GAMP 5 (2nd ed.) functional risk assessment}}.

- **Severity (S):** the effect on evidence if the failure occurs undetected.
  - **H:** a false PASS, or evidence altered without detection. A defect could be
    released as validated.
  - **M:** misleading or incomplete records that a reviewer would probably notice.
  - **L:** a false FAIL or extra work. It corrects itself, because it is investigated.
- **Probability (P):** the likelihood of the failure, given the design.
  H / M / L.
- **Detectability (D):** the likelihood that the failure is noticed before the
  evidence is relied on. **H** = likely noticed (good), **L** = unlikely.
- **Risk class** = S × P: class 1 if S=H and P≥M, or S=M and P=H; class 3 if
  S=L, or S=M and P=L; class 2 otherwise.
  **Priority** = risk class adjusted by D: class 1, or class 2 with D=L, is
  **High**; class 3 with D=H is **Low**; everything else is **Medium**.
- High-priority risks need a verified tool control (a scripted OQ test case) or a
  verified procedural control. Medium-priority risks need at least one documented
  control. Low-priority risks can be accepted with a rationale.

The ratings below are **proposed**. Confirm or change them for your environment.

## 2. Key consideration

A **false PASS** is the failure that matters. A false FAIL leads to an investigation,
which finds the cause. The highest assurance effort therefore goes to the paths that
could make a wrong application look right. The main control is known-answer testing:
test applications with planted defects must fail at exactly those defects (OQ-04).

## 3. Assessment

| ID | Function | Failure mode | Effect | S | P | D | Priority | Controls (design → verification) | Residual |
|---|---|---|---|---|---|---|---|---|---|
| RA-01 | Protocol control | A protocol different from the approved one is executed (edited after review) | Evidence for an unreviewed test | H | M | L | High | SHA-256 lock over the exact bytes; formal run refuses on mismatch → OQ-02 | Low. The lock file itself can be re-created by anyone with write access (L-02) → URS-VS-24 |
| RA-02 | Judgement | A wrong displayed value passes (comparison error, normalisation, substring matching) | False PASS | H | L | L | High | Exact text comparison; exact label matching available; known-answer defective apps → OQ-03, OQ-04 | Low |
| RA-03 | Judgement | A value that is right in the page but not visible to the user (covered, cut off, off-screen) passes | False PASS | H | M | M | High | Display-integrity check on every text/visibility check → OQ-04 (D2, D3), OQ-05 | **Medium**: heuristic, with known gaps (L-08, e.g. overlays with `pointer-events:none`). The reviewer inspects the screenshots |
| RA-04 | Judgement | Target resolves to the wrong element | The wrong thing is checked; false PASS | H | M | M | High | One match required; two or more FAIL as ambiguous → OQ-06 | Low |
| RA-05 | Judgement | Time limit judged wrongly | False PASS on a performance requirement | M | L | M | Medium | Measured from the start of the last action, 50 ms polling, measured time recorded → OQ-07 | Low; see L-12 (wall clock, resolution) |
| RA-06 | Execution | Behaviour at run time differs from the approved protocol (AI, retries, self-healing) | Unapproved test executed | H | L | L | High | No AI on the run path; one attempt per action; MCP offers authoring tools only → OQ-12, design review of `src/runner.mjs` | Low |
| RA-07 | Execution | A failed action is silently skipped and later steps still pass | Untested functions appear tested | H | L | L | High | Failed action → FAIL; later steps BLOCKED and listed → OQ-06 | Low |
| RA-08 | Execution | Environmental instability (network, slow host) causes intermittent failures | False FAIL; re-executions | L | M | H | Low | No retries (by design); configurable timeouts; deviation process | Accepted |
| RA-09 | Evidence | Screenshot does not show the state that was checked | Evidence misrepresents the check | M | L | M | Medium | Boxes measured right before the capture; reduced motion; raw image never modified; annotation rendered separately → OQ-08 | Low; see L-23 |
| RA-10 | Evidence | Evidence altered, replaced or removed after the run | Falsified evidence | H | L | L | High | Write-once files; hash manifest; hash-chained audit log; read-only files; `verify-run`; the summary report re-verifies → OQ-08, OQ-11 | **Medium**: a person with write access can rewrite the whole chain (L-03) → manifest hash on the signed record and WORM storage (URS-VS-25/26) |
| RA-11 | Evidence | Dry-run output used as evidence | Unapproved test presented as evidence | H | M | H | High | "NOT EVIDENCE" on every page and annotated image; excluded from summary reports → OQ-06, OQ-11 | Low |
| RA-12 | Records | Wrong system version attributed to the run | Evidence attributed to the wrong build | H | L | L | High | Version read from the system; a mismatch with the initiator's version aborts; address override flagged → OQ-09, OQ-11 | Medium: the version is self-reported by the application (L-13) |
| RA-13 | Records | Record incomplete or inconsistent (missing step, wrong counts) | Misleading record | M | L | H | Low | Record built from the same data as the result; counts checked in the known-answer tests → OQ-03, OQ-04, OQ-09 | Low |
| RA-14 | Reporting | Summary report hides a failed, aborted or tampered run | False overall picture | H | L | L | High | All formal runs given as input are listed; failures and aborts stay in the history; integrity re-verified → OQ-11 | **Medium**: a run not given as input is not detected (L-15) → run register / give the whole campaign folder |
| RA-15 | Review | Review copy differs from the YAML | Approval of something other than what runs | M | L | H | Low | Same wording functions as the record; exact YAML in an appendix; hash on every page → OQ-10 | Low |
| RA-16 | Change | Update of validshot, Playwright, Chromium or Node changes behaviour | Unqualified behaviour | H | M | M | High | Exact version pins and lockfile; versions printed on every record → IQ; change control → re-OQ (03 §10) | Low with change control |
| RA-17 | Authoring | Wrong expected value in the protocol (e.g. AI-authored, or copied from the application) | False PASS or false FAIL | H | M | M | High | Not a tool function: review against requirements, independent calculation, conversion report (URS-VS-30); review checklist in the review copy | Depends on the procedure |

## 4. Conclusion

{{To be completed: all High-priority risks have verified controls (OQ references
above) or procedural controls that are in place. Residual risks rated Medium
(RA-03, RA-10, RA-12, RA-14) are accepted with the controls listed in the known
limitations ({{L doc-no}}).}}

| Role | Name | Signature | Date |
|---|---|---|---|
| Author | | | |
| QA | | | |
