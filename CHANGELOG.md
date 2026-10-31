# Changelog

Review this before updating a qualified installation (see the requalification section of
[the IQ/OQ template](docs/tool-validation/03-IQ-OQ-protocol.md)).

## 0.2.0 — 2026-10-31

Added
- `validshot render <protocol.yaml>`: a review copy (PDF) laid out like a manual test
  script. Every page carries the protocol's sha256; the exact YAML is an appendix. The
  approved item is still the YAML file. Also available to agents as the MCP tool
  `render_protocol`.
- `validshot report <run-dir|runs-dir>...`: a summary report over formal runs. It
  re-verifies each run's evidence, leaves dry runs out, keeps failed and aborted runs
  in the history, and lists deviations and open items. It leaves the conclusion to
  the signatories. The report is sealed like a run.
- `docs/tool-validation/`: template pack (URS, risk assessment, IQ/OQ protocol,
  known limitations); `npm run oq` writes `oq-results.tap`.
- Tests: failure model (ambiguous target, BLOCKED steps, dry-run marking), `within_ms`
  timing, review copy, summary report.

Changed
- Execution record PDF: a step may continue onto the next page, so there is no
  half-empty page before a tall step. The screenshot stays together with its hashes.
- Annotated screenshots: a label that fits neither right of nor above its box goes
  below it, so it no longer covers the checked value.
- An aborted run records its run ID, protocol, initiator and dry-run flag in the
  audit trail.

The judgement semantics are unchanged: the same protocol gives the same verdicts as
in 0.1.0.

## 0.1.0 — 2026-10-31

First release: locked YAML protocols, deterministic execution in Chromium, display-integrity
check, raw screenshot evidence, hash-chained audit trail, execution record (PDF + JSON),
`verify-run`, MCP authoring tools, known-answer example apps.
