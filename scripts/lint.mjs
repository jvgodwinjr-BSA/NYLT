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
// The pure rule engines. Keeping these free of DOM and state means the tests and a future
// PHP/Node server can call them directly.
for (const pure of ['src/conflicts.js', 'src/progress.js', 'src/validateSchedule.js']) {
  const t = readFileSync(pure, 'utf8');
  for (const bad of ['./state.js', './canvas.js', 'document.', 'window.']) {
    if (t.includes(bad)) fail(`${pure} references ${bad}. It must stay a pure function so tests and a future server can use it.`);
  }
}

// append() with a null argument writes the literal string "null" into the page — el() filters its
// own children, a direct .append(...) does not. This has shipped twice, so it is a rule now.
//
// Only a TOP-LEVEL argument matters: `append(el('p', {}, x ? y : null))` is fine, because the null
// is el()'s child and el() drops it. So the arguments are split at depth-zero commas, skipping
// strings and template literals, rather than pattern-matched across the whole call.
function topLevelArgs(text, from) {
  const args = [];
  let depth = 0, start = from, quote = null;
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' && depth === 0) { args.push(text.slice(start, i)); return args; }
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) { args.push(text.slice(start, i)); start = i + 1; }
  }
  return args;
}
for (const f of js.filter((x) => x.startsWith('src/'))) {
  const t = readFileSync(f, 'utf8');
  for (let i = t.indexOf('.append('); i !== -1; i = t.indexOf('.append(', i + 1)) {
    for (const arg of topLevelArgs(t, i + '.append('.length)) {
      if (!/(^|\?[^?]*):\s*null\s*$|^\s*null\s*$/.test(arg.trim())) continue;
      fail(`${f}:${t.slice(0, i).split('\n').length} passes a possibly-null argument to append(), which inserts the string "null". Spread a .filter(Boolean) list instead.`);
      break;
    }
  }
}

console.log(`  checked ${js.length} script(s)`);
if (errors) { console.error(`\nlint FAILED: ${errors} error(s)`); process.exit(1); }
console.log('lint OK');
