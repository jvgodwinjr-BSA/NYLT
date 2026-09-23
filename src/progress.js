// Task status roll-up: how much of the staff workload is done, and whether that is ahead of pace.
//
// Pure, like conflicts.js — no DOM, no imports from state.js or canvas.js — so tests and a future
// server can call it. `npm run lint` enforces that.
//
// "Ahead of pace" only means something against a deadline, and the pack already carries one: every
// staff task is tagged with the weekend it is meant for (`sd3`, `before-sd2`, `course-w1`), and
// events.csv knows when those weekends are. Resolving one against the other turns a pile of 124
// tasks into a dated curve, which is what makes finishing early visible.

/** Status values a task can hold. Absent from the map means `todo`, so the map only stores changes. */
export const TASK_STATUSES = ['todo', 'doing', 'blocked', 'done'];
export const TASK_STATUS_LABEL = { todo: 'To do', doing: 'In progress', blocked: 'Blocked', done: 'Done' };

/** Activities that carry a status. Presentations and meals do not — they are events, not work items. */
export const isTask = (a) => a?.type === 'staff_task';

/** The status of one task. Anything unrecognised reads as `todo` rather than throwing. */
export function taskStatus(tasks, activityId) {
  const s = tasks?.[activityId]?.status;
  return TASK_STATUSES.includes(s) ? s : 'todo';
}

const dateOf = (s) => String(s ?? '').slice(0, 10);

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
      out.set(id.toLowerCase(), { due: dateOf(ev.hard_stop), label: ev.name ?? id, sort: dateOf(ev.hard_stop) });
    }
  }
  for (const [tag, id] of [['course-w1', 'W1'], ['course-w2', 'W2']]) {
    const ev = byId.get(id);
    if (ev) out.set(tag, { due: dateOf(ev.hard_stop), label: ev.name ?? id, sort: dateOf(ev.hard_stop) });
  }
  // Sorts last, and `due: null` keeps it out of the pace calculation.
  out.set('post-course', { due: null, label: 'After the course', sort: '9999-12-31' });
  return out;
}

/** The bucket a task belongs to: the first of its tags the calendar recognises. */
export function taskBucket(activity, due = dueDates()) {
  for (const t of activity?.tags ?? []) if (due.has(t)) return t;
  return null;
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);

/**
 * Roll up every staff task in the catalog.
 *
 * @param {object} o
 * @param {Array}  o.activities  pack activities plus custom ones
 * @param {Array}  o.events      pack events, for the deadlines
 * @param {object} o.tasks       the schedule document's `tasks` map
 * @param {string} [o.asOf]      YYYY-MM-DD; defaults to today. Explicit so tests are not time-bombs.
 */
export function progress({ activities = [], events = [], tasks = {}, asOf = todayIso() } = {}) {
  const due = dueDates(events);
  const items = activities.filter(isTask);

  const counts = { todo: 0, doing: 0, blocked: 0, done: 0 };
  let minutesTotal = 0, minutesDone = 0;
  // Pace counts only tasks that have a deadline, so finishing a post-course task early cannot
  // flatter the number.
  let dated = 0, datedDone = 0, dueByNow = 0;
  const buckets = new Map();

  for (const a of items) {
    const status = taskStatus(tasks, a.id);
    const mins = Number(a.duration_min) || 0;
    counts[status]++;
    minutesTotal += mins;
    if (status === 'done') minutesDone += mins;

    const key = taskBucket(a, due) ?? 'unscheduled';
    const meta = due.get(key) ?? { due: null, label: 'No weekend yet', sort: '9998-12-31' };
    if (!buckets.has(key)) buckets.set(key, { key, label: meta.label, due: meta.due, sort: meta.sort, total: 0, done: 0, doing: 0, blocked: 0, todo: 0, minutes: 0, minutesDone: 0 });
    const b = buckets.get(key);
    b.total++; b[status]++; b.minutes += mins;
    if (status === 'done') b.minutesDone += mins;

    if (meta.due) {
      dated++;
      if (status === 'done') datedDone++;
      if (meta.due <= asOf) dueByNow++;
    }
  }

  const ordered = [...buckets.values()].sort((x, y) => (x.sort < y.sort ? -1 : x.sort > y.sort ? 1 : 0));
  for (const b of ordered) b.remaining = b.total - b.done;

  // The next weekend that still has unfinished work — the one worth naming at the top of the panel.
  const next = ordered.find((b) => b.due && b.due >= asOf && b.remaining > 0) ?? null;

  return {
    asOf,
    total: items.length,
    ...counts,
    hours: Math.round((minutesTotal / 60) * 10) / 10,
    hoursDone: Math.round((minutesDone / 60) * 10) / 10,
    percentDone: items.length ? Math.round((counts.done / items.length) * 100) : 0,
    dated,
    datedDone,
    dueByNow,
    /** Positive means finished more than the calendar asked for by now. */
    aheadBy: datedDone - dueByNow,
    buckets: ordered,
    next: next && { ...next, daysAway: daysBetween(asOf, next.due) },
  };
}
