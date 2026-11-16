// Signatures, trusted timestamps, other browser engines and the run video.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import zlib from 'node:zlib';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { firefox, webkit } from 'playwright';
import { start } from '../examples/ka-app/server.mjs';
import { run } from '../src/runner.mjs';
import { lock, verifyLock } from '../src/lock.mjs';
import { loadProtocol } from '../src/protocol.mjs';
import { EvidenceStore, verifyRun } from '../src/evidence.mjs';
import { keygen, loadPrivateKey, signRun, timestampRun, timestampRequest, parseTimestampResponse } from '../src/sign.mjs';
import { decodePng, rendered } from '../src/png.mjs';

const tmp = (p = 'validshot-attest-') => fs.mkdtempSync(path.join(os.tmpdir(), p));
const sealed = () => { const dir = path.join(tmp(), 'run'); const s = new EvidenceStore(dir); s.put('record.json', Buffer.from('{"verdict":"PASS"}')); s.seal(); return dir; };
const openssl = (() => { try { return execFileSync('openssl', ['version'], { stdio: 'pipe' }).toString().trim(); } catch { return null; } })();

test('signatures: a valid one verifies, names its key, and is required when a trusted key is given', () => {
  const dir = sealed(), keys = tmp();
  const ann = keygen(path.join(keys, 'ann')), bob = keygen(path.join(keys, 'bob'));
  assert.equal(fs.statSync(ann.privateKeyFile).mode & 0o077, 0, 'private key is readable by its owner only');
  assert.throws(() => keygen(path.join(keys, 'ann')), /already exists/);

  // unsigned: intact, but not acceptable once a trusted key is demanded
  assert.equal(verifyRun(dir).ok, true);
  assert.match(verifyRun(dir, { trust: [ann.publicKeyFile] }).problems.join(), /not signed/);

  signRun(dir, { key: loadPrivateKey(ann.privateKeyFile), signer: 'Ann Tester', role: 'Executed (initiated) by' });
  const v = verifyRun(dir, { trust: [ann.publicKeyFile] });
  assert.equal(v.ok, true, v.problems.join());
  assert.deepEqual(v.signatures.map((s) => [s.signer, s.valid, s.trusted, s.key_fingerprint]), [['Ann Tester', true, true, ann.fingerprint]]);
  assert.equal(verifyRun(dir, { trust: [ann.fingerprint] }).ok, true, 'a fingerprint works as well as the key file');
  // signed, but not by the key that is trusted
  assert.match(verifyRun(dir, { trust: [bob.publicKeyFile] }).problems.join(), /no valid signature from a trusted key/);

  // a second person signs; both are kept
  signRun(dir, { key: loadPrivateKey(bob.privateKeyFile), signer: 'Bob Reviewer', role: 'Reviewed by' });
  assert.deepEqual(verifyRun(dir).signatures.map((s) => s.signer), ['Ann Tester', 'Bob Reviewer']);
  assert.throws(() => signRun(dir, { key: loadPrivateKey(bob.privateKeyFile) }), /name of the signer/);
  assert.throws(() => loadPrivateKey(ann.publicKeyFile), /not a readable private key/);
});

test('signatures: a rewritten run, an altered statement and a swapped key are all caught', () => {
  const keys = tmp(), ann = keygen(path.join(keys, 'ann')), eve = keygen(path.join(keys, 'eve'));
  const dir = sealed();
  signRun(dir, { key: loadPrivateKey(ann.privateKeyFile), signer: 'Ann Tester' });
  const sigFile = path.join(dir, 'manifest.sig.json');
  const original = fs.readFileSync(sigFile, 'utf8');
  const withSig = (edit) => { const d = JSON.parse(original); edit(d.signatures[0]); fs.writeFileSync(sigFile, JSON.stringify(d)); return verifyRun(dir, { trust: [ann.publicKeyFile] }).problems.join(' | '); };

  assert.match(withSig((s) => { s.signer = 'Someone Else'; }), /signature does not verify/);
  assert.match(withSig((s) => { s.signed_at = '2020-01-01T00:00:00.000Z'; }), /signature does not verify/);
  // the attacker re-signs with their own key but keeps Ann's name
  const forged = sealed();
  signRun(forged, { key: loadPrivateKey(eve.privateKeyFile), signer: 'Ann Tester' });
  assert.match(verifyRun(forged, { trust: [ann.publicKeyFile] }).problems.join(), /no valid signature from a trusted key/);
  // ...or pastes Ann's fingerprint next to their own key
  assert.match(withSig((s) => { s.public_key = fs.readFileSync(eve.publicKeyFile, 'utf8'); }), /fingerprint does not match/);

  // the whole run is rewritten consistently (the attack a local hash chain cannot see): the signature no longer covers it
  fs.writeFileSync(sigFile, original);
  const other = sealed();
  fs.copyFileSync(sigFile, path.join(other, 'manifest.sig.json'));
  assert.match(verifyRun(other).problems.join(), /signed a different content/);
});

