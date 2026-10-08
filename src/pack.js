// Loads a content pack (five CSVs + optional templates.json) into typed objects.
import { parseCsv } from './csv.js?v=12';
import { DAY_START_MIN, DAY_END_MIN, SLOT_MIN, ASSET_V } from './config.js?v=12';
import { parseLocal, addDays, dayLabel } from './util.js?v=12';

const safeJson = (s) => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };
const bool = (v) => /^(true|1|yes|y)$/i.test(String(v).trim());

/** Days of an event, each clipped to the event's hard bounds. */
export function computeDays(ev) {
  const s = parseLocal(ev.hard_start), e = parseLocal(ev.hard_stop);
  const days = [];
  for (let date = s.date, n = 1; date <= e.date; date = addDays(date, 1), n++) {
    const startMin = Math.floor((date === s.date ? s.min : DAY_START_MIN) / SLOT_MIN) * SLOT_MIN;
    const endMin = Math.ceil((date === e.date ? e.min : DAY_END_MIN) / SLOT_MIN) * SLOT_MIN;
    if (endMin - startMin >= SLOT_MIN) days.push({ date, n, label: dayLabel(date), startMin, endMin });
  }
  return days;
}

/**
 * Give an activity the shape the rest of the app assumes.
 *
 * Pack rows come from CSV, where everything is a string. Custom activities come from a saved
 * schedule and may have been hand-authored, so fields can simply be missing — and a missing `tags`
 * used to take the whole left rail down the moment anyone typed in the search box. Normalising at
 * the boundary means nothing downstream has to be defensive.
 */
export function normalizeActivity(x = {}) {
  return {
    ...x,
    duration_min: Number(x.duration_min) || SLOT_MIN,
    syllabus_day: x.syllabus_day ? Number(x.syllabus_day) : null,
    tags: Array.isArray(x.tags) ? x.tags : (typeof x.tags === 'string' ? x.tags.split('|').filter(Boolean) : []),
    type: x.type || 'other',
    audience: x.audience || 'staff',
    delivery: x.delivery || 'Staff',
    soft_vs_hard: x.soft_vs_hard === 'hard' ? 'hard' : 'soft',
    notes: x.notes ?? '',
  };
}

export async function loadPack(packId, base = './packs/') {
  const get = async (f) => { const r = await fetch(`${base}${packId}/${f}?v=${ASSET_V}`); if (!r.ok) throw new Error(`Pack ${packId}: missing ${f}`); return r.text(); };
  const [a, e, t, r, c] = await Promise.all(['activities.csv', 'events.csv', 'tracks.csv', 'resources.csv', 'constraints.csv'].map(get));
  const templates = await fetch(`${base}${packId}/templates.json?v=${ASSET_V}`).then((x) => (x.ok ? x.json() : {})).catch(() => ({}));
  const activities = parseCsv(a).map(normalizeActivity);
  const tracks = parseCsv(t).map((x) => ({ ...x, is_all_hands: bool(x.is_all_hands), sort: Number(x.sort) || 0 })).sort((p, q) => p.sort - q.sort);
  const events = parseCsv(e).map((ev) => ({ ...ev, days: computeDays(ev), tracks: tracks.filter((tr) => tr.event_id === ev.id) }));
  const resources = parseCsv(r).map((x) => ({ ...x, sort: Number(x.sort) || 0 })).sort((p, q) => p.sort - q.sort);
  const constraints = parseCsv(c).map((x) => ({ ...x, params: safeJson(x.params) }));
  return { id: packId, activities, events, tracks, resources, constraints, templates };
}
