# IQ/OQ protocol: validshot {{version}}

| | |
|---|---|
| Document no. | {{doc-no}} |
| Version | {{doc-version}} |
| Tool and version | validshot {{version}} |
| Traces to | URS {{URS doc-no}}, risk assessment {{RA doc-no}} |
| Execution environment | {{host name / type, OS and version}} (the environment used for formal runs) |

## 1. Purpose

This protocol demonstrates that validshot {{version}} is installed correctly (IQ) and
operates as specified in the URS (OQ) in the environment used for formal runs.

## 2. Scope

**In scope:** the tool functions listed in the URS, chapters 4.1–4.5, where the tool
fulfils them.

**Out of scope:**
- the organisation's own test protocols (each is reviewed and approved on its own);
- procedural and infrastructure controls (URS-VS-24 to 30), which are qualified
  elsewhere;
- PQ, see §9.

## 3. Approach: known-answer testing

The repository contains two test applications. Each has a **correct** variant and a
**defective** variant with planted defects:

| Application | Planted defects |
|---|---|
| Order form (`examples/ka-app`) | D1: total truncated to 10 cents instead of rounded. D2: promotion banner covers the stock badge and price (the DOM text is correct). D3: product name cut off (the DOM text is correct). D4: quantity 0 accepted. |
| Batch statistics (`examples/stats-app`) | Population SD instead of sample SD; rounding on the binary value instead of the decimal value (1.005 → 1.00). |

The expected results were fixed independently of the tool: from the requirements and
from independent calculation. The same approved protocol must **pass on the correct
variant** and **fail at exactly the planted defects, and nowhere else**. This
directly tests for the critical failure, a false PASS (RA-02, RA-03). It also shows
that the tool does not produce spurious failures.

Further test cases cover the failure model, timing, evidence integrity, the review
copy, the summary report and the AI boundary.

The automated test suite is the executable form of this OQ. Each test case names its
automated test (`file › test name`). Where a test case requires inspecting an output,
the procedure says so.

## 4. Installation qualification (IQ)

Execute in the formal-run environment. Record actual values.

| ID | Check | Procedure | Acceptance criterion | Actual | P/F | Init./date |
|---|---|---|---|---|---|---|
| IQ-01 | Host | Record host name, OS and version, CPU architecture | Matches {{environment specification}} | | | |
| IQ-02 | Node.js | `node --version` | ≥ 22, and equal to {{node version}} | | | |
| IQ-03 | Source at the qualified version | `git clone --branch v{{version}} https://github.com/boheling/validshot`, then `git rev-parse HEAD` | Commit {{commit sha}} | | | |
| IQ-04 | Dependencies exactly as locked | `npm ci`, then `npm ls playwright yaml @modelcontextprotocol/sdk zod` | Versions equal those in `package.json` (exact pins); `npm ci` completes without errors | | | |
| IQ-05 | Browser | `npx playwright install chromium`, then `npx playwright --version` | Playwright {{playwright version}} | | | |
| IQ-06 | Tool version | `npx validshot --version` (or, if installed from npm: `npm ls validshot`, and record the `integrity` value from `package-lock.json`) | {{version}} | | | |
| IQ-07 | Clock | Record the time-synchronisation status of the host ({{command for your OS}}) | Synchronised to {{time source}} | | | |

If formal runs use an npm installation rather than the source checkout, both must be
the same version: the OQ runs from the checkout, because the test applications are
not part of the npm package.

## 5. Executing the OQ

1. From the checkout of IQ-03: `npm run oq`. This prints the results and writes
   `oq-results.tap`.
2. For each test case below, record the result of its automated test(s) and perform
   any inspection steps.
3. Attach `oq-results.tap`, the artefacts named in the test cases, and the IQ outputs.
4. Any unexpected result is a deviation. Record it, assess its impact on the URS
   requirement concerned, and resolve it before the OQ is concluded.

**Acceptance:** every test case passes, or each deviation is resolved and its
residual risk accepted by QA.

