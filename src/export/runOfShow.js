// Run-of-show CSV for the current event: one row per placement, day by day, in time order.
import { state, currentEvent, eventPlacements, activityById, resourceLabel } from '../state.js?v=4';
import { toCsv } from '../csv.js?v=4';
import { downloadText, } from '../store/localStore.js?v=4';
import { fmt12, minToHHMM } from '../util.js?v=4';

export function runOfShowRows(ev = currentEvent(), violations = state.violations) {
  const vByP = new Map();
  for (const v of violations) if (!v.quiet) for (const id of v.placement_ids) (vByP.get(id) ?? vByP.set(id, []).get(id)).push(v);
  const order = new Map(ev.days.map((d, i) => [d.date, i]));
  return eventPlacements(ev.id)
    .slice().sort((a, b) => (order.get(a.day) ?? 99) - (order.get(b.day) ?? 99) || a.start_min - b.start_min || a.track_id.localeCompare(b.track_id))
    .map((p) => {
      const a = activityById(p.activity_id) ?? {}; const day = ev.days.find((d) => d.date === p.day); const track = ev.tracks.find((t) => t.id === p.track_id);
      return { Event: ev.name, Day: day ? `Day ${day.n}` : '', Date: p.day, Weekday: day?.label ?? '', Start: fmt12(p.start_min), End: fmt12(p.start_min + p.duration_min),
        'Start (24h)': minToHHMM(p.start_min), Minutes: p.duration_min, Activity: a.name ?? p.activity_id, Type: a.type ?? '', Lane: track?.name ?? p.track_id,
        'All hands': track?.is_all_hands ? 'yes' : '', People: (p.resource_ids ?? []).map(resourceLabel).join('; '), Delivery: a.delivery ?? '', Location: a.location ?? '',
        Notes: p.notes ?? '', Issues: (vByP.get(p.id) ?? []).map((v) => `${v.severity}: ${v.message}`).join(' | ') };
    });
}

export function exportRunOfShowCsv() {
  const ev = currentEvent(); if (!ev) return;
  downloadText(toCsv(runOfShowRows(ev)), `${state.pack.id}-${ev.id}-run-of-show.csv`, 'text/csv');
}
