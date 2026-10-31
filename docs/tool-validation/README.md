# Tool validation pack for validshot (template)

Generic templates for qualifying validshot as a tool that produces validation
evidence. Adapt them to your quality system: your document numbers, approval
workflow, risk method and roles. Your QA function owns the final documents. These
templates are a starting point, not regulatory advice.

Covers **validshot 0.2.0**. Re-check every template against the version you
install. The tool's behaviour and its known limitations change between versions.

| # | Document | Purpose |
|---|---|---|
| 01 | [User requirements (URS)](01-URS.md) | Intended use and what the tool must do; which requirements the tool meets and which your procedures or infrastructure must meet |
| 02 | [Risk assessment](02-risk-assessment.md) | Failure modes of the tool, their effect on evidence, controls, and how each control is verified |
| 03 | [IQ/OQ protocol](03-IQ-OQ-protocol.md) | Installation checks, and operational qualification based on known-answer testing |
| 04 | [Known limitations](04-known-limitations.md) | What the tool does not do or detect, with the control each limitation needs |

## The approach in one paragraph

The failure that matters is a **false PASS**: the tool reports that the application
displays the right thing when it does not, or evidence is altered without detection.
A false FAIL corrects itself, because someone investigates it as a deviation. So the
assurance effort goes where a false PASS could come from (risk-based, in the sense of
FDA CSA and GAMP 5). The core of the OQ is **known-answer testing**. The repository
contains test applications with planted defects whose correct answers are known
independently. The same approved protocol must pass on the correct variant and fail
at exactly the planted defects, and nowhere else. The automated test suite is the
executable form of the OQ. `npm run oq` runs it and writes `oq-results.tap` to
attach as evidence.

## How to use

1. Copy this folder into your document system. Replace every `{{placeholder}}`.
2. **URS:** confirm the intended use. Mark each requirement fulfilled by *Tool*,
   *Procedure* or *Infrastructure* to match your setup.
3. **Risk assessment:** review the proposed ratings with QA. Add risks from your
   environment, for example how logins are handled and where evidence is stored.
4. **IQ/OQ:** execute in the environment where formal runs will happen, with the
   same host type, OS, Node, Playwright and Chromium. Record actual results and
   attach the outputs.
5. **Known limitations:** for each limitation, confirm the control you rely on, or
   restrict the intended use.
6. **Summary:** close with your usual validation summary. It states whether the tool
   is fit for its intended use and which residual risks were accepted.
7. **PQ:** run a pilot in which real protocols are executed both manually and with
   validshot (see 03 §9).

Placeholders look like `{{organisation}}`, `{{doc-no}}` and `{{version}}`. Ratings marked
*proposed* are suggestions to confirm.
