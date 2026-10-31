#!/usr/bin/env node
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadProtocol, formatCheck } from '../src/protocol.mjs';
import { lock, verifyLock } from '../src/lock.mjs';
import { verifyRun } from '../src/evidence.mjs';
import { TOOL_VERSION } from '../src/version.mjs';

const HELP = `validshot ${TOOL_VERSION} — deterministic front-end validation with signable evidence

Authoring (an agent or a person may do these):
  validshot check <protocol.yaml>                 validate a protocol, print its sha256
  validshot inspect <url> [--after-step N --protocol p.yaml]
                                                  list verified targets on a page + screenshot
  validshot run <protocol.yaml> --dry-run         execute without a lock; output is NOT evidence
  validshot render <protocol.yaml> [--out f.pdf]  review copy (PDF) laid out like a manual test script

Review & execution (people only):
  validshot lock <protocol.yaml> --approver "Name" --reason "Initial approval" [--role Reviewer]
                                                  approve the exact bytes of a protocol
  validshot run <protocol.yaml> --initiator "Name" [--system-version X] [--base-url URL] [--out runs]
                                                  formal run: refuses an unlocked or changed protocol
  validshot verify-run <run-dir|report-dir>       re-check every hash and the audit chain
  validshot report <run-dir|runs-dir>... [--title "…"] [--id VSR-001] [--out reports]
                                                  summary report over formal runs (re-verifies each)

  validshot mcp                                   MCP server for coding agents (authoring tools only)

Common: --headed (show the browser), --storage-state login.json`;

const { values: o, positionals: [cmd, arg, ...more] } = parseArgs({
  allowPositionals: true,
  options: {
    approver: { type: 'string' }, role: { type: 'string' }, reason: { type: 'string' },
    initiator: { type: 'string' }, 'system-version': { type: 'string' }, 'base-url': { type: 'string' },
    out: { type: 'string' }, 'dry-run': { type: 'boolean' }, headed: { type: 'boolean' },
    'storage-state': { type: 'string' }, 'after-step': { type: 'string' }, protocol: { type: 'string' },
    title: { type: 'string' }, id: { type: 'string' },
    help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
  },
});

const die = (msg, code = 2) => { console.error(msg); process.exit(code); };
if (o.version) { console.log(TOOL_VERSION); process.exit(0); }
if (o.help || !cmd) { console.log(HELP); process.exit(0); }

try {
  if (cmd === 'check') {
    if (!arg) die('usage: validshot check <protocol.yaml>');
    const p = loadProtocol(path.resolve(arg));
    console.log(formatCheck(p));
    if (!p.errors.length) { const l = verifyLock(p); console.log(l.ok ? `  🔒 locked: approved by ${l.lock.approved_by} at ${l.lock.approved_at}` : `  🔓 ${l.reason}`); }
    process.exit(p.errors.length ? 1 : 0);
  }
  if (cmd === 'lock') {
    if (!arg) die('usage: validshot lock <protocol.yaml> --approver "Name" --reason "…"');
    const { file, record } = lock(path.resolve(arg), { approver: o.approver, role: o.role, reason: o.reason });
    console.log(`🔒 ${record.protocol_id} v${record.protocol_version} approved by ${record.approved_by} (${record.approver_role})\n   sha256 ${record.protocol_sha256}\n   ${file}`);
    console.log('   Any change to the protocol file now requires re-approval. This is a review record, not a Part 11 signature.');
    process.exit(0);
  }
  if (cmd === 'run') {
    if (!arg) die('usage: validshot run <protocol.yaml> (--dry-run | --initiator "Name")');
    const { run } = await import('../src/runner.mjs');
    const r = await run(arg, {
      dryRun: !!o['dry-run'], initiator: o.initiator, systemVersion: o['system-version'], baseUrl: o['base-url'],
      outDir: o.out, headless: !o.headed, storageState: o['storage-state'], log: console.log,
    });
    console.log(`\n${r.verdict === 'PASS' ? '✓' : '✗'} ${r.verdict}: ${r.counts.PASS} pass, ${r.counts.FAIL} fail, ${r.counts.BLOCKED} blocked`);
    console.log(`  record   ${path.join(r.dir, 'record.pdf')}`);
    console.log(`  manifest sha256 ${r.manifestSha256}${r.record.dry_run ? '\n  DRY RUN — not valid as evidence' : '\n  Write this hash on the signed record or store it read-only: it pins every file of this run.'}`);
    process.exit(r.verdict === 'PASS' ? 0 : 1);
  }
  if (cmd === 'render') {
    if (!arg) die('usage: validshot render <protocol.yaml> [--out review.pdf]');
    const { renderProtocol } = await import('../src/review.mjs');
    const r = await renderProtocol(arg, { out: o.out });
    console.log(`📄 review copy  ${r.file}\n   protocol sha256 ${r.hash} (the approved item is the YAML file)\n   ${r.lock.ok ? `🔒 approved by ${r.lock.lock.approved_by} at ${r.lock.lock.approved_at}` : `🔓 ${r.lock.reason}`}`);
    for (const w of r.warnings) console.log(`   ! ${w}`);
    process.exit(0);
  }
  if (cmd === 'report') {
    if (!arg) die('usage: validshot report <run-dir|runs-dir>... [--title "…"] [--id VSR-001] [--out reports]');
    const { buildReport } = await import('../src/report.mjs');
    const r = await buildReport([arg, ...more], { title: o.title, id: o.id, outDir: o.out });
    const s = r.summary;
    for (const p of s.protocols) console.log(`  ${p.id}: ${p.runs.length} run(s), most recent ${p.latest.result}${p.latest.integrity.ok ? '' : ' — EVIDENCE NOT INTACT'} (${p.latest.run_id})`);
    if (s.excluded.length) console.log(`  ${s.excluded.length} dry run(s) left out (not evidence)`);
    if (s.open.length) console.log(`\n  Open items:\n${s.open.map((x, i) => `   ${i + 1}. ${x}`).join('\n')}`);
    console.log(`\n${s.allPass ? '✓ all protocols passed in their most recent run, evidence intact' : '✗ not all passed or evidence not intact — see open items'}`);
    console.log(`  report   ${path.join(r.dir, 'report.pdf')}\n  manifest sha256 ${r.manifestSha256}`);
    process.exit(s.allPass ? 0 : 1);
  }
  if (cmd === 'verify-run') {
    if (!arg) die('usage: validshot verify-run <run-dir>');
    const r = verifyRun(path.resolve(arg));
    if (r.ok) console.log(`✓ intact: ${r.files} files, ${r.entries} audit entries, manifest sha256 ${r.manifest_sha256}`);
    else console.log(`✗ TAMPERED OR INCOMPLETE:\n  - ${r.problems.join('\n  - ')}`);
    process.exit(r.ok ? 0 : 1);
  }
  if (cmd === 'inspect') {
    const { inspect } = await import('../src/inspect.mjs');
    const r = await inspect({ url: arg, protocol: o.protocol, afterStep: o['after-step'] !== undefined ? Number(o['after-step']) : undefined, storageState: o['storage-state'] });
    console.log(r.text);
    process.exit(0);
  }
  if (cmd === 'mcp') { await import('../src/mcp.mjs'); }
  else die(`unknown command: ${cmd}\n\n${HELP}`);
} catch (e) { die(`✗ ${e.message}`, 2); }
