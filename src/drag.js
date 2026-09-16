// Pointer-event drag for the whole canvas: rail item -> canvas (create), block move, block resize. One code path.
// Nothing here writes state until pointerup; a ghost shows where the block will land, snapped to the 15-minute grid.
import { PX_PER_SLOT, SLOT_MIN, GUTTER_PX, LANE_PX } from './config.js';
import { state, currentEvent, activityById, addPlacement, updatePlacement, select } from './state.js';
import { yToMin, minToY } from './canvas.js';
import { fmtRange } from './util.js';

const DRAG_THRESHOLD = 4; // px before a press becomes a drag (so clicks still select)

function dayBodyAt(x, y) {
  const elAt = document.elementFromPoint(x, y);
  const body = elAt?.closest?.('.day-body');
  if (!body) return null;
  const ev = currentEvent();
  const day = ev.days.find((d) => d.date === body.dataset.day);
  return { body, day, ev };
}

/** Where a block of `duration` would land if its top-left were at client (x, y) inside a day body. */
function targetFor(x, y, duration, grabOffsetY = 0) {
  const hit = dayBodyAt(x, y); if (!hit) return null;
  const { body, day, ev } = hit;
  const rect = body.getBoundingClientRect();
  const relY = y - rect.top - grabOffsetY;
  const relX = x - rect.left;
  let laneIdx = Math.floor((relX - GUTTER_PX) / LANE_PX);
  laneIdx = Math.max(0, Math.min(ev.tracks.length - 1, laneIdx));
  const track = ev.tracks[laneIdx];
  let start = yToMin(relY, day);
  start = Math.max(day.startMin, Math.min(day.endMin - SLOT_MIN, start));
  return { day, track, laneIdx, start, duration, body };
}

function makeGhost(label, duration, track, evTrackCount) {
  const g = document.createElement('div');
  g.className = 'block ghost';
  g.style.height = `${(duration / SLOT_MIN) * PX_PER_SLOT}px`;
  g.style.width = `${track?.is_all_hands ? evTrackCount * LANE_PX : LANE_PX}px`;
  g.innerHTML = `<div class="b-name"></div><div class="b-time"></div>`;
  g.querySelector('.b-name').textContent = label;
  document.body.append(g);
  return g;
}

