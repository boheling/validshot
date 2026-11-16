// Targets, actions and assertions. Everything here is deterministic: no LLM, no
// selector healing, no retries of actions. An action gets one attempt within the
// protocol's action timeout; an assertion holds if its condition is met within the
// protocol's assertion timeout (polled every 100 ms), otherwise it FAILs with the
// last actual value seen.
import { DEFAULTS } from './protocol.mjs';
import { decodePng, rendered } from './png.mjs';

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
  if (displayCheck && wantsDisplayCheck(e)) parts.push('and is displayed intact (in view, not covered, not truncated, legible as rendered)');
  return `${t} ${parts.join(', ')}${e.within_ms !== undefined ? ` — within ${e.within_ms} ms of the step's last action` : ''}`;
}

// "Displayed correctly" is more than the DOM: the element must be in the viewport,
// not covered by another element, its text not cut off, and legible in the rendered pixels.
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
  // The first font family of the element is a web font and none of its faces is loaded,
  // although the element shows text: the text is in a fallback font (or, for an icon
  // font, shows the wrong glyphs). WebKit resets a failed face to "unloaded", so the
  // rule is "not loaded", not "errored".
  const fam = s.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
  const faces = [...document.fonts].filter((f) => f.family.replace(/^["']|["']$/g, '') === fam);
  const hasText = (['INPUT', 'TEXTAREA'].includes(el.tagName) ? el.value : el.innerText ?? '').trim() !== '';
  if (hasText && faces.length && !faces.some((f) => f.status === 'loaded')) {
    issues.push(faces.some((f) => f.status === 'loading') ? `web font "${fam}" is still loading` : `web font "${fam}" is not loaded (a fallback font is shown)`);
  }
  return issues;
}

// Where the element's text is on screen, in viewport CSS px: one rectangle per line of
// each text node (or the content box of a form field that holds a value). Lines that
// are not fully visible (scrolled out of a clipping ancestor, outside the viewport) are
// left out: truncation is judged separately. → null when there is no text to read.
function textLines(el) {
  const round = (r) => ({ x: Math.floor(r.left), y: Math.floor(r.top), w: Math.ceil(r.right) - Math.floor(r.left), h: Math.ceil(r.bottom) - Math.floor(r.top) });
  const clipsOf = [];
  for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
    const st = getComputedStyle(p);
    if (st.overflowX !== 'visible' || st.overflowY !== 'visible') clipsOf.push(p.getBoundingClientRect());
  }
  const whole = (r) => r.width >= 3 && r.height >= 3 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight &&
    clipsOf.every((c) => r.left >= c.left - 1 && r.right <= c.right + 1 && r.top >= c.top - 1 && r.bottom <= c.bottom + 1);
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) {
    const shown = el.tagName === 'SELECT' ? el.selectedOptions[0]?.textContent : el.value;
    if (!shown || !shown.trim() || ['checkbox', 'radio', 'range', 'color', 'file', 'hidden', 'password'].includes(el.type)) return null;
    const r = el.getBoundingClientRect();
    const box = { left: r.left + el.clientLeft, top: r.top + el.clientTop, right: r.left + el.clientLeft + el.clientWidth, bottom: r.top + el.clientTop + el.clientHeight };
    box.width = box.right - box.left; box.height = box.bottom - box.top;
    return whole(box) ? [{ ...round(box), split: false }] : null;
  }
  const lines = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n && lines.length < 200; n = walker.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const parent = n.parentElement, ps = getComputedStyle(parent);
    if (ps.visibility !== 'visible' || (parent.checkVisibility && !parent.checkVisibility())) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    // thirds are only judged for running text: preserved whitespace can leave a third of a line empty by design
    const split = !ps.whiteSpace.startsWith('pre') && Number.parseFloat(ps.wordSpacing || '0') < 8;
    for (const r of range.getClientRects()) if (whole(r)) lines.push({ ...round(r), split });
  }
  return lines.length ? lines : null;
}

