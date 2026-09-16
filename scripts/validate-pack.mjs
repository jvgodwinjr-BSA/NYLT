#!/usr/bin/env node
// Referential integrity for content packs. Runs in CI; run it after hand-editing any pack CSV.
//   node scripts/validate-pack.mjs [packId...]      (default: every folder under packs/)
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { parseCsv } from '../src/csv.js';
import { computeDays } from '../src/pack.js';
import { SLOT_MIN } from '../src/config.js';

const RULE_TYPES = new Set(['lock_slot', 'delivery', 'syllabus_day_order', 'ready_gate', 'practice_coverage', 'same_resource', 'audience']);
const TYPES = new Set(['presentation', 'meal', 'ceremony', 'meeting', 'outpost', 'game', 'logistics', 'staff_task', 'other']);
const READY = new Set(['', 'Not started', 'Outline', 'Practiced', 'Ready']);

/**
 * Validate one pack directory.
 * @returns {{errors: string[], warnings: string[], counts: object|null}}
 */
export function validatePack(dir) {
  const errors = [], warnings = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);
  const read = (f) => { const p = `${dir}/${f}`; if (!existsSync(p)) { err(`missing ${f}`); return null; } return parseCsv(readFileSync(p, 'utf8')); };

  const activities = read('activities.csv'), events = read('events.csv'), tracks = read('tracks.csv'), resources = read('resources.csv'), constraints = read('constraints.csv');
  if (!activities || !events || !tracks || !resources || !constraints) return { errors, warnings, counts: null };

  const actIds = new Set(), evIds = new Set(events.map((e) => e.id)), resIds = new Set(resources.map((r) => r.id));
  for (const a of activities) {
    if (!a.id) { err('an activity has no id'); continue; }
    if (actIds.has(a.id)) err(`duplicate activity id "${a.id}"`); else actIds.add(a.id);
    const d = Number(a.duration_min);
    if (!Number.isFinite(d) || d <= 0) err(`activity "${a.id}" has duration_min "${a.duration_min}"`);
    else if (d % SLOT_MIN) err(`activity "${a.id}" duration ${d} is not a multiple of ${SLOT_MIN}`);
    if (!TYPES.has(a.type)) err(`activity "${a.id}" has unknown type "${a.type}"`);
    if (!READY.has(a.ready ?? '')) err(`activity "${a.id}" has unknown ready "${a.ready}"`);
    if (a.owner_id && !resIds.has(a.owner_id)) err(`activity "${a.id}" owner_id "${a.owner_id}" is not a resource id`);
    if (a.practice_sd && !evIds.has(a.practice_sd)) err(`activity "${a.id}" practice_sd "${a.practice_sd}" is not an event id`);
    if (a.syllabus_day && !/^[1-9]\d*$/.test(a.syllabus_day)) err(`activity "${a.id}" syllabus_day "${a.syllabus_day}" is not a positive integer`);
    if (!['hard', 'soft'].includes(a.soft_vs_hard)) err(`activity "${a.id}" soft_vs_hard must be hard or soft`);
  }

  for (const e of events) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(e.hard_start)) err(`event "${e.id}" hard_start "${e.hard_start}" must be YYYY-MM-DDTHH:MM`);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(e.hard_stop)) err(`event "${e.id}" hard_stop "${e.hard_stop}" must be YYYY-MM-DDTHH:MM`);
    if (e.hard_stop <= e.hard_start) err(`event "${e.id}" ends before it starts`);
    const days = computeDays(e);
    if (!days.length) err(`event "${e.id}" expands to zero days`);
    const evTracks = tracks.filter((t) => t.event_id === e.id);
    if (!evTracks.length) err(`event "${e.id}" has no tracks`);
    if (!evTracks.some((t) => /^(true|1|yes)$/i.test(t.is_all_hands))) warn(`event "${e.id}" has no all-hands lane, so nothing can block every lane at once`);
  }

  const trackIds = new Set();
  for (const t of tracks) {
    if (trackIds.has(t.id)) err(`duplicate track id "${t.id}"`); else trackIds.add(t.id);
    if (!evIds.has(t.event_id)) err(`track "${t.id}" references unknown event "${t.event_id}"`);
  }

  for (const c of constraints) {
    if (!RULE_TYPES.has(c.rule_type)) err(`constraint "${c.id}" has unknown rule_type "${c.rule_type}"`);
    if (c.event_id && !evIds.has(c.event_id)) err(`constraint "${c.id}" references unknown event "${c.event_id}"`);
    if (!['hard', 'soft'].includes(c.severity)) err(`constraint "${c.id}" severity must be hard or soft`);
    let P; try { P = c.params ? JSON.parse(c.params) : {}; } catch { err(`constraint "${c.id}" params is not valid JSON`); continue; }
    if (c.rule_type === 'lock_slot') {
      if (!actIds.has(P.activity_id)) err(`constraint "${c.id}" locks unknown activity "${P.activity_id}"`);
      for (const k of ['not_before', 'not_after']) if (P[k] && !/^\d{1,2}:\d{2}$/.test(P[k])) err(`constraint "${c.id}" ${k} "${P[k]}" must be HH:MM`);
      if (P.day && !/^\d{4}-\d{2}-\d{2}$/.test(P.day)) err(`constraint "${c.id}" day "${P.day}" must be YYYY-MM-DD`);
      if (P.day && c.event_id) { const ev = events.find((e) => e.id === c.event_id); if (ev && !computeDays(ev).some((d) => d.date === P.day)) err(`constraint "${c.id}" locks to ${P.day}, not a day of ${c.event_id}`); }
    }
    for (const id of P.sd_events ?? P.events ?? []) if (!evIds.has(id)) err(`constraint "${c.id}" references unknown event "${id}"`);
    for (const id of Object.keys(P.day_map ?? {})) if (!evIds.has(id)) err(`constraint "${c.id}" day_map references unknown event "${id}"`);
  }

  const tmplPath = `${dir}/templates.json`;
  if (existsSync(tmplPath)) {
    let t; try { t = JSON.parse(readFileSync(tmplPath, 'utf8')); } catch { err('templates.json is not valid JSON'); t = null; }
    for (const [key, tmpl] of Object.entries(t ?? {})) for (const item of tmpl.items ?? []) {
      if (!actIds.has(item.activity_id)) err(`template "${key}" references unknown activity "${item.activity_id}"`);
      if (item.start_min % SLOT_MIN) err(`template "${key}" item "${item.activity_id}" start_min ${item.start_min} is not a multiple of ${SLOT_MIN}`);
    }
  }
  return { errors, warnings, counts: { activities: activities.length, events: events.length, tracks: tracks.length, resources: resources.length, constraints: constraints.length } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const packs = process.argv.slice(2).length ? process.argv.slice(2)
    : readdirSync('packs', { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  let errors = 0, warnings = 0;
  for (const id of packs) {
    const { errors: e, warnings: w, counts } = validatePack(`packs/${id}`);
    for (const m of e) console.error(`  ERROR ${id}: ${m}`);
    for (const m of w) console.warn(`  warn  ${id}: ${m}`);
    if (counts) console.log(`  ${id}: ${counts.activities} activities, ${counts.events} events, ${counts.tracks} tracks, ${counts.resources} resources, ${counts.constraints} constraints`);
    errors += e.length; warnings += w.length;
  }
  if (errors) { console.error(`\nvalidate-pack FAILED: ${errors} error(s), ${warnings} warning(s)`); process.exit(1); }
  console.log(`validate-pack OK${warnings ? ` (${warnings} warning(s))` : ''}`);
}
