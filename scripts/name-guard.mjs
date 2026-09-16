#!/usr/bin/env node
// Refuses to let a real name reach the repository.
//
//   node scripts/name-guard.mjs              structural checks + secret scan of tracked files
//   node scripts/name-guard.mjs --staged     scan what is about to be committed (used by the pre-commit hook)
//   node scripts/name-guard.mjs --files a b  scan specific files
//
// Two layers:
//   1. STRUCTURAL — always runs, needs no secrets, safe in CI. Asserts the secret files are not
//      tracked, resources.csv has no name column, every owner_id resolves to a role id, and
//      roster.enc really is ciphertext.
//   2. SECRET SCAN — only where roster.local.csv / scripts/scrub.local.txt exist (a maintainer's
//      machine). Matches real names against the content. CI has neither file and says so.
//      In scrub.local.txt a line starting with '-' allows that word on its own, for surnames that
//      are also ordinary English words; the full-name phrase is still refused. That list lives in
//      the gitignored file on purpose — a committed list of "words that are also names" would leak
//      the very first names it exists to protect.
//
// Matched names are printed only in the secret scan, which by definition runs where the names
// already live on disk. Nothing this script writes to stdout in CI can leak a name.
//
// A line that legitimately carries a name (a copyright notice, say) can carry the marker
// `name-guard:allow` in a comment. The exemption is one line wide and shows up in code review.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parseCsv } from '../src/csv.js';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const lower = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

const ALLOW_MARKER = 'name-guard:allow'; // put this in a comment on a line that legitimately carries a name
let allowed = 0;
const errors = [], notes = [];
const fail = (m) => errors.push(m);

// ---------- which files to scan ----------
const listed = has('--files') ? argv.slice(argv.indexOf('--files') + 1)
  : has('--staged') ? git('diff', '--cached', '--name-only', '--diff-filter=ACMR').split('\n').filter(Boolean)
  : git('ls-files').split('\n').filter(Boolean);
const files = listed.filter((f) => existsSync(f));

// ---------- 1. structural ----------
const tracked = new Set(git('ls-files').split('\n').filter(Boolean));
for (const secret of ['roster.local.csv', 'scripts/scrub.local.txt']) {
  if (tracked.has(secret)) fail(`${secret} is tracked by git. It holds real names and must stay ignored.`);
}
for (const f of tracked) {
  if (f.startsWith('source/')) fail(`${f} is tracked. Source workbooks contain names; keep them in the shared Drive folder.`);
  if (f.endsWith('.xlsx')) fail(`${f} is tracked. Spreadsheets contain names.`);
}

for (const res of [...tracked].filter((f) => /^packs\/.+\/resources\.csv$/.test(f))) {
  const rows = parseCsv(readFileSync(res, 'utf8'));
  const cols = Object.keys(rows[0] ?? {});
  if (cols.some((c) => /^(name|display|full[_ ]?name|person)$/i.test(c))) fail(`${res} has a "${cols.find((c) => /^(name|display|full[_ ]?name|person)$/i.test(c))}" column. Resources carry roles only; names live in the encrypted roster.`);
  const ids = new Set(rows.map((r) => r.id));
  const acts = res.replace(/resources\.csv$/, 'activities.csv');
  if (existsSync(acts)) for (const a of parseCsv(readFileSync(acts, 'utf8'))) {
    if (a.owner_id && !ids.has(a.owner_id)) fail(`${acts}: activity "${a.id}" has owner_id "${a.owner_id}", which is not a role id in ${res}. Owners must be role ids, never names.`);
  }
}

for (const enc of [...tracked].filter((f) => f.endsWith('.enc'))) {
  let blob;
  try { blob = JSON.parse(readFileSync(enc, 'utf8')); } catch { fail(`${enc} is not valid JSON.`); continue; }
  const allowed = new Set(['format', 'version', 'kdf', 'iterations', 'salt', 'iv', 'ct', 'count', 'createdAt']);
  const extra = Object.keys(blob).filter((k) => !allowed.has(k));
  if (extra.length) fail(`${enc} has unexpected key(s) ${extra.join(', ')} — only the encrypted envelope may be committed.`);
  if (blob.format !== 'program-scheduler/roster') fail(`${enc}: unexpected format "${blob.format}".`);
  if (!blob.ct || !blob.salt || !blob.iv) fail(`${enc} is missing salt/iv/ct.`);
  else {
    const raw = Buffer.from(blob.ct, 'base64').toString('utf8');
    if (/"(id|name)"\s*:/.test(raw)) fail(`${enc} ciphertext looks like plaintext JSON. It is not encrypted.`);
  }
}

// ---------- 2. secret scan ----------
const secrets = new Set(), common = new Set();
if (existsSync('scripts/scrub.local.txt')) {
  for (const line of readFileSync('scripts/scrub.local.txt', 'utf8').split('\n')) {
    const w = lower(line);
    if (!w || w.startsWith('#')) continue;
    w.startsWith('-') ? common.add(w.slice(1).trim()) : secrets.add(w);
  }
}
if (existsSync('roster.local.csv')) {
  for (const r of parseCsv(readFileSync('roster.local.csv', 'utf8'))) {
    const toks = String(r.name ?? '').trim().split(/\s+/).filter(Boolean);
    if (toks.length > 1) secrets.add(lower(r.name));
    for (const t of toks) if (t.length > 2 && !common.has(lower(t))) secrets.add(lower(t));
  }
}
for (const c of common) secrets.delete(c);

if (!secrets.size) {
  notes.push('No roster.local.csv or scripts/scrub.local.txt on this machine, so only the structural checks ran.');
  notes.push('That is expected in CI. Run this locally before pushing to get the full name scan.');
} else {
  const skip = /\.(enc|png|jpg|jpeg|gif|ico|pdf|zip|xlsx|woff2?)$/i;
  for (const f of files) {
    if (skip.test(f) || f === 'roster.local.csv' || f === 'scripts/scrub.local.txt') continue;
    let text; try { text = readFileSync(f, 'utf8'); } catch { continue; }
    text.split('\n').forEach((line, i) => {
      if (line.includes(ALLOW_MARKER)) { allowed++; return; } // deliberate, and visible in the diff
      const l = lower(line);
      const words = new Set(l.split(/[^a-z']+/).filter(Boolean));
      for (const s of secrets) {
        if (s.includes(' ') ? l.includes(s) : words.has(s)) fail(`${f}:${i + 1} contains the name "${s}".`);
      }
    });
  }
  notes.push(`Scanned ${files.length} file(s) against ${secrets.size} name token(s)${allowed ? `, skipping ${allowed} line(s) marked ${ALLOW_MARKER}` : ''}.`);
}

// ---------- report ----------
for (const n of notes) console.log(`  ${n}`);
if (errors.length) {
  console.error(`\nname-guard FAILED (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error('\nNothing here may be committed. Names belong in roster.local.csv (gitignored) and reach the site only through public/roster.enc.');
  process.exit(1);
}
console.log('name-guard OK');
