// The display-integrity check: a covering sibling is a defect; the gaps of a wrapped
// inline element (where the parent shows through) are not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { evaluate } from '../src/assert.mjs';

test('display check: wrapped inline link is intact; overlay, clipping and truncation are caught', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.setContent(`
    <h4 style="width:260px">Result: <a href="#" id="wrapped">A VERY LONG STRUCTURE TITLE THAT WRAPS OVER SEVERAL LINES</a></h4>
    <div style="position:relative"><span id="under">Low stock</span><div style="position:absolute;left:0;top:0;width:200px;height:30px;background:#fde68a">promo</div></div>
    <div id="cut" style="width:80px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Extended-range calibrator set</div>`);
  const r = (css) => evaluate(page, { target: css, visible: true }, { timeout: 200 });
  assert.equal((await r('#wrapped')).pass, true, (await r('#wrapped')).actual);
  assert.match((await r('#under')).actual, /covered by <div>/);
  assert.match((await r('#cut')).actual, /cut off horizontally/);
  await browser.close();
});
