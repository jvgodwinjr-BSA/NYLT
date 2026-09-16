// The roster CLI is the only supported way to touch real names, so its guarantees need testing:
// it round-trips, it re-encrypts under the same password, and it does not print names by accident.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { encryptRoster, decryptRosterNode } from '../scripts/encrypt-roster.mjs';
import { PACK_ID } from '../src/config.js';

const CLI = resolve('scripts/roster.mjs');
const PW = 'test-passphrase-1234';
const PEOPLE = [{ id: 'SPL', name: 'Ada Example' }, { id: 'TG-1', name: 'Blaise Sample' }, { id: 'QM-1', name: 'Cyd Placeholder' }];

function sandbox({ withLocal = true, withEnc = true, people = PEOPLE } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'roster-'));
  mkdirSync(join(dir, 'public'));
  mkdirSync(join(dir, 'packs', PACK_ID), { recursive: true });
  writeFileSync(join(dir, 'packs', PACK_ID, 'resources.csv'),
    'id,role,kind,team,sort\nSPL,Senior Patrol Leader,role,senior,1\nTG-1,Troop Guide 1,role,tg,2\nQM-1,Quartermaster 1,role,qm,3\n');
  if (withEnc) writeFileSync(join(dir, 'public/roster.enc'), JSON.stringify(encryptRoster(people, PW), null, 1) + '\n');
  if (withLocal) writeFileSync(join(dir, 'roster.local.csv'), 'id,name\n' + people.map((p) => `${p.id},${p.name}`).join('\n') + '\n');
  return dir;
}
const run = (dir, args, opts = {}) => execFileSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8', stdio: 'pipe', ...opts });
const runFail = (dir, args) => { try { run(dir, args); return null; } catch (e) { return String(e.stdout ?? '') + String(e.stderr ?? ''); } };
const encOf = (dir) => JSON.parse(readFileSync(join(dir, 'public/roster.enc'), 'utf8'));
const clean = (dir) => rmSync(dir, { recursive: true, force: true });

test('pull decrypts roster.enc into roster.local.csv and seeds the scrub file', () => {
  const dir = sandbox({ withLocal: false });
  try {
    const out = run(dir, ['pull', '--password', PW]);
    assert.match(out, /3 entries/);
    const csv = readFileSync(join(dir, 'roster.local.csv'), 'utf8');
    for (const p of PEOPLE) assert.ok(csv.includes(`${p.id},${p.name}`), `${p.id} missing`);
    assert.ok(existsSync(join(dir, 'scripts/scrub.local.txt')), 'seeded scrub.local.txt');
    assert.ok(!out.includes('Ada Example'), 'pull must not print names');
  } finally { clean(dir); }
});

test('pull refuses to clobber an existing roster unless forced, and rejects a wrong password', () => {
  const dir = sandbox();
  try {
    assert.match(runFail(dir, ['pull', '--password', PW]), /already exists/);
    assert.match(runFail(dir, ['pull', '--force', '--password', 'wrong']), /Wrong password/);
    run(dir, ['pull', '--force', '--password', PW]);
  } finally { clean(dir); }
});

test('push encrypts and the ciphertext holds no plaintext name', () => {
  const dir = sandbox({ withEnc: false });
  try {
    run(dir, ['push', '--password', PW]);
    const blob = encOf(dir);
    assert.deepEqual(decryptRosterNode(blob, PW), PEOPLE);
    assert.ok(!JSON.stringify(blob).includes('Ada'), 'no plaintext in the envelope');
    assert.ok(!Buffer.from(blob.ct, 'base64').toString('latin1').includes('Ada'));
  } finally { clean(dir); }
});

test('list reports coverage without printing a single name', () => {
  const dir = sandbox({ people: PEOPLE.slice(0, 2) });
  try {
    const out = run(dir, ['list', '--password', PW]);
    assert.match(out, /named\s+SPL/);
    assert.match(out, /MISSING\s+QM-1/);
    assert.match(out, /2 named, 1 missing/);
    for (const p of PEOPLE) assert.ok(!out.includes(p.name), `list leaked ${p.id}`);
  } finally { clean(dir); }
});

test('show refuses to print names to a non-terminal unless --yes is explicit', () => {
  const dir = sandbox();
  try {
    assert.match(runFail(dir, ['show']), /Refusing to print names/);
    const out = run(dir, ['show', '--yes', '--password', PW]);
    assert.ok(out.includes('Ada Example'), 'with --yes it does print');
  } finally { clean(dir); }
});

test('set renames one person and re-encrypts under the SAME password', () => {
  const dir = sandbox();
  try {
    const before = encOf(dir);
    const out = run(dir, ['set', 'TG-1', 'Blaise Renamed', '--password', PW]);
    assert.match(out, /TG-1 renamed/);
    assert.ok(!out.includes('Blaise Renamed'), 'set must not echo the name');
    const after = decryptRosterNode(encOf(dir), PW); // same password still works
    assert.equal(after.find((r) => r.id === 'TG-1').name, 'Blaise Renamed');
    assert.equal(after.length, 3, 'other entries untouched');
    assert.notEqual(encOf(dir).ct, before.ct, 'ciphertext changed');
    assert.ok(readFileSync(join(dir, 'roster.local.csv'), 'utf8').includes('TG-1,Blaise Renamed'));
  } finally { clean(dir); }
});

test('set rejects an id that is not a role, so a typo cannot create a ghost entry', () => {
  const dir = sandbox();
  try {
    assert.match(runFail(dir, ['set', 'TG-9', 'Someone New', '--password', PW]), /not a role id/);
    assert.equal(decryptRosterNode(encOf(dir), PW).length, 3, 'nothing was written');
    run(dir, ['set', 'TG-9', 'Someone New', '--force', '--password', PW]);
    assert.equal(decryptRosterNode(encOf(dir), PW).length, 4, '--force allows it');
  } finally { clean(dir); }
});

test('unset clears a person and shrinks the encrypted roster', () => {
  const dir = sandbox();
  try {
    run(dir, ['unset', 'QM-1', '--password', PW]);
    const after = decryptRosterNode(encOf(dir), PW);
    assert.equal(after.length, 2);
    assert.ok(!after.some((r) => r.id === 'QM-1'));
    assert.match(runFail(dir, ['unset', 'NOPE', '--password', PW]), /not in the roster/);
  } finally { clean(dir); }
});

test('check passes when complete and fails when roster.enc is stale', () => {
  const dir = sandbox();
  try {
    assert.match(run(dir, ['check', '--password', PW]), /roster OK/);
    // edit the local file without re-encrypting — exactly the drift check is meant to catch
    writeFileSync(join(dir, 'roster.local.csv'), 'id,name\nSPL,Ada Example\nTG-1,Someone Else\nQM-1,Cyd Placeholder\n');
    assert.match(runFail(dir, ['check', '--password', PW]), /OUT OF DATE/);
    run(dir, ['push', '--password', PW]);
    assert.match(run(dir, ['check', '--password', PW]), /roster OK/);
  } finally { clean(dir); }
});

test('check reports a role with no name', () => {
  const dir = sandbox({ people: PEOPLE.slice(0, 1) });
  try {
    const out = runFail(dir, ['check', '--password', PW]);
    assert.match(out, /missing a name: TG-1, QM-1/);
  } finally { clean(dir); }
});
