// Activities arrive from two places with different guarantees: pack rows come from CSV, where
// every field is a string, and custom activities come from a saved schedule, where a hand-authored
// file can simply omit fields.
//
// These exist because of a live crash: eleven custom activities in the real schedule had no
// `tags`, and the left rail did `a.tags.join(' ')` on every keystroke. Typing one letter emptied
// the rail — 229 items to zero — and threw. Normalising at the boundary is what stops the next
// hand-authored import doing it again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeActivity } from '../src/pack.js';

test('a hand-authored activity with no tags comes back with an empty array', () => {
  const a = normalizeActivity({ id: 'snack', name: 'Snack', duration_min: 15, type: 'meal', audience: 'troop' });
  assert.deepEqual(a.tags, [], 'the rail joins this, so it must never be undefined');
  assert.doesNotThrow(() => a.tags.join(' '));
});

test('CSV pipe-separated tags become an array; an array is left alone', () => {
  assert.deepEqual(normalizeActivity({ tags: 'qm|gear|sd3' }).tags, ['qm', 'gear', 'sd3']);
  assert.deepEqual(normalizeActivity({ tags: ['qm', 'sd3'] }).tags, ['qm', 'sd3']);
  assert.deepEqual(normalizeActivity({ tags: '' }).tags, []);
});

test('the fields the rail and the rules read always have a usable value', () => {
  const a = normalizeActivity({ id: 'free-time', name: 'Free time' });
  assert.equal(a.type, 'other');
  assert.equal(a.audience, 'staff');
  assert.equal(a.delivery, 'Staff');
  assert.equal(a.soft_vs_hard, 'soft');
  assert.equal(a.notes, '');
});

test('a missing or junk duration falls back to one slot rather than NaN', () => {
  assert.equal(normalizeActivity({}).duration_min, 15);
  assert.equal(normalizeActivity({ duration_min: 'abc' }).duration_min, 15);
  assert.equal(normalizeActivity({ duration_min: '45' }).duration_min, 45, 'CSV strings become numbers');
  assert.equal(normalizeActivity({ duration_min: 90 }).duration_min, 90);
});

test('syllabus_day is a number or null, never an empty string', () => {
  assert.equal(normalizeActivity({ syllabus_day: '3' }).syllabus_day, 3);
  assert.equal(normalizeActivity({ syllabus_day: '' }).syllabus_day, null);
  assert.equal(normalizeActivity({}).syllabus_day, null);
});

test('delivery defaults cannot accidentally trip the TG-delivery rule', () => {
  // delivery_mismatch fires on `delivery === 'TG'`. A default must never be that.
  assert.notEqual(normalizeActivity({ id: 'x' }).delivery, 'TG');
  assert.equal(normalizeActivity({ delivery: 'TG' }).delivery, 'TG', 'a real value is preserved');
});

test('everything else on the activity is carried through untouched', () => {
  const a = normalizeActivity({ id: 'x', name: 'X', owner_id: 'QM-ADULT', practice_sd: 'SD3', source: 'custom', location: 'Shed' });
  assert.equal(a.owner_id, 'QM-ADULT');
  assert.equal(a.practice_sd, 'SD3');
  assert.equal(a.source, 'custom');
  assert.equal(a.location, 'Shed');
});
