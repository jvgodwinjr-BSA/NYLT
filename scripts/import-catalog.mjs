#!/usr/bin/env node
// xlsx -> packs/<pack>/activities.csv
//
//   node scripts/import-catalog.mjs [--pack nylt-27-1] [--authority source/...xlsx] [--spine source/...xlsx]
//
// Presentations come from the Presentations Authority workbook ("All modules" sheet) with exact durations.
// Non-syllabus items (meals, ceremonies, meetings, games, logistics) come from last year's Day 1..6 sheets;
// their durations are inferred from consecutive 15-minute block runs and are a DRAFT for review.
// Extra 27-1-specific items come from scripts/extras-<pack>.csv.
//
// This script never emits a person's name. It refuses to write a pack that contains any name in
// roster.local.csv or any word in scripts/scrub.local.txt (both gitignored).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { readWorkbook, sheetRows, excelTimeToMinutes } from './xlsx.mjs';
import { parseCsv, toCsv } from '../src/csv.js';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1]] : []).filter(Boolean));
const pack = args.pack ?? 'nylt-27-1';
const authorityPath = args.authority ?? 'source/NYLT_2027_Presentations_Authority.xlsx';
const spinePath = args.spine ?? 'source/26-1_Schedule_BLACKWARRIOR.xlsx';
const rules = JSON.parse(readFileSync(new URL('./import-rules.json', import.meta.url), 'utf8'));

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const lower = (s) => norm(s).toLowerCase();
const renameMap = new Map(Object.entries(rules.rename).map(([k, v]) => [lower(k), v]));
const slug = (s) => norm(s).toLowerCase().replace(/[—–]/g, '-').replace(/['’"“”]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------- 1. Presentations from the Authority sheet ----------
// Read the three tabs the Course Director actually edits, not "All modules".
// The workbook says "type once; other views follow", but it holds no formulas —
// the four tabs are independent copies and have already drifted. "All modules" is
// treated as a stale duplicate and only used to warn about disagreement.
const AUTHORITY_TABS = ['Troop', 'TG Patrol', 'Flags'];
const auth = readWorkbook(authorityPath);
const present = AUTHORITY_TABS.filter((t) => auth.sheets[t]);
if (!present.length) throw new Error(`Authority workbook has none of: ${AUTHORITY_TABS.join(', ')}`);
const tabRows = present.map((t) => sheetRows(auth.sheets[t]).filter((r) => r && r[0]));
const header = tabRows[0][0].map(norm);
for (const [i, tr] of tabRows.entries()) {
  const h = tr[0].map(norm).join('|');
  if (h !== header.join('|')) throw new Error(`Tab "${present[i]}" has different columns than "${present[0]}"`);
}
const rows = [tabRows[0][0], ...tabRows.flatMap((tr) => tr.slice(1))];
const col = (name) => header.indexOf(name);
const H = { name: col('Presentation'), delivery: col('Delivery'), day: col('Syllabus day'), desc: col('Short description'),
  owner: col('Owner'), who: col("Who's required"), psd: col('Practice SD'), ready: col('Ready'), group: col('Group'),
  time: col('Time allowed'), loc: col('Recommended location') };
for (const [k, v] of Object.entries(H)) if (v < 0) throw new Error(`Authority sheet is missing column for ${k}`);

const presentations = [];
for (const r of rows.slice(1)) {
  const name = norm(r[H.name]);
  const delivery = /patrol|tg/i.test(norm(r[H.delivery])) ? 'TG' : 'Troop';
  const group = (norm(r[H.group]).match(/^[ABC]/) || ['A'])[0];
  const mins = Number((norm(r[H.time]).match(/\d+/) || [group === 'C' ? 15 : 60])[0]);
  const who = lower(r[H.who]);
  const audience = who.includes('patrol') && !who.includes('all participants') ? 'patrol' : 'troop';
  const location = group === 'C' ? norm(r[H.loc]) : '';
  presentations.push({
    id: slug(name), name, duration_min: mins, type: 'presentation', audience, delivery, group,
    syllabus_day: norm(r[H.day]), soft_vs_hard: 'hard', practice_sd: norm(r[H.psd]).toUpperCase(),
    owner_id: norm(r[H.owner]), ready: norm(r[H.ready]) || 'Not started', location,
    tags: ['syllabus', delivery === 'TG' ? 'tg|patrol' : 'troop', group === 'C' ? 'flag|ceremony' : 'module'].join('|'),
    notes: norm(r[H.desc]), source: 'authority',
  });
}
const presByName = new Map(presentations.map((p) => [lower(p.name), p]));
console.log(`  presentations from ${present.map((t, i) => `${t} (${tabRows[i].length - 1})`).join(', ')}`);

// "All modules" is a hand-maintained duplicate with no formulas behind it. Warn rather than
// silently prefer one copy, so drift gets noticed instead of quietly deciding the import.
if (auth.sheets['All modules']) {
  const all = sheetRows(auth.sheets['All modules']).filter((r) => r && r[0]);
  const ah = all[0].map(norm);
  const col = (n) => ah.indexOf(n);
  const drift = [];
  const seen = new Set();
  for (const r of all.slice(1)) {
    const name = norm(r[col('Presentation')]);
    seen.add(lower(name));
    const p = presByName.get(lower(name));
    if (!p) { drift.push(`"${name}" is on All modules but not on ${present.join('/')}`); continue; }
    for (const [label, idx, mine] of [['Owner', col('Owner'), p.owner_id], ['Practice SD', col('Practice SD'), p.practice_sd], ['Ready', col('Ready'), p.ready]]) {
      const theirs = norm(r[idx]);
      if (idx >= 0 && theirs && theirs !== norm(mine)) drift.push(`"${name}" ${label}: All modules says "${theirs}", ${present.join('/')} says "${norm(mine) || '(blank)'}"`);
    }
  }
  for (const p of presentations) if (!seen.has(lower(p.name))) drift.push(`"${p.name}" is missing from All modules`);
  if (drift.length) {
    console.warn(`  NOTE: "All modules" disagrees with the edited tabs in ${drift.length} place(s) and was ignored:`);
    for (const d of drift.slice(0, 8)) console.warn(`    - ${d}`);
    if (drift.length > 8) console.warn(`    ... and ${drift.length - 8} more`);
    console.warn('    The edited tabs win. Fix "All modules" in the workbook, or stop maintaining it.');
  }
}

// ---------- 2. Spine items from last year's Day sheets ----------
const spine = readWorkbook(spinePath);
const observed = new Map(); // canonical name -> { runs: [], days: Set }
const templateDays = {}; // day number -> [{ name, start_min, duration_min }]
const scrubInitials = (s) => norm(s).replace(/\s+-\s+[A-Z]{2,3}(\s*\(.*\))?$/, '');
for (const sheet of spine.sheetNames.filter((n) => /^Day \d$/.test(n))) {
  const day = Number(sheet.slice(-1));
  const grid = sheetRows(spine.sheets[sheet]);
  const timeRows = [];
  grid.forEach((r, i) => { if (r && typeof r[0] === 'number' && r[0] < 1) timeRows.push(i); });
  const blocks = [];
  for (const i of timeRows) {
    const label = norm(grid[i]?.[1]);
    if (label) blocks.push({ label, start: excelTimeToMinutes(grid[i][0]), run: 1 });
    else if (blocks.length) blocks[blocks.length - 1].run++;
  }
  templateDays[day] = [];
  for (const b of blocks) {
    let name = scrubInitials(b.label);
    name = renameMap.get(lower(name)) ?? name;
    for (const [re, to] of rules.rename_regex ?? []) if (new RegExp(re, 'i').test(name)) name = to;
    if (rules.skip.some((s) => lower(s) === lower(name))) continue;
    const entry = observed.get(name) ?? { runs: [], days: new Set() };
    entry.runs.push(b.run * 15);
    entry.days.add(day);
    observed.set(name, entry);
    templateDays[day].push({ name, start_min: b.start, duration_min: b.run * 15 });
  }
}

const mode = (xs) => [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map())].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
const typeOf = (name) => {
  if (rules.type_overrides[name]) return rules.type_overrides[name];
  const l = lower(name);
  for (const [type, words] of rules.type_keywords) if (words.some((w) => l.includes(w))) return type;
  return 'other';
};

const spineItems = [];
for (const [name, { runs, days }] of observed) {
  const pres = presByName.get(lower(name));
  if (pres) { pres.notes_spine = `26-1 observed: ${[...new Set(runs)].sort((a, b) => a - b).join('/')} min on day ${[...days].sort().join(',')}`; continue; }
  const type = typeOf(name);
  const staff = rules.staff_only.includes(name);
  spineItems.push({
    id: slug(name), name, duration_min: rules.duration_overrides[name] ?? mode(runs), type,
    audience: staff ? 'staff' : 'troop', delivery: staff ? 'Staff' : 'Troop', group: '', syllabus_day: '',
    soft_vs_hard: rules.hard_types.includes(type) ? 'hard' : 'soft', practice_sd: '', owner_id: '', ready: '', location: '',
    tags: ['spine-26-1', type].join('|'),
    notes: `From 26-1 schedule: ${[...new Set(runs)].sort((a, b) => a - b).join('/')} min, day ${[...days].sort().join(',')}. Review duration.`,
    source: 'spine-26-1',
  });
}
for (const p of presentations) if (p.notes_spine) { p.notes = p.notes ? `${p.notes} | ${p.notes_spine}` : p.notes_spine; delete p.notes_spine; }

// ---------- 3. Extras ----------
const extrasPath = new URL(`./extras-${pack}.csv`, import.meta.url);
const extras = existsSync(extrasPath) ? parseCsv(readFileSync(extrasPath, 'utf8')).map((e) => ({
  id: e.id, name: e.name, duration_min: Number(e.duration_min), type: e.type, audience: e.audience, delivery: e.delivery, group: '',
  syllabus_day: '', soft_vs_hard: e.soft_vs_hard, practice_sd: '', owner_id: '', ready: '', location: '', tags: e.tags, notes: e.notes,
  // Extras carry their own provenance when they have one, so a row's origin stays visible in
  // activities.csv — qm-tasks came from scripts/qm-tasks-source.json, not from a workbook.
  source: e.source || 'extras',
})) : [];

// ---------- 4. Assemble, scrub, write ----------
const typeOrder = ['presentation', 'meal', 'ceremony', 'meeting', 'outpost', 'game', 'logistics', 'staff_task', 'other'];
const all = [...presentations.sort((a, b) => a.group.localeCompare(b.group) || Number(a.syllabus_day) - Number(b.syllabus_day)),
  ...spineItems.sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type) || a.name.localeCompare(b.name)), ...extras];
