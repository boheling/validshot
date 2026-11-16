// Signatures and trusted timestamps over a sealed manifest.
//
// The manifest pins every file of a run by SHA-256, so one statement about the manifest
// covers the whole run. Two independent statements can be attached to it:
//
//   manifest.sig.json   Ed25519 signatures. Each one binds a named signer, a role and a
//                       time to the manifest hash. Whoever rewrites the evidence cannot
//                       re-create the signature without the private key.
//   manifest.tsr        an RFC 3161 timestamp token from a time-stamping authority (TSA):
//                       proof, signed by a third party, that this manifest existed at
//                       that time. Only the hash is sent to the TSA.
//
// What this is not: a 21 CFR Part 11 electronic signature. A key file proves possession
// of the key, not the identity of a person; binding keys to people (issuing, protecting,
// revoking them) is the organisation's procedure. Keep private keys off the execution
// host's shared storage, or the "cannot re-create" above does not hold.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { sha256 } from './protocol.mjs';

// ---- keys ----------------------------------------------------------------

// accepts a PEM string/buffer or a key object (public, or private: its public half is used)
const asPublic = (k) => (k instanceof crypto.KeyObject && k.type === 'public' ? k : crypto.createPublicKey(k));
export const fingerprint = (publicKey) => sha256(asPublic(publicKey).export({ type: 'spki', format: 'der' }));