## 6. Test cases

### OQ-01 Protocol validation
**URS:** 01 · **Risk:** — · **Automated:** `unit.test.mjs › a minimal protocol is valid`; `unit.test.mjs › protocol errors: missing req, missing expect, bad target, unknown requirement, display_check without reason`

| # | Procedure | Expected result | Actual | P/F |
|---|---|---|---|---|
| 1 | Automated tests above | pass | | |
| 2 | `validshot check examples/stats-app/protocols/STAT-001-batch-statistics.yaml` | "STAT-001 v1, 9 steps, 62 assertions" and a sha256 | | |
| 3 | Copy the file, delete the `req:` line of one step, and run `check` on the copy | Error naming the step and the missing `req` | | |

### OQ-02 Approval bound to exact content
**URS:** 02, 03, 04 · **Risk:** RA-01 · **Automated:** `unit.test.mjs › lock pins the exact bytes; any edit breaks it`; `known-answer.test.mjs › a formal run refuses an unlocked protocol and a missing initiator`; `known-answer.test.mjs › a changed protocol is refused until re-approved`

| # | Procedure | Expected result | Actual | P/F |
|---|---|---|---|---|
| 1 | Automated tests above | pass | | |
| 2 | In a copy of the KA-001 protocol: `validshot run <copy> --initiator "OQ"` | Refused: no lock file | | |
| 3 | `validshot lock <copy> --approver "OQ Reviewer" --reason "OQ"`; inspect the `.lock.json` | Records approver, role, time, reason and the protocol sha256 | | |
| 4 | Change one character in the copy; run again | Refused: protocol changed since approval | | |

### OQ-03 Known answer: correct applications pass
**URS:** 06, 07, 13 · **Risk:** RA-02, RA-13 · **Automated:** `known-answer.test.mjs › correct app: every step passes, record and evidence verify`; `stats-known-answer.test.mjs › correct app: all 9 steps pass; source and notes reach the record`

| # | Procedure | Expected result | Actual | P/F |
|---|---|---|---|---|
| 1 | Automated tests above | pass: KA-001 10/10 steps, STAT-001 9/9 steps; the system version read from the application (1.4.2) | | |

### OQ-04 Known answer: defective applications fail at exactly the planted defects
**URS:** 06, 08, 09, 20 · **Risk:** RA-02, RA-03, RA-13 · **Automated:** `known-answer.test.mjs › defective app: exactly the planted defects fail`; `stats-known-answer.test.mjs › defective app (population SD, binary rounding): exactly the dependent assertions fail`

Expected deviations, and no others:

| Protocol | Step.check | Actual (expected by the test) | Planted defect |
|---|---|---|---|
| KA-001 | 1.A3, 2.A2 | covered by `<div#promo>` | D2 (covered value, DOM text correct) |
| KA-001 | 2.A1 | text is cut off horizontally | D3 (truncated, DOM text correct) |
| KA-001 | 2.A4, 3.A3, 4.A2 | $569.90, $189.90, $18809.00 | D1 (truncated total) |
| KA-001 | 5.A1, 5.A2, 5.A3 | no error; ordering enabled; $0.00 shown | D4 (quantity 0 accepted) |
| STAT-001 | 2.A3, 2.A4, 3.A3, 3.A4, 5.A3, 5.A4, 7.A3 | 0.28, 2.83, 0.283, 2.828, 1.12, 44.72, 1.00 | population SD |
| STAT-001 | 4.A2, 4.A4, 4.A5 | 1.00, 0.50, 1.00 | binary rounding of 1.005 |

| # | Procedure | Expected result | Actual | P/F |
|---|---|---|---|---|
| 1 | Automated tests above | pass: exactly the deviations in the table above | | |
| 2 | Formal run of KA-001 against `/bad/` (see README "Quick start"); open `record.pdf` | Deviations table as above. Step 1 screenshot shows the banner over the badge, with a red box on A3 | | |

