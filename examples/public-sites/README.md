# Public-site demo protocols

Dry-run demos against real public websites (last passed 2026-10-30). Not validation
evidence: the sites change without notice and expose no version number.

- Expected values come from outside the site: computed independently (CALC-001),
  countable by hand (REGEX-001), or from the literature (PDB-001). Where an
  expectation could only be observed on the site (an error message's wording), the
  assertion's `note` says so.
- Time limits (`within_ms`) are single-user response times on whatever network runs
  them. They are not load tests. Run these occasionally, not in loops or CI schedules.
- If a protocol starts failing, first check whether the site changed. That is the
  same "protocol problem or app problem?" decision as in any dry run.