export function installDrag({ rail, canvas, onChange }) {
  let session = null; // { kind:'create'|'move'|'resize', ... }

  const start = (e, s) => {
    session = { ...s, startX: e.clientX, startY: e.clientY, active: false, pointerId: e.pointerId };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp, { once: true });
    document.addEventListener('pointercancel', cancel, { once: true });
  };

  rail.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const item = e.target.closest('.rail-item'); if (!item) return;
    const a = activityById(item.dataset.activityId); if (!a) return;
    start(e, { kind: 'create', activity: a, duration: a.duration_min, label: a.name, grabOffsetY: 0, srcEl: item });
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const resize = e.target.closest('.b-resize');
    const block = e.target.closest('.block'); if (!block) return;
    const p = state.placements.find((x) => x.id === block.dataset.id); if (!p) return;
    const a = activityById(p.activity_id);
    const rect = block.getBoundingClientRect(); // before select(): selecting re-renders and detaches this element
    select(p.id);
    if (resize) start(e, { kind: 'resize', placement: p, label: a?.name ?? '', duration: p.duration_min, srcEl: block });
    else start(e, { kind: 'move', placement: p, label: a?.name ?? '', duration: p.duration_min, grabOffsetY: e.clientY - rect.top, srcEl: block });
  });

  function onMove(e) {
    if (!session) return;
    if (!session.active) {
      if (Math.hypot(e.clientX - session.startX, e.clientY - session.startY) < DRAG_THRESHOLD) return;
      session.active = true;
      session.srcEl.classList.add('dragging');
      const ev = currentEvent();
      if (session.kind !== 'resize') session.ghost = makeGhost(session.label, session.duration, null, ev.tracks.length);
    }
    e.preventDefault();
    if (session.kind === 'resize') {
      const p = session.placement, ev = currentEvent(), day = ev.days.find((d) => d.date === p.day);
      const dy = e.clientY - session.startY;
      let dur = Math.max(SLOT_MIN, Math.round((p.duration_min + (dy / PX_PER_SLOT) * SLOT_MIN) / SLOT_MIN) * SLOT_MIN);
      if (day) dur = Math.min(dur, day.endMin - p.start_min);
      session.newDuration = dur;
      session.srcEl.style.height = `${(dur / SLOT_MIN) * PX_PER_SLOT}px`;
      session.srcEl.querySelector('.b-time').textContent = fmtRange(p.start_min, p.start_min + dur);
      return;
    }
    const t = targetFor(e.clientX, e.clientY, session.duration, session.grabOffsetY);
    document.querySelectorAll('.lane.drop-ok').forEach((l) => l.classList.remove('drop-ok'));
    const g = session.ghost;
    if (!t) { g.style.left = `${e.clientX + 8}px`; g.style.top = `${e.clientY - 10}px`; g.style.width = `${LANE_PX}px`; g.classList.add('off'); session.target = null; return; }
    g.classList.remove('off');
    const rect = t.body.getBoundingClientRect();
    const span = t.track?.is_all_hands;
    g.style.width = `${span ? t.ev?.tracks?.length * LANE_PX || currentEvent().tracks.length * LANE_PX : LANE_PX}px`;
    g.style.left = `${rect.left + GUTTER_PX + (span ? 0 : t.laneIdx * LANE_PX)}px`;
    g.style.top = `${rect.top + minToY(t.start, t.day)}px`;
    g.querySelector('.b-time').textContent = fmtRange(t.start, t.start + session.duration);
    t.body.querySelector(`.lane[data-track-id="${t.track.id}"]`)?.classList.add('drop-ok');
    session.target = t;
  }

  function cleanup() {
    document.removeEventListener('pointermove', onMove);
    document.querySelectorAll('.lane.drop-ok').forEach((l) => l.classList.remove('drop-ok'));
    session?.ghost?.remove();
    session?.srcEl?.classList.remove('dragging');
    session = null;
  }
  function cancel() { cleanup(); onChange?.(); }

  function onUp() {
    if (!session) return;
    const s = session;
    if (!s.active) { cleanup(); return; } // plain click: selection already handled
    if (s.kind === 'resize') { if (s.newDuration && s.newDuration !== s.placement.duration_min) updatePlacement(s.placement.id, { duration_min: s.newDuration }); cleanup(); onChange?.(); return; }
    const t = s.target;
    if (!t) { cleanup(); onChange?.(); return; }
    const ev = currentEvent();
    if (s.kind === 'create') {
      const p = addPlacement({ activity_id: s.activity.id, event_id: ev.id, track_id: t.track.id, day: t.day.date, start_min: t.start });
      cleanup(); select(p.id); onChange?.();
    } else {
      const p = s.placement;
      if (p.day !== t.day.date || p.track_id !== t.track.id || p.start_min !== t.start) updatePlacement(p.id, { day: t.day.date, track_id: t.track.id, start_min: t.start });
      cleanup(); onChange?.();
    }
  }

  // Keyboard: nudge the selected block. Handled here so drag.js owns all placement geometry changes.
  document.addEventListener('keydown', (e) => {
    if (!state.selectedId || /input|textarea|select/i.test(e.target.tagName)) return;
    const p = state.placements.find((x) => x.id === state.selectedId); if (!p) return;
    const ev = currentEvent(); const day = ev.days.find((d) => d.date === p.day); if (!day) return;
    const laneIdx = ev.tracks.findIndex((t) => t.id === p.track_id);
    const step = e.shiftKey ? 60 : SLOT_MIN;
    if (e.key === 'ArrowUp') { e.preventDefault(); updatePlacement(p.id, { start_min: Math.max(day.startMin, p.start_min - step) }); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); updatePlacement(p.id, { start_min: Math.min(day.endMin - SLOT_MIN, p.start_min + step) }); }
    else if (e.key === 'ArrowLeft' && laneIdx > 0) { e.preventDefault(); updatePlacement(p.id, { track_id: ev.tracks[laneIdx - 1].id }); }
    else if (e.key === 'ArrowRight' && laneIdx < ev.tracks.length - 1) { e.preventDefault(); updatePlacement(p.id, { track_id: ev.tracks[laneIdx + 1].id }); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); import('./state.js').then((m) => m.removePlacement(p.id)); }
    else if (e.key === 'Escape') { select(null); }
  });
}
