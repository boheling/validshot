// within_ms: the measured time is reported, and a late or missing result FAILs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { evaluate } from '../src/assert.mjs';

test('within_ms: on time passes with the measured time; late and never both fail', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const load = () => page.setContent(`<div id="out"></div><script>setTimeout(() => { document.getElementById('out').textContent = 'done' }, 600)</script>`);

  await load();
  const onTime = await evaluate(page, { target: '#out', text: 'done', within_ms: 1500 }, { t0: Date.now() });
  assert.equal(onTime.pass, true, onTime.actual);
  assert.ok(onTime.elapsed_ms >= 550 && onTime.elapsed_ms < 1500, String(onTime.elapsed_ms));

  await load();
  const late = await evaluate(page, { target: '#out', text: 'done', within_ms: 200 }, { t0: Date.now() });
  assert.equal(late.pass, false);
  assert.match(late.actual, /shows "done".*; after \d+ ms \(limit 200 ms\)/);   // how late is on the record

  const never = await evaluate(page, { target: '#missing', text: 'x', within_ms: 100 }, { t0: Date.now(), timeout: 100 });
  assert.equal(never.pass, false);
  assert.match(never.actual, /not met after \d+ ms \(limit 100 ms\)/);
  await browser.close();
});
