// Task status roll-up: how much of the staff workload is done, and whether that is ahead of pace.
//
// Pure, like conflicts.js — no DOM, no imports from state.js or canvas.js — so tests and a future
// server can call it. `npm run lint` enforces that.
//
// The unit of work is one *occurrence*, not one catalog row. A task that is not on the schedule is
// one occurrence; a task placed seventeen times is seventeen. That distinction is the whole point:
// `qm-work-block` appears on every weekend and two QM routines run daily, and counting each of them
// once both understated the workload and meant ticking Friday's gear check marked Sunday's too.
//
// "Ahead of pace" needs a deadline, and the data already carries one. A placed occurrence is due on
// the day it is scheduled. An unplaced task is due from its weekend tag (`sd3`, `before-sd2`,
// `course-w1`) resolved against the event calendar.

/** Status values a task can hold. Absent from the map means `todo`, so it only stores changes. */
export const TASK_STATUSES = ['todo', 'doing', 'blocked', 'done'];
export const TASK_STATUS_LABEL = { todo: 'To do', doing: 'In progress', blocked: 'Blocked', done: 'Done' };

/** Activities that carry a status. Presentations and meals are events, not work items. */
export const isTask = (a) => a?.type === 'staff_task';

/**
 * The key a status is stored under: the placement when the work is on the schedule, otherwise the
 * activity. One occurrence, one key.
 */
export const taskKey = (activity, placement) => placement?.id ?? activity?.id;

/**
 * The stored entry for one occurrence.
 *
 * Falls back to the activity id for a placed occurrence so that a schedule file written before
 * status moved to placements does not silently lose it. Nothing writes an activity-keyed entry for
 * placed work any more, so the fallback only ever reads old data.
 */
export function taskEntry(tasks, activity, placement) {
  return tasks?.[taskKey(activity, placement)] ?? (placement ? tasks?.[activity?.id] : undefined);
}

export function taskStatus(tasks, activity, placement) {
  const s = taskEntry(tasks, activity, placement)?.status;
  return TASK_STATUSES.includes(s) ? s : 'todo';
}

const dateOf = (s) => String(s ?? '').slice(0, 10);

/** The bucket tag an event belongs to, so placed and unplaced work group onto the same line. */
export const eventTag = (eventId) => {
  const id = String(eventId ?? '').toUpperCase();
  if (/^SD\d$/.test(id)) return id.toLowerCase();
  if (id === 'W1') return 'course-w1';
  if (id === 'W2') return 'course-w2';
  return id.toLowerCase();
};

/**
 * When each timing tag falls due, as a plain YYYY-MM-DD.
 *
 * `before-sd2` is due when SD2 starts — the point of the tag is that the work is finished before
 * anyone arrives. `sd2` is due when SD2 ends, because that weekend is when it gets done.
 * `post-course` has no deadline at all; it is excluded from pace rather than given a fake one.
 */
export function dueDates(events = []) {
  const byId = new Map(events.map((e) => [String(e.id).toUpperCase(), e]));
  const out = new Map();
  for (const [id, ev] of byId) {
    if (/^SD\d$/.test(id)) {
      out.set(`before-${id.toLowerCase()}`, { due: dateOf(ev.hard_start), label: `Before ${id}`, sort: dateOf(ev.hard_start) });
    }
    out.set(eventTag(id), { due: dateOf(ev.hard_stop), label: ev.name ?? id, sort: dateOf(ev.hard_stop) });
  }
  // Sorts last, and `due: null` keeps it out of the pace calculation.
  out.set('post-course', { due: null, label: 'After the course', sort: '9999-12-31' });
  return out;
}

/** The bucket an unplaced task belongs to: the first of its tags the calendar recognises. */
export function taskBucket(activity, due = dueDates()) {
  for (const t of activity?.tags ?? []) if (due.has(t)) return t;
  return null;
}

const UNSCHEDULED = { due: null, label: 'No weekend yet', sort: '9998-12-31' };

/**
 * Every unit of work: one entry per placement of a staff task, plus one per task that is not on
 * the schedule at all.
 */
