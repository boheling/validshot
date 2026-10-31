// Known-answer test app for validating validshot itself (OQ): the same order form,
// served correct at /good/ and with planted display defects at /bad/.
//   node examples/ka-app/server.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
export const VERSION = '1.4.2';

export function start(port = 4173) {
  const server = http.createServer((req, res) => {
    const m = new URL(req.url, 'http://x').pathname.match(/^\/(good|bad)(\/.*)?$/);
    if (!m) { res.writeHead(302, { location: '/good/' }); return res.end(); }
    const file = m[2] && m[2] !== '/' ? m[2].slice(1) : 'index.html';
    if (file === 'version.json') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ version: VERSION, variant: m[1] })); }
    if (file !== 'index.html') { res.writeHead(404); return res.end('not found'); }
    let html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
    if (m[1] === 'bad') html = html.replace('<head>', '<head><script>window.KA_DEFECTS = true</script>');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] ?? 4173);
  await start(port);
  console.log(`known-answer app: http://127.0.0.1:${port}/good/  (planted defects: /bad/)`);
}
