import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, byPlacement, coverageMatrix } from '../src/conflicts.js';
import { computeDays } from '../src/pack.js';

const tracks = (id, names) => names.map((n, i) => ({ id: `${id}-${n}`, event_id: id, name: n, is_all_hands: n === 'all', sort: i }));
const W2 = { id: 'W2', name: 'Course Weekend 2', hard_start: '2027-02-19T18:00', hard_stop: '2027-02-21T16:00' };
const SD2 = { id: 'SD2', name: 'SD2', hard_start: '2026-12-11T18:00', hard_stop: '2026-12-13T16:00' };
const events = [W2, SD2].map((e) => ({ ...e, days: computeDays(e), tracks: tracks(e.id, e.id === 'W2' ? ['all', 'patrol', 'qm'] : ['all', 'tg', 'qm']) }));
const activities = [
  { id: 'servant', name: 'Servant Leadership', type: 'presentation', delivery: 'Troop', syllabus_day: 4, practice_sd: 'SD2', ready: 'Not started', duration_min: 60 },
  { id: 'com3', name: 'Com 3', type: 'presentation', delivery: 'TG', syllabus_day: 3, practice_sd: 'SD2', ready: 'Ready', duration_min: 30 },
  { id: 'outpost', name: 'Outpost', type: 'outpost', delivery: 'Troop', duration_min: 240 },
  { id: 'lunch', name: 'Lunch', type: 'meal', delivery: 'Troop', duration_min: 60 },
  { id: 'flag', name: 'Flag', type: 'presentation', delivery: 'Troop', syllabus_day: 1, practice_sd: '', duration_min: 15 },
];
const constraints = [
  { id: 'outpost-lock', event_id: 'W2', rule_type: 'lock_slot', params: { activity_id: 'outpost', day: '2027-02-20', not_before: '17:00' }, severity: 'hard', description: 'Outpost Sat night' },
  { id: 'tg', event_id: '', rule_type: 'delivery', params: { delivery: 'TG', disallow_all_hands: true }, severity: 'soft' },
  { id: 'order', event_id: '', rule_type: 'syllabus_day_order', params: { day_map: { W2: [4, 5, 6] } }, severity: 'soft' },
  { id: 'ready', event_id: '', rule_type: 'ready_gate', params: { events: ['W2'], required: 'Ready' }, severity: 'soft' },
  { id: 'cov', event_id: '', rule_type: 'practice_coverage', params: { sd_events: ['SD2'] }, severity: 'soft' },
];
const P = (id, o) => ({ id, event_id: 'W2', track_id: 'W2-all', day: '2027-02-20', start_min: 660, duration_min: 60, resource_ids: [], flags: [], ...o });
const run = (placements) => evaluate({ placements, activities, events, constraints });
const rules = (vs) => vs.map((v) => v.rule).sort();

test('clean schedule has only quiet coverage/readiness notices', () => {
  const vs = run([P('a', { activity_id: 'lunch' }), P('b', { activity_id: 'outpost', start_min: 17 * 60, duration_min: 240 })]);
  assert.ok(vs.every((v) => v.quiet), JSON.stringify(vs));
});

test('resource_double_booked: same person in two overlapping blocks, across lanes', () => {
  const vs = run([P('a', { activity_id: 'lunch', resource_ids: ['TG-1'] }), P('b', { activity_id: 'servant', track_id: 'W2-qm', start_min: 690, resource_ids: ['TG-1'], flags: ['overlap-ok'] })]);
  const v = vs.find((x) => x.rule === 'resource_double_booked');
  assert.ok(v && v.severity === 'hard'); assert.deepEqual(v.placement_ids.sort(), ['a', 'b']); assert.deepEqual(v.resource_ids, ['TG-1']);
  assert.ok(!run([P('a', { activity_id: 'lunch', resource_ids: ['TG-1'] }), P('b', { activity_id: 'servant', start_min: 720, resource_ids: ['TG-1'] })]).some((x) => x.rule === 'resource_double_booked'), 'adjacent blocks do not conflict');
});

test('track_overlap: same lane, or any all-hands overlap; overlap-ok flag silences', () => {
  assert.ok(run([P('a', { activity_id: 'lunch', track_id: 'W2-qm' }), P('b', { activity_id: 'servant', track_id: 'W2-qm', start_min: 690 })]).some((x) => x.rule === 'track_overlap'));
  assert.ok(run([P('a', { activity_id: 'lunch' }), P('b', { activity_id: 'servant', track_id: 'W2-qm', start_min: 690 })]).some((x) => x.rule === 'track_overlap'), 'all-hands blocks every lane');
  assert.ok(!run([P('a', { activity_id: 'lunch', track_id: 'W2-patrol' }), P('b', { activity_id: 'servant', track_id: 'W2-qm', start_min: 690 })]).some((x) => x.rule === 'track_overlap'), 'parallel lanes may overlap');
  assert.ok(!run([P('a', { activity_id: 'lunch', flags: ['overlap-ok'] }), P('b', { activity_id: 'servant', track_id: 'W2-qm', start_min: 690 })]).some((x) => x.rule === 'track_overlap'));
});

