import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('MCP exposes authoring tools only — no lock, no formal run', async () => {
  const client = new Client({ name: 't', version: '0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ['bin/validshot.mjs', 'mcp'] }));
  const names = (await client.listTools()).tools.map((t) => t.name).sort();
  assert.deepEqual(names, ['check_protocol', 'dry_run', 'inspect_page', 'render_protocol', 'validshot_guide']);
  const r = await client.callTool({ name: 'check_protocol', arguments: { protocol: `${process.cwd()}/examples/ka-app/protocols/KA-001-order-form.yaml` } });
  assert.match(r.content[0].text, /KA-001 v1, 10 steps/);
  await client.close();
});