export function keygen(base, { force = false } = {}) {
  const priv = `${base}.key.pem`, pub = `${base}.pub.pem`;
  for (const f of [priv, pub]) if (fs.existsSync(f) && !force) throw new Error(`${f} already exists (a key is not overwritten; choose another name)`);
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  fs.mkdirSync(path.dirname(path.resolve(priv)), { recursive: true });
  fs.writeFileSync(priv, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  fs.writeFileSync(pub, publicKey.export({ type: 'spki', format: 'pem' }));
  return { privateKeyFile: priv, publicKeyFile: pub, fingerprint: fingerprint(publicKey) };
}

export function loadPrivateKey(file) {
  let key;
  try { key = crypto.createPrivateKey(fs.readFileSync(file)); } catch (e) { throw new Error(`signing key ${file}: ${e.code === 'ENOENT' ? 'file not found' : 'not a readable private key (PEM, unencrypted)'}`); }
  if (key.asymmetricKeyType !== 'ed25519') throw new Error(`signing key ${file}: expected an Ed25519 key (validshot keygen), got ${key.asymmetricKeyType}`);
  return key;
}

// a trusted key is given as a public key file (PEM) or as its fingerprint (64 hex digits)
export function trustedFingerprints(list = []) {
  return [].concat(list).filter(Boolean).map((t) => {
    if (/^[0-9a-f]{64}$/i.test(t)) return t.toLowerCase();
    try { return fingerprint(fs.readFileSync(t)); } catch { throw new Error(`--trust ${t}: not a public key file (PEM) or a 64-digit key fingerprint`); }
  });
}

// ---- signatures ----------------------------------------------------------

// The signed statement. Plain text, one field per line, so it can be re-created by hand.
const statement = (s) => ['validshot-signature-v1', s.subject, s.sha256, s.signer, s.role, s.signed_at].join('\n');

export function signBytes(buf, { key, signer, role, subject, now = new Date() }) {
  if (!signer) throw new Error('a signature needs the name of the signer (--signer "Name")');
  const pub = asPublic(key);
  const s = { algorithm: 'ed25519', subject, sha256: sha256(buf), signer, role, signed_at: now.toISOString(), key_fingerprint: fingerprint(pub), public_key: pub.export({ type: 'spki', format: 'pem' }) };
  s.signature = crypto.sign(null, Buffer.from(statement(s)), key).toString('base64');
  return s;
}

// → { valid, reason } for one signature entry against the bytes it claims to cover
export function checkSignature(s, buf) {
  try {
    if (s.algorithm !== 'ed25519') return { valid: false, reason: `unknown algorithm ${s.algorithm}` };
    if (s.sha256 !== sha256(buf)) return { valid: false, reason: 'signed a different content (hash does not match)' };
    const pub = crypto.createPublicKey(s.public_key);
    if (fingerprint(pub) !== s.key_fingerprint) return { valid: false, reason: 'key fingerprint does not match the public key' };
    return crypto.verify(null, Buffer.from(statement(s)), pub, Buffer.from(s.signature, 'base64')) ? { valid: true } : { valid: false, reason: 'signature does not verify (statement or signature altered)' };
  } catch (e) { return { valid: false, reason: `unreadable signature: ${e.message.split('\n')[0]}` }; }
}

const SIG_FILE = 'manifest.sig.json';

// add a signature to a sealed run (or report). Several people may sign; earlier signatures are kept.
export function signRun(dir, { key, signer, role = 'Signed by', now }) {
  const mfile = path.join(dir, 'manifest.json');
  if (!fs.existsSync(mfile)) throw new Error(`${dir}: no manifest.json (not a sealed run or report)`);
  const file = path.join(dir, SIG_FILE);
  const doc = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { signatures: [] };
  const s = signBytes(fs.readFileSync(mfile), { key, signer, role, subject: 'manifest.json', now });
  doc.signatures.push(s);
  fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
  return s;
}

export function verifySignatures(dir, { trust = [] } = {}) {
  const file = path.join(dir, SIG_FILE);
  if (!fs.existsSync(file)) return [];
  const buf = fs.readFileSync(path.join(dir, 'manifest.json'));
  let doc;
  try { doc = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return [{ valid: false, reason: `${SIG_FILE} is not readable JSON`, trusted: false }]; }
  return (doc.signatures ?? []).map((s) => ({ signer: s.signer, role: s.role, signed_at: s.signed_at, key_fingerprint: s.key_fingerprint, ...checkSignature(s, buf), trusted: trust.includes(s.key_fingerprint) }));
}

// ---- RFC 3161 trusted timestamp -----------------------------------------

const SHA256_ALG = Buffer.from('300d06096086480165030402010500', 'hex');

export function timestampRequest(hashHex, nonce = crypto.randomBytes(8)) {
  const n = Buffer.from(nonce); n[0] = (n[0] & 0x7f) | 0x40; // a positive INTEGER without a leading zero
  const imprint = Buffer.concat([Buffer.from([0x30, 0x31]), SHA256_ALG, Buffer.from([0x04, 0x20]), Buffer.from(hashHex, 'hex')]);
  const body = Buffer.concat([Buffer.from([0x02, 0x01, 0x01]), imprint, Buffer.from([0x02, n.length]), n, Buffer.from([0x01, 0x01, 0xff])]);
  return { der: Buffer.concat([Buffer.from([0x30, body.length]), body]), nonce: n.toString('hex') };
}

// just enough DER to walk a timestamp response
function der(buf, off = 0) {
  const tag = buf[off];
  let len = buf[off + 1], start = off + 2;
  if (len === 0x80) throw new Error('indefinite-length encoding is not supported');
  if (len & 0x80) { const k = len & 0x7f; len = 0; for (let i = 0; i < k; i++) len = len * 256 + buf[start + i]; start += k; }
  const end = start + len;
  if (end > buf.length) throw new Error('truncated');
  return { tag, start, end, value: buf.subarray(start, end), children() { const out = []; for (let o = start; o < end;) { const c = der(buf, o); out.push(c); o = c.end; } return out; } };
}
const oid = (v) => { const out = [Math.floor(v[0] / 40), v[0] % 40]; let n = 0; for (const b of v.subarray(1)) { n = n * 128 + (b & 0x7f); if (!(b & 0x80)) { out.push(n); n = 0; } } return out.join('.'); };

// → { granted, status, gen_time, imprint (hex), hash_algorithm, serial, nonce, policy }
export function parseTimestampResponse(buf) {
  try {
    const [status, token] = der(buf).children();
    const code = status.children()[0].value.readUIntBE(0, status.children()[0].value.length);
    if (code > 1 || !token) return { granted: false, status: code };
    const signedData = token.children()[1].children()[0];
    const encap = signedData.children()[2].children();
    if (oid(encap[0].value) !== '1.2.840.113549.1.9.16.1.4') throw new Error('the token does not contain a TSTInfo');
    const octets = encap[1].children()[0];
    if (octets.tag !== 0x04) throw new Error('TSTInfo is not a primitive OCTET STRING');
    const tst = der(octets.value).children();
    const mi = tst[2].children();
    const t = tst[4].value.toString('latin1').match(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\.\d+)?Z$/);
    if (!t) throw new Error('genTime is not a UTC GeneralizedTime');
    const nonce = tst.slice(5).find((c) => c.tag === 0x02);
    return { granted: true, status: code, policy: oid(tst[1].value), hash_algorithm: oid(mi[0].children()[0].value), imprint: mi[1].value.toString('hex'),
      serial: tst[3].value.toString('hex'), gen_time: `${t[1]}-${t[2]}-${t[3]}T${t[4]}:${t[5]}:${t[6]}${t[7] ?? ''}Z`, nonce: nonce ? nonce.value.toString('hex').replace(/^00/, '') : null };
  } catch (e) { throw new Error(`not a readable RFC 3161 timestamp response: ${e.message}`); }
}

