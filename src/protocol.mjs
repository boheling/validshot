// Load and validate a validation protocol (YAML). The protocol is the unit that a
// human approves and locks: its exact bytes are hashed, so any edit needs re-approval.
import fs from 'node:fs';
import crypto from 'node:crypto';
import YAML from 'yaml';

export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

export const ACTIONS = ['goto', 'click', 'fill', 'select', 'check', 'uncheck', 'press', 'hover', 'wait_for'];
const TARGET_KEYS = ['role', 'name', 'exact', 'label', 'text', 'testid', 'placeholder', 'alt', 'css', 'nth'];
// what an assertion can check about its target (or the page, for url/title)
export const CHECKS = ['visible', 'text', 'contains', 'matches', 'value', 'count', 'enabled', 'checked', 'attribute'];
const PAGE_CHECKS = ['url', 'title'];

export const DEFAULTS = {
  viewport: { width: 1280, height: 800 },
  timezone: 'UTC',
  locale: 'en-US',
  action_timeout_ms: 5000,
  assert_timeout_ms: 2000,
};

export function loadProtocol(file) {
  const bytes = fs.readFileSync(file);
  let doc;
  try { doc = YAML.parse(bytes.toString('utf8'), { prettyErrors: true }); }
  catch (e) { return { file, bytes, hash: sha256(bytes), doc: null, errors: [`YAML: ${e.message}`], warnings: [] }; }
  const { errors, warnings } = validate(doc ?? {});
  return { file, bytes, hash: sha256(bytes), doc: errors.length ? doc : normalize(doc), errors, warnings };
}

function validTarget(t, where, errors) {
  if (typeof t === 'string') return; // a CSS selector
  if (!t || typeof t !== 'object') { errors.push(`${where}: target must be a CSS string or an object`); return; }
  const bad = Object.keys(t).filter((k) => !TARGET_KEYS.includes(k));
  if (bad.length) errors.push(`${where}: unknown target key(s) ${bad.join(', ')} (allowed: ${TARGET_KEYS.join(', ')})`);
  const kinds = ['role', 'label', 'text', 'testid', 'placeholder', 'alt', 'css'].filter((k) => k in t);
  if (kinds.length !== 1) errors.push(`${where}: target needs exactly one of role/label/text/testid/placeholder/alt/css (got ${kinds.join(', ') || 'none'})`);
  if ('name' in t && !('role' in t)) errors.push(`${where}: \`name\` only goes with \`role\``);
}