export function taskUnits({ activities = [], placements = [], events = [] } = {}) {
  const due = dueDates(events);
  const evById = new Map(events.map((e) => [String(e.id), e]));
  const byId = new Map(activities.filter(isTask).map((a) => [a.id, a]));
  const units = [];
  const placed = new Set();

  for (const p of placements) {
    const a = byId.get(p.activity_id);
    if (!a) continue; // not a task, or not in this catalog
    placed.add(a.id);
    const key = eventTag(p.event_id);
    const meta = due.get(key) ?? UNSCHEDULED;
    units.push({
      key: p.id, activity: a, placement: p,
      minutes: Number(p.duration_min) || Number(a.duration_min) || 0,
      // A scheduled occurrence is due the day it is scheduled — more truthful than its tag.
      due: p.day || meta.due, bucket: key, label: meta.label, sort: meta.sort,
    });
  }

  for (const a of byId.values()) {
    if (placed.has(a.id)) continue;
    const key = taskBucket(a, due);
    const meta = (key && due.get(key)) || UNSCHEDULED;
    units.push({
      key: a.id, activity: a, placement: null,
      minutes: Number(a.duration_min) || 0,
      due: meta.due, bucket: key ?? 'unscheduled', label: meta.label, sort: meta.sort,
    });
  }
  return units;
}

/** How many occurrences of one task there are, and how many are done. For the rail. */
export function taskTally(tasks, activity, placements = []) {
  const mine = placements.filter((p) => p.activity_id === activity?.id);
  if (!mine.length) return { total: 1, done: taskStatus(tasks, activity, null) === 'done' ? 1 : 0, placements: [] };
  return { total: mine.length, done: mine.filter((p) => taskStatus(tasks, activity, p) === 'done').length, placements: mine };
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);

/**
 * Roll up every unit of staff work.
 *
 * @param {object} o
 * @param {Array}  o.activities  pack activities plus custom ones
 * @param {Array}  o.placements  the schedule, so repeated work counts once per occurrence
 * @param {Array}  o.events      pack events, for the deadlines
 * @param {object} o.tasks       the schedule document's `tasks` map
 * @param {string} [o.asOf]      YYYY-MM-DD; defaults to today. Explicit so tests are not time-bombs.
 */
export function progress({ activities = [], placements = [], events = [], tasks = {}, asOf = todayIso() } = {}) {
  const units = taskUnits({ activities, placements, events });

  const counts = { todo: 0, doing: 0, blocked: 0, done: 0 };
  let minutesTotal = 0, minutesDone = 0;
  // Pace counts only units with a deadline, so finishing undated work early cannot flatter it.
  let dated = 0, datedDone = 0, dueByNow = 0;
  const buckets = new Map();

  for (const u of units) {
    const status = taskStatus(tasks, u.activity, u.placement);
    counts[status]++;
    minutesTotal += u.minutes;
    if (status === 'done') minutesDone += u.minutes;

    if (!buckets.has(u.bucket)) buckets.set(u.bucket, { key: u.bucket, label: u.label, due: u.due, sort: u.sort, total: 0, done: 0, doing: 0, blocked: 0, todo: 0, minutes: 0, minutesDone: 0, scheduled: 0 });
    const b = buckets.get(u.bucket);
    b.total++; b[status]++; b.minutes += u.minutes;
    if (u.placement) b.scheduled++;
    if (status === 'done') b.minutesDone += u.minutes;

    if (u.due) {
      dated++;
      if (status === 'done') datedDone++;
      if (u.due <= asOf) dueByNow++;
    }
  }

  const ordered = [...buckets.values()].sort((x, y) => (x.sort < y.sort ? -1 : x.sort > y.sort ? 1 : 0));
  for (const b of ordered) b.remaining = b.total - b.done;

  const next = ordered.find((b) => b.due && b.due >= asOf && b.remaining > 0) ?? null;

  return {
    asOf,
    total: units.length,
    ...counts,
    /** Distinct catalog rows behind those units — "17 work blocks" is 1 task, 17 occurrences. */
    distinct: new Set(units.map((u) => u.activity.id)).size,
    scheduled: units.filter((u) => u.placement).length,
    hours: Math.round((minutesTotal / 60) * 10) / 10,
    hoursDone: Math.round((minutesDone / 60) * 10) / 10,
    percentDone: units.length ? Math.round((counts.done / units.length) * 100) : 0,
    dated,
    datedDone,
    dueByNow,
    /** Positive means finished more than the calendar asked for by now. */
    aheadBy: datedDone - dueByNow,
    buckets: ordered,
    next: next && { ...next, daysAway: daysBetween(asOf, next.due) },
  };
}
