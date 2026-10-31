// Review copy of a protocol: the YAML laid out like a manual test script, for the
// people who review and approve it. It adds nothing and decides nothing. The approved
// item stays the YAML file: the copy carries the file's SHA-256 on every page and the
// exact file as an appendix, and `validshot lock` prints the same hash.
import fs from 'node:fs';
import path from 'node:path';
import { loadProtocol } from './protocol.mjs';
import { verifyLock } from './lock.mjs';
import { describeAction, describeAssertion } from './assert.mjs';
import { esc, badge, sig, BASE_CSS } from './record.mjs';
import { toPdf } from './pdf.mjs';
import { TOOL_VERSION, PLAYWRIGHT_VERSION } from './version.mjs';

export const reviewFileFor = (file) => file.replace(/\.ya?ml$/i, '') + '.review.pdf';

function lockStatus(l) {
  if (l.ok) return `Approved by ${esc(l.lock.approved_by)} (${esc(l.lock.approver_role)}) at ${esc(l.lock.approved_at)}: ${esc(l.lock.reason)}. The lock matches this file.`;
  if (l.lock) return `<span class="err">NOT APPROVED in this version. A lock exists for different content (sha256 ${esc(l.lock.protocol_sha256.slice(0, 16))}…, approved by ${esc(l.lock.approved_by)} at ${esc(l.lock.approved_at)}); this file must be re-approved.</span>`;
  return 'Not yet approved (no lock file).';
}

function versionSource(sv) {
  if (sv?.url) return `read at run start from ${esc(sv.url)}${sv.json ? ` (field ${esc(sv.json)})` : ''}`;
  if (sv?.selector) return `read at run start from ${esc(sv.selector)} on ${esc(sv.page ?? '/')}`;
  return '<span class="err">none in the protocol: the initiator must state it at each run (recorded as initiator-confirmed)</span>';
}

function expectedItem(e, k) {
  const extra = [];
  if (e.display_check === false) extra.push(`<span class="note">Display check off: ${esc(e.display_check_reason)}</span>`);
  if (e.timeout_ms !== undefined && e.within_ms === undefined) extra.push(`<span class="note">May take up to ${e.timeout_ms} ms (a wait, not a time limit).</span>`);
  if (e.note) extra.push(`<span class="note">Note: ${esc(e.note)}</span>`);
  return `<li><b>A${k + 1}</b> ${esc(describeAssertion(e, { displayCheck: false }))}${extra.length ? `<br>${extra.join('<br>')}` : ''}</li>`;
}

