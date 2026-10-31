// MCP server (stdio) for coding agents. AUTHORING TOOLS ONLY: an agent can read the
// guide, inspect pages, check a protocol, dry-run it and render its review copy. It
// cannot lock (approve) a protocol, start a formal run or build the summary report:
// those are human acts, done with the CLI.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { loadProtocol, formatCheck } from './protocol.mjs';
import { verifyLock } from './lock.mjs';
import { inspect } from './inspect.mjs';
import { run } from './runner.mjs';
import { renderProtocol } from './review.mjs';
import { ROOT, TOOL_VERSION } from './version.mjs';

const text = (t) => ({ type: 'text', text: t });
const image = (file) => ({ type: 'image', data: fs.readFileSync(file).toString('base64'), mimeType: 'image/png' });
const fail = (t) => ({ isError: true, content: [text(t)] });
const abs = (p) => path.resolve(p);

const server = new McpServer({ name: 'validshot', version: TOOL_VERSION }, {
  instructions: [
    'Validshot executes front-end validation protocols (YAML) deterministically and produces signable evidence.',
    'You help AUTHOR protocols: validshot_guide (once) → inspect_page → write/edit the YAML → check_protocol → dry_run → fix → repeat.',
    'Every step needs a requirement id (req), a plain-language action, and assertions (expect). Cover edge cases (boundaries, invalid, empty) as their own steps.',
    'Never guess targets: use the ones inspect_page lists. Never weaken an assertion to make a dry run pass: if the app looks wrong, report it to the user as a possible defect.',
    'You cannot approve (lock) a protocol or run it formally; tell the user the CLI commands for that (validshot lock / validshot run --initiator).',
  ].join(' '),
});

server.registerTool('validshot_guide', {
  title: 'Protocol guide',
  description: 'Read first. How to write a validation protocol: YAML reference (actions, targets, assertions, display checks), edge-case checklist, and the authoring rules.',
  inputSchema: {},
}, async () => ({ content: [text(fs.readFileSync(path.join(ROOT, 'skills/validshot/SKILL.md'), 'utf8'))] }));

server.registerTool('inspect_page', {
  title: 'Inspect page',
  description: 'List a page\'s headings, interactive elements and readable regions (alerts, status, labelled outputs) as verified targets, plus a screenshot. ' +
    'Give `url`, or `protocol` + `after_step` to see the page after replaying that protocol\'s actions for steps 1..after_step.',
  inputSchema: {
    url: z.string().optional().describe('Page URL (or, with protocol, a base URL override)'),
    protocol: z.string().optional().describe('Absolute path to a protocol YAML'),
    after_step: z.number().int().min(0).optional().describe('With protocol: replay the actions of steps 1..N first. Default: all steps.'),
    storage_state: z.string().optional().describe('Absolute path to a Playwright storage state (saved login)'),
  },
}, async ({ url, protocol, after_step, storage_state }) => {
  try {
    const r = await inspect({ url, protocol: protocol && abs(protocol), afterStep: after_step, storageState: storage_state && abs(storage_state) });
    return { content: [text(r.text), image(r.screenshot)] };
  } catch (e) { return fail(`inspect failed: ${e.message}`); }
});

server.registerTool('check_protocol', {
  title: 'Check protocol',
  description: 'Validate a protocol YAML (structure, targets, requirement traceability) without opening a browser. Run after every edit.',
  inputSchema: { protocol: z.string().describe('Absolute path to the protocol YAML') },
}, async ({ protocol }) => {
  const p = loadProtocol(abs(protocol));
  let out = formatCheck(p);
  if (!p.errors.length) { const l = verifyLock(p); out += l.ok ? `\n  locked: approved by ${l.lock.approved_by}` : `\n  not locked: ${l.reason}`; }
  return { content: [text(out)], isError: p.errors.length > 0 };
});

server.registerTool('dry_run', {
  title: 'Dry run',
  description: 'Execute a protocol in a real browser WITHOUT a lock, to check that targets and assertions work. Output is marked DRY RUN and is not evidence. ' +
    'Returns per-step results and the annotated screenshots of failing steps (up to 4).',
  inputSchema: {
    protocol: z.string().describe('Absolute path to the protocol YAML'),
    base_url: z.string().optional().describe('Override environment.base_url'),
    storage_state: z.string().optional().describe('Absolute path to a Playwright storage state (saved login)'),
  },
}, async ({ protocol, base_url, storage_state }) => {
  try {
    const lines = [];
    const r = await run(abs(protocol), { dryRun: true, baseUrl: base_url, storageState: storage_state && abs(storage_state), log: (l) => lines.push(l) });
    const failing = r.record.steps.filter((s) => s.result === 'FAIL' && s.screenshot).slice(0, 4);
    return { content: [
      text(`${lines.join('\n')}\n\n${r.verdict}: ${r.counts.PASS} pass, ${r.counts.FAIL} fail, ${r.counts.BLOCKED} blocked\nRecord: ${path.join(r.dir, 'record.pdf')}\n` +
        (r.counts.FAIL ? '\nFor each failure decide: wrong target/assertion in the protocol (fix it), or the app really behaves differently from the requirement (report it to the user; do not change the expectation to match).' : '')),
      ...failing.map((s) => image(path.join(r.dir, s.screenshot.annotated.path))),
    ] };
  } catch (e) { return fail(`dry run failed: ${e.message}`); }
});

server.registerTool('render_protocol', {
  title: 'Render the review copy',
  description: 'Render a protocol as a PDF laid out like a manual test script (requirements, steps, expected results, the exact YAML as an appendix), ' +
    'for the person who reviews and locks it. The approved item stays the YAML file; the PDF carries its sha256. Run this when handing a protocol over for review.',
  inputSchema: {
    protocol: z.string().describe('Absolute path to the protocol YAML'),
    out: z.string().optional().describe('Absolute path for the PDF (default: next to the protocol, <name>.review.pdf)'),
  },
}, async ({ protocol, out }) => {
  try {
    const r = await renderProtocol(abs(protocol), { out: out && abs(out) });
    return { content: [text(`Review copy: ${r.file}\nProtocol sha256 ${r.hash}\n${r.lock.ok ? 'Locked (approved).' : `Not locked: ${r.lock.reason}`}` +
      (r.warnings.length ? `\nPoints for the reviewer:\n- ${r.warnings.join('\n- ')}` : ''))] };
  } catch (e) { return fail(`render failed: ${e.message}`); }
});

await server.connect(new StdioServerTransport());
