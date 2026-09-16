// The shared-schedule API is the difference between "my copy" and "our schedule", so its
// guarantees need testing: the password is required, a stale write is refused rather than
// clobbering, and the pack name cannot escape the data directory.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { configFor, renderConfig, ITERATIONS } from '../scripts/api-password.mjs';

const PW = 'shared-test-passphrase';
let php = null, root = null, base = null;
const havePhp = (() => { try { execFileSync('php', ['--version'], { stdio: 'pipe' }); return true; } catch { return false; } })();

before(async () => {
  if (!havePhp) return;
  root = mkdtempSync(join(tmpdir(), 'api-'));
  mkdirSync(join(root, 'api/data'), { recursive: true });
  cpSync(resolve('api/placements.php'), join(root, 'api/placements.php'));
  writeFileSync(join(root, 'api/config.php'), renderConfig(configFor(PW)));
  const port = 9000 + Math.floor(Math.random() * 900);
  base = `http://127.0.0.1:${port}/api/placements.php`;
  php = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', root], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { await fetch(base); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
});
after(() => { php?.kill(); if (root) rmSync(root, { recursive: true, force: true }); });

const call = (method, q, body, pw = PW) => fetch(`${base}?pack=${q}`, {
  method, headers: { 'X-Schedule-Password': pw, 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const opts = () => ({ skip: havePhp ? false : 'php not installed' });

test('the password is required, and a wrong one is refused', opts(), async () => {
  assert.equal((await fetch(`${base}?pack=t1`)).status, 401);
  assert.equal((await call('GET', 't1', undefined, 'wrong')).status, 401);
  assert.equal((await call('GET', 't1')).status, 200);
});

test('an unwritten pack reads as an empty schedule at version 0', opts(), async () => {
  const d = await (await call('GET', 'fresh')).json();
  assert.equal(d.version, 0);
  assert.deepEqual(d.placements, []);
});

test('write then read round-trips, and the version increments', opts(), async () => {
  const p = [{ id: 'a', activity_id: 'lunch', event_id: 'W2', track_id: 'W2-all', day: '2027-02-20', start_min: 720, duration_min: 60 }];
  const w = await (await call('PUT', 't2', { version: 0, placements: p, customActivities: [], savedBy: 'tester' })).json();
  assert.equal(w.ok, true);
  assert.equal(w.version, 1);
  const d = await (await call('GET', 't2')).json();
  assert.deepEqual(d.placements, p);
  assert.equal(d.savedBy, 'tester');
  const w2 = await (await call('PUT', 't2', { version: 1, placements: [], customActivities: [] })).json();
  assert.equal(w2.version, 2);
});

test('a stale write is refused with 409 and the current document, so nobody is clobbered', opts(), async () => {
  await call('PUT', 't3', { version: 0, placements: [{ id: 'x' }], customActivities: [] });
  const r = await call('PUT', 't3', { version: 0, placements: [], customActivities: [] });
  assert.equal(r.status, 409);
  const d = await r.json();
  assert.equal(d.currentVersion, 1);
  assert.deepEqual(d.current.placements, [{ id: 'x' }]);
  // the loser's data is untouched on the server
  assert.deepEqual((await (await call('GET', 't3')).json()).placements, [{ id: 'x' }]);
});

test('force=1 overwrites deliberately, which is what the conflict banner offers', opts(), async () => {
  await call('PUT', 't4', { version: 0, placements: [{ id: 'theirs' }], customActivities: [] });
  const r = await fetch(`${base}?pack=t4&force=1`, {
    method: 'PUT', headers: { 'X-Schedule-Password': PW, 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: 0, placements: [{ id: 'mine' }], customActivities: [] }),
  });
  assert.equal(r.status, 200);
  assert.deepEqual((await (await call('GET', 't4')).json()).placements, [{ id: 'mine' }]);
});

test('a malformed body is rejected rather than stored', opts(), async () => {
  assert.equal((await call('PUT', 't5', { version: 0 })).status, 400);
  assert.equal((await call('PUT', 't5', { version: 0, placements: 'nope' })).status, 400);
  assert.equal((await (await call('GET', 't5')).json()).version, 0, 'nothing was written');
});

test('the pack name cannot escape the data directory', opts(), async () => {
  for (const bad of ['../config', '../../etc/passwd', '..', '']) {
    assert.equal((await call('GET', encodeURIComponent(bad))).status, 400, `pack=${bad}`);
  }
});

test('DELETE and other methods are refused', opts(), async () => {
  assert.equal((await call('DELETE', 't6')).status, 405);
});

test('the generated config holds a salt and a hash, never the password', () => {
  const c = configFor(PW);
  assert.equal(c.iterations, ITERATIONS);
  const php = renderConfig(c);
  assert.ok(!php.includes(PW), 'the password must not appear in api/config.php');
  assert.match(php, /^<\?php/);
  assert.notDeepEqual(configFor(PW).salt, configFor(PW).salt, 'a fresh salt each time');
});
