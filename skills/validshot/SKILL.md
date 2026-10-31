---
name: validshot
description: Write and dry-run front-end validation protocols with validshot — step-by-step checks of what a web app displays, with requirement IDs, edge cases, and screenshot evidence. Use when the user asks to validate or verify front-end features, write a test script/protocol for validation (CSV/CSA, GxP, IEC 62304, IQ/OQ/PQ), collect screenshot evidence, or turn a manual test script into an automated one.
---

# Authoring validation protocols with validshot

Validshot runs a YAML **protocol** against a web app in a real browser. Each step
does something, then checks what is displayed. The run produces raw screenshots, a
hash-chained audit trail and an execution record (PDF + JSON) that people sign.

**Your role is authoring only.** You write the protocol and dry-run it until it
works. A person reviews and **locks** it (`validshot lock`), then a person starts the
**formal run** (`validshot run --initiator`). You never do either of those, and
nothing you produce in a dry run is evidence.

## Tools

| step | MCP tool | CLI |
|---|---|---|
| this guide | `validshot_guide` | `validshot --help` |
| verified targets + screenshot | `inspect_page` (`url`) | `validshot inspect <url>` |
| the page after steps 1..N | `inspect_page` (`protocol`, `after_step`) | `validshot inspect --protocol p.yaml --after-step N` |
| validate after every edit | `check_protocol` | `validshot check p.yaml` |
| execute without a lock | `dry_run` | `validshot run p.yaml --dry-run` |

Pass absolute paths to MCP tools.

## Workflow

1. **Get the requirements.** The protocol checks the app against *requirements*,
   not against what the code does. Use the user's requirement list, spec or
   existing manual test script. If there is none, ask for it. Do not derive
   requirements by reading the app's code: a protocol written that way just
   confirms the code does what it does.
2. `inspect_page` the start URL. Use only the targets it lists.
3. Write the protocol (format below): one step per thing a tester would check,
   each with a `req`. Add edge cases as **separate steps** (checklist below).
4. `check_protocol` → fix → `dry_run` → read the failures and the screenshots.
5. For every failure, decide which kind it is:
   - **Protocol problem** (wrong target, ambiguous match, wrong expected text
     because you misread the requirement): fix the protocol.
   - **App problem** (the app does not do what the requirement says): **do not
     change the expectation to match the app.** Report it to the user as a
     possible defect, quoting the requirement, the expected and actual values, and
     the screenshot.
6. Hand over: tell the user that the protocol is ready for review, and give them
   the commands to lock it and to run it formally (below).

## Protocol format

```yaml
protocol:
  id: OE-001                 # stable id; goes on every record
  version: 1                 # bump on every approved change
  title: Order entry form — display and validation
requirements:                # optional but recommended: enables the traceability table
  REQ-010: The order page shows the selected product's full name and unit price.
environment:
  base_url: https://test.example.com/app
  viewport: { width: 1280, height: 800 }    # defaults shown
  timezone: UTC
  locale: en-US
  action_timeout_ms: 5000    # each action gets ONE attempt within this time
  assert_timeout_ms: 2000    # an assertion passes if it holds within this time
system_version:              # how the run learns the version under test
  url: /version.json         # GET, relative to base_url …
  json: version              # … and the field to read (dot path)
  # or: selector: "#app-version", page: /   (read text from the page)
stop_on_fail: false          # default: a failed assertion does not stop the run
steps:
  - id: 1
    req: REQ-010             # or a list: [REQ-010, REQ-011]
    action: Open the order page.          # what a tester does, in words (goes on the record)
    expected: Product name and price are shown.   # optional plain-language expectation
    do: { goto: / }          # one action, or a list of actions
    expect:                  # at least one assertion
      - { target: { label: Unit price }, text: "$12.50" }
    screenshot: viewport     # or full_page
```

### Actions (`do:`)

