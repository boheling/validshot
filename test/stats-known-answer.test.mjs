// The Excel-converted protocol (examples/stats-app) against the mock statistics app:
// PASS on the correct variant; FAIL exactly on the planted calculation defects.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { start } from '../examples/stats-app/server.mjs';
import { run } from '../src/runner.mjs';

const PORT = 4198;
let server, dir, protocol;

before(async () => {
  server = await start(PORT);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'validshot-stats-'));
  protocol = path.join(dir, 'STAT-001.yaml');
  fs.writeFileSync(protocol, fs.readFileSync('examples/stats-app/protocols/STAT-001-batch-statistics.yaml', 'utf8').replace('127.0.0.1:4174', `127.0.0.1:${PORT}`));
});
after(() => server.close());

test('correct app: all 9 steps pass; source and notes reach the record', async () => {
  const r = await run(protocol, { dryRun: true, outDir: dir });
  assert.equal(r.verdict, 'PASS', JSON.stringify(r.record.deviations, null, 1));
  assert.match(r.record.protocol.source, /TS-STAT-001/);
  assert.equal(r.record.steps[1].source, 'TS-STAT-001 step 2 (data set A)');
  assert.match(r.record.steps[1].assertions[2].note, /population SD/);
});

test('defective app (population SD, binary rounding): exactly the dependent assertions fail', async () => {
  const r = await run(protocol, { dryRun: true, outDir: dir, baseUrl: `http://127.0.0.1:${PORT}/bad` });
  const got = r.record.deviations.map((d) => `${d.step}.${d.assertion} ${d.actual}`);
  assert.deepEqual(got, [
    '2.A3 shows "0.28", displayed intact',      // = the Excel's (wrong) expected SD
    '2.A4 shows "2.83", displayed intact',      // = the Excel's (wrong) expected CV %
    '3.A3 shows "0.283", displayed intact',
    '3.A4 shows "2.828", displayed intact',
    '4.A2 shows "1.00", displayed intact',      // 1.005 rounded on the binary value
    '4.A4 shows "0.50", displayed intact',
    '4.A5 shows "1.00", displayed intact',
    '5.A3 shows "1.12", displayed intact',
    '5.A4 shows "44.72", displayed intact',
    '7.A3 shows "1.00", displayed intact',
  ]);
});
