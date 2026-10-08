// The pace maths decides what the team sees at the top of the Progress panel, so it gets the
// same treatment as the conflict rules: fixed dates, no reliance on "today", and the awkward
// cases asserted rather than assumed.
//
// The unit of work is one occurrence — one placement, or one task that is not on the schedule.
// Most of what is here exists because counting by catalog row instead got it wrong.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progress, dueDates, taskBucket, taskStatus, taskKey, taskEntry, taskTally, taskUnits, isTask, eventTag } from '../src/progress.js';

const EVENTS = [
  { id: 'SD2', name: 'SD2 — Full staff', hard_start: '2026-12-11T18:00', hard_stop: '2026-12-13T16:00' },
  { id: 'SD3', name: 'SD3 — Full staff', hard_start: '2027-01-08T18:00', hard_stop: '2027-01-10T16:00' },
  { id: 'W1', name: 'Course Weekend 1', hard_start: '2027-02-12T18:00', hard_stop: '2027-02-15T17:00' },
];
const task = (id, tags, duration_min = 60) => ({ id, name: id, type: 'staff_task', duration_min, tags });
const talk = (id) => ({ id, name: id, type: 'presentation', duration_min: 45, tags: [] });
const place = (id, activity_id, event_id, day, duration_min = 60) => ({ id, activity_id, event_id, day, start_min: 540, duration_min });

// ---------- keys and status ----------

test('a placed occurrence is keyed by its placement, an unplaced task by its activity', () => {
  const a = task('a', ['sd2']);
  assert.equal(taskKey(a, null), 'a');
  assert.equal(taskKey(a, place('p1', 'a', 'SD2', '2026-12-12')), 'p1');
});

test('two placements of one task hold independent statuses', () => {
  const a = task('qm-daily', ['course-w1']);
  const p1 = place('p1', 'qm-daily', 'W1', '2027-02-13');
  const p2 = place('p2', 'qm-daily', 'W1', '2027-02-14');
  const tasks = { p1: { status: 'done' } };
  assert.equal(taskStatus(tasks, a, p1), 'done');
  assert.equal(taskStatus(tasks, a, p2), 'todo', 'marking one morning done must not mark the next');
});

test('an activity-keyed status from an older file is still read for a placed occurrence', () => {
  const a = task('a', ['sd2']);
  const p = place('p1', 'a', 'SD2', '2026-12-12');
  assert.equal(taskStatus({ a: { status: 'done' } }, a, p), 'done', 'legacy entries are not silently lost');
  assert.equal(taskEntry({ a: { status: 'done', by: 'QM-ADULT' } }, a, p).by, 'QM-ADULT');
});

test('an unknown or absent status reads as todo', () => {
  const a = task('a', ['sd2']);
  assert.equal(taskStatus({}, a, null), 'todo');
  assert.equal(taskStatus({ a: { status: 'banana' } }, a, null), 'todo');
});

test('only staff tasks carry a status', () => {
  assert.equal(isTask(task('a', ['qm'])), true);
  assert.equal(isTask(talk('servant-leadership')), false);
  const r = progress({ activities: [task('a', ['sd2']), talk('b')], events: EVENTS, tasks: {}, asOf: '2026-10-01' });
  assert.equal(r.total, 1, 'the presentation is not counted');
});

// ---------- units ----------

test('a task placed many times is many units, not one', () => {
  const a = task('qm-work-block', ['sd2']);
  const placements = [place('p1', 'qm-work-block', 'SD2', '2026-12-12'), place('p2', 'qm-work-block', 'SD2', '2026-12-13'), place('p3', 'qm-work-block', 'SD3', '2027-01-09')];
  const units = taskUnits({ activities: [a], placements, events: EVENTS });
  assert.equal(units.length, 3);
  assert.deepEqual(units.map((u) => u.key), ['p1', 'p2', 'p3']);
});