const TSR_FILE = 'manifest.tsr', TSR_INFO = 'manifest.tsr.json';

// Ask a TSA to timestamp the manifest hash, check the answer is about this manifest and
// this request, and store the token. The host clock is compared with the TSA's time:
// the difference goes on file, so a wrong host clock is visible.
export async function timestampRun(dir, { url, timeoutMs = 20000 }) {
  const mfile = path.join(dir, 'manifest.json');
  if (!fs.existsSync(mfile)) throw new Error(`${dir}: no manifest.json (not a sealed run or report)`);
  if (fs.existsSync(path.join(dir, TSR_FILE))) throw new Error(`${dir} already has a trusted timestamp (${TSR_FILE}); it is not replaced`);
  const hash = sha256(fs.readFileSync(mfile));
  const req = timestampRequest(hash);
  const sent = Date.now();
  let res;
  try { res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/timestamp-query' }, body: req.der, signal: AbortSignal.timeout(timeoutMs) }); }
  catch (e) { throw new Error(`TSA ${url} not reachable: ${e.cause?.code ?? e.message}`); }
  const received = Date.now();
  if (!res.ok) throw new Error(`TSA ${url} answered HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const t = parseTimestampResponse(buf);
  if (!t.granted) throw new Error(`TSA ${url} did not grant the timestamp (status ${t.status})`);
  if (t.imprint !== hash) throw new Error('the TSA answered about a different hash than the one sent');
  if (t.nonce !== req.nonce) throw new Error('the TSA answer does not carry the nonce of this request (possible replay)');
  fs.writeFileSync(path.join(dir, TSR_FILE), buf, { flag: 'wx' });
  // the host's time at the middle of the round trip, against the TSA's time
  const offset = Math.round((sent + received) / 2 - Date.parse(t.gen_time));
  const info = { tsa_url: url, manifest_sha256: hash, gen_time: t.gen_time, serial: t.serial, policy: t.policy, host_time_at_request: new Date(sent).toISOString(), host_clock_offset_ms: offset, round_trip_ms: received - sent,
    note: 'gen_time and the hash are read from manifest.tsr, which is the evidence; this file is a readable summary. host_clock_offset_ms = host clock minus TSA time; a TSA that states whole seconds limits it to about ±1 s.' };
  fs.writeFileSync(path.join(dir, TSR_INFO), JSON.stringify(info, null, 2) + '\n', { flag: 'wx' });
  return info;
}

// Re-read the stored token. Without a CA file this shows that the token is about this
// manifest and what time it states; it does not prove who issued it. With `caFile`
// (the TSA's certificate chain, PEM) the token's signature is verified with OpenSSL.
export function verifyTimestamp(dir, { caFile } = {}) {
  const file = path.join(dir, TSR_FILE);
  if (!fs.existsSync(file)) return null;
  const hash = sha256(fs.readFileSync(path.join(dir, 'manifest.json')));
  let t;
  try { t = parseTimestampResponse(fs.readFileSync(file)); } catch (e) { return { valid: false, reason: e.message, issuer_verified: false }; }
  if (!t.granted) return { valid: false, reason: `the stored response is not a granted timestamp (status ${t.status})`, issuer_verified: false };
  if (t.imprint !== hash) return { valid: false, reason: 'the timestamp is for a different manifest (hash does not match)', issuer_verified: false, gen_time: t.gen_time };
  const out = { valid: true, gen_time: t.gen_time, serial: t.serial, issuer_verified: false };
  if (caFile) {
    try { execFileSync('openssl', ['ts', '-verify', '-digest', hash, '-in', file, '-CAfile', caFile], { stdio: 'pipe' }); out.issuer_verified = true; }
    catch (e) { return { ...out, valid: false, reason: `OpenSSL could not verify the token against ${caFile}: ${e.code === 'ENOENT' ? 'openssl not found' : String(e.stderr || e.message).trim().split('\n').pop()}` }; }
  }
  return out;
}