test('lock: an approval signed with a key is checked; a forged or re-pointed approval is refused', () => {
  const dir = tmp(), keys = tmp(), ann = keygen(path.join(keys, 'ann'));
  const f = path.join(dir, 'p.yaml');
  fs.writeFileSync(f, `protocol: { id: T-1, version: 1, title: t }\nenvironment: { base_url: http://x }\nrequirements: { R1: r }\nsteps:\n  - { id: 1, req: R1, action: open, do: { goto: / }, expect: [ { target: { label: Total }, text: "1" } ] }\n`);
  const { record } = lock(f, { approver: 'Ann Reviewer', reason: 'Initial approval', key: loadPrivateKey(ann.privateKeyFile) });
  assert.equal(record.signature.key_fingerprint, ann.fingerprint);
  assert.equal(verifyLock(loadProtocol(f)).ok, true);
  const lf = f.replace('.yaml', '.lock.json'), l = JSON.parse(fs.readFileSync(lf, 'utf8'));
  fs.writeFileSync(lf, JSON.stringify({ ...l, approved_by: 'Somebody Senior' }));
  assert.match(verifyLock(loadProtocol(f)).reason, /signed by "Ann Reviewer" but names "Somebody Senior"/);
  // the protocol is edited and the lock's hash is patched by hand to match
  fs.appendFileSync(f, '# changed\n');
  fs.writeFileSync(lf, JSON.stringify({ ...l, protocol_sha256: loadProtocol(f).hash }));
  assert.match(verifyLock(loadProtocol(f)).reason, /approval signature .* is not valid: signed a different content/);
});

test('RFC 3161: the request is well-formed', { skip: openssl ? false : 'openssl not found' }, () => {
  const hash = 'ab'.repeat(32), req = timestampRequest(hash), f = path.join(tmp(), 'req.tsq');
  fs.writeFileSync(f, req.der);
  const text = execFileSync('openssl', ['ts', '-query', '-in', f, '-text'], { stdio: 'pipe' }).toString();
  assert.match(text, /Hash Algorithm: sha256/);
  assert.match(text.replace(/[\s-]/g, '').replace(/0000|0010/g, ''), new RegExp(hash.slice(0, 16)));
  assert.match(text, /Certificate required: yes/);
  assert.match(text, new RegExp(`Nonce: 0x${req.nonce}`, 'i'));
});