// Legibility is judged on the rendered pixels, not on styles: a screenshot of the area
// where the text is (the page is not touched) must show something that stands out from
// its background. This catches what hit-testing cannot see — an overlay with
// `pointer-events: none`, text in the background colour, a mask, a near-opaque veil —
// in every browser engine, because it only looks at the picture.
// A line wide enough to hold several characters is also judged in thirds, so a cover
// over part of the text is found.
export const DEFAULT_MIN_CONTRAST = 2;
async function legibility(page, el, min) {
  const lines = await el.evaluate(textLines);
  if (!lines) return [];
  const x0 = Math.min(...lines.map((l) => l.x)), y0 = Math.min(...lines.map((l) => l.y));
  const clip = { x: x0, y: y0, width: Math.max(...lines.map((l) => l.x + l.w)) - x0, height: Math.max(...lines.map((l) => l.y + l.h)) - y0 };
  const img = decodePng(await page.screenshot({ clip, type: 'png', scale: 'css' }));
  const fx = img.width / clip.width, fy = img.height / clip.height; // 1 with scale: css; kept in case an engine ignores it
  const at = (l, a, b) => rendered(img, { x: (l.x - x0 + l.w * a) * fx, y: (l.y - y0) * fy, w: l.w * (b - a) * fx, h: l.h * fy });
  const fmt = (r) => `${r.ratio.toFixed(1)}:1`;
  let worst = null;
  for (const [i, l] of lines.entries()) {
    const all = at(l, 0, 1);
    if (all.ratio < min) { worst = { ...all, text: `text is not legible as rendered${lines.length > 1 ? ` (line ${i + 1})` : ''}: contrast ${fmt(all)} against its background, minimum ${min}:1` }; break; }
    if (!l.split || l.w < 30) continue;
    for (const [k, part] of ['left', 'middle', 'right'].entries()) {
      const r = at(l, k / 3, (k + 1) / 3);
      if (r.ratio < min && !worst) worst = { ...r, text: `part of the text is not legible as rendered (${part} third${lines.length > 1 ? ` of line ${i + 1}` : ''}: contrast ${fmt(r)}, minimum ${min}:1)` };
    }
    if (worst) break;
  }
  return worst ? [worst.text] : [];
}

async function evaluateOnce(page, e, { minContrast = DEFAULT_MIN_CONTRAST } = {}) {
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
    // the condition was met (or not) at this moment; reading the pixels back takes
    // a screenshot and must not count against a time limit
    const at = Date.now();
    // the picture is only read once everything else holds, so a failing poll stays cheap
    if (!issues.length && !fails.length) issues.push(...await legibility(page, el, e.min_contrast ?? minContrast));
    add(issues.length === 0, issues.length ? `display: ${issues.join('; ')}` : 'displayed intact');
    return { pass: fails.length === 0, actual: actual.join(', '), at };
  }
  return { pass: fails.length === 0, actual: actual.join(', ') };
}

// Timing: with `within_ms`, the clock starts when the step's last action started
// (t0) and stops at the first poll where the condition holds. Polling is every 50 ms,
// so the measurement is an upper bound with about 50 ms resolution, measured on the
// host clock and including network time.
export async function evaluate(page, e, { timeout = DEFAULTS.assert_timeout_ms, t0, minContrast } = {}) {
  const timed = e.within_ms !== undefined;
  // a timed assertion keeps polling past its limit (up to 2×) so the record shows how late it was
  const limit = e.timeout_ms ?? (timed ? Math.max(timeout, e.within_ms * 2) : timeout);
  const deadline = Date.now() + limit;
  let last;
  for (;;) {
    try { last = await evaluateOnce(page, e, { minContrast }); } catch (x) { last = { pass: false, actual: `error: ${x.message.split('\n')[0]}` }; }
    if (last.pass || Date.now() >= deadline) break;
    await page.waitForTimeout(timed ? 50 : 100);
  }
  const metAt = last.at ?? Date.now();
  delete last.at;
  const out = { expected: describeAssertion(e), ...last, display_check: wantsDisplayCheck(e) ? 'on' : (e.display_check === false ? `off: ${e.display_check_reason}` : 'n/a') };
  if (timed) {
    const ms = metAt - t0;
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
