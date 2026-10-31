// Targets, actions and assertions. Everything here is deterministic: no LLM, no
// selector healing, no retries of actions. An action gets one attempt within the
// protocol's action timeout; an assertion holds if its condition is met within the
// protocol's assertion timeout (polled every 100 ms), otherwise it FAILs with the
// last actual value seen.
import { DEFAULTS } from './protocol.mjs';

export function locatorFor(page, t) {
  if (typeof t === 'string') return page.locator(t);
  const exact = t.exact ?? false;
  let loc;
  if (t.role) loc = page.getByRole(t.role, t.name !== undefined ? { name: t.name, exact } : {});
  else if (t.label) loc = page.getByLabel(t.label, { exact });
  else if (t.text) loc = page.getByText(t.text, { exact });
  else if (t.testid) loc = page.getByTestId(t.testid);
  else if (t.placeholder) loc = page.getByPlaceholder(t.placeholder, { exact });
  else if (t.alt) loc = page.getByAltText(t.alt, { exact });
  else loc = page.locator(t.css);
  return t.nth !== undefined ? loc.nth(t.nth) : loc;
}

export function describeTarget(t) {
  if (typeof t === 'string') return `\`${t}\``;
  const q = (s) => `"${s}"`;
  const base = t.role ? `${t.role}${t.name !== undefined ? ` ${q(t.name)}` : ''}` : t.label ? `field labelled ${q(t.label)}` : t.text ? `text ${q(t.text)}` :
    t.testid ? `test id ${q(t.testid)}` : t.placeholder ? `field with placeholder ${q(t.placeholder)}` : t.alt ? `image ${q(t.alt)}` : `\`${t.css}\``;
  return base + (t.nth !== undefined ? ` (match #${t.nth + 1})` : '');
}

const actionTarget = (v) => (v && typeof v === 'object' && 'target' in v ? v.target : v);

export function describeAction(a) {
  const [kind, v] = Object.entries(a)[0];
  if (kind === 'goto') return `open ${v}`;
  if (kind === 'fill') return `enter ${JSON.stringify(v.value)} into ${describeTarget(v.target)}`;
  if (kind === 'select') return `choose "${v.option}" in ${describeTarget(v.target)}`;
  if (kind === 'press') return typeof v === 'string' ? `press ${v}` : `press ${v.key} in ${describeTarget(v.target)}`;
  if (kind === 'wait_for') return `wait until ${describeTarget(actionTarget(v))} is ${v.state ?? 'visible'}`;
  return `${kind} ${describeTarget(actionTarget(v))}`;
}