### OQ-05 Display integrity
**URS:** 09 · **Risk:** RA-03 · **Automated:** `display.test.mjs › display check: wrapped inline link is intact; overlay, clipping and truncation are caught`

| # | Procedure | Expected result | Actual | P/F |
|---|---|---|---|---|
| 1 | Automated test above | pass: overlay → "covered by"; ellipsis → "cut off horizontally"; a wrapped inline link is not flagged | | |

### OQ-06 Failure model and dry-run marking
**URS:** 10, 11, 18 · **Risk:** RA-04, RA-07, RA-11 · **Automated:** `failure-model.test.mjs › ambiguous target FAILs, the run continues; a failed action BLOCKs later steps; dry runs are marked`

| # | Procedure | Expected result | Actual | P/F |
|---|---|---|---|---|
| 1 | Automated test above | pass: ambiguous target fails ("2 elements match"); the next check in the step is still evaluated; the failed action fails step 2; step 3 is BLOCKED; the record carries the DRY RUN banner | | |
| 2 | `validshot run <protocol> --dry-run`; open `record.pdf` | Banner on page 1 and "DRY RUN — NOT VALID AS EVIDENCE" in every page footer and on every annotated image | | |

### OQ-07 Time limits
**URS:** 12 · **Risk:** RA-05 · **Automated:** `timing.test.mjs › within_ms: on time passes with the measured time; late and never both fail`

| # | Procedure | Expected result | Actual | P/F |
|---|---|---|---|---|
| 1 | Automated test above | pass: a result after ~600 ms passes a 1500 ms limit (time recorded) and fails a 200 ms limit, with the measured time recorded; a result that never appears fails | | |

### OQ-08 Evidence integrity
**URS:** 15, 16, 17 · **Risk:** RA-09, RA-10 · **Automated:** `unit.test.mjs › evidence store: verify passes when intact and catches every kind of tampering`

| # | Procedure | Expected result | Actual | P/F |
|---|---|---|---|---|
| 1 | Automated test above | pass | | |
| 2 | `validshot verify-run <run dir from OQ-04 #2>` | "intact", with file count and manifest sha256 | | |
| 3 | Copy the run directory; in the copy, overwrite `shots/step-02.raw.png` with `step-03.raw.png`; run `verify-run` on the copy | "hash mismatch: shots/step-02.raw.png" | | |
| 4 | In another copy, change one character in a line of `audit.jsonl`; run `verify-run` | Audit entry content altered / chain broken | | |
| 5 | Compare `shots/step-01.raw.png` with `step-01.annotated.png` | The raw file has no annotation; the annotated file is a separate file with its own hash in the record | | |

### OQ-09 Execution record content
**URS:** 13, 19, 20 · **Risk:** RA-12, RA-13

| # | Procedure | Expected result | Actual | P/F |
|---|---|---|---|---|
| 1 | Inspect `record.pdf` from OQ-04 #2 | Contains: run ID; protocol file and sha256; approval (who, role, when, why); system under test, with the `/bad/` override flagged in red; system version and its source; initiator; start/end times and clock note; environment; tool, Playwright, browser, Node and OS versions; evidence chain head; requirement traceability; deviations; per step: action, expected, actual, P/F, screenshot and hashes; three signature fields | | |
| 2 | Compare `record.json` counts with the PDF | Identical | | |

### OQ-10 Review copy
**URS:** 05 · **Risk:** RA-15 · **Automated:** `review.test.mjs › review copy: hash, steps in words, coverage gaps, exact file; follows the lock`

| # | Procedure | Expected result | Actual | P/F |
|---|---|---|---|---|
| 1 | Automated test above | pass | | |
| 2 | `validshot render examples/stats-app/protocols/STAT-001-batch-statistics.yaml --out <dir>/STAT-001.review.pdf`; compare the sha256 on page 1 with the output of `validshot check` on the same file | Identical | | |
| 3 | Compare Appendix A with the YAML file (spot-check at least 10 lines, including the first and last) | Identical | | |

