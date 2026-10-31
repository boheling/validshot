// HTML → A4 PDF with the same pinned Chromium that executes the runs. The footer
// identifies the document on every page (run ID, protocol hash or report ID).
import { chromium } from 'playwright';
import { esc } from './record.mjs';

export async function toPdf({ url, html, footer }) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    if (url) await page.goto(url, { waitUntil: 'load' });
    else await page.setContent(html, { waitUntil: 'load' });
    return await page.pdf({
      format: 'A4', printBackground: true, margin: { top: '14mm', bottom: '16mm', left: '12mm', right: '12mm' },
      displayHeaderFooter: true, headerTemplate: '<span></span>',
      footerTemplate: `<div style="font-size:7px;width:100%;padding:0 12mm;display:flex;justify-content:space-between;gap:12px;color:#555"><span>${esc(footer)}</span><span style="white-space:nowrap">page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
    });
  } finally { await browser.close(); }
}
