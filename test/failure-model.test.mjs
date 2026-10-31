// The failure model: an ambiguous target FAILs (never a guess), a failed check lets the
// run continue, a failed action BLOCKs every later step, and a dry run says so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { run } from '../src/runner.mjs';

const PAGE = '<h1>List</h1><ul><li>apple</li><li>pear</li></ul><p id="n">2 items</p>';

test('ambiguous target FAILs, the run continues; a failed action BLOCKs later steps; dry runs are marked', async () => {
  const server = http.createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end(PAGE); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'validshot-fm-'));
  const f = path.join(dir, 'FM-001.yaml');
  fs.writeFileSync(f, `protocol: { id: FM-001, version: 1, title: Failure model }
environment: { base_url: "http://127.0.0.1:${server.address().port}", action_timeout_ms: 500, assert_timeout_ms: 300 }
steps:
  - { id: 1, req: R, action: Open the list., do: { goto: / }, expect: [ { target: li, text: apple }, { target: "#n", text: 2 items } ] }
  - { id: 2, req: R, action: Click Delete., do: { click: { role: button, name: Delete } }, expect: [ { target: "#n", text: 1 item } ] }
  - { id: 3, req: R, action: Reopen the list., do: { goto: / }, expect: [ { target: "#n", text: 2 items } ] }
`);
  try {
    const r = await run(f, { dryRun: true, outDir: dir });
    const [s1, s2, s3] = r.record.steps;
    assert.equal(s1.result, 'FAIL');
    assert.match(s1.assertions[0].actual, /ambiguous: 2 elements match/);
    assert.equal(s1.assertions[1].pass, true);                      // the next check still ran
    assert.equal(s2.result, 'FAIL');
    assert.match(s2.error, /click button "Delete"/);
    assert.equal(s3.result, 'BLOCKED');                             // not executed, and on the record
    assert.deepEqual(r.counts, { PASS: 0, FAIL: 2, BLOCKED: 1 });
    assert.equal(r.record.dry_run, true);
    assert.match(fs.readFileSync(path.join(r.dir, 'record.html'), 'utf8'), /DRY RUN — AUTHORING ONLY — NOT VALID AS VALIDATION EVIDENCE/);
  } finally { server.close(); }
});