const ids = new Set();
for (const a of all) { if (ids.has(a.id)) throw new Error(`Duplicate id ${a.id}`); ids.add(a.id); }

const scrub = new Set();
const scrubFile = new URL('./scrub.local.txt', import.meta.url);
if (existsSync(scrubFile)) for (const line of readFileSync(scrubFile, 'utf8').split('\n')) { const w = lower(line.split('->')[0]); if (w && !w.startsWith('#') && !w.startsWith('-')) scrub.add(w); }
const common = new Set();
const commonWords = new URL('./common-name-words.txt', import.meta.url);
if (existsSync(commonWords)) for (const line of readFileSync(commonWords, 'utf8').split('\n')) { const w = lower(line); if (w && !w.startsWith('#')) common.add(w); }
if (existsSync(scrubFile)) for (const line of readFileSync(scrubFile, 'utf8').split('\n')) { const w = lower(line.split('->')[0]); if (w.startsWith('-')) common.add(w.slice(1).trim()); }
if (existsSync('roster.local.csv')) for (const r of parseCsv(readFileSync('roster.local.csv', 'utf8'))) {
  const toks = norm(r.name).split(/\s+/);
  if (toks.length > 1) scrub.add(lower(r.name));
  for (const w of toks) if (w.length > 2 && !common.has(lower(w))) scrub.add(lower(w));
}
const offenders = [];
for (const a of all) for (const [k, v] of Object.entries(a)) {
  const words = lower(v).split(/[^a-z']+/);
  for (const w of scrub) if (w.includes(' ') ? lower(v).includes(w) : words.includes(w)) offenders.push(`${a.id}.${k} contains "${w}"`);
}
if (offenders.length) { console.error('REFUSING to write pack: names found in output\n  ' + offenders.join('\n  ')); process.exit(1); }

const columns = ['id', 'name', 'duration_min', 'type', 'audience', 'delivery', 'group', 'syllabus_day', 'soft_vs_hard', 'practice_sd', 'owner_id', 'ready', 'location', 'tags', 'notes', 'source'];
writeFileSync(`packs/${pack}/activities.csv`, toCsv(all, columns));
// Templates: last year's day layouts, by activity id, so a course weekend can start from a real schedule.
const byName = new Map(all.map((a) => [lower(a.name), a.id]));
const templates = {};
for (const [day, items] of Object.entries(templateDays)) {
  templates[`26-1-day-${day}`] = {
    label: `26-1 Day ${day}`, source: 'spine-26-1',
    items: items.filter((i) => byName.has(lower(i.name)) && !rules.skip.some((s) => lower(s) === lower(i.name)))
      .map((i) => ({ activity_id: byName.get(lower(i.name)), start_min: i.start_min, duration_min: rules.duration_overrides[i.name] ?? i.duration_min })),
  };
}
writeFileSync(`packs/${pack}/templates.json`, JSON.stringify(templates, null, 1));
const counts = all.reduce((m, a) => (m[a.type] = (m[a.type] ?? 0) + 1, m), {});
console.log(`Wrote packs/${pack}/activities.csv: ${all.length} activities`, counts);
console.log(`  ${presentations.length} presentations from Authority, ${spineItems.length} from 26-1 spine (review durations), ${extras.length} extras`);