test('a task that is placed is not also counted as backlog', () => {
  const a = task('a', ['sd2']);
  const units = taskUnits({ activities: [a], placements: [place('p1', 'a', 'SD2', '2026-12-12')], events: EVENTS });
  assert.equal(units.length, 1, 'one occurrence, not one placed plus one unplaced');
  assert.equal(units[0].placement.id, 'p1');
});

test('a placed occurrence is due the day it is scheduled, not its tag', () => {
  // Tagged for SD3, actually scheduled inside SD2 — the schedule is the truth.
  const a = task('a', ['sd3']);
  const units = taskUnits({ activities: [a], placements: [place('p1', 'a', 'SD2', '2026-12-12')], events: EVENTS });
  assert.equal(units[0].due, '2026-12-12');
  assert.equal(units[0].bucket, 'sd2', 'and it groups under the weekend it is actually on');
});

test('placed and unplaced work for the same weekend share one bucket line', () => {
  const r = progress({ activities: [task('placed', ['sd2']), task('backlog', ['sd2'])],
    placements: [place('p1', 'placed', 'SD2', '2026-12-12')], events: EVENTS, tasks: {}, asOf: '2026-10-01' });
  const sd2 = r.buckets.filter((b) => b.key === 'sd2');
  assert.equal(sd2.length, 1, 'SD2 is not listed twice');
  assert.equal(sd2[0].total, 2);
  assert.equal(sd2[0].scheduled, 1);
});

test('eventTag maps event ids onto the tags the catalog uses', () => {
  assert.equal(eventTag('SD2'), 'sd2');
  assert.equal(eventTag('W1'), 'course-w1');
  assert.equal(eventTag('W2'), 'course-w2');
});

test('a placement of something that is not a task is ignored', () => {
  const units = taskUnits({ activities: [talk('lunch-talk')], placements: [place('p1', 'lunch-talk', 'SD2', '2026-12-12')], events: EVENTS });
  assert.equal(units.length, 0);
});

// ---------- the tally the rail shows ----------

test('taskTally counts occurrences and how many are done', () => {
  const a = task('qm-daily', ['course-w1']);
  const ps = [place('p1', 'qm-daily', 'W1', '2027-02-13'), place('p2', 'qm-daily', 'W1', '2027-02-14'), place('p3', 'qm-daily', 'W1', '2027-02-15')];
  const t = taskTally({ p1: { status: 'done' }, p3: { status: 'done' } }, a, ps);
  assert.deepEqual([t.done, t.total], [2, 3]);
});

test('an unplaced task tallies as one, from its activity key', () => {
  const a = task('a', ['sd2']);
  assert.deepEqual(taskTally({ a: { status: 'done' } }, a, []), { total: 1, done: 1, placements: [] });
  assert.equal(taskTally({}, a, []).done, 0);
});

// ---------- pace ----------

test('before any deadline, every finished unit counts as ahead', () => {
  const acts = [task('a', ['sd2']), task('b', ['sd2']), task('c', ['sd3'])];
  const r = progress({ activities: acts, events: EVENTS, tasks: { a: { status: 'done' } }, asOf: '2026-10-01' });
  assert.equal(r.dueByNow, 0);
  assert.equal(r.aheadBy, 1);
});

test('behind shows as a negative, counting only what was actually due', () => {
  const acts = [task('a', ['sd2']), task('b', ['sd2']), task('c', ['sd3'])];
  const r = progress({ activities: acts, events: EVENTS, tasks: { a: { status: 'done' } }, asOf: '2026-12-20' });
  assert.equal(r.dueByNow, 2);
  assert.equal(r.aheadBy, -1);
});

test('each occurrence of a repeated task counts toward pace on its own day', () => {
  const a = task('qm-daily', ['course-w1']);
  const ps = [place('p1', 'qm-daily', 'W1', '2027-02-13'), place('p2', 'qm-daily', 'W1', '2027-02-14'), place('p3', 'qm-daily', 'W1', '2027-02-15')];
  // The 14th has passed; the 15th has not.
  const r = progress({ activities: [a], placements: ps, events: EVENTS, tasks: { p1: { status: 'done' }, p2: { status: 'done' } }, asOf: '2027-02-14' });
  assert.equal(r.total, 3);
  assert.equal(r.dueByNow, 2, 'two mornings have come and gone');
  assert.equal(r.aheadBy, 0, 'both were done, so the team is level rather than two ahead');
});

