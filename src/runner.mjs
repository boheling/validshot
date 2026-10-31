// Deterministic execution of a locked protocol. No LLM is called anywhere on this path.
// Per step: actions → assertions → raw screenshot (never modified) → annotated copy
// (drawn in a separate browser context from the raw PNG, so the app is never touched).
// A failed assertion is recorded as FAIL with its actual value and the run continues;
// a failed action FAILs its step and marks every later step BLOCKED (not executed).
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadProtocol } from './protocol.mjs';
import { verifyLock } from './lock.mjs';
import { EvidenceStore } from './evidence.mjs';
import { perform, evaluate, describeAction, describeAssertion, boxOf, resolveUrl, locatorFor } from './assert.mjs';
import { renderRecord, annotatedHtml } from './record.mjs';
import { toPdf } from './pdf.mjs';
import { TOOL_VERSION, PLAYWRIGHT_VERSION } from './version.mjs';

const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

async function resolveSystemVersion(context, doc, baseUrl, given) {
  const src = doc.system_version;
  let found = null, source = null;
  if (src?.url) {
    const url = resolveUrl(baseUrl, src.url);
    const res = await context.request.get(url, { timeout: 10000 });
    if (!res.ok()) throw new Error(`system_version: GET ${url} returned ${res.status()}`);
    if (src.json) {
      let v = await res.json();
      for (const k of src.json.split('.')) v = v?.[k];
      if (v === undefined || v === null) throw new Error(`system_version: field "${src.json}" not found in ${url}`);
      found = String(v);
    } else found = (await res.text()).trim();
    source = `read from ${url}${src.json ? ` (field ${src.json})` : ''}`;
  } else if (src?.selector) {
    const page = await context.newPage();
    const url = resolveUrl(baseUrl, src.page ?? '/');
    await page.goto(url, { waitUntil: 'load' });
    found = (await page.locator(src.selector).first().innerText({ timeout: 5000 })).trim();
    await page.close();
    source = `read from ${src.selector} on ${url}`;
  }
  if (found !== null && given && given !== found) throw new Error(`system version mismatch: the system reports "${found}" but --system-version says "${given}"`);
  if (found !== null) return { value: found, source };
  if (given) return { value: given, source: 'confirmed by the initiator at start (not read from the system)' };
  return null;
}