### OQ-11 Summary report
**URS:** 14, 17, 18, 21, 22 · **Risk:** RA-10, RA-11, RA-12, RA-14 · **Automated:** `known-answer.test.mjs › summary report: re-verifies every run, leaves dry runs out, keeps the history, flags tampering`

| # | Procedure | Expected result | Actual | P/F |
|---|---|---|---|---|
| 1 | Automated test above | pass: the history lists PASS, FAIL and the aborted run (system version mismatch); the dry run is excluded; an altered screenshot in an earlier run is reported as an integrity failure; the report directory passes `verify-run` | | |
| 2 | `validshot report <runs dir with the OQ-04 #2 run and a later correct run>`; inspect `report.pdf` | Earlier FAIL kept in the history and the deviations; open item asking to confirm its deviation record; conclusion field empty, for the signatories | | |

### OQ-12 AI authoring boundary
**URS:** 06, 23 · **Risk:** RA-06 · **Automated:** `mcp.test.mjs › MCP exposes authoring tools only — no lock, no formal run`

| # | Procedure | Expected result | Actual | P/F |
|---|---|---|---|---|
| 1 | Automated test above | pass: tools are exactly `check_protocol`, `dry_run`, `inspect_page`, `render_protocol` and `validshot_guide` | | |
| 2 | Design review: confirm that `src/runner.mjs` and its imports call no AI or LLM service, and that `package.json` has no such dependency | Confirmed | | |

## 7. Traceability

| URS | Risk | OQ |
|---|---|---|
| VS-01 | — | OQ-01 |
| VS-02, 03, 04 | RA-01 | OQ-02 |
| VS-05 | RA-15 | OQ-10 |
| VS-06 | RA-06 | OQ-03, OQ-04, OQ-12 |
| VS-07 | RA-02 | OQ-03 |
| VS-08 | RA-02 | OQ-04 |
| VS-09 | RA-03 | OQ-04, OQ-05 |
| VS-10 | RA-04 | OQ-06 |
| VS-11 | RA-07 | OQ-06 |
| VS-12 | RA-05 | OQ-07 |
| VS-13 | RA-12 | OQ-03, OQ-09 |
| VS-14 | RA-12 | OQ-11 |
| VS-15, 16, 17 | RA-09, RA-10 | OQ-08, OQ-11 |
| VS-18 | RA-11 | OQ-06, OQ-11 |
| VS-19, 20 | RA-13 | OQ-04, OQ-09 |
| VS-21, 22 | RA-14 | OQ-11 |
| VS-23 | RA-06 | OQ-12 |
| VS-24 to 30 | RA-01, RA-10, RA-16, RA-17 | procedures / infrastructure (not in this OQ) |

## 8. Deviations during the OQ

| No. | Test case | Description | Impact assessment | Resolution | Closed (init./date) |
|---|---|---|---|---|---|
| | | | | | |

## 9. Beyond the OQ: performance qualification (pilot)

The OQ shows that the tool works on known answers. PQ shows that it works for
{{organisation}}'s protocols and systems. Proposed pilot:

1. Select {{n}} existing manual test scripts of low to medium risk. Convert them into
   protocols, with a conversion report for each, then review and approve them.
2. Execute each one **both** manually (current procedure) **and** with validshot,
   against the same system version.
3. Compare step by step. Every difference must be explained: a defect in the
   application, a weakness of the manual script, or a problem with the tool.
4. Acceptance: {{e.g. no unexplained difference; every tool-caused difference
   corrected and re-tested}}.

## 10. Requalification

Assess, and where needed re-execute (fully or in part, based on risk), when any of
these changes: validshot version; Playwright or Chromium version; Node major version;
OS major version or host type; the protocol format or the assertion semantics as
described in the release notes. A full `npm run oq` takes a few minutes, so a full
re-execution is usually the simplest choice.

## 11. Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| Author | | | |
| Reviewer | | | |
| QA approver | | | |
