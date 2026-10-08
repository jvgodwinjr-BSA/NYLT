// Will this schedule file import, and what will it look like when it does?
//
// Pure, like conflicts.js and progress.js — no DOM, no imports from state.js or canvas.js — so the
// browser can run it on Load JSON and `npm run check:schedule` can run the identical checks from a
// terminal. One implementation, two callers: a validator that disagrees with itself is worse than
// none. `npm run lint` enforces the purity.
//
// Three levels, because they call for different responses:
//   BLOCKING  the placement cannot render, or a field the rail reads is missing. Do not load.
//   WARNING   it loads but is probably wrong — off-grid times, a file for another pack.
//   conflicts the engine's normal output. Not an import problem; shown so red blocks are no surprise.
import { SLOT_MIN } from './config.js?v=12';

const REQUIRED = ['id', 'name', 'duration_min', 'type', 'audience', 'delivery', 'soft_vs_hard', 'tags'];
const STATUSES = ['todo', 'doing', 'blocked', 'done'];
const AUDIENCES = ['troop', 'patrol', 'staff'];

const fmt = (m) => { const h = Math.floor(m / 60) % 24, mm = String(m % 60).padStart(2, '0'); return `${h % 12 || 12}:${mm} ${h >= 12 ? 'PM' : 'AM'}`; };

/**
 * @param {object} o
 * @param {object} o.doc   the parsed schedule file
 * @param {object} o.pack  a loaded pack: { id, activities, events (with days+tracks), resources }
 * @returns {{blocking: string[], warning: string[], counts: {placements: number, customActivities: number}}}
 */
export function validateSchedule({ doc = {}, pack }) {
  const blocking = [], warning = [];
  const B = (m) => blocking.push(m);
  const W = (m) => warning.push(m);

  if (doc.format !== 'program-scheduler/schedule') {
    B(`format is "${doc.format}" — Load JSON refuses anything but "program-scheduler/schedule"`);
  }
  if (doc.pack && pack?.id && doc.pack !== pack.id) {
    W(`file says pack "${doc.pack}", checking against "${pack.id}" — the app asks before loading`);
  }

  const customs = Array.isArray(doc.customActivities) ? doc.customActivities : [];
  if (doc.customActivities !== undefined && !Array.isArray(doc.customActivities)) B('"customActivities" is not an array');
  for (const c of customs) {
    const missing = REQUIRED.filter((k) => c?.[k] === undefined || c?.[k] === null);
    if (missing.length) B(`custom activity "${c?.id ?? '(no id)'}" is missing ${missing.join(', ')} — the left rail reads these`);
    if (c?.audience && !AUDIENCES.includes(c.audience)) W(`custom activity "${c.id}" has audience "${c.audience}" (expected ${AUDIENCES.join(', ')})`);
  }

  const byId = new Map([...(pack?.activities ?? []), ...customs].filter((a) => a?.id).map((a) => [a.id, a]));
  const evById = new Map((pack?.events ?? []).map((e) => [e.id, e]));
  const roleIds = new Set((pack?.resources ?? []).map((r) => r.id));

  // Task status. A wrong entry mostly reads as "to do", so these are warnings — except a `tasks`
  // that is not a map (the client spreads it) and a credit that is not a role id, which is the
  // one way a person's name could get in.
  const tasks = doc.tasks;
  if (tasks !== undefined) {
    if (Array.isArray(tasks) || typeof tasks !== 'object' || tasks === null) {
      B(`"tasks" is ${Array.isArray(tasks) ? 'an array' : typeof tasks} — it must be an object keyed by placement or activity id`);
    } else {
      const placementIds = new Set((doc.placements ?? []).map((p) => p?.id));
      for (const [key, t] of Object.entries(tasks)) {
        const known = placementIds.has(key) || byId.has(key);
        if (!known) W(`tasks: "${key}" matches no placement or activity — its status will be ignored`);
        if (!t || typeof t !== 'object') { W(`tasks: "${key}" is not an object`); continue; }
        if (t.status && !STATUSES.includes(t.status)) W(`tasks: "${key}" has status "${t.status}" (expected ${STATUSES.join(', ')}) — it will read as "todo"`);
        if (t.by && roleIds.size && !roleIds.has(t.by)) B(`tasks: "${key}" is credited to "${t.by}", which is not a role id — status carries roles, never names`);
      }
    }
  }

  const placements = Array.isArray(doc.placements) ? doc.placements : [];
  if (!Array.isArray(doc.placements)) B('"placements" is missing or is not an array');
  const seen = new Set();
  for (const p of placements) {
    const where = `${p?.event_id ?? '?'} ${p?.day ?? '?'} ${String(p?.activity_id ?? '?')}`;
    if (seen.has(p?.id)) B(`duplicate placement id "${p.id}"`); else seen.add(p?.id);
    if (!byId.has(p?.activity_id)) B(`${where}: no activity "${p?.activity_id}" in the pack or in customActivities`);
    const ev = evById.get(p?.event_id);
    if (!ev) { B(`${where}: no event "${p?.event_id}"`); continue; }
    if (!ev.tracks?.some((t) => t.id === p.track_id)) B(`${where}: no lane "${p.track_id}" on ${ev.id} (lanes are ${(ev.tracks ?? []).map((t) => t.id).join(', ')})`);
    const day = ev.days?.find((d) => d.date === p.day);
    if (!day) { B(`${where}: ${p.day} is not a day of ${ev.id} (${(ev.days ?? []).map((d) => d.date).join(', ')})`); continue; }
    const end = Number(p.start_min) + Number(p.duration_min);
    if (!Number.isFinite(end)) { B(`${where}: start_min or duration_min is not a number`); continue; }
    if (p.start_min < day.startMin) W(`${where}: starts ${fmt(p.start_min)}, before this day opens at ${fmt(day.startMin)}`);
    if (end > day.endMin) W(`${where}: ends ${fmt(end)}, after this day closes at ${fmt(day.endMin)}`);
    if (p.start_min % SLOT_MIN) W(`${where}: starts at ${fmt(p.start_min)}, off the ${SLOT_MIN}-minute grid`);
    if (p.duration_min % SLOT_MIN) W(`${where}: lasts ${p.duration_min} min, not a multiple of ${SLOT_MIN}`);
  }

  return { blocking, warning, counts: { placements: placements.length, customActivities: customs.length } };
}
