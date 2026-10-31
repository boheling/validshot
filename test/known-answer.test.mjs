// Known-answer test (the basis for the tool's OQ): the same protocol must PASS on the
// correct app and FAIL on exactly the planted defects of the defective one.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { start } from '../examples/ka-app/server.mjs';
import { run } from '../src/runner.mjs';
import { lock } from '../src/lock.mjs';
import { verifyRun } from '../src/evidence.mjs';
import { buildReport } from '../src/report.mjs';

const PORT = 4199;
const SRC = path.resolve('examples/ka-app/protocols/KA-001-order-form.yaml');
let server, dir, protocol;

before(async () => {
  server = await start(PORT);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'validshot-ka-'));
  protocol = path.join(dir, 'KA-001.yaml');
  fs.writeFileSync(protocol, fs.readFileSync(SRC, 'utf8').replace('http://127.0.0.1:4173/good', `http://127.0.0.1:${PORT}/good`));
});
after(() => server.close());

test('a formal run refuses an unlocked protocol and a missing initiator', async () => {
  await assert.rejects(run(protocol, { initiator: 'T', outDir: dir }), /no lock file/);
  lock(protocol, { approver: 'Test Reviewer', reason: 'test' });
  await assert.rejects(run(protocol, { outDir: dir }), /--initiator/);
});

test('correct app: every step passes, record and evidence verify', async () => {
  const r = await run(protocol, { initiator: 'Test Tester', outDir: dir });
  assert.equal(r.verdict, 'PASS', JSON.stringify(r.record.deviations, null, 1));
  assert.equal(r.record.system_version.value, '1.4.2');
  for (const f of ['record.pdf', 'record.html', 'record.json', 'protocol.yaml', 'protocol.lock.json', 'shots/step-01.raw.png', 'shots/step-01.annotated.png'])
    assert.ok(fs.existsSync(path.join(r.dir, f)), f);
  assert.equal(verifyRun(r.dir).ok, true);
});

test('defective app: exactly the planted defects fail', async () => {
  const r = await run(protocol, { initiator: 'Test Tester', outDir: dir, baseUrl: `http://127.0.0.1:${PORT}/bad` });
  const got = r.record.deviations.map((d) => `${d.step}.${d.assertion}: ${d.actual}`);
  const want = [
    /^1\.A3: .*covered by <div#promo>/,          // D2 occluded badge (DOM text correct)
    /^2\.A1: .*text is cut off horizontally/,     // D3 truncated product name (DOM text correct)
    /^2\.A2: .*covered by <div#promo>/,          // D2
    /^2\.A4: shows "\$569\.90"/,                 // D1 total truncated to 10 cents
    /^3\.A3: shows "\$189\.90"/,                 // D1
    /^4\.A2: shows "\$18809\.00"/,               // D1
    /^5\.A1: shows ""/,                          // D4 quantity 0 accepted: no error…
    /^5\.A2: enabled/,                           // D4 …ordering not disabled
    /^5\.A3: shows "\$0\.00"/,                   // D4 …and a total is shown
  ];
  assert.equal(got.length, want.length, got.join('\n'));
  want.forEach((re, i) => assert.match(got[i], re));
  assert.equal(r.record.base_url_overridden.used, `http://127.0.0.1:${PORT}/bad`);
});

test('summary report: re-verifies every run, leaves dry runs out, keeps the history, flags tampering', async () => {
  await run(protocol, { dryRun: true, outDir: dir });
  await assert.rejects(run(protocol, { initiator: 'T', outDir: dir, systemVersion: '9.9.9' }), /mismatch/);   // aborted, but on record
  const r = await buildReport([dir], { outDir: path.join(dir, 'reports'), id: 'VSR-T1' });
  const s = r.summary;
  assert.deepEqual(s.formal.map((x) => x.result), ['PASS', 'FAIL', 'ABORTED']);
  assert.equal(s.excluded.length, 1);
  assert.equal(s.allPass, false);
  assert.ok(s.open.some((o) => /most recent run .* was aborted: system version mismatch/.test(o)), s.open.join('\n'));
  assert.ok(s.open.some((o) => /earlier run .* FAILED with 9 deviation/.test(o)), s.open.join('\n'));
  for (const f of ['report.pdf', 'report.html', 'report.json']) assert.ok(fs.existsSync(path.join(r.dir, f)), f);
  assert.equal(verifyRun(r.dir).ok, true);   // the report is sealed like a run

  // alter the passing run's raw screenshot: the next report must say so
  const shot = path.join(s.formal[0].dir, 'shots/step-01.raw.png');
  fs.chmodSync(shot, 0o644);
  fs.appendFileSync(shot, 'x');
  const r2 = await buildReport([dir], { outDir: path.join(dir, 'reports'), id: 'VSR-T2' });
  assert.ok(r2.summary.open.some((o) => /evidence integrity check FAILED .*step-01\.raw\.png/.test(o)), r2.summary.open.join('\n'));
  await assert.rejects(buildReport([path.join(dir, 'reports')], { outDir: path.join(dir, 'reports2') }), /no run directories/);
});

test('a changed protocol is refused until re-approved', async () => {
  fs.appendFileSync(protocol, '\n');
  await assert.rejects(run(protocol, { initiator: 'T', outDir: dir }), /changed since approval/);
});
