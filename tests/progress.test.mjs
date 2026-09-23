// The pace maths decides what the team sees at the top of the Progress panel, so it gets the
// same treatment as the conflict rules: fixed dates, no reliance on "today", and the awkward
// cases asserted rather than assumed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progress, dueDates, taskBucket, taskStatus, isTask } from '../src/progress.js';

const EVENTS = [
  { id: 'SD2', name: 'SD2 — Full staff', hard_start: '2026-12-11T18:00', hard_stop: '2026-12-13T16:00' },
  { id: 'SD3', name: 'SD3 — Full staff', hard_start: '2027-01-08T18:00', hard_stop: '2027-01-10T16:00' },
  { id: 'W1', name: 'Course Weekend 1', hard_start: '2027-02-12T18:00', hard_stop: '2027-02-15T17:00' },
];
const task = (id, tags, duration_min = 60) => ({ id, name: id, type: 'staff_task', duration_min, tags });
const talk = (id) => ({ id, name: id, type: 'presentation', duration_min: 45, tags: [] });

test('a before-SD task is due when that weekend starts, not when it ends', () => {
  const d = dueDates(EVENTS);
  assert.equal(d.get('before-sd2').due, '2026-12-11');
  assert.equal(d.get('sd2').due, '2026-12-13');
});

test('post-course work has no deadline rather than a made-up one', () => {
  assert.equal(dueDates(EVENTS).get('post-course').due, null);
});

test('only staff tasks carry a status', () => {
  assert.equal(isTask(task('a', ['qm'])), true);
  assert.equal(isTask(talk('servant-leadership')), false);
  const r = progress({ activities: [task('a', ['sd2']), talk('b')], events: EVENTS, tasks: {}, asOf: '2026-10-01' });
  assert.equal(r.total, 1, 'the presentation is not counted as a task');
});

test('an unknown or absent status reads as todo', () => {
  assert.equal(taskStatus({}, 'a'), 'todo');
  assert.equal(taskStatus({ a: { status: 'banana' } }, 'a'), 'todo');
  assert.equal(taskStatus({ a: { status: 'done' } }, 'a'), 'done');
});

test('before any deadline, every finished task counts as ahead', () => {
  const acts = [task('a', ['sd2']), task('b', ['sd2']), task('c', ['sd3'])];
  const r = progress({ activities: acts, events: EVENTS, tasks: { a: { status: 'done' } }, asOf: '2026-10-01' });
  assert.equal(r.dueByNow, 0);
  assert.equal(r.aheadBy, 1, 'nothing was due yet, so one done is one ahead');
});

test('behind shows as a negative, counting only what was actually due', () => {
  const acts = [task('a', ['sd2']), task('b', ['sd2']), task('c', ['sd3'])];
  // Past SD2 (2 due), past nothing else. One of the two is done.
  const r = progress({ activities: acts, events: EVENTS, tasks: { a: { status: 'done' } }, asOf: '2026-12-20' });
  assert.equal(r.dueByNow, 2);
  assert.equal(r.aheadBy, -1);
});

test('finishing undated work early cannot flatter the pace number', () => {
  const acts = [task('a', ['sd2']), task('p1', ['post-course']), task('p2', ['post-course'])];
  const r = progress({ activities: acts, events: EVENTS, tasks: { p1: { status: 'done' }, p2: { status: 'done' } }, asOf: '2026-10-01' });
  assert.equal(r.done, 2, 'they still count as done');
  assert.equal(r.datedDone, 0, 'but not toward pace, because they had no deadline');
  assert.equal(r.aheadBy, 0);
});

test('counts, hours and percent add up', () => {
  const acts = [task('a', ['sd2'], 60), task('b', ['sd2'], 30), task('c', ['sd3'], 90), task('d', ['sd3'], 60)];
  const r = progress({ activities: acts, events: EVENTS,
    tasks: { a: { status: 'done' }, b: { status: 'doing' }, c: { status: 'blocked' } }, asOf: '2026-10-01' });
  assert.equal(r.total, 4);
  assert.deepEqual([r.done, r.doing, r.blocked, r.todo], [1, 1, 1, 1]);
  assert.equal(r.hours, 4);
  assert.equal(r.hoursDone, 1);
  assert.equal(r.percentDone, 25);
});

test('buckets come back in calendar order with the remaining work', () => {
  const acts = [task('c', ['sd3']), task('a', ['before-sd2']), task('b', ['sd2']), task('z', ['post-course'])];
  const r = progress({ activities: acts, events: EVENTS, tasks: { b: { status: 'done' } }, asOf: '2026-10-01' });
  assert.deepEqual(r.buckets.map((x) => x.key), ['before-sd2', 'sd2', 'sd3', 'post-course']);
  assert.equal(r.buckets.find((x) => x.key === 'sd2').remaining, 0);
  assert.equal(r.buckets.find((x) => x.key === 'sd3').remaining, 1);
});

test('next names the soonest weekend that still has work left', () => {
  const acts = [task('a', ['sd2']), task('b', ['sd3'])];
  const done = progress({ activities: acts, events: EVENTS, tasks: { a: { status: 'done' } }, asOf: '2026-10-01' });
  assert.equal(done.next.key, 'sd3', 'SD2 is finished, so it is not what is next');
  assert.equal(done.next.daysAway, 101);
  const none = progress({ activities: acts, events: EVENTS, tasks: { a: { status: 'done' }, b: { status: 'done' } }, asOf: '2026-10-01' });
  assert.equal(none.next, null, 'nothing left anywhere');
});

test('a task with no recognised weekend tag still appears, under its own heading', () => {
  const r = progress({ activities: [task('a', ['qm', 'gear'])], events: EVENTS, tasks: {}, asOf: '2026-10-01' });
  assert.equal(r.buckets.length, 1);
  assert.equal(r.buckets[0].key, 'unscheduled');
  assert.equal(r.dated, 0, 'and does not affect pace');
});

test('taskBucket picks the first tag the calendar knows, ignoring the rest', () => {
  const d = dueDates(EVENTS);
  assert.equal(taskBucket({ tags: ['qm', 'gear', 'sd3'] }, d), 'sd3');
  assert.equal(taskBucket({ tags: ['qm', 'gear'] }, d), null);
});

test('an empty pack does not divide by zero', () => {
  const r = progress({ activities: [], events: EVENTS, tasks: {}, asOf: '2026-10-01' });
  assert.equal(r.total, 0);
  assert.equal(r.percentDone, 0);
  assert.equal(r.next, null);
});
