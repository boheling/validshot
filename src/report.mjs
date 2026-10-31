// Summary report over formal runs: what was executed, against which system version,
// with what result, and whether each run's evidence is still intact. It re-verifies
// every run when it is generated, leaves dry runs out (not evidence), keeps failed and
// aborted runs in the history, and lists open items. It draws no conclusion: that is
// written and signed by people. The report itself is sealed like a run, so
// `validshot verify-run` works on it too.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import YAML from 'yaml';
import { EvidenceStore, verifyRun } from './evidence.mjs';
import { esc, badge, sig, BASE_CSS } from './record.mjs';
import { toPdf } from './pdf.mjs';
import { TOOL_VERSION, PLAYWRIGHT_VERSION } from './version.mjs';

const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const isRun = (d) => fs.existsSync(path.join(d, 'audit.jsonl')) && fs.existsSync(path.join(d, 'protocol.yaml'));

// a run directory, or a directory of run directories (one level)
export function findRuns(inputs) {
  const out = [];
  for (const input of inputs.map((x) => path.resolve(x))) {
    if (!fs.existsSync(input)) throw new Error(`not found: ${input}`);
    if (isRun(input)) { out.push(input); continue; }
    const found = fs.readdirSync(input).sort().map((d) => path.join(input, d)).filter((d) => fs.statSync(d).isDirectory() && isRun(d));
    if (!found.length) throw new Error(`no run directories in ${input}`);
    out.push(...found);
  }
  return [...new Set(out)];
}

function loadRun(dir) {
  const integrity = verifyRun(dir);
  const base = { dir, integrity };
  const rec = path.join(dir, 'record.json');
  if (fs.existsSync(rec)) {
    const r = JSON.parse(fs.readFileSync(rec, 'utf8'));
    return { ...base, run_id: r.run_id, dry_run: r.dry_run, result: r.verdict, protocol: r.protocol, started_at: r.started_at, record: r };
  }
  // no record: the run was aborted before its first step (e.g. system version unreadable)
  let aborted = null;
  for (const line of fs.readFileSync(path.join(dir, 'audit.jsonl'), 'utf8').split('\n').filter(Boolean)) {
    try { const e = JSON.parse(line); if (e.type === 'run_aborted') aborted = e; } catch {}
  }
  const doc = (() => { try { return YAML.parse(fs.readFileSync(path.join(dir, 'protocol.yaml'), 'utf8')); } catch { return {}; } })();
  const a = aborted?.data ?? {};
  return { ...base, run_id: a.run_id ?? path.basename(dir), dry_run: a.dry_run ?? false, result: 'ABORTED',
    protocol: a.protocol ?? { id: doc?.protocol?.id ?? '?', version: doc?.protocol?.version ?? '?', title: doc?.protocol?.title ?? '' },
    started_at: a.started_at ?? aborted?.at ?? '', reason: a.reason ?? 'no execution record (run incomplete)', record: null };
}

