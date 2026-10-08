#!/usr/bin/env node
// Check a saved schedule file against a content pack before trusting it.
//
//   npm run check:schedule -- path/to/schedule.json [--pack nylt-27-1]
//
// Exits 0 when the file is safe to load and 1 when it is not, so it can gate a script.
//
// The checks themselves live in src/validateSchedule.js, which the app also runs on Load JSON.
// This file is the terminal front end: read the pack off disk, call it, print, exit.
import { readFileSync, readdirSync } from 'node:fs';
import { parseCsv } from '../src/csv.js';
import { computeDays, normalizeActivity } from '../src/pack.js';
import { evaluate } from '../src/conflicts.js';
import { validateSchedule } from '../src/validateSchedule.js';

const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith('--'));
const packId = (() => { const i = argv.indexOf('--pack'); return i >= 0 ? argv[i + 1] : readdirSync('packs')[0]; })();
if (!file) { console.error('Usage: npm run check:schedule -- <file.json> [--pack <id>]'); process.exit(2); }

const dir = `packs/${packId}`;
const read = (f) => parseCsv(readFileSync(`${dir}/${f}`, 'utf8'));
const bool = (v) => /^(true|1|yes)$/i.test(String(v));
const tracks = read('tracks.csv').map((t) => ({ ...t, is_all_hands: bool(t.is_all_hands) }));
const pack = {
  id: packId,
  activities: read('activities.csv').map(normalizeActivity),
  events: read('events.csv').map((e) => ({ ...e, days: computeDays(e), tracks: tracks.filter((t) => t.event_id === e.id) })),
  resources: read('resources.csv'),
  constraints: read('constraints.csv').map((c) => { try { return { ...c, params: c.params ? JSON.parse(c.params) : {} }; } catch { return { ...c, params: {} }; } }),
};

let doc;
try { doc = JSON.parse(readFileSync(file, 'utf8')); }
catch (e) { console.error(`Could not read ${file}: ${e.message}`); process.exit(2); }

const { blocking, warning, counts } = validateSchedule({ doc, pack });

const report = (label, list) => {
  if (!list.length) { console.log(`  ${label}: none`); return; }
  console.log(`  ${label}: ${list.length}`);
  for (const x of list.slice(0, 40)) console.log(`    - ${x}`);
  if (list.length > 40) console.log(`    ... and ${list.length - 40} more`);
};

console.log(`Schedule: ${file}`);
console.log(`Pack:     ${packId}  (${counts.placements} placements, ${counts.customActivities} custom activities)\n`);
report('BLOCKING', blocking);
console.log();
report('WARNING', warning);

if (!blocking.length) {
  const activities = [...pack.activities, ...(doc.customActivities ?? []).map(normalizeActivity)];
  const v = evaluate({ placements: doc.placements ?? [], activities, events: pack.events, constraints: pack.constraints });
  const hard = v.filter((x) => x.severity === 'hard' && !x.quiet);
  const soft = v.filter((x) => x.severity !== 'hard' && !x.quiet);
  console.log(`\n  Once loaded, the conflict engine would show ${hard.length} red and ${soft.length} amber:`);
  for (const x of [...hard, ...soft].slice(0, 15)) console.log(`    ${x.severity === 'hard' ? 'RED  ' : 'AMBER'} ${x.message}`);
  if (hard.length + soft.length > 15) console.log(`    ... and ${hard.length + soft.length - 15} more`);
}
process.exit(blocking.length ? 1 : 0);
