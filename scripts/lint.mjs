#!/usr/bin/env node
// Zero-dependency sanity checks: every script parses, and the house rules hold.
//   node scripts/lint.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const walk = (dir, out = []) => { for (const e of readdirSync(dir)) { const p = join(dir, e); if (e === 'node_modules' || e.startsWith('.')) continue; statSync(p).isDirectory() ? walk(p, out) : out.push(p); } return out; };
const files = ['src', 'scripts', 'tests'].flatMap((d) => walk(d)).concat('server.mjs');
const js = files.filter((f) => /\.(m?js)$/.test(f));
let errors = 0;
const fail = (m) => { console.error(`  ERROR ${m}`); errors++; };

for (const f of js) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (e) { fail(`${f} does not parse:\n${String(e.stderr).trim().split('\n').slice(0, 3).join('\n')}`); }
}

// House rules. These are the invariants the design depends on; see CLAUDE.md.
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
if (pkg.dependencies && Object.keys(pkg.dependencies).length) fail('package.json has runtime dependencies. This project ships zero dependencies so Hostinger\'s build cannot fail.');
for (const f of js.filter((x) => x.startsWith('src/'))) {
  const t = readFileSync(f, 'utf8');
  if (/\brequire\s*\(/.test(t)) fail(`${f} uses require(). src/ is browser ES modules only.`);
}
const conflicts = readFileSync('src/conflicts.js', 'utf8');
for (const bad of ['./state.js', './canvas.js', 'document.', 'window.']) {
  if (conflicts.includes(bad)) fail(`src/conflicts.js references ${bad}. It must stay a pure function so tests and a future server can use it.`);
}

console.log(`  checked ${js.length} script(s)`);
if (errors) { console.error(`\nlint FAILED: ${errors} error(s)`); process.exit(1); }
console.log('lint OK');