// a throwaway CA and time-stamping authority, served over HTTP by `openssl ts -reply`
function localTsa() {
  const d = tmp('validshot-tsa-'), ssl = (...a) => execFileSync('openssl', a, { cwd: d, stdio: 'pipe' });
  fs.writeFileSync(path.join(d, 'tsa.cnf'), `[tsa]\ndefault_tsa = t\n[t]\ndir = ${d}\nserial = ${d}/serial\ncrypto_device = builtin\nsigner_cert = ${d}/tsa.crt\ncerts = ${d}/ca.crt\nsigner_key = ${d}/tsa.key\nsigner_digest = sha256\ndefault_policy = 1.2.3.4.1\ndigests = sha256\naccuracy = secs:1\nordering = no\ntsa_name = no\ness_cert_id_chain = no\n[ext]\nextendedKeyUsage = critical,timeStamping\nkeyUsage = critical,digitalSignature\n`);
  fs.writeFileSync(path.join(d, 'serial'), '01\n');
  ssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.crt', '-subj', '/CN=validshot test CA', '-days', '2', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign');
  ssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'tsa.key', '-out', 'tsa.csr', '-subj', '/CN=validshot test TSA');
  ssl('x509', '-req', '-in', 'tsa.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'tsa.crt', '-days', '2', '-extfile', 'tsa.cnf', '-extensions', 'ext');
  let n = 0, mode = 'ok';
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (mode === 'down') { res.writeHead(503); return res.end(); }
      const q = path.join(d, `q${++n}.tsq`), r = path.join(d, `r${n}.tsr`);
      // "other": the TSA answers about some other hash (a replayed or mixed-up response)
      fs.writeFileSync(q, mode === 'other' ? timestampRequest('cd'.repeat(32)).der : Buffer.concat(chunks));
      ssl('ts', '-reply', '-config', 'tsa.cnf', '-queryfile', q, '-out', r);
      res.writeHead(200, { 'content-type': 'application/timestamp-reply' });
      res.end(fs.readFileSync(r));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}/`, ca: path.join(d, 'ca.crt'), close: () => server.close(), set: (m) => { mode = m; } })));
}

test('RFC 3161: a timestamp is obtained, bound to the manifest, verified against the TSA chain, and tampering is caught', { skip: openssl ? false : 'openssl not found' }, async () => {
  const tsa = await localTsa();
  try {
    const dir = sealed();
    assert.match(verifyRun(dir, { requireTimestamp: true }).problems.join(), /no trusted timestamp/);
    const t = await timestampRun(dir, { url: tsa.url });
    assert.equal(t.manifest_sha256, verifyRun(dir).manifest_sha256);
    assert.ok(Math.abs(Date.parse(t.gen_time) - Date.now()) < 5000, t.gen_time);
    assert.ok(Math.abs(t.host_clock_offset_ms) < 2000, `offset ${t.host_clock_offset_ms}`);
    assert.deepEqual(parseTimestampResponse(fs.readFileSync(path.join(dir, 'manifest.tsr'))).imprint, t.manifest_sha256);

    const plain = verifyRun(dir);
    assert.equal(plain.ok, true, plain.problems.join());
    assert.equal(plain.timestamp.issuer_verified, false);
    const full = verifyRun(dir, { caFile: tsa.ca });
    assert.equal(full.ok, true, full.problems.join());
    assert.equal(full.timestamp.issuer_verified, true);
    await assert.rejects(timestampRun(dir, { url: tsa.url }), /already has a trusted timestamp/);

    // a token for one run does not vouch for another
    const changed = path.join(tmp(), 'run'), s = new EvidenceStore(changed);
    s.put('record.json', Buffer.from('{"verdict":"FAIL"}')); s.seal();
    fs.copyFileSync(path.join(dir, 'manifest.tsr'), path.join(changed, 'manifest.tsr'));
    assert.match(verifyRun(changed).problems.join(), /timestamp is for a different manifest/);

    // a chain that did not issue the token
    const stranger = await localTsa();
    assert.match(verifyRun(dir, { caFile: stranger.ca }).problems.join(), /OpenSSL could not verify/);
    stranger.close();

    // the TSA answers about another hash, or is down: nothing is stored
    const fresh = sealed();
    tsa.set('other');
    await assert.rejects(timestampRun(fresh, { url: tsa.url }), /different hash/);
    tsa.set('down');
    await assert.rejects(timestampRun(fresh, { url: tsa.url }), /HTTP 503/);
    assert.equal(fs.existsSync(path.join(fresh, 'manifest.tsr')), false);
    await assert.rejects(timestampRun(fresh, { url: 'http://127.0.0.1:9/' }), /not reachable/);
  } finally { tsa.close(); }
});

// ---- a formal run, signed, on video, in other engines ---------------------

const PORT = 4197;
const SRC = path.resolve('examples/ka-app/protocols/KA-001-order-form.yaml');
let server, dir;
const protocolFor = (name, envExtra) => {
  const f = path.join(dir, `KA-001-${name}.yaml`);
  fs.writeFileSync(f, fs.readFileSync(SRC, 'utf8').replace('http://127.0.0.1:4173/good', `http://127.0.0.1:${PORT}/good`).replace('environment:\n', `environment:\n${envExtra}`));
  lock(f, { approver: 'Test Reviewer', reason: 'test' });
  return f;
};
before(async () => { server = await start(PORT); dir = tmp('validshot-engines-'); });
after(() => server.close());

test('a signed run with video: the recording is hashed evidence, steps point into it, and the signature covers it', async () => {
  const keys = tmp(), ann = keygen(path.join(keys, 'ann'));
  const r = await run(protocolFor('video', '  video: true\n'), { initiator: 'Ann Tester', outDir: dir, signKey: ann.privateKeyFile });
  assert.equal(r.verdict, 'PASS', JSON.stringify(r.record.deviations, null, 1));
  const video = path.join(r.dir, 'video/run.webm');
  assert.ok(fs.statSync(video).size > 10000, 'a real recording');
  assert.equal(fs.readFileSync(video).subarray(0, 4).toString('hex'), '1a45dfa3', 'WebM (EBML) as the browser wrote it');
  assert.equal(JSON.parse(fs.readFileSync(path.join(r.dir, 'manifest.json'))).files['video/run.webm'], r.record.video.sha256);
  const at = r.record.steps.map((s) => s.video_at_s);
  assert.ok(at.every(([a, b], i) => b >= a && (i === 0 || a >= at[i - 1][0])), JSON.stringify(at));
  assert.match(fs.readFileSync(path.join(r.dir, 'record.html'), 'utf8'), /video\/run\.webm sha256 [0-9a-f]{64}/);

  assert.equal(r.attest.signature.signer, 'Ann Tester');
  const v = verifyRun(r.dir, { trust: [ann.publicKeyFile] });
  assert.equal(v.ok, true, v.problems.join());
  // a missing key stops the run before the browser starts
  await assert.rejects(run(protocolFor('nokey', ''), { initiator: 'Ann Tester', outDir: dir, signKey: path.join(keys, 'none.pem') }), /signing key .* file not found/);
});

