# validshot

Deterministic front-end validation with evidence an auditor can sign.

In regulated software (medical devices, pharma, other GxP systems), display checks
are often still done by hand: follow a test script, take a screenshot, paste it into
a document, compare it with the expected value, sign. validshot does the clicking,
the screenshots and the comparisons. People still write, approve and sign.

![Step 2 of a sample execution record: three of four checks fail](docs/sample/img/record-step-2-fail.png)

*Step 2 of a [sample execution record](docs/sample/runs/KA-001-20261110T154735Z-9a05/record.pdf),
run against a test app with planted defects. The stock badge's DOM text is the
expected "Low stock", but a banner covers it, so the check fails: a tester looking
at the screen couldn't read it either. The product name is cut off, and the total
is $569.90 where 3 × $189.99 = $569.97.*

## What you get

A **protocol** (YAML) lists steps: what a tester does, the requirement it covers,
and what must be displayed. validshot executes it in a pinned Chromium and produces
three kinds of document. All of them are in [docs/sample/](docs/sample/), generated
from the example protocol and unedited.

**1. A review copy for the approver** ([PDF](docs/sample/KA-001-order-form.review.pdf)).
The protocol laid out like a manual test script, for reviewers who don't read YAML.
Approval (`validshot lock`) pins the protocol's exact bytes.

![Review copy: test steps with requirements, actions and numbered expected results](docs/sample/img/review-copy.png)

**2. An execution record for every run**
([FAIL](docs/sample/runs/KA-001-20261110T154735Z-9a05/record.pdf),
[PASS](docs/sample/runs/KA-001-20261110T154758Z-d544/record.pdf)). For every step:
the **raw screenshot** (never modified), an **annotated copy** with each check boxed
pass/fail, and **expected vs actual** for every check, as in the image above. The
record (PDF + JSON) also holds requirement traceability, deviations and signature
blocks. Every file is SHA-256 hashed into an append-only, hash-chained audit log.

**3. A summary report over all formal runs** ([PDF](docs/sample/reports/VSR-001/report.pdf)).
Results by protocol, traceability, the full execution history including failed
runs, every deviation, and open items. Each run's evidence is re-verified when the
report is generated.

![Summary report: results by protocol, open items, traceability and execution history](docs/sample/img/summary-report.png)

Built for regulated software (IEC 62304 / SaMD, GxP CSV/CSA, GAMP 5). Design
rationale: [docs/design.md](docs/design.md).

## Principles

- **No AI in the execution path.** An agent may help *write* a protocol (MCP tools
  below). A formal run is a deterministic replay. It calls no LLM, does no selector
  healing and no automatic retries. A target that is not found is a FAIL.
- **People approve, people execute.** A reviewer locks a protocol (`validshot lock`),
  which pins its exact bytes. A formal run refuses an unlocked or edited protocol and
  requires a named initiator. The MCP server has no lock tool and no formal-run tool.
- **Evidence is never touched.** Raw screenshots are stored as captured. Annotations
  are drawn on a copy, in a separate browser context, so the app under test is never
  modified for the picture.
- **"Displayed correctly" is more than the DOM.** Every text or visibility assertion
  also checks that the element is in the viewport, not covered by another element,
  and not truncated. A badge hidden under a banner FAILs even if its DOM text is
  right.
- **Failures are recorded, not hidden.** A failed assertion is recorded as FAIL with
  its actual value, and the run continues. A failed action FAILs its step and marks
  every later step BLOCKED.

## Install

```bash
npm install -g validshot                # or per project: npm install --save-dev validshot
npx playwright install chromium        # once, if not already cached
validshot --help
```

Pin the exact version in a validated setup (`npm install validshot@0.2.0`): the tool
version goes on every record, and a version change needs its own assessment.

## Quick start (from a clone, with the example apps)