export function reviewHtml(p, l, { now = new Date() } = {}) {
  const d = p.doc, env = d.environment, file = path.basename(p.file);
  const row = (k, v) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`;
  const reqs = Object.entries(d.requirements);
  const trace = reqs.map(([id, text]) => {
    const steps = d.steps.filter((s) => s.req.includes(id)).map((s) => s.id);
    return `<tr><td>${esc(id)}</td><td>${esc(text)}</td><td>${steps.map(esc).join(', ') || '—'}</td><td>${steps.length ? 'covered' : badge('NOT COVERED')}</td></tr>`;
  }).join('');
  const steps = d.steps.map((s) => `<tr>
      <td><b>${esc(s.id)}</b>${s.source ? `<div class="meta">${esc(s.source)}</div>` : ''}</td>
      <td>${s.req.map(esc).join('<br>')}</td>
      <td><b>${esc(s.action)}</b>${s.do.length ? `<ol class="how">${s.do.map((a) => `<li>${esc(describeAction(a))}</li>`).join('')}</ol>` : ''}</td>
      <td>${s.expected ? `<p><i>${esc(s.expected)}</i></p>` : ''}<ul class="exp">${s.expect.map(expectedItem).join('')}</ul>${s.screenshot === 'full_page' ? '<div class="meta">Screenshot: full page</div>' : ''}</td>
    </tr>`).join('');
  const lines = p.bytes.toString('utf8').replace(/\n$/, '').split('\n')
    .map((t, i) => `<div class="l"><span class="ln">${i + 1}</span><span class="t">${esc(t) || ' '}</span></div>`).join('');
  const assertions = d.steps.reduce((n, s) => n + s.expect.length, 0);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Protocol review ${esc(d.protocol.id)} v${esc(d.protocol.version)}</title><style>${BASE_CSS}
  .copy{border:2px solid #1d4ed8;color:#1e3a8a;padding:6px 8px;margin:8px 0;font-size:10px}
  .script th{width:auto} .script td:nth-child(1){width:52px} .script td:nth-child(2){width:72px} .script td:nth-child(3){width:30%}
  .script p{margin:0 0 3px} .how{margin:3px 0 0;padding-left:16px;color:#333;font-size:9.5px} .exp{margin:0;padding-left:14px} .exp li{margin-bottom:2px}
  .trace th{width:auto} .trace td:first-child{width:80px;white-space:nowrap} .trace td:nth-child(3){width:60px} .trace td:last-child{width:84px}
  .warn li{color:#92400e} .check li{margin-bottom:3px}
  .src{font:8.5px/1.4 ui-monospace,Menlo,monospace;border:1px solid #bbb;padding:6px;margin:4px 0}
  .l{display:flex} .ln{flex:0 0 28px;color:#888;user-select:none} .t{white-space:pre-wrap;word-break:break-all}
  </style></head><body>
  <h1>Test protocol for review: ${esc(d.protocol.id)} v${esc(d.protocol.version)}</h1>
  <div>${esc(d.protocol.title)}</div>
  <div class="copy"><b>Review copy.</b> The item that is approved and executed is the protocol file <b>${esc(file)}</b>, identified by
    sha256 <span class="mono">${esc(p.hash)}</span>. This copy is generated from that file by validshot and adds nothing to it; the exact
    file is reproduced in Appendix A. If the two ever differ, the file governs.</div>

  <h2>1. Protocol</h2><table>
    ${row('Protocol ID / version', `${esc(d.protocol.id)} v${esc(d.protocol.version)}`)}
    ${row('Title', esc(d.protocol.title))}
    ${d.protocol.system ? row('System', esc(d.protocol.system)) : ''}
    ${d.protocol.source ? row('Converted from', esc(d.protocol.source)) : ''}
    ${row('Protocol file', `${esc(file)} · sha256 <span class="mono">${esc(p.hash)}</span>`)}
    ${row('Approval status', lockStatus(l))}
    ${row('Size', `${d.steps.length} steps, ${assertions} checks, ${reqs.length} requirements`)}
    ${row('Review copy generated', `${esc(now.toISOString())} by validshot ${esc(TOOL_VERSION)}`)}
  </table>

  <h2>2. Test environment and execution rules</h2><table>
    ${row('System under test', `${esc(env.base_url)} <span class="meta">(the initiator may point a run elsewhere; the record then flags the override)</span>`)}
    ${row('System version', versionSource(d.system_version))}
    ${row('Browser', `Chromium driven by Playwright ${esc(PLAYWRIGHT_VERSION)}; the exact browser build is recorded by each run`)}
    ${row('Screen and locale', `viewport ${env.viewport.width}×${env.viewport.height}, scale 1, timezone ${esc(env.timezone)}, locale ${esc(env.locale)}, light scheme, reduced motion`)}
    ${row('Timeouts', `each action ${env.action_timeout_ms} ms; each check must hold within ${env.assert_timeout_ms} ms unless stated otherwise`)}
    ${row('Failure handling', `${d.stop_on_fail ? 'The run stops at the first failed check.' : 'A failed check is recorded as FAIL with its actual value and the run continues.'} A failed action fails its step and every later step is recorded as BLOCKED. Nothing is retried.`)}
  </table>
  <p class="meta">How a check is judged: text is compared as displayed, with runs of whitespace collapsed. A target must match exactly one element; two or more matches FAIL as ambiguous. Every check of shown text or visibility also requires the element to be displayed intact: inside the screen, not covered by another element and its text not cut off. Actual values, pass/fail, timestamps and screenshots are recorded automatically by each run in its execution record.</p>

  ${reqs.length ? `<h2>3. Requirements and coverage</h2><table class="trace"><tr><th>Requirement</th><th>Text</th><th>Steps</th><th>Coverage</th></tr>${trace}</table>` : ''}

  <h2 style="break-before:page">${reqs.length ? 4 : 3}. Test steps</h2>
  <p class="meta">Every check of shown text or visibility also requires the element to be displayed intact (section 2); exceptions are marked.</p>
  <table class="script"><thead><tr><th>Step</th><th>Req</th><th>Action</th><th>Expected result</th></tr></thead><tbody>${steps}</tbody></table>

  ${p.warnings.length ? `<h2>Points for the reviewer</h2><ul class="warn">${p.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}

  <h2>Review and approval</h2>
  <ul class="check">
    <li>Every requirement in scope is listed and covered, or its omission is explained.</li>
    <li>Every expected value follows from the requirement or an independent calculation, not from what the application currently shows.</li>
    <li>Edge cases the requirements speak to are tested; notes and conversion decisions are acceptable.</li>
    <li>The sha256 above is the sha256 printed by <span class="mono">validshot check ${esc(file)}</span>.</li>
  </ul>
  <p>Approval is recorded with <span class="mono">validshot lock ${esc(file)} --approver "Name" --reason "…"</span>, which pins
    sha256 <span class="mono">${esc(p.hash)}</span>. Any later change to the file requires a new review and lock.</p>
  <p class="meta">Reviewer comments:</p><div style="border:1px solid #bbb;height:60px"></div>
  <div class="sigs">${sig('Reviewed by')}${sig('Approved by')}</div>

  <h2 style="break-before:page">Appendix A. Protocol file (exact content)</h2>
  <p class="meta">${esc(file)} · ${p.bytes.length} bytes · sha256 <span class="mono">${esc(p.hash)}</span></p>
  <div class="src">${lines}</div>
  </body></html>`;
}

export async function renderProtocol(file, { out } = {}) {
  const p = loadProtocol(path.resolve(file));
  if (p.errors.length) throw new Error(`protocol has errors; fix them before review:\n  - ${p.errors.join('\n  - ')}`);
  const l = verifyLock(p);
  const pdf = await toPdf({ html: reviewHtml(p, l), footer: `${p.doc.protocol.id} v${p.doc.protocol.version} · REVIEW COPY of ${path.basename(p.file)} sha256 ${p.hash}` });
  const target = path.resolve(out ?? reviewFileFor(p.file));
  fs.writeFileSync(target, pdf);
  return { file: target, hash: p.hash, lock: l, steps: p.doc.steps.length, warnings: p.warnings };
}
