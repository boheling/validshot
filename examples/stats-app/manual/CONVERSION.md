# Conversion report: TS-STAT-001 (Excel) → STAT-001 (validshot protocol)

> MOCK example. Company, system, data and people are fictional.

| | |
|---|---|
| Source | `TS-STAT-001_Batch-Statistics.xlsx` v2.0 (manual test script, 11 steps, data sets A–F, requirements URS-STAT-01…07) |
| Target | `../protocols/STAT-001-batch-statistics.yaml` v1 (9 steps, 62 assertions) |
| Method | Each expected value was recomputed independently from the **requirements** (Python `statistics` + decimal half-up rounding), not copied from the Excel and not read off the application. Targets come from `validshot inspect`. |
| Status | Draft. The reviewer must accept decisions C1–C5 before running `validshot lock`. |

## Step mapping

| Excel step | Req | Protocol step | Change |
|---|---|---|---|
| 1 | URS-STAT-01 | 1 | "All result fields show '—'" became 7 explicit checks |
| 2 | URS-STAT-02 | 2 | **SD and CV % corrected (C1)** |
| 3 | URS-STAT-03 | 3 | **Vague expected result made specific (C2)** |
| 4 | URS-STAT-04 | 4 | none (values match the requirement) |
| 5 | URS-STAT-02 | 5 | none |
| 6 | URS-STAT-05 | 6 | none |
| 7 | URS-STAT-05 | 7 | none |
| 8 | URS-STAT-06 | 8 | "identifies the invalid value" became "message contains `abc`" (C3) |
| 9 | URS-STAT-06 | 9 | "asks for at least one value" became regex `[Aa]t least one value` |
| 10 | URS-STAT-07 | — | **Not converted (C4)** |
| 11 | URS-STAT-02 | — | **Not converted, superseded (C5)** |

## Decisions for the reviewer

**C1. Excel step 2 expects the population SD; the requirement asks for the sample SD.**
Excel expects SD = 0.28 and CV % = 2.83. Those are what `=ROUND(STDEV.P(...),2)` gives,
which is the formula on the *Test Data* sheet. URS-STAT-02 says "sample standard
deviation (n−1)", which gives SD = 0.316 → **0.32** and CV % = 3.162 → **3.16**. The
protocol uses 0.32 / 3.16, and each assertion has a note saying so.
*Why it matters:* the defective variant of the app (`/bad/`) computes the population
SD and displays exactly 0.28 and 2.83. Executed as written, the Excel script would
have **passed** that wrong calculation. Data set C (step 5) uses `STDEV.S` and was
right, which hid the inconsistency.
*Reviewer action:* confirm that the requirement wins, and raise a change against
TS-STAT-001 so the Excel is corrected (or retired).

**C2. Excel step 3: "Results are shown with 3 decimals."** This doesn't check the
values, so "10.123" would pass. The protocol checks all seven values at 3 decimals:
10.000, 0.316, 3.162, 10.000, 9.600, 10.400 and n = 5.

**C3. Excel step 8: "An error message identifies the invalid value."** URS-STAT-06
doesn't fix the wording, so the protocol does not lock in the app's current text. It
checks that the message contains the invalid value `abc`, and that every result shows
"—".

**C4. Excel step 10 (print the page and attach the printout) is not automated.**
Printing goes through the OS print dialog, outside the browser page. Options: (a) keep
it as a manual step in a short companion script; (b) accept the execution record's
screenshots as evidence for URS-STAT-07 if the requirement's intent is "results can
be captured on paper". This needs a reviewer decision. **URS-STAT-07 is not covered by
STAT-001** and is deliberately left out of its requirement list.

**C5. Excel step 11 ("Verify all results are displayed correctly") is not a separate
step.** As written it has no checkable expected result. Every value assertion in
STAT-001 now also checks that the value is displayed intact: in view, not covered,
not truncated. That is the checkable form of this step.

## Edge cases

The Excel already covered the edge cases URS-STAT-04/05/06 call for: rounding at
1.005, an even count, a single value, a mean of zero, text input and empty input.
Each one has a note in the protocol. Not covered by the Excel and not added, because
no requirement specifies the behaviour (gaps to raise with the requirement owner):

- negative values only (e.g. CV % with a negative mean: URS says |mean|, untested);
- very large values, many decimals, or > 1,000 values;
- other separators (semicolon, decimal comma as in `10,2`).

## Verification of the conversion

- `validshot check`: 9 steps, 62 assertions, no errors.
- Dry run against `/good/`: 9/9 PASS.
- Dry run against `/bad/` (planted: population SD, binary rounding): steps 2, 3, 4, 5
  and 7 FAIL on SD / CV % / rounding, as expected. Steps 6, 8 and 9 PASS, because they
  don't depend on either defect.
