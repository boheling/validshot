# Changelog

Review this before updating a qualified installation (see the requalification section of
[the IQ/OQ template](docs/tool-validation/03-IQ-OQ-protocol.md)).

## 0.3.0 — 2026-11-15

**The display check judges more than before. A protocol that passed under 0.2.x can
fail under 0.3.0** where text is shown with a contrast below 2:1 against its
background, where it lies under an overlay that hit-testing does not see, or where
its web font did not load. Re-execute the OQ and assess existing protocols before
using 0.3.0 for formal runs. The known-answer protocols give the same verdicts as
under 0.2.0.

Added
- Display check on the rendered pixels: for each line of an asserted element's text,
  the contrast between the background and what stands out from it must reach
  `min_contrast` (default 2:1; `environment.min_contrast`, or per assertion). Lines
  30 px or wider are also judged in thirds. This closes the gap in L-08 for overlays
  with `pointer-events: none`, and finds text in the background colour, veils and
  masks. The page is not touched: the tool reads a screenshot of the area.
- Display check: a web font is reported when none of its faces is loaded although the
  element shows text.
- `environment.browser`: `chromium` (default), `firefox`, `webkit`, or the `chrome` /
  `msedge` installed on the host. The engine is in the protocol, so it is approved
  with it. The known-answer tests run in Firefox and WebKit when they are installed.
- `environment.video: true` or `run --video`: the browser's own recording of the run,
  unedited, stored as `video/run.webm` and hashed into the manifest. Each step in the
  record lists its position in the video.
- `validshot keygen`, `validshot sign`, and `--sign-key` on `lock`, `run` and `report`:
  Ed25519 signatures over the sealed manifest (or the protocol's bytes, for a lock).
  `verify-run --trust <public key|fingerprint>` requires a valid signature from that
  key. These are not Part 11 signatures.
- `validshot timestamp`, and `--tsa <url>` on `run` and `report`: an RFC 3161 token for
  the manifest. The host clock's difference to the TSA's time is recorded.
  `verify-run --tsa-ca <chain.pem>` verifies the issuer with OpenSSL;
  `--require-timestamp` fails a run without a token.
- Tool validation pack: optional requirements URS-VS-31 to 34, OQ-13 and OQ-14, and
  limitations L-26 to L-29; L-01 to L-05, L-08 and L-14 rewritten.

Changed
- The expected-result text of display-checked assertions now ends "(in view, not
  covered, not truncated, legible as rendered)".
- A time limit (`within_ms`) is measured up to the moment the condition held, before
  the pixels are read back.
- The system version is read in a browser context of its own, so a video contains
  only the protocol's steps.
- A signed approval that does not verify, or that names another approver than the one
  who signed, makes the lock invalid.

## 0.2.1 — 2026-11-15


Documentation and package metadata only. No file under `bin/`, `src/` or `skills/`
changed, so the tool behaves exactly as 0.2.0 does; only the version it prints on
records differs.

- README: sample output (`docs/sample/`) with screenshots, and a short demo video.
- npm keywords.

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
