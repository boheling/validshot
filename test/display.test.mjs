// The display-integrity check: a covering sibling is a defect; the gaps of a wrapped
// inline element (where the parent shows through) are not. What hit-testing cannot
// see (an overlay with pointer-events: none, text in the background colour, a veil)
// is judged on the rendered pixels. Every case runs in each installed browser engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium, firefox, webkit } from 'playwright';
import { evaluate } from '../src/assert.mjs';

const ENGINES = { chromium, firefox, webkit };
const PAGE = `<body style="margin:8px;font:16px/1.4 Arial,sans-serif;background:#fff;color:#111">
  <h4 style="width:260px">Result: <a href="#" id="wrapped">A VERY LONG STRUCTURE TITLE THAT WRAPS OVER SEVERAL LINES</a></h4>
  <div style="position:relative"><span id="under">Low stock</span><div style="position:absolute;left:0;top:0;width:200px;height:20px;background:#fde68a">promo</div></div>
  <div id="cut" style="width:80px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Extended-range calibrator set</div>
  <p id="plain">Sample concentration 12.5 mg/L</p>
  <p id="grey" style="color:#888">Last calibrated 2026-01-05</p>
  <div style="position:relative"><span id="veiled">In stock</span><div style="position:absolute;inset:0;background:#fff;pointer-events:none"></div></div>
  <div style="position:relative"><span id="half">Result: 4.20 mmol/L (high)</span><div style="position:absolute;left:0;top:0;width:95px;height:100%;background:#fff;pointer-events:none"></div></div>
  <div style="position:relative"><span id="faint">Batch released</span><div style="position:absolute;inset:0;background:rgba(255,255,255,.9);pointer-events:none"></div></div>
  <p id="same" style="color:#fff">Out of range</p>
  <p id="pale" style="color:#bbb">Pending review</p>
  <input id="field" value="42" style="font:16px Arial;width:200px">
  <div style="position:relative;display:inline-block"><input id="hidden-field" value="42" style="font:16px Arial;width:200px"><div style="position:absolute;inset:0;background:#fff;pointer-events:none"></div></div>
  <input id="empty" value="" style="font:16px Arial;width:200px">
  <div style="height:40px;overflow:auto;width:300px"><p id="scrolled" style="margin:0">line one</p><p>line two</p><p>line three</p><p>line four</p></div>
  <style>@font-face{font-family:"Broken Sans";src:url(data:font/woff2;base64,AAAA) format("woff2")}</style>
  <p id="font" style="font-family:'Broken Sans',Arial,sans-serif">Dose 5 mg</p>
</body>`;

for (const [name, engine] of Object.entries(ENGINES)) {
  const installed = fs.existsSync(engine.executablePath());
  test(`display check (${name}): intact text passes; covers, clipping, truncation, illegible rendering and a failed web font are caught`, { skip: installed ? false : `${name} is not installed (npx playwright install ${name})` }, async () => {
    const browser = await engine.launch();
    try {
    const page = await browser.newPage({ viewport: { width: 800, height: 900 }, deviceScaleFactor: 1 });
    await page.setContent(PAGE);
    const r = (css, extra = {}) => evaluate(page, { target: css, visible: true, ...extra }, { timeout: 300 });
    const ok = async (css, extra) => { const x = await r(css, extra); assert.equal(x.pass, true, `${css}: ${x.actual}`); };
    const bad = async (css, re, extra) => { const x = await r(css, extra); assert.equal(x.pass, false, `${css} should fail: ${x.actual}`); assert.match(x.actual, re, css); };

    await ok('#wrapped');
    await bad('#under', /covered by <div>/);
    await bad('#cut', /cut off horizontally/);
    await ok('#plain');
    await ok('#grey');                                   // 3.5:1, above the default floor of 2:1
    await bad('#grey', /contrast 3\.\d:1 against its background, minimum 4\.5:1/, { min_contrast: 4.5 });
    await bad('#veiled', /not legible as rendered: contrast 1\.0:1/);       // pointer-events: none overlay, invisible to hit-testing
    await bad('#half', /part of the text is not legible as rendered \(left third/);
    await bad('#faint', /not legible as rendered: contrast 1\.[0-4]:1/);    // 90 % white veil
    await bad('#same', /not legible as rendered: contrast 1\.0:1/);         // white on white
    await bad('#pale', /contrast 1\.[89]:1/);                               // #bbb on white is 1.9:1
    await ok('#field');
    await bad('#hidden-field', /not legible as rendered/);
    await ok('#empty');                                  // nothing to read: no legibility claim
    await ok('#scrolled');                               // first line of a scrolling list
    await bad('#font', /web font "Broken Sans" is not loaded \(a fallback font is shown\)/);
    } finally { await browser.close(); }
  });
}
