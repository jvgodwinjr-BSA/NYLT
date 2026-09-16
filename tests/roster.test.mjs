import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptRoster, decryptRosterNode } from '../scripts/encrypt-roster.mjs';
import { decryptRoster } from '../src/roster.js';

const entries = [{ id: 'TG-1', name: 'Example Person' }, { id: 'SPL', name: 'Another Example' }];

test('encrypt (node crypto) -> decrypt (WebCrypto, as the browser does) round-trips', async () => {
  const blob = encryptRoster(entries, 'correct horse battery');
  assert.equal(blob.format, 'program-scheduler/roster');
  assert.deepEqual(decryptRosterNode(blob, 'correct horse battery'), entries);
  const map = await decryptRoster(blob, 'correct horse battery');
  assert.equal(map.get('TG-1'), 'Example Person');
  assert.equal(map.size, 2);
});

test('wrong password is rejected, not garbled', async () => {
  const blob = encryptRoster(entries, 'right-password');
  await assert.rejects(() => decryptRoster(blob, 'wrong-password'), /Wrong password/);
  assert.throws(() => decryptRosterNode(blob, 'wrong-password'));
});

test('ciphertext does not contain the names', () => {
  const blob = encryptRoster(entries, 'right-password');
  const text = JSON.stringify(blob);
  assert.ok(!text.includes('Example Person'));
  assert.ok(!Buffer.from(blob.ct, 'base64').toString('latin1').includes('Example'));
});
