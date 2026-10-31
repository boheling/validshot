// The execution record: what an auditor reads and a reviewer signs. Rendered to
// HTML, then to PDF by the same pinned Chromium. Signature blocks are for wet-ink
// or the organisation's existing e-signature system (validshot has no Part 11 signing yet).

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const short = (h) => (h ? `${h.slice(0, 16)}…` : '');

// annotated copy: the raw PNG as an image, with assertion boxes drawn on top.
// Labels go to the right of the box (never over the value being checked); above it
// when there is no room on the right, and below it when there is no room above either.
export function annotatedHtml(raw, boxes, { dryRun, caption, width }) {
  const b64 = raw.toString('base64');
  const marks = boxes.map((b) => {
    const c = b.pass ? '#16a34a' : '#dc2626';
    const right = b.x + b.w + 8 + 56 <= width;
    const lx = right ? b.x + b.w + 8 : b.x - 3, ly = right ? b.y + b.h / 2 - 10 : b.y >= 24 ? b.y - 24 : b.y + b.h + 4;
    return `<div style="position:absolute;left:${b.x - 3}px;top:${b.y - 3}px;width:${b.w + 6}px;height:${b.h + 6}px;border:3px solid ${c};box-sizing:border-box;border-radius:3px"></div>` +
      `<div style="position:absolute;left:${lx}px;top:${ly}px;background:${c};color:#fff;font:bold 13px/20px system-ui,sans-serif;padding:0 6px;border-radius:3px;white-space:nowrap">${esc(b.label)} ${b.pass ? '✓' : '✗'}</div>`;
  }).join('');
  return `<!doctype html><html><body style="margin:0;position:relative"><img src="data:image/png;base64,${b64}" style="display:block">${marks}` +
    `<div style="position:absolute;right:0;bottom:0;background:rgba(17,24,39,.85);color:#fff;font:12px/18px system-ui,sans-serif;padding:4px 10px">ANNOTATED COPY · ${esc(caption)}${dryRun ? ' · DRY RUN — NOT EVIDENCE' : ''}</div></body></html>`;
}

const badge = (r) => `<span class="badge ${r === 'PASS' ? 'pass' : r === 'FAIL' ? 'fail' : 'blocked'}">${r}</span>`;