test('finishing undated work early cannot flatter the pace number', () => {
  const acts = [task('a', ['sd2']), task('p1', ['post-course']), task('p2', ['post-course'])];
  const r = progress({ activities: acts, events: EVENTS, tasks: { p1: { status: 'done' }, p2: { status: 'done' } }, asOf: '2026-10-01' });
  assert.equal(r.done, 2);
  assert.equal(r.datedDone, 0);
  assert.equal(r.aheadBy, 0);
});

// ---------- totals ----------

test('counts, hours and percent follow the occurrences', () => {
  const a = task('rep', ['sd2'], 60);
  const ps = [place('p1', 'rep', 'SD2', '2026-12-12', 30), place('p2', 'rep', 'SD2', '2026-12-13', 90)];
  const r = progress({ activities: [a, task('solo', ['sd3'], 60)], placements: ps, events: EVENTS,
    tasks: { p1: { status: 'done' } }, asOf: '2026-10-01' });
  assert.equal(r.total, 3, 'two occurrences plus one unplaced task');
  assert.equal(r.distinct, 2, 'from two catalog rows');
  assert.equal(r.scheduled, 2);
  assert.equal(r.hours, 3, 'placement durations are used, not the catalog default');
  assert.equal(r.hoursDone, 0.5);
  assert.equal(r.percentDone, 33);
});

test('buckets come back in calendar order with the remaining work', () => {
  const acts = [task('c', ['sd3']), task('a', ['before-sd2']), task('b', ['sd2']), task('z', ['post-course'])];
  const r = progress({ activities: acts, events: EVENTS, tasks: { b: { status: 'done' } }, asOf: '2026-10-01' });
  assert.deepEqual(r.buckets.map((x) => x.key), ['before-sd2', 'sd2', 'sd3', 'post-course']);
  assert.equal(r.buckets.find((x) => x.key === 'sd2').remaining, 0);
});

test('next names the soonest weekend that still has work left', () => {
  const acts = [task('a', ['sd2']), task('b', ['sd3'])];
  const done = progress({ activities: acts, events: EVENTS, tasks: { a: { status: 'done' } }, asOf: '2026-10-01' });
  assert.equal(done.next.key, 'sd3');
  assert.equal(done.next.daysAway, 101);
  const none = progress({ activities: acts, events: EVENTS, tasks: { a: { status: 'done' }, b: { status: 'done' } }, asOf: '2026-10-01' });
  assert.equal(none.next, null);
});

test('a task with no recognised weekend tag still appears, under its own heading', () => {
  const r = progress({ activities: [task('a', ['qm', 'gear'])], events: EVENTS, tasks: {}, asOf: '2026-10-01' });
  assert.equal(r.buckets[0].key, 'unscheduled');
  assert.equal(r.dated, 0);
});

test('taskBucket picks the first tag the calendar knows, ignoring the rest', () => {
  const d = dueDates(EVENTS);
  assert.equal(taskBucket({ tags: ['qm', 'gear', 'sd3'] }, d), 'sd3');
  assert.equal(taskBucket({ tags: ['qm', 'gear'] }, d), null);
});

test('a before-SD task is due when that weekend starts, not when it ends', () => {
  const d = dueDates(EVENTS);
  assert.equal(d.get('before-sd2').due, '2026-12-11');
  assert.equal(d.get('sd2').due, '2026-12-13');
});

test('post-course work has no deadline rather than a made-up one', () => {
  assert.equal(dueDates(EVENTS).get('post-course').due, null);
});

test('an empty pack does not divide by zero', () => {
  const r = progress({ activities: [], events: EVENTS, tasks: {}, asOf: '2026-10-01' });
  assert.equal(r.total, 0);
  assert.equal(r.percentDone, 0);
  assert.equal(r.next, null);
});