export function resolveUrl(baseUrl, v) {
  if (/^https?:\/\//.test(v)) return v;
  return baseUrl.replace(/\/+$/, '') + (v.startsWith('/') ? v : `/${v}`);
}

export async function perform(page, a, { baseUrl, timeout = DEFAULTS.action_timeout_ms }) {
  const [kind, v] = Object.entries(a)[0];
  if (kind === 'goto') { await page.goto(resolveUrl(baseUrl, v), { waitUntil: 'load', timeout }); return; }
  if (kind === 'press' && typeof v === 'string') { await page.keyboard.press(v); return; }
  const loc = locatorFor(page, actionTarget(v)); // Playwright locators are strict: 2+ matches is an error
  if (kind === 'click') await loc.click({ timeout });
  else if (kind === 'hover') await loc.hover({ timeout });
  else if (kind === 'fill') await loc.fill(v.value, { timeout });
  else if (kind === 'select') await loc.selectOption({ label: v.option }, { timeout });
  else if (kind === 'check') await loc.check({ timeout });
  else if (kind === 'uncheck') await loc.uncheck({ timeout });
  else if (kind === 'press') await loc.press(v.key, { timeout });
  else if (kind === 'wait_for') await loc.waitFor({ state: v.state ?? 'visible', timeout });
}

const norm = (s) => (s ?? '').replace(/\s+/g, ' ').trim();

// displayCheck: false leaves out the "displayed intact" clause, for documents that state
// the rule once (the protocol review copy); the execution record always includes it
export function describeAssertion(e, { displayCheck = true } = {}) {
  const within = e.within_ms !== undefined ? ` — within ${e.within_ms} ms of the step's last action` : '';
  if (e.url !== undefined) return (typeof e.url === 'string' ? `page URL contains "${e.url}"` : `page URL matches /${e.url.matches}/`) + within;
  if (e.title !== undefined) return `page title is "${e.title}"` + within;
  const t = describeTarget(e.target), parts = [];
  if (e.visible === true) parts.push('is visible');
  if (e.visible === false) parts.push('is not visible');
  if (e.text !== undefined) parts.push(`shows exactly "${e.text}"`);
  if (e.contains !== undefined) parts.push(`shows text containing "${e.contains}"`);
  if (e.matches !== undefined) parts.push(`shows text matching /${e.matches}/`);
  if (e.value !== undefined) parts.push(`has value "${e.value}"`);
  if (e.count !== undefined) parts.push(`appears ${e.count} time(s) (visible matches)`);
  if (e.enabled !== undefined) parts.push(e.enabled ? 'is enabled' : 'is disabled');
  if (e.checked !== undefined) parts.push(e.checked ? 'is checked' : 'is not checked');
  if (e.attribute) parts.push(`has ${e.attribute.name}="${e.attribute.value}"`);
  if (displayCheck && wantsDisplayCheck(e)) parts.push('and is displayed intact (in view, not covered, not truncated)');
  return `${t} ${parts.join(', ')}${e.within_ms !== undefined ? ` — within ${e.within_ms} ms of the step's last action` : ''}`;
}

// "Displayed correctly" is more than the DOM: the element must be in the viewport,
// not covered by another element, and its text not cut off.
const wantsDisplayCheck = (e) => e.display_check !== false && (e.visible === true || e.text !== undefined || e.contains !== undefined || e.matches !== undefined);

function integrity(el) {
  const issues = [];
  const r = el.getBoundingClientRect(), s = getComputedStyle(el);
  const name = (n) => `<${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ''}${typeof n.className === 'string' && n.className.trim() ? '.' + n.className.trim().split(/\s+/).join('.') : ''}>`;
  if (r.width < 1 || r.height < 1) issues.push('has zero size');
  if (s.visibility === 'hidden' || Number(s.opacity) < 0.05) issues.push('is transparent or hidden');
  if (r.top < -0.5 || r.left < -0.5 || r.bottom > innerHeight + 0.5 || r.right > innerWidth + 0.5) issues.push('is not fully inside the viewport');
  const covers = new Set();
  for (const [fx, fy] of [[0.5, 0.5], [0.1, 0.5], [0.9, 0.5], [0.5, 0.15], [0.5, 0.85]]) {
    const x = r.left + r.width * fx, y = r.top + r.height * fy;
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
    const hit = document.elementFromPoint(x, y);
    if (!hit || el === hit || el.contains(hit)) continue;
    // an ancestor at the point is background (e.g. the gaps of a wrapped inline element), not a cover
    if (hit.contains(el)) continue;
    if (hit.tagName === 'LABEL' && hit.control === el) continue;
    covers.add(name(hit));
  }
  if (covers.size) issues.push(`is covered by ${[...covers].join(', ')}`);
  const clips = (st) => st.overflowX !== 'visible' || st.overflowY !== 'visible';
  if (el.scrollWidth > el.clientWidth + 1 && (clips(s) || ['INPUT', 'TEXTAREA'].includes(el.tagName))) issues.push(`text is cut off horizontally (${el.scrollWidth}px of content in ${el.clientWidth}px)`);
  if (el.scrollHeight > el.clientHeight + 1 && clips(s) && el.tagName !== 'SELECT') issues.push(`text is cut off vertically (${el.scrollHeight}px of content in ${el.clientHeight}px)`);
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const ps = getComputedStyle(p);
    if (!clips(ps)) continue;
    const pr = p.getBoundingClientRect();
    if (r.left < pr.left - 1 || r.right > pr.right + 1 || r.top < pr.top - 1 || r.bottom > pr.bottom + 1) { issues.push(`is clipped by ${name(p)}`); break; }
  }
  return issues;
}

