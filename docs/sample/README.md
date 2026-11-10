# Sample output

Every file in this folder was produced by validshot 0.2.0 and is unedited. The
protocol is the known-answer example
[KA-001](../../examples/ka-app/protocols/KA-001-order-form.yaml): an order form
served twice, correct at `/good` and with four planted display defects at `/bad`.
The same approved protocol was executed against both.

This is a demonstration, not validation evidence. The app is a test fixture,
"A. Reviewer" and "T. Tester" are placeholders, and nothing was signed.

## The files

| File | What it is | Used by |
|---|---|---|
| [KA-001-order-form.review.pdf](KA-001-order-form.review.pdf) | **Review copy** of the protocol, laid out like a manual test script: requirements and their coverage, steps with numbered expected results, a review checklist, and the exact YAML as an appendix | The reviewer, before approving it with `validshot lock` |
| [runs/KA-001-20261110T154735Z-9a05/record.pdf](runs/KA-001-20261110T154735Z-9a05/record.pdf) | **Execution record** against `/bad`: **FAIL**, 5 of 10 steps pass, 9 deviations | The tester signs it; QA reviews the deviations |
| [runs/KA-001-20261110T154758Z-d544/record.pdf](runs/KA-001-20261110T154758Z-d544/record.pdf) | **Execution record** against `/good`: **PASS**, 10 of 10 steps | The tester signs it |
| [reports/VSR-001/report.pdf](reports/VSR-001/report.pdf) | **Summary report** over both runs: results by protocol, requirement traceability, execution history, every deviation, and open items (here: the earlier failed run) | The validation lead and QA sign it |

GitHub shows the PDFs in the browser. The `record.html` and `report.html` files
show their screenshots only when you download the folder and open them locally.

## The planted defects and where the record shows them

| Defect in `/bad` | Is the DOM text right? | Failed checks | Actual value recorded |
|---|---|---|---|
| A promo banner covers the stock badge | yes | step 1 A3, step 2 A2 | `shows "Low stock", display: is covered by <div#promo>` |
| The product name is cut off | yes | step 2 A1 | `display: text is cut off horizontally (463px of content in 360px)` |
| The total is truncated to 10 cents | no | step 2 A4, step 3 A3, step 4 A2 | `shows "$569.90"` where 3 × $189.99 = $569.97 |
| Quantity 0 is accepted | no | step 5 A1, A2, A3 | no error, "Place order" enabled, total `$0.00` |

The first two would pass a DOM-only test, because the text is correct. A tester
looking at the screen could not read it, so validshot fails them.

## One run directory

```
runs/KA-001-20261110T154735Z-9a05/
  protocol.yaml                the exact bytes that were executed
  protocol.lock.json           the approval: who, when, why, and the protocol's sha256
  shots/step-NN.raw.png        each step's screenshot as captured
  shots/step-NN.annotated.png  a copy with every check boxed PASS/FAIL
  record.pdf / .html / .json   the execution record
  audit.jsonl                  append-only log; each entry hashes the previous one
  manifest.json                sha256 of every file and the chain head
  manifest.sha256              the value to write on the signed record
```

## Check the evidence yourself

From a clone of this repository, after `npm install`:

```bash
node bin/validshot.mjs verify-run docs/sample/runs/KA-001-20261110T154735Z-9a05
# ✓ intact: 25 files, 50 audit entries, manifest sha256 08d60e44dcda7bbee3d3a68bb149bb422fbf5c98480ddf3a5745215ff4d644b6
```

Swap a screenshot, edit a line of `audit.jsonl` or change a value in
`record.json`, and run it again: the change is reported.

## How it was made

In a clean container (`mcr.microsoft.com/playwright:v1.64.0-noble`, host name
`qa-runner-01`), with the KA app running (`npm run ka-app`):

```bash
P=examples/ka-app/protocols/KA-001-order-form.yaml
validshot render $P --out KA-001-order-form.review.pdf
validshot lock   $P --approver "A. Reviewer" --reason "Initial approval"
validshot run    $P --initiator "T. Tester" --base-url http://127.0.0.1:4173/bad --out runs
validshot run    $P --initiator "T. Tester" --out runs
validshot report runs --title "KA Order Entry 1.4.2 — validation summary (sample)" --id VSR-001 --out reports
```

The images in `img/` are crops of these files, made for the main README.