export function summarize(runs) {
  const formal = runs.filter((r) => !r.dry_run).sort((a, b) => a.started_at.localeCompare(b.started_at));
  const excluded = runs.filter((r) => r.dry_run);
  const byProtocol = new Map();
  for (const r of formal) byProtocol.set(r.protocol.id, [...(byProtocol.get(r.protocol.id) ?? []), r]);
  const protocols = [...byProtocol].map(([id, list]) => ({ id, runs: list, latest: list.at(-1) }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const open = [];
  for (const r of formal) if (!r.integrity.ok) open.push(`Run ${r.run_id}: evidence integrity check FAILED (${r.integrity.problems.join('; ')}).`);
  for (const p of protocols) {
    const l = p.latest;
    if (l.result !== 'PASS') open.push(`${p.id}: the most recent run (${l.run_id}) ${l.result === 'ABORTED' ? `was aborted: ${l.reason}` : `FAILED with ${l.record.deviations.length} deviation(s)`}.`);
    if (l.record?.base_url_overridden) open.push(`${p.id}: the most recent run was pointed at ${l.record.base_url} instead of the protocol's ${l.record.base_url_overridden.protocol}; confirm this is the system in scope.`);
    for (const [req] of Object.entries(l.record?.requirements ?? {})) if (!l.record.steps.some((s) => s.req.includes(req))) open.push(`${p.id}: requirement ${req} is not covered by any step.`);
    for (const r of p.runs.slice(0, -1)) if (r.result !== 'PASS') open.push(`${p.id}: earlier run ${r.run_id} ${r.result === 'ABORTED' ? 'was aborted' : `FAILED with ${r.record.deviations.length} deviation(s)`}; confirm a deviation record exists and is closed.`);
  }
  const versions = [...new Set(protocols.map((p) => p.latest.record?.system_version?.value).filter(Boolean))];
  if (versions.length > 1) open.push(`The most recent runs were executed against different system versions (${versions.join(', ')}); confirm the scope of this report.`);
  const latest = protocols.map((p) => p.latest);
  const allPass = latest.length > 0 && latest.every((r) => r.result === 'PASS') && formal.every((r) => r.integrity.ok);
  return { formal, excluded, protocols, open, versions, allPass,
    counts: { PASS: latest.filter((r) => r.result === 'PASS').length, FAIL: latest.filter((r) => r.result === 'FAIL').length, ABORTED: latest.filter((r) => r.result === 'ABORTED').length } };
}

export function reportHtml(rep) {
  const { summary: s } = rep;
  const row = (k, v) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`;
  const intact = (r) => (r.integrity.ok ? '<span class="badge pass">INTACT</span>' : '<span class="badge fail">NOT INTACT</span>');
  const result = (r) => badge(r.result === 'ABORTED' ? 'ABORTED' : r.result);
  const when = (t) => esc(String(t).replace('T', ' ').replace(/\.\d+Z$/, 'Z'));
  const overview = s.protocols.map((p) => {
    const l = p.latest, rec = l.record;
    const reqs = Object.keys(rec?.requirements ?? {});
    const covered = reqs.filter((q) => rec.steps.some((st) => st.req.includes(q))).length;
    return `<tr><td><b>${esc(p.id)}</b> v${esc(l.protocol.version)}<br>${esc(l.protocol.title)}</td><td>${reqs.length ? `${covered} of ${reqs.length}` : '—'}</td>
      <td>${p.runs.length}</td><td class="mono">${esc(l.run_id)}</td><td>${when(l.started_at)}<br>${esc(rec?.initiator ?? '')}</td>
      <td>${esc(rec?.system_version?.value ?? '—')}</td><td>${result(l)}${rec ? `<div class="meta">${rec.counts.PASS}/${rec.steps.length} steps pass</div>` : ''}</td><td>${intact(l)}</td></tr>`;
  }).join('');
  const trace = s.protocols.flatMap((p) => {
    const rec = p.latest.record;
    if (!rec) return [`<tr><td>${esc(p.id)}</td><td colspan="3">no execution record (run aborted)</td><td>${badge('ABORTED')}</td></tr>`];
    return Object.entries(rec.requirements ?? {}).map(([id, text]) => {
      const steps = rec.steps.filter((st) => st.req.includes(id));
      const res = !steps.length ? 'NOT COVERED' : steps.every((st) => st.result === 'PASS') ? 'PASS' : 'FAIL';
      return `<tr><td>${esc(p.id)}</td><td>${esc(id)}</td><td>${esc(text)}</td><td>${steps.map((st) => esc(st.id)).join(', ') || '—'}</td><td>${badge(res)}</td></tr>`;
    });
  }).join('');
  const history = s.formal.map((r) => {
    const rec = r.record;
    return `<tr><td class="mono">${esc(r.run_id)}</td><td>${esc(r.protocol.id)} v${esc(r.protocol.version)}<div class="mono">${esc((r.protocol.sha256 ?? '').slice(0, 16))}…</div></td>
      <td>${rec ? `${esc(rec.lock.approved_by)}<div class="meta">${when(rec.lock.approved_at)}</div>` : '—'}</td><td>${esc(rec?.initiator ?? '—')}</td>
      <td>${esc(rec?.system_version?.value ?? '—')}<div class="meta">${esc(rec?.base_url ?? '')}${rec?.base_url_overridden ? ' <span class="err">(override)</span>' : ''}</div></td>
      <td>${when(r.started_at)}</td><td>${result(r)}${rec ? `<div class="meta">${rec.counts.PASS} pass · ${rec.counts.FAIL} fail · ${rec.counts.BLOCKED} blocked</div>` : `<div class="meta">${esc(r.reason)}</div>`}</td>
      <td>${intact(r)}<div class="mono">${esc((r.integrity.manifest_sha256 ?? '').slice(0, 16))}${r.integrity.manifest_sha256 ? '…' : ''}</div></td></tr>`;
  }).join('');
  const devs = s.formal.filter((r) => r.record?.deviations.length).flatMap((r) => r.record.deviations.map((d) =>
    `<tr><td class="mono">${esc(r.run_id)}</td><td>${esc(d.step)}${d.assertion ? ` ${esc(d.assertion)}` : ''}</td><td>${d.req.map(esc).join(', ')}</td><td>${esc(d.expected)}</td><td>${esc(d.actual)}</td><td></td></tr>`)).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(rep.title)} ${esc(rep.report_id)}</title><style>${BASE_CSS}
  .grid th{width:auto} .open li{margin-bottom:3px} .verdict{font-size:13px;margin:6px 0}
  .devs td:nth-child(1){width:120px} .devs td:nth-child(2){width:40px;white-space:nowrap} .devs td:nth-child(3){width:70px} .devs td:last-child{width:90px}
  .concl{border:1px solid #bbb;height:110px;margin:4px 0} .hist td:first-child{width:120px}
  .trace td:nth-child(1),.trace td:nth-child(2){white-space:nowrap} .trace td:nth-child(4){width:44px}
  </style></head><body>
  <h1>${esc(rep.title)}</h1>
  <div>Summary of formal validshot executions · report ${esc(rep.report_id)}</div>
  <p class="verdict">Most recent results: ${s.allPass ? badge('PASS') : badge('FAIL')} &nbsp; ${s.protocols.length} protocol(s): ${s.counts.PASS} passed, ${s.counts.FAIL} failed, ${s.counts.ABORTED} aborted in their most recent run · ${s.formal.length} formal run(s) · evidence ${s.formal.every((r) => r.integrity.ok) ? 'intact for every run' : '<span class="err">NOT intact for every run</span>'} · ${s.open.length} open item(s)</p>
  <p class="meta">This is a factual summary generated from the runs' records. It does not conclude that the system is fit for use; the conclusion in section 7 is written by the signatories.</p>

  <h2>1. Report details</h2><table>
    ${row('Report ID', `<span class="mono">${esc(rep.report_id)}</span>`)}
    ${row('Generated', `${esc(rep.generated_at)} by validshot ${esc(rep.tool.validshot)} (Playwright ${esc(rep.tool.playwright)}, Node ${esc(rep.tool.node)}, ${esc(rep.tool.os)}, host ${esc(rep.tool.host)})`)}
    ${row('System version(s) in the most recent runs', s.versions.length ? s.versions.map(esc).join(', ') : '—')}
    ${row('Inputs', `${s.formal.length} formal run(s)${s.excluded.length ? `; ${s.excluded.length} dry run(s) left out (not evidence)` : ''}. Each run's evidence was re-verified (every file hash, the audit chain and the manifest) when this report was generated.`)}
  </table>

  <h2>2. Results by protocol (most recent run)</h2>
  <table class="grid"><tr><th>Protocol</th><th>Requirements covered</th><th>Runs</th><th>Most recent run</th><th>Executed / by</th><th>System version</th><th>Result</th><th>Evidence</th></tr>${overview}</table>

  <h2>3. Open items</h2>
  ${s.open.length ? `<ol class="open">${s.open.map((o) => `<li>${esc(o)}</li>`).join('')}</ol>` : '<p>None.</p>'}

  <h2>4. Requirement traceability (most recent run of each protocol)</h2>
  <table class="grid trace"><tr><th>Protocol</th><th>Requirement</th><th>Text</th><th>Steps</th><th>Result</th></tr>${trace}</table>

  <h2>5. Execution history (all formal runs)</h2>
  <table class="grid hist"><tr><th>Run ID</th><th>Protocol</th><th>Approved by</th><th>Initiated by</th><th>System version</th><th>Started</th><th>Result</th><th>Evidence (manifest sha256)</th></tr>${history}</table>
  <p class="meta">Each run's execution record (record.pdf) holds the per-step results and screenshots. Re-check any run with <span class="mono">validshot verify-run &lt;run-dir&gt;</span>.</p>

  <h2>6. Deviations (all formal runs)</h2>
  ${devs ? `<table class="grid devs"><tr><th>Run ID</th><th>Step</th><th>Req</th><th>Expected</th><th>Actual</th><th>Deviation record / resolution</th></tr>${devs}</table>
  <p class="meta">Deviations of earlier runs remain listed after a later run passes. Enter the reference of each deviation record from the organisation's deviation system.</p>` : '<p>None.</p>'}
  ${s.excluded.length ? `<p class="meta">Dry runs left out: ${s.excluded.map((r) => esc(r.run_id)).join(', ')}.</p>` : ''}

  <h2>7. Conclusion and approval</h2>
  <p class="meta">To be written by the signatories, taking into account the open items in section 3 and the resolution of each deviation in section 6.</p>
  <div class="concl"></div>
  <div class="sigs">${sig('Prepared by')}${sig('Reviewed by')}${sig('Approved by (QA)')}</div>
  </body></html>`;
}

export async function buildReport(inputs, { title = 'Validation summary report', id, outDir = 'reports', now = new Date() } = {}) {
  const runs = findRuns(inputs).map(loadRun);
  const summary = summarize(runs);
  if (!summary.formal.length) throw new Error(`no formal runs among the inputs (${runs.length} dry run(s) found; dry runs are not evidence)`);
  const reportId = id ?? `report-${stamp(now)}-${crypto.randomBytes(2).toString('hex')}`;
  const dir = path.resolve(outDir, reportId);
  const store = new EvidenceStore(dir);
  const tool = { validshot: TOOL_VERSION, playwright: PLAYWRIGHT_VERSION, node: process.version, os: `${os.type()} ${os.release()} ${os.arch()}`, host: os.hostname() };
  store.event('report_started', { report_id: reportId, title, inputs: runs.map((r) => ({ run_id: r.run_id, dir: r.dir, dry_run: r.dry_run, manifest_sha256: r.integrity.manifest_sha256 ?? null, intact: r.integrity.ok })) });
  const rep = { report_id: reportId, title, generated_at: now.toISOString(), tool, summary };
  const json = { report_id: reportId, title, generated_at: rep.generated_at, tool, all_pass: summary.allPass, counts: summary.counts, open_items: summary.open,
    runs: summary.formal.map((r) => ({ run_id: r.run_id, dir: r.dir, protocol: r.protocol, result: r.result, started_at: r.started_at, system_version: r.record?.system_version?.value ?? null,
      manifest_sha256: r.integrity.manifest_sha256 ?? null, evidence_intact: r.integrity.ok, integrity_problems: r.integrity.problems, deviations: r.record?.deviations ?? [] })),
    excluded_dry_runs: summary.excluded.map((r) => r.run_id) };
  store.put('report.json', Buffer.from(JSON.stringify(json, null, 2) + '\n'));
  const html = reportHtml(rep);
  store.put('report.html', Buffer.from(html));
  store.put('report.pdf', await toPdf({ html, footer: `${title} · ${reportId}` }));
  store.event('report_finished', { all_pass: summary.allPass, open_items: summary.open.length });
  const sealed = store.seal();
  fs.writeFileSync(path.join(dir, 'manifest.sha256'), `${sealed.sha256}  manifest.json\n`);
  return { dir, reportId, summary, manifestSha256: sealed.sha256 };
}