async function evaluateOnce(page, e) {
  if (e.url !== undefined) {
    const url = page.url();
    const pass = typeof e.url === 'string' ? url.includes(e.url) : new RegExp(e.url.matches).test(url);
    return { pass, actual: `URL is ${url}` };
  }
  if (e.title !== undefined) { const t = await page.title(); return { pass: t === e.title, actual: `title is "${t}"` }; }
  const loc = locatorFor(page, e.target);
  if (e.count !== undefined) {
    const n = await loc.filter({ visible: true }).count();
    return { pass: n === e.count, actual: `${n} visible match(es)` };
  }
  const n = await loc.count();
  if (n === 0) return e.visible === false && Object.keys(e).filter((k) => !['target', 'visible', 'note', 'display_check', 'display_check_reason'].includes(k)).length === 0
    ? { pass: true, actual: 'not present' } : { pass: false, actual: 'target not found' };
  if (n > 1) return { pass: false, actual: `target is ambiguous: ${n} elements match (make it specific, e.g. add nth)` };
  const el = loc.first(), actual = [], fails = [];
  const visible = await el.isVisible();
  const add = (ok, a) => { actual.push(a); if (!ok) fails.push(a); };
  if (e.visible !== undefined) add(visible === e.visible, visible ? 'visible' : 'not visible');
  if (e.text !== undefined || e.contains !== undefined || e.matches !== undefined) {
    const t = norm(await el.innerText());
    if (e.text !== undefined) add(t === norm(e.text), `shows "${t}"`);
    else if (e.contains !== undefined) add(t.includes(norm(e.contains)), `shows "${t}"`);
    else add(new RegExp(e.matches).test(t), `shows "${t}"`);
  }
  if (e.value !== undefined) { const v = await el.inputValue(); add(v === String(e.value), `value "${v}"`); }
  if (e.enabled !== undefined) { const v = await el.isEnabled(); add(v === e.enabled, v ? 'enabled' : 'disabled'); }
  if (e.checked !== undefined) { const v = await el.isChecked(); add(v === e.checked, v ? 'checked' : 'not checked'); }
  if (e.attribute) { const v = await el.getAttribute(e.attribute.name); add(v === String(e.attribute.value), `${e.attribute.name}=${v === null ? '(absent)' : `"${v}"`}`); }
  if (wantsDisplayCheck(e) && visible) {
    await el.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
    const issues = await el.evaluate(integrity);
    add(issues.length === 0, issues.length ? `display: ${issues.join('; ')}` : 'displayed intact');
  }
  return { pass: fails.length === 0, actual: actual.join(', ') };
}

// Timing: with `within_ms`, the clock starts when the step's last action started
// (t0) and stops at the first poll where the condition holds. Polling is every 50 ms,
// so the measurement is an upper bound with about 50 ms resolution, measured on the
// host clock and including network time.
export async function evaluate(page, e, { timeout = DEFAULTS.assert_timeout_ms, t0 } = {}) {
  const timed = e.within_ms !== undefined;
  // a timed assertion keeps polling past its limit (up to 2×) so the record shows how late it was
  const limit = e.timeout_ms ?? (timed ? Math.max(timeout, e.within_ms * 2) : timeout);
  const deadline = Date.now() + limit;
  let last;
  for (;;) {
    try { last = await evaluateOnce(page, e); } catch (x) { last = { pass: false, actual: `error: ${x.message.split('\n')[0]}` }; }
    if (last.pass || Date.now() >= deadline) break;
    await page.waitForTimeout(timed ? 50 : 100);
  }
  const out = { expected: describeAssertion(e), ...last, display_check: wantsDisplayCheck(e) ? 'on' : (e.display_check === false ? `off: ${e.display_check_reason}` : 'n/a') };
  if (timed) {
    const ms = Date.now() - t0;
    out.elapsed_ms = last.pass ? ms : null;
    if (last.pass && ms > e.within_ms) out.pass = false;
    out.actual += last.pass ? `; after ${ms} ms (limit ${e.within_ms} ms)` : `; not met after ${ms} ms (limit ${e.within_ms} ms)`;
  }
  return out;
}

// box of an asserted element in screenshot coordinates (for the annotated copy)
export async function boxOf(page, e, { fullPage }) {
  if (!e.target || e.count !== undefined) return null;
  const loc = locatorFor(page, e.target);
  if ((await loc.count().catch(() => 0)) !== 1) return null;
  return loc.evaluate((el, fp) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    const box = { x: r.left + (fp ? scrollX : 0), y: r.top + (fp ? scrollY : 0), w: r.width, h: r.height };
    box.inView = fp || (r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth);
    return box;
  }, fullPage).catch(() => null);
}