function validate(doc) {
  const errors = [], warnings = [];
  const p = doc.protocol;
  if (!p?.id) errors.push('protocol.id is required');
  if (p && p.version === undefined) errors.push('protocol.version is required');
  if (!p?.title) errors.push('protocol.title is required');
  if (!doc.environment?.base_url) errors.push('environment.base_url is required');
  const reqs = doc.requirements ?? {};
  if (!Array.isArray(doc.steps) || !doc.steps.length) { errors.push('steps: at least one step is required'); return { errors, warnings }; }
  const ids = new Set();
  doc.steps.forEach((s, i) => {
    const where = `step ${s?.id ?? i + 1}`;
    if (s?.id === undefined) errors.push(`steps[${i}]: id is required`);
    else if (ids.has(String(s.id))) errors.push(`${where}: duplicate step id`);
    ids.add(String(s?.id));
    if (!s?.action) errors.push(`${where}: \`action\` (what the tester does, in words) is required`);
    const req = [].concat(s?.req ?? []);
    if (!req.length) errors.push(`${where}: \`req\` (requirement id) is required for traceability`);
    for (const r of req) if (doc.requirements && !(r in reqs)) errors.push(`${where}: requirement ${r} is not listed under requirements`);
    for (const [k, a] of [].concat(s?.do ?? []).map((a, j) => [j, a])) {
      const w = `${where} do[${k}]`;
      const kinds = Object.keys(a ?? {}).filter((x) => ACTIONS.includes(x));
      if (kinds.length !== 1) { errors.push(`${w}: exactly one action of ${ACTIONS.join('/')} is required`); continue; }
      const kind = kinds[0], v = a[kind];
      if (kind === 'goto') { if (typeof v !== 'string') errors.push(`${w}: goto takes a path or URL`); continue; }
      if (kind === 'press' && typeof v === 'string') continue; // a key on the focused element
      const target = typeof v === 'object' && v && 'target' in v ? v.target : v;
      validTarget(target, w, errors);
      if (kind === 'fill' && typeof v?.value !== 'string') errors.push(`${w}: fill needs { target, value } with a string value`);
      if (kind === 'select' && typeof v?.option !== 'string') errors.push(`${w}: select needs { target, option }`);
      if (kind === 'press' && typeof v?.key !== 'string') errors.push(`${w}: press needs a key, or { target, key }`);
    }
    const expects = [].concat(s?.expect ?? []);
    if (!expects.length) errors.push(`${where}: \`expect\` needs at least one assertion — a step without one proves nothing`);
    expects.forEach((e, k) => {
      const w = `${where} expect[${k}]`;
      const checks = Object.keys(e ?? {}).filter((x) => CHECKS.includes(x));
      const page = Object.keys(e ?? {}).filter((x) => PAGE_CHECKS.includes(x));
      if (page.length && (checks.length || e.target)) errors.push(`${w}: url/title assertions take no target and no other checks`);
      if (!page.length) {
        if (!e?.target) errors.push(`${w}: target is required`); else validTarget(e.target, w, errors);
        if (!checks.length) errors.push(`${w}: at least one check of ${CHECKS.join('/')} is required`);
      }
      if (e?.matches !== undefined) { try { new RegExp(e.matches); } catch (x) { errors.push(`${w}: bad regex: ${x.message}`); } }
      for (const k of ['within_ms', 'timeout_ms']) if (e?.[k] !== undefined && !(Number.isInteger(e[k]) && e[k] > 0)) errors.push(`${w}: ${k} must be a positive whole number of milliseconds`);
      if (e?.display_check === false && !e.display_check_reason) errors.push(`${w}: display_check: false needs a display_check_reason`);
      const unknown = Object.keys(e ?? {}).filter((x) => ![...CHECKS, ...PAGE_CHECKS, 'target', 'display_check', 'display_check_reason', 'note', 'within_ms', 'timeout_ms'].includes(x));
      if (unknown.length) errors.push(`${w}: unknown key(s) ${unknown.join(', ')}`);
    });
    if (s?.screenshot && !['viewport', 'full_page'].includes(s.screenshot)) errors.push(`${where}: screenshot must be viewport or full_page`);
  });
  if (!doc.system_version) warnings.push('no system_version source: every formal run will need --system-version (recorded as operator-confirmed)');
  const covered = new Set(doc.steps.flatMap((s) => [].concat(s?.req ?? [])));
  for (const r of Object.keys(reqs)) if (!covered.has(r)) warnings.push(`requirement ${r} is not covered by any step`);
  return { errors, warnings };
}

function normalize(doc) {
  const env = { ...DEFAULTS, ...doc.environment, viewport: { ...DEFAULTS.viewport, ...doc.environment?.viewport } };
  return {
    ...doc,
    environment: env,
    requirements: doc.requirements ?? {},
    steps: doc.steps.map((s) => ({ ...s, id: String(s.id), req: [].concat(s.req), do: [].concat(s.do ?? []), expect: [].concat(s.expect), screenshot: s.screenshot ?? 'viewport' })),
  };
}

export function formatCheck(r) {
  const lines = [];
  if (r.errors.length) lines.push(`✗ ${r.file}: ${r.errors.length} error(s)`, ...r.errors.map((e) => `  - ${e}`));
  else lines.push(`✓ ${r.file}: ${r.doc.protocol.id} v${r.doc.protocol.version}, ${r.doc.steps.length} steps, ${r.doc.steps.reduce((n, s) => n + s.expect.length, 0)} assertions`, `  sha256 ${r.hash}`);
  if (r.warnings.length) lines.push(...r.warnings.map((w) => `  ! ${w}`));
  return lines.join('\n');
}