| action | form |
|---|---|
| `goto` | `goto: /path` (relative to base_url) or a full URL |
| `click`, `hover`, `check`, `uncheck` | `click: <target>` |
| `fill` | `fill: { target: <target>, value: "text" }` (`""` clears the field) |
| `select` | `select: { target: <target>, option: "visible option text" }` |
| `press` | `press: Enter` (focused element) or `press: { target: <target>, key: Enter }` |
| `wait_for` | `wait_for: { target: <target>, state: visible }` (visible/hidden/attached/detached) |

A failed action FAILs the step and BLOCKs all later steps, so don't put fragile
optional clicks (cookie banners that may not appear) in a protocol. Handle those in
the test environment instead.

### Targets

Exactly one of: `{ role, name }`, `{ label }`, `{ text }`, `{ testid }`,
`{ placeholder }`, `{ alt }`, `{ css }`, or a plain CSS string. Optional:
`exact: true`, `nth: 0`. A target must match **exactly one** element; two or more
matches is a FAIL ("ambiguous"), never a guess. Prefer `label`, `role` + `name` and
`testid` over CSS.

### Assertions (`expect:`)

Each entry has a `target` plus one or more checks, all of which must hold:

| check | passes when |
|---|---|
| `text: "…"` | the rendered text (as displayed, whitespace collapsed) equals it exactly |
| `contains: "…"` / `matches: "regex"` | text contains / matches |
| `value: "…"` | an input's current value |
| `visible: true/false` | shown / not shown (`false` also passes if absent) |
| `enabled: true/false`, `checked: true/false` | control state |
| `attribute: { name: aria-invalid, value: "true" }` | attribute value |
| `count: 3` | number of *visible* matches (target may match many) |

Timing (any assertion, including page-level ones):

| key | meaning |
|---|---|
| `within_ms: 5000` | FAIL unless the condition holds within 5000 ms. The clock starts when the step's **last action** starts and stops at the first poll where the condition holds (50 ms polling, host clock, includes network). The record shows the measured time. Timed assertions are evaluated first. |
| `timeout_ms: 60000` | wait longer than `assert_timeout_ms` for this one assertion (long jobs), without making it a timing requirement |

Use `within_ms` only when a requirement states a time limit. Measure single-user
response time; never loop a step to load-test a site.

Page-level (no target): `{ url: "/confirm" }` (URL contains),
`{ url: { matches: "regex" } }`, `{ title: "…" }`.

**Display check.** Every `visible: true`, `text`, `contains` or `matches` assertion
also checks that the element is displayed intact: inside the viewport, not
covered by another element, and its text not cut off. A covered or truncated value
FAILs even when the DOM text is right. To turn it off for one assertion (for example an
empty error area), you must give a reason:
`display_check: false, display_check_reason: "empty when there is no error"`.

## Edge-case checklist

For every input or state in the requirements, consider one step each for:

- **Boundaries**: minimum, maximum, and one beyond each (0, 1, 99, 100).
- **Invalid types**: letters in a number field, decimals where integers are
  expected, leading/trailing spaces.
- **Empty**: cleared required field; nothing selected.
- **Long content**: the longest realistic name or value. The display check catches
  truncation.
- **Special characters**: accents, CJK, `<`, `&`, quotes, emoji, if the requirement
  covers free text.
- **State changes**: what was shown is cleared or updated after changing a choice;
  messages disappear when fixed.
- **Permissions and empty data**: empty lists, "no results", read-only roles, if the
  requirements mention them.

Only add edge cases that a requirement speaks to, and tie each one to that
requirement with `req`. If an edge case matters but no requirement covers it, tell
the user that the requirements have a gap. Don't invent the expected behaviour.

## Handing over (tell the user)

```
validshot lock <protocol.yaml> --approver "Reviewer Name" --reason "Initial approval"
validshot run  <protocol.yaml> --initiator "Tester Name"
validshot verify-run runs/<run-id>
```

Any edit to the protocol after locking makes the formal run refuse it until it is
re-approved.