export async function run(file, {
  dryRun = false, initiator, systemVersion, baseUrl: baseOverride, outDir,
  headless = true, storageState, log = () => {},
} = {}) {
  const p = loadProtocol(path.resolve(file));
  if (p.errors.length) throw new Error(`protocol has errors:\n  - ${p.errors.join('\n  - ')}`);
  const lock = verifyLock(p);
  if (!dryRun && !lock.ok) throw new Error(`refusing a formal run: ${lock.reason}. (Use --dry-run while authoring; dry runs are not evidence.)`);
  if (!dryRun && !initiator) throw new Error('--initiator is required for a formal run (the person starting the execution)');
  const doc = p.doc, env = doc.environment;
  const baseUrl = baseOverride ?? env.base_url;
  const started = new Date();
  const runId = `${doc.protocol.id}-${stamp(started)}-${crypto.randomBytes(2).toString('hex')}`;
  const dir = path.resolve(outDir ?? (dryRun ? '.validshot/dry-runs' : 'runs'), runId);
  const store = new EvidenceStore(dir);
  store.put('protocol.yaml', p.bytes);
  if (lock.lock) store.put('protocol.lock.json', fs.readFileSync(lock.file ?? path.resolve(file).replace(/\.ya?ml$/i, '.lock.json')));

  const browser = await chromium.launch({ headless });
  const contextOptions = { viewport: env.viewport, timezoneId: env.timezone, locale: env.locale, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: 'light', storageState };
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => { consoleErrors.push(e.message); store.event('page_error', { message: e.message }); });
  page.on('console', (m) => { if (m.type() === 'error') { consoleErrors.push(m.text()); store.event('console_error', { text: m.text() }); } });

  const meta = {
    run_id: runId, dry_run: dryRun,
    protocol: { id: doc.protocol.id, version: doc.protocol.version, title: doc.protocol.title, sha256: p.hash, file: path.basename(file), source: doc.protocol.source ?? null },
    lock: lock.lock ? { ok: lock.ok, approved_by: lock.lock.approved_by, approver_role: lock.lock.approver_role, approved_at: lock.lock.approved_at, reason: lock.lock.reason, problem: lock.ok ? null : lock.reason } : { ok: false, problem: lock.reason },
    initiator: initiator ?? '(dry run)',
    base_url: baseUrl, base_url_overridden: baseOverride ? { protocol: env.base_url, used: baseOverride } : null,
    environment: { ...env, color_scheme: 'light', reduced_motion: 'reduce', device_scale_factor: 1 },
    tool: { validshot: TOOL_VERSION, playwright: PLAYWRIGHT_VERSION, browser: `chromium ${browser.version()}`, node: process.version, os: `${os.type()} ${os.release()} ${os.arch()}`, host: os.hostname() },
    clock: 'host system clock (UTC); NTP synchronisation not verified by validshot',
    started_at: started.toISOString(),
  };

  try {
    meta.system_version = await resolveSystemVersion(context, doc, baseUrl, systemVersion);
    if (!meta.system_version && !dryRun) throw new Error('no system version: add system_version to the protocol, or pass --system-version (recorded as initiator-confirmed)');
  } catch (e) { await browser.close(); store.event('run_aborted', { run_id: runId, dry_run: dryRun, protocol: meta.protocol, initiator: meta.initiator, started_at: meta.started_at, reason: e.message }); store.seal(); throw e; }
  store.event('run_started', meta);
  log(`${dryRun ? 'DRY RUN' : 'Run'} ${runId} → ${dir}`);

  const shotPage = await (await browser.newContext({ deviceScaleFactor: 1 })).newPage();
  const steps = [];
  let blockedBy = null;
  for (const [i, s] of doc.steps.entries()) {
    const n = String(i + 1).padStart(2, '0');
    const base = { id: s.id, req: s.req, source: s.source ?? null, action: s.action, expected_text: s.expected ?? null, actions: s.do.map(describeAction) };
    if (blockedBy) {
      const r = { ...base, result: 'BLOCKED', reason: `not executed: step ${blockedBy} failed an action`, assertions: s.expect.map((e) => ({ expected: describeAssertion(e), actual: '(not executed)', pass: false })) };
      steps.push(r); store.event('step', r); log(`  ${s.id} BLOCKED`);
      continue;
    }
    const stepStart = new Date();
    let actionError = null;
    let t0 = Date.now();
    for (const a of s.do) {
      t0 = Date.now();
      try { await perform(page, a, { baseUrl, timeout: env.action_timeout_ms }); store.event('action', { step: s.id, action: describeAction(a), ok: true }); }
      catch (e) { actionError = `${describeAction(a)}: ${e.message.split('\n')[0]}`; store.event('action', { step: s.id, action: describeAction(a), ok: false, error: actionError }); break; }
    }
    // timed assertions are evaluated first, so earlier checks don't eat into their clock;
    // results stay in protocol order
    const assertions = new Array(s.expect.length);
    const order = s.expect.map((e, k) => k).sort((a, b) => (s.expect[a].within_ms === undefined) - (s.expect[b].within_ms === undefined));
    for (const k of order) {
      const e = s.expect[k];
      const r = actionError ? { expected: describeAssertion(e), actual: '(not evaluated: action failed)', pass: false } : await evaluate(page, e, { timeout: env.assert_timeout_ms, t0 });
      assertions[k] = e.note ? { ...r, note: e.note } : r;
    }
    // the step screenshot shows the first asserted element; any assertion target still
    // outside it gets its own raw capture below
    const first = s.expect.find((e) => e.target && e.count === undefined);
    if (first && !actionError) await locatorFor(page, first.target).scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
    // measure the boxes right before the raw screenshot, with nothing in between that changes the page
    const fullPage = s.screenshot === 'full_page';
    const boxes = [];
    for (const e of s.expect) boxes.push(await boxOf(page, e, { fullPage }));
    const raw = await page.screenshot({ fullPage, type: 'png' });
    const rawRef = store.put(`shots/step-${n}.raw.png`, raw);
    const extra = [];
    for (const [k, e] of s.expect.entries()) {
      if (!boxes[k] || boxes[k].inView) continue;
      // asserted element outside the step screenshot: capture it on its own (raw, unmodified)
      const buf = await locatorFor(page, e.target).screenshot({ type: 'png', timeout: 2000 }).catch(() => null);
      if (buf) { const ref = store.put(`shots/step-${n}.a${k + 1}.raw.png`, buf); extra.push({ assertion: k + 1, ...ref }); assertions[k].evidence = ref.path; }
    }
    const dims = fullPage ? await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight })) : { w: env.viewport.width, h: env.viewport.height };
    await shotPage.setViewportSize({ width: dims.w, height: Math.min(dims.h, 16000) });
    await shotPage.setContent(annotatedHtml(raw, boxes.map((b, k) => (b?.inView ? { ...b, label: `A${k + 1}`, pass: assertions[k].pass } : null)).filter(Boolean), { dryRun, width: dims.w, caption: `${doc.protocol.id} · step ${s.id} · ${assertions.every((a) => a.pass) && !actionError ? 'PASS' : 'FAIL'}` }));
    const ann = await shotPage.screenshot({ fullPage: true, type: 'png' });
    const annRef = store.put(`shots/step-${n}.annotated.png`, ann);
    const pass = !actionError && assertions.every((a) => a.pass);
    const r = { ...base, result: pass ? 'PASS' : 'FAIL', error: actionError, assertions, started_at: stepStart.toISOString(), finished_at: new Date().toISOString(),
      url: page.url(), screenshot: { raw: rawRef, annotated: annRef, extra } };
    steps.push(r);
    store.event('step', r);
    log(`  ${s.id} ${r.result}${actionError ? ` — ${actionError}` : assertions.filter((a) => !a.pass).map((a) => `\n      ✗ ${a.expected}\n        actual: ${a.actual}`).join('')}`);
    if (actionError) blockedBy = s.id;
    else if (!pass && doc.stop_on_fail) blockedBy = s.id;
  }
  await browser.close();

  const finished = new Date();
  const counts = { PASS: 0, FAIL: 0, BLOCKED: 0 };
  for (const s of steps) counts[s.result]++;
  const verdict = counts.PASS === steps.length ? 'PASS' : 'FAIL';
  const record = { ...meta, finished_at: finished.toISOString(), verdict, counts, requirements: doc.requirements, steps, console_errors: consoleErrors,
    // one row per failed assertion (or per failed action / blocked step)
    deviations: steps.filter((s) => s.result !== 'PASS').flatMap((s) => (s.result === 'BLOCKED' || s.error
      ? [{ step: s.id, req: s.req, result: s.result, assertion: null, expected: s.action, actual: s.error ?? s.reason }]
      : s.assertions.map((a, k) => ({ step: s.id, req: s.req, result: 'FAIL', assertion: `A${k + 1}`, expected: a.expected, actual: a.actual, pass: a.pass })).filter((d) => !d.pass).map(({ pass, ...d }) => d))),
    evidence_chain_head: store.head };
  store.event('run_finished', { verdict, counts });
  record.evidence_chain_head = store.head;
  store.put('record.json', Buffer.from(JSON.stringify(record, null, 2) + '\n'));
  const html = renderRecord(record);
  store.put('record.html', Buffer.from(html));
  const pdf = await toPdf({ url: `file://${path.join(dir, 'record.html')}`, footer: `${runId}${dryRun ? ' · DRY RUN — NOT VALID AS EVIDENCE' : ''}` });
  store.put('record.pdf', pdf);
  const sealed = store.seal();
  fs.writeFileSync(path.join(dir, 'manifest.sha256'), `${sealed.sha256}  manifest.json\n`);
  return { dir, runId, verdict, counts, record, manifestSha256: sealed.sha256 };
}
