#!/usr/bin/env node
// Check a saved schedule file against a content pack before trusting it.
//
//   npm run check:schedule -- path/to/schedule.json [--pack nylt-27-1]
//
// Answers "will this import, and what will it look like when it does". Reports three levels:
// BLOCKING (the placement cannot render or will be dropped), WARNING (it renders but is wrong
// or misaligned), and the conflict engine's own violations, which are the app's normal output
// rather than import problems.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { parseCsv } from '../src/csv.js';
import { computeDays } from '../src/pack.js';
import { evaluate } from '../src/conflicts.js';
import { SLOT_MIN } from '../src/config.js';

const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith('--'));
const packId = (() => { const i = argv.indexOf('--pack'); return i >= 0 ? argv[i + 1] : readdirSync('packs')[0]; })();
if (!file) { console.error('Usage: npm run check:schedule -- <file.json> [--pack <id>]'); process.exit(2); }

const dir = `packs/${packId}`;
const read = (f) => parseCsv(readFileSync(`${dir}/${f}`, 'utf8'));
const bool = (v) => /^(true|1|yes)$/i.test(String(v));
const packActivities = read('activities.csv').map((a) => ({ ...a, duration_min: Number(a.duration_min), syllabus_day: a.syllabus_day ? Number(a.syllabus_day) : null, tags: a.tags ? a.tags.split('|') : [] }));
const tracks = read('tracks.csv').map((t) => ({ ...t, is_all_hands: bool(t.is_all_hands) }));
const events = read('events.csv').map((e) => ({ ...e, days: computeDays(e), tracks: tracks.filter((t) => t.event_id === e.id) }));
const constraints = read('constraints.csv').map((c) => { try { return { ...c, params: c.params ? JSON.parse(c.params) : {} }; } catch { return { ...c, params: {} }; } });

const doc = JSON.parse(readFileSync(file, 'utf8'));
const blocking = [], warning = [];
const B = (m) => blocking.push(m);
const W = (m) => warning.push(m);

if (doc.format !== 'program-scheduler/schedule') B(`format is "${doc.format}" — Load JSON refuses anything but "program-scheduler/schedule"`);
if (doc.pack && doc.pack !== packId) W(`file says pack "${doc.pack}", validating against "${packId}" — the app asks before loading`);

// Custom activities must carry every field the catalog and canvas read.
const REQUIRED = ['id', 'name', 'duration_min', 'type', 'audience', 'delivery', 'soft_vs_hard', 'tags'];
const customs = doc.customActivities ?? [];
for (const c of customs) {
  const missing = REQUIRED.filter((k) => c[k] === undefined || c[k] === null);
  if (missing.length) B(`custom activity "${c.id ?? '(no id)'}" is missing ${missing.join(', ')} — the left rail reads these`);
  if (c.audience && !['troop', 'patrol', 'staff'].includes(c.audience)) W(`custom activity "${c.id}" has audience "${c.audience}" (expected troop, patrol or staff)`);
}
const byId = new Map([...packActivities, ...customs].map((a) => [a.id, a]));
const evById = new Map(events.map((e) => [e.id, e]));

const placements = doc.placements ?? [];
const seenIds = new Set();
for (const p of placements) {
  const where = `${p.event_id ?? '?'} ${p.day ?? '?'} ${String(p.activity_id ?? '?')}`;
  if (seenIds.has(p.id)) B(`duplicate placement id "${p.id}"`); else seenIds.add(p.id);
  if (!byId.has(p.activity_id)) B(`${where}: no activity "${p.activity_id}" in the pack or in customActivities`);
  const ev = evById.get(p.event_id);
  if (!ev) { B(`${where}: no event "${p.event_id}"`); continue; }
  const tr = ev.tracks.find((t) => t.id === p.track_id);
  if (!tr) B(`${where}: no lane "${p.track_id}" on ${ev.id} (lanes are ${ev.tracks.map((t) => t.id).join(', ')})`);
  const day = ev.days.find((d) => d.date === p.day);
  if (!day) { B(`${where}: ${p.day} is not a day of ${ev.id} (${ev.days.map((d) => d.date).join(', ')})`); continue; }
  const end = p.start_min + p.duration_min;
  if (p.start_min < day.startMin) W(`${where}: starts ${fmt(p.start_min)}, before this day opens at ${fmt(day.startMin)}`);
  if (end > day.endMin) W(`${where}: ends ${fmt(end)}, after this day closes at ${fmt(day.endMin)}`);
  if (p.start_min % SLOT_MIN) W(`${where}: starts at ${fmt(p.start_min)}, off the ${SLOT_MIN}-minute grid`);
  if (p.duration_min % SLOT_MIN) W(`${where}: lasts ${p.duration_min} min, not a multiple of ${SLOT_MIN}`);
}
function fmt(m) { const h = Math.floor(m / 60) % 24, mm = String(m % 60).padStart(2, '0'); return `${h % 12 || 12}:${mm} ${h >= 12 ? 'PM' : 'AM'}`; }

const group = (list) => { const m = new Map(); for (const x of list) { const k = x.replace(/^\S+ \d{4}-\d{2}-\d{2} /, '').replace(/"[^"]*"/g, '"…"'); m.set(k, (m.get(k) ?? 0) + 1); } return m; };
const report = (label, list) => {
  if (!list.length) { console.log(`  ${label}: none`); return; }
  console.log(`  ${label}: ${list.length}`);
  for (const x of list.slice(0, 40)) console.log(`    - ${x}`);
  if (list.length > 40) console.log(`    ... and ${list.length - 40} more`);
};

console.log(`Schedule: ${file}`);
console.log(`Pack:     ${packId}  (${placements.length} placements, ${customs.length} custom activities)\n`);
report('BLOCKING', blocking);
console.log();
report('WARNING', warning);

if (!blocking.length) {
  const v = evaluate({ placements, activities: [...packActivities, ...customs], events, constraints });
  const hard = v.filter((x) => x.severity === 'hard' && !x.quiet);
  const soft = v.filter((x) => x.severity !== 'hard' && !x.quiet);
  console.log(`\n  Once loaded, the conflict engine would show ${hard.length} red and ${soft.length} amber:`);
  for (const x of [...hard, ...soft].slice(0, 15)) console.log(`    ${x.severity === 'hard' ? 'RED  ' : 'AMBER'} ${x.message}`);
  if (hard.length + soft.length > 15) console.log(`    ... and ${hard.length + soft.length - 15} more`);
}
process.exit(blocking.length ? 1 : 0);