export function renderRecord(r) {
  const row = (k, v) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`;
  const reqs = Object.entries(r.requirements ?? {});
  const trace = reqs.map(([id, text]) => {
    const steps = r.steps.filter((s) => s.req.includes(id));
    const res = !steps.length ? 'NOT COVERED' : steps.every((s) => s.result === 'PASS') ? 'PASS' : 'FAIL';
    return `<tr><td>${esc(id)}</td><td>${esc(text)}</td><td>${steps.map((s) => esc(s.id)).join(', ') || '—'}</td><td>${badge(res)}</td></tr>`;
  }).join('');
  const steps = r.steps.map((s) => `
    <section class="step">
      <h3>Step ${esc(s.id)} ${badge(s.result)} <span class="req">${s.req.map(esc).join(', ')}${s.source ? ` · source: ${esc(s.source)}` : ''}</span></h3>
      <p><b>Action:</b> ${esc(s.action)}${s.actions.length ? `<br><span class="mono">${s.actions.map(esc).join(' → ')}</span>` : ''}</p>
      ${s.expected_text ? `<p><b>Expected (protocol text):</b> ${esc(s.expected_text)}</p>` : ''}
      ${s.error ? `<p class="err"><b>Action failed:</b> ${esc(s.error)}</p>` : ''}
      ${s.reason ? `<p class="err">${esc(s.reason)}</p>` : ''}
      <table class="asserts"><tr><th>#</th><th>Expected</th><th>Actual</th><th>Result</th></tr>
        ${s.assertions.map((a, k) => `<tr><td>A${k + 1}</td><td>${esc(a.expected)}${a.note ? `<br><span class="note">Note: ${esc(a.note)}</span>` : ''}</td><td>${esc(a.actual)}${a.evidence ? `<br><span class="mono">separate capture: ${esc(a.evidence)}</span>` : ''}</td><td>${badge(s.result === 'BLOCKED' ? 'BLOCKED' : a.pass ? 'PASS' : 'FAIL')}</td></tr>`).join('')}
      </table>
      ${s.screenshot ? `<div class="shot">
      <p class="meta">Executed ${esc(s.started_at)} → ${esc(s.finished_at)} · URL ${esc(s.url)}</p>
      <img src="${esc(s.screenshot.annotated.path)}" alt="annotated screenshot of step ${esc(s.id)}">
      <p class="meta mono">raw ${esc(s.screenshot.raw.path)} sha256 ${esc(s.screenshot.raw.sha256)}<br>annotated ${esc(s.screenshot.annotated.path)} sha256 ${esc(s.screenshot.annotated.sha256)}${s.screenshot.extra.map((x) => `<br>A${x.assertion} capture ${esc(x.path)} sha256 ${esc(x.sha256)}`).join('')}</p></div>` : ''}
    </section>`).join('');
  const sig = (role) => `<div class="sig"><div class="line"></div><b>${role}</b><br>Name / signature / date</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Execution record ${esc(r.run_id)}</title><style>
  body{font:10.5px/1.45 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif;color:#111;margin:0}
  h1{font-size:18px;margin:0 0 2px} h2{font-size:13px;border-bottom:1.5px solid #111;padding-bottom:2px;margin:18px 0 6px}
  h3{font-size:12px;margin:0 0 4px} table{border-collapse:collapse;width:100%;margin:4px 0}
  th,td{border:1px solid #bbb;padding:3px 5px;text-align:left;vertical-align:top} th{background:#f2f2f2;width:22%}
  .asserts th,.dev th{width:auto} .dev td:nth-child(1){width:44px;white-space:nowrap} .dev td:nth-child(2){width:62px} .dev td:last-child{width:52px} .asserts td:first-child{width:28px} .asserts td:last-child{width:62px}
  .mono{font-family:ui-monospace,Menlo,monospace;font-size:8.5px;word-break:break-all} .meta{color:#444;font-size:9px;margin:3px 0}
  .badge{display:inline-block;padding:0 6px;border-radius:3px;font-weight:700;font-size:9.5px;color:#fff}
  .pass{background:#15803d}.fail{background:#b91c1c}.blocked{background:#6b7280}
  .note{color:#92400e;font-size:9.5px} .req{font-weight:400;color:#444;font-size:10px} .err{color:#b91c1c}
  .step{border:1px solid #ddd;padding:8px;margin:8px 0;border-radius:4px}
  /* a step may span pages (no half-empty page before a tall step); keep its heading with its table, rows whole, and the screenshot with its hashes */
  .step h3,.step>p{break-after:avoid} .step tr{break-inside:avoid} .shot{break-inside:avoid}
  .step img{max-width:100%;border:1px solid #999;display:block;margin-top:4px}
  .dry{border:3px solid #b91c1c;color:#b91c1c;font-weight:700;padding:6px;text-align:center;font-size:13px;margin-bottom:8px}
  .verdict{font-size:14px;margin:6px 0} .sigs{display:flex;gap:18px;margin-top:10px} .sig{flex:1;font-size:9.5px} .line{border-bottom:1px solid #111;height:34px;margin-bottom:3px}
  </style></head><body>
  ${r.dry_run ? '<div class="dry">DRY RUN — AUTHORING ONLY — NOT VALID AS VALIDATION EVIDENCE</div>' : ''}
  <h1>Execution record: ${esc(r.protocol.id)} v${esc(r.protocol.version)}</h1>
  <div>${esc(r.protocol.title)}</div>
  <p class="verdict">Overall result: ${badge(r.verdict)} &nbsp; ${r.counts.PASS} pass · ${r.counts.FAIL} fail · ${r.counts.BLOCKED} blocked of ${r.steps.length} steps</p>
  <h2>1. Execution details</h2><table>
    ${row('Run ID', `<span class="mono">${esc(r.run_id)}</span>`)}
    ${row('Protocol', `${esc(r.protocol.file)} · sha256 <span class="mono">${esc(r.protocol.sha256)}</span>`)}
    ${r.protocol.source ? row('Converted from', esc(r.protocol.source)) : ''}
    ${row('Protocol approval', r.lock.ok ? `${esc(r.lock.approved_by)} (${esc(r.lock.approver_role)}), ${esc(r.lock.approved_at)} — ${esc(r.lock.reason)}. Review approval; not a Part 11 signature.` : `<span class="err">NOT APPROVED: ${esc(r.lock.problem)}</span>`)}
    ${row('System under test', `${esc(r.base_url)}${r.base_url_overridden ? ` <span class="err">(overridden at start; protocol says ${esc(r.base_url_overridden.protocol)})</span>` : ''}`)}
    ${row('System version', r.system_version ? `${esc(r.system_version.value)} — ${esc(r.system_version.source)}` : '<span class="err">not recorded</span>')}
    ${row('Initiated by', esc(r.initiator))}
    ${row('Started / finished', `${esc(r.started_at)} → ${esc(r.finished_at)} · ${esc(r.clock)}`)}
    ${row('Environment', `viewport ${r.environment.viewport.width}×${r.environment.viewport.height}, scale ${r.environment.device_scale_factor}, timezone ${esc(r.environment.timezone)}, locale ${esc(r.environment.locale)}, ${esc(r.environment.color_scheme)} scheme, reduced motion; action timeout ${r.environment.action_timeout_ms} ms, assertion timeout ${r.environment.assert_timeout_ms} ms, no automatic retries`)}
    ${row('Execution tool', `validshot ${esc(r.tool.validshot)}, Playwright ${esc(r.tool.playwright)}, ${esc(r.tool.browser)}, Node ${esc(r.tool.node)}, ${esc(r.tool.os)}, host ${esc(r.tool.host)}`)}
    ${row('Evidence chain head', `<span class="mono">${esc(r.evidence_chain_head)}</span> (audit.jsonl at the time this record was generated; verify with <span class="mono">validshot verify-run</span>)`)}
  </table>
  ${reqs.length ? `<h2>2. Requirement traceability</h2><table class="asserts"><tr><th>Requirement</th><th>Text</th><th>Steps</th><th>Result</th></tr>${trace}</table>` : ''}
  <h2>3. Deviations</h2>
  ${r.deviations.length ? `<table class="dev"><tr><th>Step</th><th>Req</th><th>Expected</th><th>Actual</th><th>Result</th></tr>${r.deviations.map((d) => `<tr><td>${esc(d.step)}${d.assertion ? ` ${esc(d.assertion)}` : ''}</td><td>${d.req.map(esc).join(', ')}</td><td>${esc(d.expected)}</td><td>${esc(d.actual)}</td><td>${badge(d.result)}</td></tr>`).join('')}</table><p class="meta">Each deviation needs a deviation record. A re-execution gets a new run ID; this record is kept unchanged.</p>` : '<p>None.</p>'}
  ${r.console_errors.length ? `<h2>Browser errors during execution</h2><ul>${r.console_errors.map((e) => `<li class="mono">${esc(e)}</li>`).join('')}</ul>` : ''}
  <h2>4. Steps</h2>
  <p class="meta">Each step shows the annotated copy (boxes = assertion targets). The raw screenshot is stored unmodified next to it; both hashes are listed and recorded in the audit trail.</p>
  ${steps}
  <h2>5. Review and approval</h2>
  <div class="sigs">${sig('Executed (initiated) by')}${sig('Reviewed by')}${sig('Approved by')}</div>
  </body></html>`;
}