for (const [name, engine] of Object.entries({ firefox, webkit })) {
  const installed = fs.existsSync(engine.executablePath());
  test(`known-answer protocol in ${name}: the correct app passes, the defective one fails on the same planted defects`, { skip: installed ? false : `${name} is not installed (npx playwright install ${name})` }, async () => {
    const p = protocolFor(name, `  browser: ${name}\n`);
    const good = await run(p, { initiator: 'Test Tester', outDir: dir });
    assert.equal(good.verdict, 'PASS', JSON.stringify(good.record.deviations, null, 1));
    assert.match(good.record.tool.browser, new RegExp(`^${name} \\d`));
    assert.equal(verifyRun(good.dir).ok, true);
    const bad = await run(p, { initiator: 'Test Tester', outDir: dir, baseUrl: `http://127.0.0.1:${PORT}/bad` });
    const got = bad.record.deviations.map((d) => `${d.step}.${d.assertion}: ${d.actual}`).join('\n');
    for (const want of [/^1\.A3: .*covered by <div#promo>/m, /^2\.A1: .*text is cut off horizontally/m, /^2\.A2: .*covered by <div#promo>/m, /^2\.A4: shows "\$569\.90"/m, /^5\.A2: enabled/m])
      assert.match(got, want);
    assert.equal(bad.record.deviations.length, 9, got);
  });
}

test('protocol: unknown browser, bad video and contrast settings are errors; a host browser is a warning', () => {
  const f = path.join(tmp(), 'p.yaml');
  const proto = (env) => { fs.writeFileSync(f, `protocol: { id: T, version: 1, title: t }\nenvironment: { base_url: http://x, ${env} }\nsystem_version: { url: /v }\nrequirements: { R1: r }\nsteps:\n  - { id: 1, req: R1, action: a, do: { goto: / }, expect: [ { target: h1, visible: true, min_contrast: 4.5 } ] }\n`); return loadProtocol(f); };
  assert.match(proto('browser: opera').errors.join(), /environment\.browser must be one of chromium, firefox, webkit, chrome, msedge/);
  assert.match(proto('video: yes please').errors.join(), /environment\.video must be true or false/);
  assert.match(proto('min_contrast: 0').errors.join(), /min_contrast must be a number from 1 to 21/);
  const edge = proto('browser: msedge');
  assert.deepEqual(edge.errors, []);
  assert.match(edge.warnings.join(), /msedge: the browser installed on the host is used/);
  assert.deepEqual([proto('browser: webkit').doc.environment.browser, proto('min_contrast: 3').doc.environment.min_contrast, proto('timezone: UTC').doc.environment.browser], ['webkit', 3, 'chromium']);
});

test('png: the decoder and the contrast measure agree with known pictures', () => {
  // 20×10 RGB, white, with a 6×4 block: black in one picture, #777 in the other
  const picture = (v) => { const rows = []; for (let y = 0; y < 10; y++) { const r = Buffer.alloc(1 + 60, 255); r[0] = 0; if (y >= 3 && y < 7) r.fill(v, 1 + 7 * 3, 1 + 13 * 3); rows.push(r); } return decodePng(makePng(20, 10, Buffer.concat(rows))); };
  const black = picture(0), grey = picture(0x77);
  assert.deepEqual([black.width, black.height, [...black.data.subarray(0, 4)], [...black.data.subarray((3 * 20 + 7) * 4, (3 * 20 + 7) * 4 + 4)]], [20, 10, [255, 255, 255, 255], [0, 0, 0, 255]]);
  assert.ok(Math.abs(rendered(black).ratio - 21) < 0.01, 'black on white is 21:1');
  assert.ok(Math.abs(rendered(grey).ratio - 4.48) < 0.02, `#777 on white is 4.48:1, got ${rendered(grey).ratio}`);
  assert.equal(rendered(black, { x: 0, y: 0, w: 6, h: 3 }).ratio, 1, 'one flat colour: nothing to read');
  assert.ok(Math.abs(rendered(black).ink - 24 / 200) < 1e-9);
  assert.throws(() => decodePng(Buffer.from('not a png at all')), /not a PNG/);
});

function makePng(w, h, raw) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, body) => { const len = Buffer.alloc(4); len.writeUInt32BE(body.length); const td = Buffer.concat([Buffer.from(type), body]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
