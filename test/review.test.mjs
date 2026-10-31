// The review copy: the protocol in words for the reviewer, pinned to the YAML's hash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadProtocol } from '../src/protocol.mjs';
import { lock, verifyLock } from '../src/lock.mjs';
import { reviewHtml, renderProtocol } from '../src/review.mjs';

const YAML = `protocol: { id: RV-001, version: 1, title: Review copy test }
requirements:
  R-1: The page shows a heading.
  R-2: Something nobody tests yet.
environment: { base_url: "http://127.0.0.1:1" }
system_version: { url: /version.json, json: version }
steps:
  - id: 1
    req: R-1
    action: Open the page.
    do: { goto: / }
    expect:
      - { target: { role: heading, name: Hello }, visible: true, note: "From R-1." }
      - { target: "#err", text: "", display_check: false, display_check_reason: "empty when there is no error" }
`;

test('review copy: hash, steps in words, coverage gaps, exact file; follows the lock', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'validshot-review-'));
  const f = path.join(dir, 'RV-001.yaml');
  fs.writeFileSync(f, YAML);
  const html = () => { const p = loadProtocol(f); return { p, h: reviewHtml(p, verifyLock(p)) }; };

  let { p, h } = html();
  assert.ok(h.includes(p.hash));
  assert.match(h, /Not yet approved/);
  assert.match(h, /heading &quot;Hello&quot; is visible/);
  assert.doesNotMatch(h, /and is displayed intact \(in view/);   // the rule is stated once, not per check
  assert.match(h, /Display check off: empty when there is no error/);
  assert.match(h, /Note: From R-1\./);
  assert.match(h, /R-2<\/td><td>Something nobody tests yet\.<\/td><td>—<\/td><td><span class="badge blocked">NOT COVERED/);
  assert.ok(h.includes('<span class="t">  R-2: Something nobody tests yet.</span>'));   // Appendix A: the exact file

  lock(f, { approver: 'R. Reviewer', reason: 'test' });
  assert.match(html().h, /Approved by R\. Reviewer .*The lock matches this file\./);
  fs.appendFileSync(f, '# edited\n');
  assert.match(html().h, /NOT APPROVED in this version/);

  const r = await renderProtocol(f);
  assert.equal(r.file, path.join(dir, 'RV-001.review.pdf'));
  assert.equal(fs.readFileSync(r.file).subarray(0, 5).toString(), '%PDF-');
});
