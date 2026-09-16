// Center canvas: one section per event day, lanes per track, blocks sized by duration on the 15-minute spine.
import { PX_PER_SLOT, SLOT_MIN, GUTTER_PX, LANE_PX } from './config.js?v=4';
import { state, currentEvent, eventPlacements, activityById, resourceLabel } from './state.js?v=4';
import { el, clear, fmt12, fmtRange } from './util.js?v=4';

export const slotsBetween = (a, b) => (b - a) / SLOT_MIN;
export const minToY = (min, day) => slotsBetween(day.startMin, min) * PX_PER_SLOT;
export const yToMin = (y, day) => day.startMin + Math.round(y / PX_PER_SLOT) * SLOT_MIN;

/** Geometry for a placement inside its day body. Returns null if the day is not on the canvas. */
export function blockGeometry(p, ev) {
  const day = ev.days.find((d) => d.date === p.day);
  if (!day) return null;
  const laneIdx = Math.max(0, ev.tracks.findIndex((t) => t.id === p.track_id));
  const track = ev.tracks[laneIdx];
  const top = minToY(p.start_min, day);
  const height = Math.max(PX_PER_SLOT, (p.duration_min / SLOT_MIN) * PX_PER_SLOT);
  const left = GUTTER_PX + (track?.is_all_hands ? 0 : laneIdx * LANE_PX);
  const width = track?.is_all_hands ? ev.tracks.length * LANE_PX : LANE_PX;
  return { day, track, laneIdx, top, height, left, width };
}

export function renderCanvas(root, { violationsByPlacement = new Map() } = {}) {
  clear(root);
  const ev = currentEvent();
  if (!ev) { root.append(el('p.empty', {}, 'No event selected.')); return; }
  const days = state.view === 'day' ? [ev.days[Math.min(state.dayIndex, ev.days.length - 1)]] : ev.days;
  const width = GUTTER_PX + ev.tracks.length * LANE_PX;
  const placements = eventPlacements(ev.id);

  if (!placements.length) {
    const others = state.pack.events.filter((e) => e.id !== ev.id && state.placements.some((p) => p.event_id === e.id));
    root.append(el('div.empty-event', {},
      el('strong', {}, `Nothing scheduled in ${ev.name} yet.`),
      el('p.muted', {}, 'Drag an activity from the left rail onto a lane below to start.'),
      others.length ? el('p.muted', {}, `Other events do have a schedule: ${others.map((e) => e.name).join(', ')}. Switch with the picker above.`) : null));
  }

  for (const day of days) {
    const height = slotsBetween(day.startMin, day.endMin) * PX_PER_SLOT;
    const body = el('div.day-body', { dataset: { day: day.date, startMin: day.startMin, endMin: day.endMin }, style: { height: `${height}px`, width: `${width}px` } });
    // gutter with hour labels
    const gutter = el('div.gutter', { style: { width: `${GUTTER_PX}px` } });
    for (let m = Math.ceil(day.startMin / 60) * 60; m <= day.endMin; m += 60) gutter.append(el('div.hour', { style: { top: `${minToY(m, day)}px` } }, fmt12(m)));
    body.append(gutter);
    // lanes
    ev.tracks.forEach((t, i) => body.append(el('div.lane', { class: `lane${t.is_all_hands ? ' all-hands' : ''}`, dataset: { trackId: t.id, laneIdx: i },
      style: { left: `${GUTTER_PX + i * LANE_PX}px`, width: `${LANE_PX}px`, '--slot': `${PX_PER_SLOT}px`, '--hour': `${PX_PER_SLOT * 4}px` } })));
    // blocks
    for (const p of placements.filter((p) => p.day === day.date)) {
      const g = blockGeometry(p, ev); if (!g) continue;
      const a = activityById(p.activity_id);
      const v = violationsByPlacement.get(p.id) ?? [];
      const sev = v.some((x) => x.severity === 'hard') ? 'hard' : v.length ? 'soft' : '';
      const block = el('div.block', {
        class: `block type-${a?.type ?? 'other'}${g.track?.is_all_hands ? ' all-hands' : ''}${state.selectedId === p.id ? ' selected' : ''}${sev ? ' viol-' + sev : ''}`,
        dataset: { id: p.id }, title: v.map((x) => x.message).join('\n') || `${a?.name ?? p.activity_id}\n${fmtRange(p.start_min, p.start_min + p.duration_min)}`,
        style: { top: `${g.top}px`, height: `${g.height}px`, left: `${g.left}px`, width: `${g.width}px` } },
        el('div.b-name', {}, a?.name ?? p.activity_id),
        el('div.b-time', {}, fmtRange(p.start_min, p.start_min + p.duration_min)),
        p.resource_ids?.length ? el('div.b-res', {}, p.resource_ids.map(resourceLabel).join(' · ')) : null,
        el('div.b-resize', { dataset: { resize: p.id } }));
      body.append(block);
    }
    const heads = el('div.lane-heads', { style: { width: `${width}px` } }, el('div', { style: { width: `${GUTTER_PX}px` } }),
      ev.tracks.map((t) => el('div.lane-head', { class: `lane-head${t.is_all_hands ? ' all-hands' : ''}`, style: { width: `${LANE_PX}px` } }, t.name)));
    root.append(el('section.day', { dataset: { day: day.date } },
      el('header.day-head', {}, el('strong', {}, `${day.label} · Day ${day.n}`), el('span.muted', {}, ` ${fmtRange(day.startMin, day.endMin)}`)),
      heads, body));
  }
}