test('outside_event_bounds: Friday before 6 PM, or a day not in the event', () => {
  assert.ok(run([P('a', { activity_id: 'lunch', day: '2027-02-19', start_min: 12 * 60 })]).some((x) => x.rule === 'outside_event_bounds'));
  assert.ok(run([P('a', { activity_id: 'lunch', day: '2027-02-22' })]).some((x) => x.rule === 'outside_event_bounds'));
  assert.ok(run([P('a', { activity_id: 'lunch', day: '2027-02-21', start_min: 15 * 60 + 30, duration_min: 60 })]).some((x) => x.rule === 'outside_event_bounds'), 'runs past Sunday 4 PM');
});

test('lock_slot: Outpost off Saturday night is hard; missing Outpost is a quiet notice', () => {
  const wrongDay = run([P('a', { activity_id: 'outpost', day: '2027-02-21', start_min: 9 * 60, duration_min: 240 })]).find((x) => x.rule === 'lock_slot' && !x.quiet);
  assert.ok(wrongDay && wrongDay.severity === 'hard' && /2027-02-20/.test(wrongDay.message));
  const tooEarly = run([P('a', { activity_id: 'outpost', start_min: 14 * 60, duration_min: 240 })]).find((x) => x.rule === 'lock_slot' && !x.quiet);
  assert.ok(tooEarly && /5:00 PM/.test(tooEarly.message));
  assert.ok(run([]).some((x) => x.rule === 'lock_slot' && x.quiet && x.activity_id === 'outpost'));
});

test('delivery_mismatch: TG module in an all-hands lane, unless Override', () => {
  assert.ok(run([P('a', { activity_id: 'com3' })]).some((x) => x.rule === 'delivery_mismatch' && x.severity === 'soft'));
  assert.ok(!run([P('a', { activity_id: 'com3', track_id: 'W2-patrol' })]).some((x) => x.rule === 'delivery_mismatch'));
  assert.ok(!run([P('a', { activity_id: 'com3', flags: ['override'] })]).some((x) => x.rule === 'delivery_mismatch'));
});

test('syllabus_day_order: day-4 module on course day 4 is fine; day-4 module cannot be checked earlier than the event allows', () => {
  assert.ok(!run([P('a', { activity_id: 'servant', day: '2027-02-19', start_min: 19 * 60 })]).some((x) => x.rule === 'syllabus_day_order'), 'Fri = course day 4, syllabus day 4');
  const act2 = activities.map((a) => a.id === 'servant' ? { ...a, syllabus_day: 6 } : a);
  assert.ok(evaluate({ placements: [P('a', { activity_id: 'servant' })], activities: act2, events, constraints }).some((x) => x.rule === 'syllabus_day_order'), 'syllabus day 6 on course day 5');
});

test('ready_gate is quiet; practice coverage flags unpracticed and unassigned', () => {
  const vs = run([P('a', { activity_id: 'servant' })]);
  const r = vs.find((x) => x.rule === 'ready_gate'); assert.ok(r?.quiet);
  assert.ok(vs.some((x) => x.rule === 'practice_uncovered' && x.activity_id === 'servant'));
  assert.ok(vs.some((x) => x.rule === 'practice_uncovered' && x.activity_id === 'flag' && /no Practice SD/.test(x.message)));
  const practiced = run([P('a', { activity_id: 'servant' }), P('p', { activity_id: 'servant', event_id: 'SD2', track_id: 'SD2-tg', day: '2026-12-12' })]);
  assert.ok(!practiced.some((x) => x.rule === 'practice_uncovered' && x.activity_id === 'servant'));
});

test('byPlacement excludes quiet; coverageMatrix cells', () => {
  const vs = run([P('a', { activity_id: 'com3' })]);
  assert.deepEqual([...byPlacement(vs).get('a')].map((v) => v.rule), ['delivery_mismatch']);
  const m = coverageMatrix({ placements: [P('p', { activity_id: 'servant', event_id: 'SD2', day: '2026-12-12' })], activities, sdEvents: ['SD2'] });
  const row = (id) => m.find((r) => r.activity.id === id);
  assert.equal(row('servant').cells.SD2, 'ok'); assert.equal(row('com3').cells.SD2, 'missing'); assert.equal(row('flag').cells.SD2, 'na');
  assert.equal(row('servant').covered, true);
  const inf = coverageMatrix({ placements: [P('p', { activity_id: 'flag', event_id: 'SD2', day: '2026-12-12' })], activities, sdEvents: ['SD2'] });
  assert.equal(inf.find((r) => r.activity.id === 'flag').covered, true, 'unassigned but placed counts as covered (inferred)');
  assert.equal(inf.find((r) => r.activity.id === 'flag').inferred, true);
});
