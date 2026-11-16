// Minimal PNG decoder for the screenshots the browser produces (8-bit, non-interlaced,
// greyscale / RGB / RGBA / with alpha). Used to read back what was actually rendered,
// so the legibility check judges pixels, not styles. No dependency: zlib only.
import zlib from 'node:zlib';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

// → { width, height, data } with data as RGBA bytes
export function decodePng(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  let width, height, type, off = 8;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), kind = buf.toString('latin1', off + 4, off + 8), body = buf.subarray(off + 8, off + 8 + len);
    if (kind === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4); type = body[9];
      if (body[8] !== 8 || !(type in CHANNELS) || body[12] !== 0) throw new Error(`unsupported PNG (bit depth ${body[8]}, colour type ${type}, interlace ${body[12]})`);
    } else if (kind === 'IDAT') idat.push(body);
    else if (kind === 'IEND') break;
    off += 12 + len;
  }
  const ch = CHANNELS[type], stride = width * ch;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[dst + x - ch] : 0, b = y ? px[dst + x - stride] : 0, c = x >= ch && y ? px[dst + x - stride - ch] : 0;
      let v = raw[src + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[dst + x] = v & 255;
    }
  }
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0, n = width * height; i < n; i++) {
    const s = i * ch, d = i * 4;
    if (ch >= 3) { data[d] = px[s]; data[d + 1] = px[s + 1]; data[d + 2] = px[s + 2]; data[d + 3] = ch === 4 ? px[s + 3] : 255; }
    else { data[d] = data[d + 1] = data[d + 2] = px[s]; data[d + 3] = ch === 2 ? px[s + 1] : 255; }
  }
  return { width, height, data };
}

// WCAG relative luminance of an sRGB colour
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export const luminance = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export const contrastRatio = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

// What is rendered inside a rectangle of an image: the background (its most common
// colour) and how strongly anything stands out from it.
//   ratio — contrast between the background and the pixels that differ most from it
//           (the strongest 2 % of the area, at least 4 pixels, so one stray pixel does not count)
//   ink   — share of the area that differs visibly from the background
// A rectangle that is one flat colour gives ratio 1 and ink 0: nothing can be read there.
export function rendered(img, rect = { x: 0, y: 0, w: img.width, h: img.height }) {
  const x0 = Math.max(0, Math.floor(rect.x)), y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(img.width, Math.ceil(rect.x + rect.w)), y1 = Math.min(img.height, Math.ceil(rect.y + rect.h));
  const n = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  if (!n) return { ratio: 1, ink: 0, pixels: 0 };
  const counts = new Map(), lums = new Float64Array(n);
  let i = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const o = (y * img.width + x) * 4, r = img.data[o], g = img.data[o + 1], b = img.data[o + 2];
    lums[i++] = luminance(r, g, b);
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const c = counts.get(key);
    if (c) { c.n++; c.l += lums[i - 1]; } else counts.set(key, { n: 1, l: lums[i - 1] });
  }
  let bg = null;
  for (const c of counts.values()) if (!bg || c.n > bg.n) bg = c;
  const bgL = bg.l / bg.n;
  const ratios = Array.from(lums, (l) => contrastRatio(l, bgL)).sort((a, b) => b - a);
  const k = Math.min(n - 1, Math.max(3, Math.floor(n * 0.02)));
  return { ratio: ratios[k], ink: ratios.filter((r) => r >= 1.15).length / n, pixels: n };
}
