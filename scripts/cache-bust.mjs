#!/usr/bin/env node
// Give every app URL a new cache key, consistently.
//
//   npm run cache-bust            bump to the next version
//   npm run cache-bust -- 7       set it explicitly
//
// Why this exists: the app is plain ES modules served straight from the repository, with no
// bundler and no content-hashed filenames. Hostinger's CDN cached them under a week-long
// max-age, and its edges disagreed about the contents. Busting one file is worse than busting
// none — a new main.js importing an old roster.js fails with "does not provide an export
// named …" and the app does not start. So every module URL, stylesheet and runtime fetch moves
// together or not at all.
//
// The .htaccess now serves no-cache, must-revalidate, so this should not be needed again.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (d, out = []) => { for (const e of readdirSync(d)) { const p = join(d, e); statSync(p).isDirectory() ? walk(p, out) : out.push(p); } return out; };
const files = walk('src').filter((f) => f.endsWith('.js'));

const current = Number(/ASSET_V\s*=\s*'(\d+)'/.exec(readFileSync('src/config.js', 'utf8'))?.[1] ?? 1);
const v = String(Number(process.argv[2] ?? current + 1));
let changed = 0;

const bust = (text) => text
  // static and dynamic imports of local modules
  .replace(/(\bfrom\s+'|\bimport\(\s*')(\.[^']*?\.js)(\?v=\d+)?'/g, (_, pre, path) => `${pre}${path}?v=${v}'`)
  // <script src> and <link href> in index.html
  .replace(/((?:src|href)=")(\.\/[^"]*?\.(?:js|css))(\?v=\d+)?"/g, (_, pre, path) => `${pre}${path}?v=${v}"`);

for (const f of [...files, 'index.html']) {
  const before = readFileSync(f, 'utf8');
  const after = bust(before);
  if (after !== before) { writeFileSync(f, after); changed++; }
}

// Runtime fetches (content pack CSVs, roster.enc) build their URLs at run time, so they read
// this constant instead of being rewritten.
const cfg = readFileSync('src/config.js', 'utf8');
const nextCfg = /ASSET_V/.test(cfg)
  ? cfg.replace(/(ASSET_V\s*=\s*')\d+(')/, `$1${v}$2`)
  : cfg.replace(/^(export const PACK_ID.*)$/m, `$1\n// Cache key for runtime fetches. Bump with \`npm run cache-bust\`; see that script for why.\nexport const ASSET_V = '${v}';`);
if (nextCfg !== cfg) { writeFileSync('src/config.js', nextCfg); }

console.log(`Cache key is now v=${v} (${changed} file(s) rewritten).`);
console.log('Commit and push; the CDN sees URLs it has never cached.');
