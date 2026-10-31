import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TOOL_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
// resolve like an import would: when installed as a dependency, playwright is hoisted next to validshot
export const PLAYWRIGHT_VERSION = createRequire(import.meta.url)('playwright/package.json').version;
