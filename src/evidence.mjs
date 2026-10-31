// Evidence store for one run: files are written once and never modified, every
// event goes into an append-only audit log where each entry hashes the previous one,
// and a manifest lists the SHA-256 of every file plus the chain head.
//
// A local hash chain detects edits, but an administrator could rewrite the whole chain.
// Anchor the printed manifest hash somewhere read-only (WORM storage, the signed record).
import fs from 'node:fs';
import path from 'node:path';
import { sha256 } from './protocol.mjs';

const GENESIS = '0'.repeat(64);
const entryHash = (e) => sha256(JSON.stringify({ seq: e.seq, at: e.at, type: e.type, data: e.data, prev: e.prev }));

export class EvidenceStore {
  constructor(dir) {
    if (fs.existsSync(dir)) throw new Error(`run directory already exists: ${dir}`);
    fs.mkdirSync(path.join(dir, 'shots'), { recursive: true });
    this.dir = dir;
    this.log = path.join(dir, 'audit.jsonl');
    this.seq = 0;
    this.head = GENESIS;
    this.files = new Map();
  }

  event(type, data = {}) {
    const e = { seq: ++this.seq, at: new Date().toISOString(), type, data, prev: this.head };
    e.hash = entryHash(e);
    fs.appendFileSync(this.log, JSON.stringify(e) + '\n');
    this.head = e.hash;
    return e;
  }

  // write a file exactly once; return its relative path and hash
  put(rel, buf) {
    const file = path.join(this.dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buf, { flag: 'wx' });
    const hash = sha256(buf);
    this.files.set(rel, hash);
    this.event('file', { path: rel, sha256: hash, bytes: buf.length });
    return { path: rel, sha256: hash };
  }

  seal() {
    this.event('sealed', { files: this.files.size });
    const manifest = {
      files: Object.fromEntries([...this.files].sort(([a], [b]) => a.localeCompare(b))),
      audit_log: { path: 'audit.jsonl', sha256: sha256(fs.readFileSync(this.log)), entries: this.seq, chain_head: this.head },
    };
    const buf = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
    fs.writeFileSync(path.join(this.dir, 'manifest.json'), buf, { flag: 'wx' });
    for (const rel of [...this.files.keys(), 'audit.jsonl', 'manifest.json']) try { fs.chmodSync(path.join(this.dir, rel), 0o444); } catch {}
    return { manifest, sha256: sha256(buf) };
  }
}

// Re-check a sealed run: every file's hash, the chain, and that log and manifest agree.
export function verifyRun(dir) {
  const problems = [];
  const mfile = path.join(dir, 'manifest.json');
  if (!fs.existsSync(mfile)) return { ok: false, problems: ['manifest.json is missing (run not sealed?)'] };
  const mbuf = fs.readFileSync(mfile);
  const manifest = JSON.parse(mbuf);
  for (const [rel, want] of Object.entries(manifest.files)) {
    const f = path.join(dir, rel);
    if (!fs.existsSync(f)) { problems.push(`missing: ${rel}`); continue; }
    const got = sha256(fs.readFileSync(f));
    if (got !== want) problems.push(`hash mismatch: ${rel} (manifest ${want.slice(0, 12)}…, file ${got.slice(0, 12)}…)`);
  }
  const logBuf = fs.readFileSync(path.join(dir, 'audit.jsonl'));
  if (sha256(logBuf) !== manifest.audit_log.sha256) problems.push('audit.jsonl hash differs from manifest');
  let prev = GENESIS, n = 0;
  const logged = new Map();
  for (const line of logBuf.toString('utf8').split('\n').filter(Boolean)) {
    const e = JSON.parse(line);
    n++;
    if (e.seq !== n) problems.push(`audit entry ${n}: sequence ${e.seq} out of order`);
    if (e.prev !== prev) problems.push(`audit entry ${e.seq}: broken chain (prev does not match)`);
    if (entryHash(e) !== e.hash) problems.push(`audit entry ${e.seq}: content altered (hash does not match)`);
    if (e.type === 'file') logged.set(e.data.path, e.data.sha256);
    prev = e.hash;
  }
  if (prev !== manifest.audit_log.chain_head) problems.push('chain head differs from manifest');
  for (const [rel, h] of Object.entries(manifest.files)) if (logged.get(rel) !== h) problems.push(`manifest entry ${rel} is not the hash the audit log recorded`);
  return { ok: problems.length === 0, problems, manifest_sha256: sha256(mbuf), entries: n, files: Object.keys(manifest.files).length };
}