```bash
git clone https://github.com/boheling/validshot && cd validshot
npm install
npx playwright install chromium        # once, if not already cached

npm run ka-app                         # known-answer test app on :4173 (/good and /bad)

validshot check   examples/ka-app/protocols/KA-001-order-form.yaml
validshot run     examples/ka-app/protocols/KA-001-order-form.yaml --dry-run          # authoring, not evidence
validshot render  examples/ka-app/protocols/KA-001-order-form.yaml                    # review copy (PDF) for the reviewer
validshot lock    examples/ka-app/protocols/KA-001-order-form.yaml --approver "A. Reviewer" --reason "Initial approval"
validshot run     examples/ka-app/protocols/KA-001-order-form.yaml --initiator "T. Tester"
validshot verify-run runs/KA-001-<timestamp>-<id>
validshot report  runs --title "Order form 1.4.2 — validation summary"                # summary over all formal runs
```

(`validshot` = `node bin/validshot.mjs`, or `npm link` once.)

Try the same locked protocol against the defective variant, which has four planted
display defects:

```bash
validshot run examples/ka-app/protocols/KA-001-order-form.yaml --initiator "T. Tester" --base-url http://127.0.0.1:4173/bad
```

It fails on exactly the planted defects: a total truncated to 10 cents, quantity 0
accepted, a stock badge covered by a promo banner, and a truncated product name. The
last two have correct DOM text. `test/known-answer.test.mjs` asserts this, and it is
the starting point for the tool's own OQ. The output of these commands is in
[docs/sample/](docs/sample/), with a table of which check caught which defect.

## Example: converting a manual Excel test script

`examples/stats-app/` is a worked conversion of a **mock** manual test script.
`manual/TS-STAT-001_Batch-Statistics.xlsx` is generated by `manual/make_mock_xlsx.py`;
the app, the company and the data are fictional. It becomes
`protocols/STAT-001-batch-statistics.yaml`. `manual/CONVERSION.md` maps every Excel
step to a protocol step and lists the decisions the reviewer must accept. One of them
is a wrong expected value in the Excel: it computed the population SD where the
requirement asks for the sample SD. Executed as written, the Excel would have passed
the defective app.

```bash
npm run stats-app     # :4174, /good and /bad
validshot run examples/stats-app/protocols/STAT-001-batch-statistics.yaml --dry-run
```

## Example: public websites (demo only)

`examples/public-sites/` holds three protocols against real public sites. Each one
checks known answers that were computed or looked up independently of the site, plus
edge cases and response times (`within_ms`):

| protocol | site | checks |
|---|---|---|
| CALC-001 | calculator.net standard deviation | σ = 0.28284271247462 and s = 0.31622776601684 for the STAT-001 data set; small values; text input; single value; result within 5 s |
| REGEX-001 | regex101 | `\d+` on `a1b22c333` → 3 matches; no match; pattern error; catastrophic backtracking halted within 5 s |
| PDB-001 | rcsb.org | search 4HHB → entry listed; title, 1.74 Å, 2 unique chains (Fermi & Perutz 1984); results within 10 s |

```bash
validshot run examples/public-sites/REGEX-001-regex101.yaml --dry-run
```

These are demos, not validation. Public sites change without notice and expose no
version. Respect each site's terms and run them occasionally, never in a loop.

## What a run produces

A real one: [docs/sample/runs/KA-001-20261110T154735Z-9a05/](docs/sample/runs/KA-001-20261110T154735Z-9a05/).

```
runs/KA-001-20261110T154735Z-9a05/
  protocol.yaml            exact bytes that were executed
  protocol.lock.json       who approved them, when, why
  shots/step-01.raw.png    as captured (read-only)
  shots/step-01.annotated.png
  record.json / .html / .pdf
  audit.jsonl              append-only, each entry hashes the previous one
  manifest.json            sha256 of every file + chain head
  manifest.sha256          write this on the signed record / store it read-only
```

`validshot verify-run` re-hashes every file and walks the chain. A swapped
screenshot, an edited or deleted log entry, or a changed record is reported.

