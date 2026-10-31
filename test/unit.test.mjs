import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadProtocol } from '../src/protocol.mjs';
import { lock, verifyLock } from '../src/lock.mjs';
import { EvidenceStore, verifyRun } from '../src/evidence.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'validshot-'));
const write = (dir, name, s) => { const f = path.join(dir, name); fs.writeFileSync(f, s); return f; };
const MIN = `protocol: { id: T-1, version: 1, title: t }
environment: { base_url: http://x }
system_version: { url: /v, json: v }
requirements: { R1: r }
steps:
  - id: 1
    req: R1
    action: open
    do: { goto: / }
    expect: [ { target: { label: Total }, text: "1" } ]
`;

test('a minimal protocol is valid', () => {
  const p = loadProtocol(write(tmp(), 'p.yaml', MIN));
  assert.deepEqual(p.errors, []);
  assert.equal(p.doc.environment.timezone, 'UTC');
});

test('protocol errors: missing req, missing expect, bad target, unknown requirement, display_check without reason', () => {
  const p = loadProtocol(write(tmp(), 'p.yaml', `protocol: { id: T, version: 1, title: t }
environment: { base_url: http://x }
requirements: { R1: r }
steps:
  - { id: 1, action: a, do: { goto: / } }
  - { id: 2, req: R9, action: a, expect: [ { target: { label: A, css: b }, text: x } ] }
  - { id: 3, req: R1, action: a, expect: [ { target: { label: A }, text: x, display_check: false } ] }
`));
  const all = p.errors.join('\n');
  assert.match(all, /step 1: `req`/);
  assert.match(all, /step 1: `expect`/);
  assert.match(all, /exactly one of role/);
  assert.match(all, /R9 is not listed/);
  assert.match(all, /display_check_reason/);
});

test('lock pins the exact bytes; any edit breaks it', () => {
  const dir = tmp(), f = write(dir, 'p.yaml', MIN);
  assert.throws(() => lock(f, { approver: 'A' }), /--reason/);
  lock(f, { approver: 'Ann Reviewer', reason: 'Initial approval' });
  assert.equal(verifyLock(loadProtocol(f)).ok, true);
  fs.appendFileSync(f, '# a comment\n');
  const v = verifyLock(loadProtocol(f));
  assert.equal(v.ok, false);
  assert.match(v.reason, /changed since approval/);
});

test('evidence store: verify passes when intact and catches every kind of tampering', () => {
  const dir = path.join(tmp(), 'run');
  const s = new EvidenceStore(dir);
  s.put('shots/a.png', Buffer.from('raw pixels'));
  s.put('record.json', Buffer.from('{}'));
  s.seal();
  assert.equal(verifyRun(dir).ok, true);
  assert.throws(() => s.put('shots/a.png', Buffer.from('again')), /EEXIST/);

  const copy = (name) => { const d = path.join(tmp(), name); fs.cpSync(dir, d, { recursive: true }); for (const f of fs.readdirSync(d, { recursive: true })) if (fs.statSync(path.join(d, f)).isFile()) fs.chmodSync(path.join(d, f), 0o644); return d; };
  const swapped = copy('swapped');
  fs.writeFileSync(path.join(swapped, 'shots/a.png'), 'other pixels');
  assert.match(verifyRun(swapped).problems.join(), /hash mismatch: shots\/a.png/);

  const edited = copy('edited');
  const log = path.join(edited, 'audit.jsonl');
  fs.writeFileSync(log, fs.readFileSync(log, 'utf8').replace('"bytes":10', '"bytes":11'));
  assert.match(verifyRun(edited).problems.join(), /content altered/);

  const dropped = copy('dropped');
  const lines = fs.readFileSync(path.join(dropped, 'audit.jsonl'), 'utf8').split('\n');
  fs.writeFileSync(path.join(dropped, 'audit.jsonl'), [lines[0], ...lines.slice(2)].join('\n'));
  assert.equal(verifyRun(dropped).ok, false);
});
