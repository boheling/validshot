// Review & Lock: a human approves a protocol, which pins the exact bytes by SHA-256.
// A formal run refuses a protocol whose bytes no longer match its lock.
// This approval is a record of review, NOT a 21 CFR Part 11 electronic signature.
import fs from 'node:fs';
import os from 'node:os';
import { loadProtocol } from './protocol.mjs';
import { TOOL_VERSION } from './version.mjs';

export const lockFileFor = (file) => file.replace(/\.ya?ml$/i, '') + '.lock.json';

export function lock(file, { approver, role = 'Reviewer', reason, now = new Date() } = {}) {
  if (!approver) throw new Error('--approver is required: a lock records who approved the protocol');
  if (!reason) throw new Error('--reason is required (e.g. "Initial approval" or "Re-approved after CR-123")');
  const p = loadProtocol(file);
  if (p.errors.length) throw new Error(`protocol has errors; fix them before approval:\n  - ${p.errors.join('\n  - ')}`);
  const out = lockFileFor(file);
  const previous = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
  const record = {
    protocol_id: p.doc.protocol.id,
    protocol_version: p.doc.protocol.version,
    protocol_sha256: p.hash,
    approved_by: approver,
    approver_role: role,
    approved_at: now.toISOString(),
    reason,
    host_user: os.userInfo().username,
    tool_version: TOOL_VERSION,
    meaning: 'Reviewed and approved for execution. Not a 21 CFR Part 11 electronic signature.',
    supersedes: previous ? { protocol_sha256: previous.protocol_sha256, approved_at: previous.approved_at, approved_by: previous.approved_by } : null,
  };
  fs.writeFileSync(out, JSON.stringify(record, null, 2) + '\n');
  return { file: out, record };
}

// { ok, lock, reason } — ok only if a lock exists and pins these exact bytes
export function verifyLock(protocol) {
  const file = lockFileFor(protocol.file);
  if (!fs.existsSync(file)) return { ok: false, lock: null, reason: `no lock file (${file}); a reviewer must run \`validshot lock\`` };
  const l = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (l.protocol_sha256 !== protocol.hash) return { ok: false, lock: l, reason: `protocol changed since approval (locked ${l.protocol_sha256.slice(0, 12)}…, now ${protocol.hash.slice(0, 12)}…); it must be re-approved` };
  return { ok: true, lock: l, file };
}
