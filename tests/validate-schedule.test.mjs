// The schedule validator is the gate between a hand-authored file and everyone's shared schedule.
// It now runs in two places — `npm run check:schedule` and the app's Load JSON — off this one
// implementation, so these cover the rules rather than either front end.
//
// The first two cases are the problems that actually reached the live schedule and sat there for
// weeks: placements on a lane that does not exist, and custom activities missing the fields the
// left rail reads. Both were reported all along by a command nobody ran.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSchedule } from '../src/validateSchedule.js';

const PACK = {
  id: 'nylt-27-1',
  activities: [
    { id: 'lunch', name: 'Lunch', type: 'meal', duration_min: 45, tags: [] },
    { id: 'qm-thing', name: 'QM thing', type: 'staff_task', duration_min: 60, tags: [] },
  ],
  resources: [{ id: 'QM-ADULT' }, { id: 'ASPL-QM' }],
  events: [{
    id: 'W1', name: 'Course Weekend 1',
    days: [{ date: '2027-02-13', startMin: 360, endMin: 1410 }],
    tracks: [{ id: 'W1-all', is_all_hands: true }, { id: 'W1-qm', is_all_hands: false }],
  }],
};
const doc = (over = {}) => ({ format: 'program-scheduler/schedule', pack: 'nylt-27-1', placements: [], customActivities: [], ...over });
const place = (over = {}) => ({ id: 'p1', activity_id: 'lunch', event_id: 'W1', track_id: 'W1-all', day: '2027-02-13', start_min: 720, duration_min: 45, ...over });

const run = (over) => validateSchedule({ doc: doc(over), pack: PACK });

test('a good file reports nothing', () => {
  const r = run({ placements: [place()] });
  assert.deepEqual(r.blocking, []);
  assert.deepEqual(r.warning, []);
  assert.deepEqual(r.counts, { placements: 1, customActivities: 0 });
});

// ---- the two that reached production ----

test('a placement on a lane that does not exist is blocking', () => {
  const r = run({ placements: [place({ track_id: 'W1-troop' })] });
  assert.equal(r.blocking.length, 1);
  assert.match(r.blocking[0], /no lane "W1-troop" on W1/);
  assert.match(r.blocking[0], /W1-all, W1-qm/, 'and it names the real lanes');
});

test('a custom activity missing the fields the rail reads is blocking', () => {
  // Exactly the shape that crashed the catalog search: no tags, no delivery, no soft_vs_hard.
  const r = run({ customActivities: [{ id: 'snack', name: 'Snack', duration_min: 15, type: 'meal', audience: 'troop' }] });
  assert.equal(r.blocking.length, 1);
  assert.match(r.blocking[0], /"snack" is missing delivery, soft_vs_hard, tags/);
});

// ---- the rest of the blocking rules ----

test('the wrong format is blocking', () => {
  assert.match(validateSchedule({ doc: { format: 'something-else', placements: [] }, pack: PACK }).blocking.join(), /format is "something-else"/);
});

test('a placement pointing at an unknown activity is blocking', () => {
  assert.match(run({ placements: [place({ activity_id: 'nope' })] }).blocking.join(), /no activity "nope"/);
});

test('an unknown event, a day outside the event, and a duplicate id are each blocking', () => {
  assert.match(run({ placements: [place({ event_id: 'W9' })] }).blocking.join(), /no event "W9"/);
  assert.match(run({ placements: [place({ day: '2027-03-99' })] }).blocking.join(), /not a day of W1/);
  assert.match(run({ placements: [place(), place()] }).blocking.join(), /duplicate placement id "p1"/);
});

test('placements that is not an array is blocking rather than a crash', () => {
  assert.match(validateSchedule({ doc: { format: 'program-scheduler/schedule', placements: 'nope' }, pack: PACK }).blocking.join(), /"placements" is missing or is not an array/);
});

test('a non-numeric time is blocking rather than producing NaN warnings', () => {
  const r = run({ placements: [place({ start_min: 'noon' })] });
  assert.match(r.blocking.join(), /start_min or duration_min is not a number/);
});

test('a status credited to something that is not a role id is blocking', () => {
  // This is the one way a person's name could get in, so it is not a warning.
  const r = run({ placements: [place()], tasks: { p1: { status: 'done', by: 'Someone Real' } } });
  assert.match(r.blocking.join(), /not a role id/);
  assert.deepEqual(run({ placements: [place()], tasks: { p1: { status: 'done', by: 'QM-ADULT' } } }).blocking, []);
});

test('a tasks map that is an array is blocking, because the client spreads it', () => {
  assert.match(run({ tasks: [] }).blocking.join(), /"tasks" is an array/);
});

// ---- warnings: it loads, but look at it ----

test('off-grid times and times outside the day are warnings, not blockers', () => {
  const r = run({ placements: [place({ start_min: 727, duration_min: 20 })] });
  assert.deepEqual(r.blocking, []);
  assert.equal(r.warning.length, 2, r.warning.join(' | '));
  assert.match(r.warning.join(), /off the 15-minute grid/);
  assert.match(r.warning.join(), /not a multiple of 15/);
});

test('a file for another pack warns rather than blocks', () => {
  const r = validateSchedule({ doc: doc({ pack: 'wood-badge-1' }), pack: PACK });
  assert.deepEqual(r.blocking, []);
  assert.match(r.warning.join(), /file says pack "wood-badge-1"/);
});

test('a status keyed by placement or by activity is fine; anything else warns', () => {
  assert.deepEqual(run({ placements: [place()], tasks: { p1: { status: 'done' } } }).warning, [], 'by placement id');
  assert.deepEqual(run({ tasks: { 'qm-thing': { status: 'done' } } }).warning, [], 'by activity id');
  assert.match(run({ tasks: { 'who-knows': { status: 'done' } } }).warning.join(), /matches no placement or activity/);
});

test('an unknown status reads as todo and only warns', () => {
  const r = run({ placements: [place()], tasks: { p1: { status: 'banana' } } });
  assert.deepEqual(r.blocking, []);
  assert.match(r.warning.join(), /will read as "todo"/);
});

test('an odd audience on a custom activity warns', () => {
  const r = run({ customActivities: [{ id: 'x', name: 'X', duration_min: 15, type: 'other', audience: 'everyone', delivery: 'Staff', soft_vs_hard: 'soft', tags: [] }] });
  assert.deepEqual(r.blocking, []);
  assert.match(r.warning.join(), /audience "everyone"/);
});

test('an empty schedule is valid — that is how you wipe one on purpose', () => {
  // It must not be blocked, but it is exactly the file that replaces everything with nothing.
  const r = run({ placements: [] });
  assert.deepEqual(r.blocking, []);
  assert.equal(r.counts.placements, 0);
});