## Review copy and summary report

The workflow is: draft, dry-run, **render**, review, lock, run, **report**.

- `validshot render p.yaml` writes `p.review.pdf`, the protocol laid out like a manual
  test script, for reviewers who don't read YAML. It contains:
  - the requirements with their coverage, with gaps flagged;
  - each step with its action in words and its expected results as numbered checks,
    with notes;
  - the execution rules, a review checklist and signature fields;
  - the exact YAML as an appendix.

  The approved item is still the YAML file. Every page carries its sha256, and the
  sha256 the reviewer sees is the one `validshot lock` pins.
- `validshot report <runs-dir|run-dir>...` writes a summary report over formal runs.
  It contains:
  - the results by protocol (most recent run) and requirement traceability;
  - the full execution history, including failed and aborted runs;
  - all deviations, with a column for the deviation-record reference;
  - open items: earlier failures, uncovered requirements, overridden addresses,
    differing system versions and evidence-integrity failures.

  Every run's evidence is re-verified when the report is generated, and dry runs
  are left out. The report draws no conclusion: section 7 is for the signatories.
  The report directory is sealed like a run, so `validshot verify-run` works on it.

## Writing protocols

The full YAML reference and edge-case checklist are in
[skills/validshot/SKILL.md](skills/validshot/SKILL.md). A step looks like this:

```yaml
  - id: 5
    req: REQ-020
    action: "Edge case, below range: enter quantity 0."
    do: { fill: { target: { label: Quantity }, value: "0" } }
    expect:
      - { target: { role: alert }, text: Quantity must be a whole number from 1 to 99 }
      - { target: { role: button, name: Place order }, enabled: false }
```

`validshot inspect <url>` lists verified targets. With
`--protocol p.yaml --after-step N` it lists them for the state after replaying steps
1..N.

### With a coding agent (MCP, authoring only)

```json
{ "mcpServers": { "validshot": { "command": "npx", "args": ["-y", "validshot@0.2.0", "mcp"] } } }
```

Tools: `validshot_guide`, `inspect_page`, `check_protocol`, `dry_run`,
`render_protocol`. There is no tool for lock, formal run or report. For Claude Code,
also copy `skills/validshot/` to `.claude/skills/validshot/`.

## Status: 0.2.0 (M1 of the design + authoring loop)

Done:
- Evidence Runner (M1);
- review copy, lock and summary report;
- agent authoring via MCP (M3; the 80 % acceptance metric has not been measured);
- known-answer apps and tests;
- a tool validation template pack in [docs/tool-validation/](docs/tool-validation/):
  URS, risk assessment, IQ/OQ protocol based on known-answer testing, and known
  limitations.

Not done yet. Each of these needs to exist before validshot output can serve as
formal evidence:

- **Part 11 electronic signatures and access control (M4).** Records carry
  wet-ink / external e-signature blocks. The lock is a review record, not a
  signature.
- **WORM storage / external anchoring** of the manifest hash. A local hash chain
  detects edits, but someone with full admin access can rewrite the whole chain.
- **Trusted time.** Timestamps come from the host clock, and NTP sync is not
  verified (the record says so).
- **PDF/A** archival output, Word template import/fill-back (M2), traceability
  export to validation platforms (M6).
- **An executed qualification.** The validation pack is a set of templates; each
  organisation executes the IQ/OQ in its own environment (`npm run oq` writes
  `oq-results.tap`). The [known limitations](docs/tool-validation/04-known-limitations.md)
  include display-check gaps, such as overlays with `pointer-events: none`.
- Determinism means the same protocol, tool version and system state give the same
  steps and verdicts. Screenshots are not guaranteed pixel-identical.

## Tests

```bash
npm test     # unit, tamper detection, known-answer (good/bad apps), failure model,
             # timing, display check, review copy, summary report, MCP surface
npm run oq   # the same suite as OQ evidence: also writes oq-results.tap
```

## License

MIT
