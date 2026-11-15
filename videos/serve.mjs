// One origin for the promo recording: the known-answer app at /good/ and /bad/,
// and the sample output (docs/sample) at /sample/.
//   node videos/serve.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'examples/ka-app/public/index.html');
const SAMPLE = path.join(ROOT, 'docs/sample');
const TYPES = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.pdf': 'application/pdf', '.jsonl': 'text/plain', '.yaml': 'text/plain' };

const port = Number(process.argv[2] ?? 4180);
http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const app = p.match(/^\/(good|bad)\/?$/);
  if (app) {
    let html = fs.readFileSync(APP, 'utf8');
    if (app[1] === 'bad') html = html.replace('<head>', '<head><script>window.KA_DEFECTS = true</script>');
    res.writeHead(200, { 'content-type': TYPES['.html'] });
    return res.end(html);
  }
  if (p.startsWith('/sample/')) {
    const file = path.join(SAMPLE, p.slice('/sample/'.length));
    if (file.startsWith(SAMPLE) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
      return res.end(fs.readFileSync(file));
    }
  }
  res.writeHead(404); res.end('not found');
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/bad/  ·  /sample/runs/<run>/record.html`));
