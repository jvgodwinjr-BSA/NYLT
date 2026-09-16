#!/usr/bin/env node
// scripts/qm-tasks-source.json -> rows in scripts/extras-nylt-27-1.csv, which npm run import-catalog
// then folds into the pack.
//
//   npm run import-qm-tasks
//
// The tasks arrived as a schedule file full of customActivities with no placements. That shape
// is wrong twice over: loading it would have replaced the live schedule with nothing, and
// `category` / `suggested_sd` have nowhere to live in a placement. They are catalog material,
// so they belong in the pack — where they survive any reload, are searchable by tag, and get
// reviewed by the name guard like every other committed row.
//
// Idempotent: re-running replaces the rows this script owns rather than appending duplicates.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseCsv, toCsv } from '../src/csv.js';

// Gitignored: the raw upload still names people. Same rule as the source workbooks — keep it in
// the shared Drive folder. What gets committed is the scrubbed output.
const SRC = 'scripts/qm-tasks-source.json';
const EXTRAS = 'scripts/extras-nylt-27-1.csv';
const SOURCE = 'qm-tasks';
const COLUMNS = ['id', 'name', 'duration_min', 'type', 'audience', 'delivery', 'soft_vs_hard', 'tags', 'notes', 'source'];

const slug = (s) => String(s ?? '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const snap = (m) => Math.max(15, Math.round(Number(m) / 15) * 15);

// The uploaded notes named individual staff. Names never go in the repository, and roles read
// just as well — more durably, since people change between courses. The replacements are derived
// from roster.local.csv and scripts/scrub.local.txt rather than written here: a hardcoded list of
// names in a committed script is the very leak this is meant to prevent, and the name guard
// rejected exactly that.
//
// scrub.local.txt covers what the roster cannot: a name the author wrote a different way from the
// roster's spelling, a past year's staff, or a set of initials. A `Name -> ROLE-ID` line there is
// both refused by the guard and substituted here.
function roleReplacements() {
  const common = new Set();
  if (existsSync('scripts/common-name-words.txt')) {
    for (const line of readFileSync('scripts/common-name-words.txt', 'utf8').split('\n')) {
      const w = line.trim().toLowerCase();
      if (w && !w.startsWith('#')) common.add(w);
    }
  }
  const full = [], byToken = new Map();
  const add = (name, roleId) => {
    const label = ROLE_LABEL[roleId] ?? roleId;
    full.push([name, label]);
    for (const tok of name.split(/\s+/)) {
      if (tok.length <= 2 || common.has(tok.toLowerCase())) continue;
      const key = tok.toLowerCase();
      if (!byToken.has(key)) byToken.set(key, { tok, labels: new Set() });
      byToken.get(key).labels.add(label);
    }
  };
  if (existsSync('roster.local.csv')) {
    for (const r of parseCsv(readFileSync('roster.local.csv', 'utf8'))) {
      const name = String(r.name ?? '').trim();
      if (name && r.id) add(name, r.id);
    }
  }
  if (existsSync('scripts/scrub.local.txt')) {
    for (const line of readFileSync('scripts/scrub.local.txt', 'utf8').split('\n')) {
      const [rawName, rawRole] = line.split('->');
      const name = rawName.trim();
      if (!name || name.startsWith('#') || name.startsWith('-') || !rawRole) continue;
      add(name, rawRole.trim());
    }
  }
  // Two people can share a surname, and this roster has three such pairs. A bare surname does not
  // say which of them a note meant, so guessing would silently attribute a task to the wrong
  // person. Leave those tokens alone: the self-check below refuses to write, and the fix is an
  // explicit `Name -> ROLE-ID` line in scrub.local.txt.
  const out = [...full];
  for (const { tok, labels } of byToken.values()) if (labels.size === 1) out.push([tok, [...labels][0]]);
  // Longest first, so a full name is replaced before either of its halves.
  return out.sort((a, b) => b[0].length - a[0].length);
}

// Every name token the guard knows about, so this script can refuse to write output that still
// carries one instead of leaving it for the pre-commit hook. Only the activity id and field are
// reported — never the name, which would put it in whatever log or transcript is watching.
function knownNameTokens() {
  const toks = new Set();
  const common = new Set();
  if (existsSync('scripts/common-name-words.txt')) {
    for (const line of readFileSync('scripts/common-name-words.txt', 'utf8').split('\n')) {
      const w = line.trim().toLowerCase();
      if (w && !w.startsWith('#')) common.add(w);
    }
  }
  const eat = (name) => {
    for (const tok of String(name).trim().split(/\s+/)) {
      const w = tok.toLowerCase();
      if (w.length > 2 && !common.has(w)) toks.add(w);
    }
  };
  if (existsSync('roster.local.csv')) for (const r of parseCsv(readFileSync('roster.local.csv', 'utf8'))) eat(r.name ?? '');
  if (existsSync('scripts/scrub.local.txt')) {
    for (const line of readFileSync('scripts/scrub.local.txt', 'utf8').split('\n')) {
      const w = line.split('->')[0].trim();
      if (w && !w.startsWith('#') && !w.startsWith('-')) eat(w);
    }
  }
  return toks;
}

// How a role should read in prose. Anything not listed falls back to the bare role id.
const ROLE_LABEL = {
  'QM-ADULT': 'the adult QM', 'QM-YOUTH': 'the youth QM', 'ASPL-QM': 'ASPL-QM',
  CHO: 'the CHO', CD: 'the Course Director', ACD: 'ACD', SPL: 'the SPL',
};

const REPLACEMENTS = roleReplacements();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A first name is often written with a surname initial after it. Replacing only the name leaves a
// dangling "ACD G", which still points at a person. Swallow a single capitalised letter after the
// match — capitalised, so an article or a stray word is left alone.
const scrub = (s) => REPLACEMENTS.reduce(
  (t, [name, role]) => t.replace(
    new RegExp(`\\b${esc(name)}\\b(\\s+([A-Za-z])\\.?(?![A-Za-z]))?`, 'gi'),
    (_m, tail, initial) => (initial && initial === initial.toUpperCase() ? role : role + (tail ?? ''))),
  String(s ?? ''));

const src = JSON.parse(readFileSync(SRC, 'utf8'));
const tasks = src.customActivities ?? [];
if (!tasks.length) { console.error(`${SRC} has no customActivities`); process.exit(1); }

const NAME_TOKENS = knownNameTokens();
const carriesName = (s) => {
  const words = new Set(String(s ?? '').toLowerCase().split(/[^a-z']+/).filter(Boolean));
  return [...NAME_TOKENS].some((t) => words.has(t));
};

const snapped = [], renamed = [];
const rows = tasks.map((t) => {
  const duration = snap(t.duration_min);
  if (duration !== Number(t.duration_min)) snapped.push(`${t.id}: ${t.duration_min} -> ${duration}`);
  // The ids are slugs of the titles, so a title that named someone put that name in the id too.
  // Re-slug only those: the rest keep the id the author wrote, including the one that was
  // truncated by hand.
  const name = scrub(t.name);
  const id = carriesName(t.id) ? slug(name) : t.id;
  if (id !== t.id) renamed.push(id);
  return {
    id,
    name,
    duration_min: duration,
    type: t.type || 'staff_task',
    // The file said "qm_staff", which is not one of the three the model allows. The QM-ness is
    // carried by the tags instead, where the rail can search it.
    audience: 'staff',
    delivery: 'Staff',
    soft_vs_hard: t.soft_vs_hard === 'hard' ? 'hard' : 'soft',
    tags: ['qm', slug(t.category), slug(t.suggested_sd)].filter(Boolean).join('|'),
    notes: scrub(t.notes),
    source: SOURCE,
  };
});

const ids = new Set();
for (const r of rows) { if (ids.has(r.id)) { console.error(`duplicate id ${r.id}`); process.exit(1); } ids.add(r.id); }

const survivors = [];
for (const r of rows) for (const field of ['id', 'name', 'notes']) {
  if (carriesName(r[field])) survivors.push(`${r.id}.${field}`);
}
if (survivors.length) {
  console.error(`REFUSING to write ${EXTRAS}: a name survived the scrub in ${survivors.length} field(s):`);
  for (const s of survivors) console.error(`  ${s}`);
  console.error(`\nAdd a "Name -> ROLE-ID" line to scripts/scrub.local.txt for each, then re-run.`);
  console.error('Run `npm run check:names` to see which name it is — that prints names, so do it in a terminal, not an agent.');
  process.exit(1);
}

const existing = parseCsv(readFileSync(EXTRAS, 'utf8'));
const kept = existing.filter((r) => (r.source ?? '') !== SOURCE);
const clash = kept.filter((r) => ids.has(r.id)).map((r) => r.id);
if (clash.length) { console.error(`these ids already exist in ${EXTRAS} under another source: ${clash.join(', ')}`); process.exit(1); }

writeFileSync(EXTRAS, toCsv([...kept.map((r) => ({ ...r, source: r.source || 'extras' })), ...rows], COLUMNS));
console.log(`Wrote ${EXTRAS}: ${kept.length} existing + ${rows.length} ${SOURCE} rows`);
if (snapped.length) { console.log(`  snapped to the 15-minute grid (${snapped.length}):`); for (const s of snapped) console.log(`    ${s}`); }
if (renamed.length) { console.log(`  re-slugged after scrubbing a name out of the title (${renamed.length}):`); for (const r of renamed) console.log(`    ${r}`); }
console.log('Now run: npm run import-catalog');
