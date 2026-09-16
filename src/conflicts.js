// Constraint engine. Pure: no DOM, no state module. Reusable from tests and a future server.
//
//   evaluate({ placements, activities, events, constraints }) -> Violation[]
//   Violation: { id, rule, severity: 'hard'|'soft', quiet?: true, placement_ids: string[], activity_id?, event_id?, message }
//
// `quiet` violations are listed in the Issues panel but do not paint blocks (e.g. readiness, coverage).
// Events must carry `days` (from pack.computeDays) and `tracks`.

const overlaps = (a, b) => a.day === b.day && a.start_min < b.start_min + b.duration_min && b.start_min < a.start_min + a.duration_min;
const hhmm = (m) => `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, '0')} ${m >= 720 ? 'PM' : 'AM'}`;
const toMin = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };

export function evaluate({ placements, activities, events, constraints = [] }) {
  const out = [];
  const act = new Map(activities.map((a) => [a.id, a]));
  const evs = new Map(events.map((e) => [e.id, e]));
  const trackOf = (ev, id) => ev?.tracks.find((t) => t.id === id);
  const name = (p) => act.get(p.activity_id)?.name ?? p.activity_id;
  const push = (v) => out.push(v);

  // Group placements per event/day for pairwise rules.
  const byEvent = new Map();
  for (const p of placements) (byEvent.get(p.event_id) ?? byEvent.set(p.event_id, []).get(p.event_id)).push(p);

  for (const [eventId, ps] of byEvent) {
    const ev = evs.get(eventId);
    for (const p of ps) {
      const a = act.get(p.activity_id);
      // 2. outside_event_bounds
      const day = ev?.days.find((d) => d.date === p.day);
      if (!ev || !day) push({ id: `bounds:${p.id}`, rule: 'outside_event_bounds', severity: 'hard', placement_ids: [p.id], event_id: eventId, message: `${name(p)} is on ${p.day}, which is not a day of ${ev?.name ?? eventId}.` });
      else if (p.start_min < day.startMin || p.start_min + p.duration_min > day.endMin)
        push({ id: `bounds:${p.id}`, rule: 'outside_event_bounds', severity: 'hard', placement_ids: [p.id], event_id: eventId, message: `${name(p)} runs ${hhmm(p.start_min)}–${hhmm(p.start_min + p.duration_min)}, outside the ${day.label} window ${hhmm(day.startMin)}–${hhmm(day.endMin)}.` });
      // 5. delivery (TG module in an all-hands lane)
      for (const c of constraints.filter((c) => c.rule_type === 'delivery' && (!c.event_id || c.event_id === eventId))) {
        const t = trackOf(ev, p.track_id);
        if (a?.delivery === c.params.delivery && t?.is_all_hands && c.params.disallow_all_hands && !(p.flags ?? []).includes('override'))
          push({ id: `delivery:${p.id}`, rule: 'delivery_mismatch', severity: c.severity || 'soft', placement_ids: [p.id], event_id: eventId, message: `${name(p)} is a ${a.delivery}-delivery module but sits in the all-hands lane "${t.name}". Move it to a patrol/TG lane or tick Override.` });
      }
    }
    // pairwise: 1. resource_double_booked, 3. track_overlap
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const p = ps[i], q = ps[j];
      if (!overlaps(p, q)) continue;
      const shared = (p.resource_ids ?? []).filter((r) => (q.resource_ids ?? []).includes(r));
      if (shared.length) push({ id: `res:${p.id}:${q.id}`, rule: 'resource_double_booked', severity: 'hard', placement_ids: [p.id, q.id], event_id: eventId, resource_ids: shared,
        message: `${shared.join(', ')} double-booked: ${name(p)} (${hhmm(p.start_min)}) and ${name(q)} (${hhmm(q.start_min)}) overlap.` });
      const tp = trackOf(ev, p.track_id), tq = trackOf(ev, q.track_id);
      const sameLane = p.track_id === q.track_id, allHands = tp?.is_all_hands || tq?.is_all_hands;
      const ok = (p.flags ?? []).includes('overlap-ok') || (q.flags ?? []).includes('overlap-ok');
      if ((sameLane || allHands) && !ok) push({ id: `lane:${p.id}:${q.id}`, rule: 'track_overlap', severity: 'hard', placement_ids: [p.id, q.id], event_id: eventId,
        message: sameLane ? `${name(p)} and ${name(q)} overlap in lane "${tp?.name ?? p.track_id}".` : `${name(p)} and ${name(q)} overlap, and one of them is all-hands.` });
    }
  }

  for (const c of constraints) {
    const P = c.params ?? {};
    // 4. lock_slot
    if (c.rule_type === 'lock_slot' && c.event_id) {
      const ev = evs.get(c.event_id);
      const ps = (byEvent.get(c.event_id) ?? []).filter((p) => p.activity_id === P.activity_id);
      const aName = act.get(P.activity_id)?.name ?? P.activity_id;
      if (!ps.length) push({ id: `lock-missing:${c.id}`, rule: 'lock_slot', severity: 'soft', quiet: true, placement_ids: [], activity_id: P.activity_id, event_id: c.event_id, message: `${aName} is locked to ${P.day}${P.not_before ? ' from ' + hhmm(toMin(P.not_before)) : ''} in ${ev?.name ?? c.event_id} but is not on the schedule yet.` });
      for (const p of ps) {
        const problems = [];
        if (P.day && p.day !== P.day) problems.push(`must be on ${P.day}`);
        if (P.not_before && p.start_min < toMin(P.not_before)) problems.push(`must not start before ${hhmm(toMin(P.not_before))}`);
        if (P.not_after && p.start_min > toMin(P.not_after)) problems.push(`must not start after ${hhmm(toMin(P.not_after))}`);
        if (problems.length) push({ id: `lock:${c.id}:${p.id}`, rule: 'lock_slot', severity: c.severity || 'hard', placement_ids: [p.id], event_id: c.event_id, message: `${aName}: ${problems.join('; ')} (${c.description || 'locked slot'}).` });
      }
    }
    // 6. syllabus_day_order
    if (c.rule_type === 'syllabus_day_order') {
      for (const [eventId, courseDays] of Object.entries(P.day_map ?? {})) {
        const ev = evs.get(eventId); if (!ev) continue;
        for (const p of byEvent.get(eventId) ?? []) {
          const a = act.get(p.activity_id); if (!a?.syllabus_day) continue;
          const d = ev.days.find((x) => x.date === p.day); if (!d) continue;
          const courseDay = courseDays[d.n - 1];
          if (courseDay && courseDay < a.syllabus_day) push({ id: `order:${p.id}`, rule: 'syllabus_day_order', severity: c.severity || 'soft', placement_ids: [p.id], event_id: eventId, message: `${a.name} is syllabus day ${a.syllabus_day} but is scheduled on course day ${courseDay}.` });
        }
      }
    }
    // 7. ready_gate
    if (c.rule_type === 'ready_gate') {
      for (const eventId of P.events ?? []) for (const p of byEvent.get(eventId) ?? []) {
        const a = act.get(p.activity_id);
        if (a?.type === 'presentation' && (a.ready || 'Not started') !== (P.required || 'Ready'))
          push({ id: `ready:${p.id}`, rule: 'ready_gate', severity: c.severity || 'soft', quiet: true, placement_ids: [p.id], event_id: eventId, message: `${a.name} is on the course but marked "${a.ready || 'Not started'}" in the Authority sheet.` });
      }
    }
    // 8. practice_coverage
    if (c.rule_type === 'practice_coverage') {
      const sds = new Set(P.sd_events ?? []);
      for (const a of activities.filter((x) => x.type === 'presentation')) {
        if (!a.practice_sd) { push({ id: `practice-unassigned:${a.id}`, rule: 'practice_uncovered', severity: 'soft', quiet: true, placement_ids: [], activity_id: a.id, message: `${a.name} has no Practice SD assigned in the Authority sheet.` }); continue; }
        if (!sds.has(a.practice_sd)) continue;
        const placed = (byEvent.get(a.practice_sd) ?? []).some((p) => p.activity_id === a.id);
        if (!placed) push({ id: `practice:${a.id}`, rule: 'practice_uncovered', severity: 'soft', quiet: true, placement_ids: [], activity_id: a.id, event_id: a.practice_sd, message: `${a.name} is assigned to practice at ${a.practice_sd} but is not on that schedule.` });
      }
    }
  }
  return out;
}

/** Map placement id -> violations that paint it (non-quiet). */
export function byPlacement(violations) {
  const m = new Map();
  for (const v of violations) if (!v.quiet) for (const id of v.placement_ids) (m.get(id) ?? m.set(id, []).get(id)).push(v);
  return m;
}

/** Practice matrix: rows = presentations, cols = SD events. cell: 'ok' | 'missing' | 'na'. A row with no Practice SD counts as covered (inferred) if placed in any SD. */
export function coverageMatrix({ placements, activities, sdEvents }) {
  const rows = [];
  for (const a of activities.filter((x) => x.type === 'presentation')) {
    const cells = {};
    for (const sd of sdEvents) {
      const placed = placements.some((p) => p.event_id === sd && p.activity_id === a.id);
      cells[sd] = placed ? 'ok' : a.practice_sd === sd ? 'missing' : 'na';
    }
    const anywhere = Object.values(cells).includes('ok');
    rows.push({ activity: a, cells, assigned: a.practice_sd || null, covered: a.practice_sd ? cells[a.practice_sd] === 'ok' : anywhere, inferred: !a.practice_sd && anywhere });
  }
  return rows;
}
