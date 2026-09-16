// The guards that keep names out of the repo and packs internally consistent are load-bearing.
// A check that can never fail is worthless, so these assert the failures too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePack } from '../scripts/validate-pack.mjs';
import { writeFileSync as wf, mkdirSync as md, readFileSync as rf } from 'node:fs';

const GOOD = {
  'activities.csv': 'id,name,duration_min,type,audience,delivery,group,syllabus_day,soft_vs_hard,practice_sd,owner_id,ready,location,tags,notes,source\n'
    + 'talk,A Talk,60,presentation,troop,Troop,A,1,hard,SD1,TG-1,Ready,,syllabus,,authority\n'
    + 'lunch,Lunch,60,meal,troop,Troop,,,hard,,,,,,,spine\n',
  'events.csv': 'id,name,hard_start,hard_stop,location,notes\nSD1,SD One,2026-10-30T18:00,2026-11-01T16:00,Camp,\n',
  'tracks.csv': 'id,event_id,name,is_all_hands,sort\nSD1-all,SD1,All Hands,true,1\nSD1-tg,SD1,TG,false,2\n',
  'resources.csv': 'id,role,kind,team,sort\nTG-1,Troop Guide 1,role,tg,1\n',
  'constraints.csv': 'id,event_id,rule_type,params,severity,description\nlock,SD1,lock_slot,"{""activity_id"":""lunch"",""day"":""2026-10-31"",""not_before"":""12:00""}",hard,Lunch at noon\n',
};

function pack(overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pack-'));
  for (const [f, body] of Object.entries({ ...GOOD, ...overrides })) writeFileSync(join(dir, f), body);
  return dir;
}
const check = (overrides) => { const d = pack(overrides); try { return validatePack(d); } finally { rmSync(d, { recursive: true, force: true }); } };

test('a well-formed pack validates clean', () => {
  const { errors, warnings, counts } = check();
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  assert.equal(counts.activities, 2);
});

test('catches a duration that is not on the 15-minute grid', () => {
  const { errors } = check({ 'activities.csv': GOOD['activities.csv'].replace(',60,presentation', ',50,presentation') });
  assert.ok(errors.some((e) => /not a multiple of 15/.test(e)), errors.join('; '));
});

test('catches an owner_id that is not a role id — this is how a name would sneak in', () => {
  const { errors } = check({ 'activities.csv': GOOD['activities.csv'].replace(',TG-1,Ready', ',Some Person,Ready') });
  assert.ok(errors.some((e) => /owner_id "Some Person" is not a resource id/.test(e)), errors.join('; '));
});

test('catches dangling references: practice_sd, track event, constraint activity and event', () => {
  assert.ok(check({ 'activities.csv': GOOD['activities.csv'].replace(',SD1,TG-1', ',SD9,TG-1') }).errors.some((e) => /practice_sd "SD9"/.test(e)));
  assert.ok(check({ 'tracks.csv': GOOD['tracks.csv'].replace('SD1-tg,SD1,', 'SD1-tg,NOPE,') }).errors.some((e) => /unknown event "NOPE"/.test(e)));
  assert.ok(check({ 'constraints.csv': GOOD['constraints.csv'].replace('""lunch""', '""ghost""') }).errors.some((e) => /unknown activity "ghost"/.test(e)));
});

test('catches a lock_slot pinned to a day the event does not cover', () => {
  const { errors } = check({ 'constraints.csv': GOOD['constraints.csv'].replace('2026-10-31', '2026-12-25') });
  assert.ok(errors.some((e) => /not a day of SD1/.test(e)), errors.join('; '));
});

test('catches duplicate activity ids and malformed event bounds', () => {
  assert.ok(check({ 'activities.csv': GOOD['activities.csv'] + 'talk,Dup,60,other,troop,Troop,,,soft,,,,,,,x\n' }).errors.some((e) => /duplicate activity id/.test(e)));
  assert.ok(check({ 'events.csv': GOOD['events.csv'].replace('2026-10-30T18:00', '10/30/2026') }).errors.some((e) => /must be YYYY-MM-DDTHH:MM/.test(e)));
  assert.ok(check({ 'events.csv': GOOD['events.csv'].replace('2026-11-01T16:00', '2026-10-29T16:00') }).errors.some((e) => /ends before it starts/.test(e)));
});

test('warns when an event has no all-hands lane', () => {
  const { warnings } = check({ 'tracks.csv': GOOD['tracks.csv'].replace('true,1', 'false,1') });
  assert.ok(warnings.some((w) => /no all-hands lane/.test(w)), warnings.join('; '));
});

test('the real pack and the name guard both pass on this repository', () => {
  const { errors } = validatePack('packs/nylt-27-1');
  assert.deepEqual(errors, [], 'packs/nylt-27-1 must stay valid');
  execFileSync(process.execPath, ['scripts/name-guard.mjs'], { stdio: 'pipe' }); // throws on non-zero exit
});

// A surname that is also an ordinary word must not fire on its own. This is the regression that
// made the guard unusable on a fresh clone: "lane" appears ~58 times because lanes are the core
// concept, so without the generic allowlist a roster containing a Lane produced 80 false positives.
test('common-name-words lets an ordinary word through alone but still catches the full name', () => {
  const dir = mkdtempSync(join(tmpdir(), 'guard-'));
  try {
    md(join(dir, 'scripts'), { recursive: true });
    md(join(dir, 'public'), { recursive: true });
    execFileSync('git', ['init', '-q'], { cwd: dir });
    wf(join(dir, '.gitignore'), 'roster.local.csv\n'); // as in the real repo, so the structural check is satisfied
    wf(join(dir, 'roster.local.csv'), 'id,name\nATG-3,Robin Lane\n');
    wf(join(dir, 'scripts/common-name-words.txt'), rf('scripts/common-name-words.txt', 'utf8'));
    wf(join(dir, 'doc.md'), 'Each event declares a lane. The qm lane runs in parallel.\n');
    execFileSync('git', ['add', '-A'], { cwd: dir });

    const guard = resolve('scripts/name-guard.mjs');
    const runIn = (d) => { try { return { ok: true, out: execFileSync(process.execPath, [guard], { cwd: d, encoding: 'utf8', stdio: 'pipe' }) }; }
      catch (e) { return { ok: false, out: String(e.stdout ?? '') + String(e.stderr ?? '') }; } };

    const clean = runIn(dir);
    assert.ok(clean.ok, `"lane" alone must not fail:\n${clean.out}`);

    wf(join(dir, 'doc.md'), 'Ask Robin Lane about the qm lane.\n');
    execFileSync('git', ['add', '-A'], { cwd: dir });
    const caught = runIn(dir);
    assert.ok(!caught.ok, 'the full name must still be caught');
    assert.match(caught.out, /robin lane/i);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// The schedule validator is what stands between a hand-authored plan and a broken import,
// so it has to actually catch the things that broke the first draft we were handed.
test('validate-schedule flags a bad lane, a misspelled activity, and an off-grid start', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sched-'));
  try {
    const good = {
      format: 'program-scheduler/schedule', pack: 'nylt-27-1',
      placements: [{ id: 'a', activity_id: 'lunch', event_id: 'W2', track_id: 'W2-all', day: '2027-02-20', start_min: 720, duration_min: 60, resource_ids: [], flags: [] }],
      customActivities: [],
    };
    const run = (doc) => {
      const f = join(dir, 'x.json');
      wf(f, JSON.stringify(doc));
      try { return { ok: true, out: execFileSync(process.execPath, [resolve('scripts/validate-schedule.mjs'), f, '--pack', 'nylt-27-1'], { encoding: 'utf8', stdio: 'pipe' }) }; }
      catch (e) { return { ok: false, out: String(e.stdout ?? '') + String(e.stderr ?? '') }; }
    };

    assert.ok(run(good).ok, 'a valid placement must pass');

    const badLane = structuredClone(good); badLane.placements[0].track_id = 'W2-troop';
    const r1 = run(badLane);
    assert.ok(!r1.ok && /no lane "W2-troop"/.test(r1.out), r1.out);

    const badAct = structuredClone(good); badAct.placements[0].activity_id = 'staff-arrival-check-in';
    const r2 = run(badAct);
    assert.ok(!r2.ok && /no activity "staff-arrival-check-in"/.test(r2.out), r2.out);

    const badDay = structuredClone(good); badDay.placements[0].day = '2027-03-01';
    assert.ok(/is not a day of W2/.test(run(badDay).out));

    // off-grid and out-of-bounds are warnings: they load, but they are wrong
    const offGrid = structuredClone(good); offGrid.placements[0].start_min = 725;
    const r3 = run(offGrid);
    assert.ok(r3.ok, 'off-grid still imports');
    assert.match(r3.out, /off the 15-minute grid/);

    const late = structuredClone(good); late.placements[0].day = '2027-02-21'; late.placements[0].start_min = 950;
    assert.match(run(late).out, /after this day closes/);

    const badCustom = structuredClone(good);
    badCustom.customActivities = [{ id: 'qm-x', name: 'QM thing', duration_min: 60, type: 'staff_task', audience: 'qm_staff' }];
    const r4 = run(badCustom);
    assert.ok(!r4.ok && /missing delivery, soft_vs_hard, tags/.test(r4.out), r4.out);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---------- import-qm-tasks: names out of hand-authored input ----------
// The QM task list was written by a human and named people. These run the real importer in a
// temp directory with a fictional roster, because the one thing that must never regress here is
// a name reaching the pack — and the three ways it got through in review were a note, a title
// (which the id is slugged from), and a spelling the roster no longer carried.
const QM_IMPORTER = fileURLToPath(new URL('../scripts/import-qm-tasks.mjs', import.meta.url));

function qmRun({ tasks, roster = 'id,name\nACD,Alder Birchwood\nCHO,Rowan Birchwood\nQM-ADULT,Juniper Thorne\n', scrub = '', extras = 'id,name,duration_min,type,audience,delivery,soft_vs_hard,tags,notes,source\n' }) {
  const dir = mkdtempSync(join(tmpdir(), 'qm-'));
  md(join(dir, 'scripts'), { recursive: true });
  wf(join(dir, 'roster.local.csv'), roster);
  wf(join(dir, 'scripts', 'scrub.local.txt'), scrub);
  wf(join(dir, 'scripts', 'extras-nylt-27-1.csv'), extras);
  wf(join(dir, 'scripts', 'qm-tasks-source.json'), JSON.stringify({ customActivities: tasks }));
  try {
    let stdout = '', status = 0;
    try { stdout = execFileSync('node', [QM_IMPORTER], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { status = e.status ?? 1; stdout = (e.stdout ?? '') + (e.stderr ?? ''); }
    return { status, stdout, csv: status === 0 ? rf(join(dir, 'scripts', 'extras-nylt-27-1.csv'), 'utf8') : '' };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const QM_TASK = { id: 'qm-do-a-thing', name: 'QM: Do a thing', duration_min: 60, category: 'Gear', suggested_sd: 'SD2', notes: '' };

test('a name in a note is replaced by the role that person holds', () => {
  const { status, csv } = qmRun({ tasks: [{ ...QM_TASK, notes: 'Juniper Thorne stages the gear' }] });
  assert.equal(status, 0);
  assert.ok(csv.includes('the adult QM stages the gear'), csv);
  assert.ok(!/juniper|thorne/i.test(csv), csv);
});

test('a first name followed by a surname initial swallows the initial', () => {
  // Replacing only the first name leaves "ACD B", which still points at one of two people.
  const { status, csv } = qmRun({ tasks: [{ ...QM_TASK, notes: 'Alder B owns this' }] });
  assert.equal(status, 0);
  assert.ok(csv.includes('ACD owns this'), csv);
});

test('a lowercase word after a name is left alone', () => {
  const { status, csv } = qmRun({ tasks: [{ ...QM_TASK, notes: 'Alder a second time' }] });
  assert.equal(status, 0);
  assert.ok(csv.includes('ACD a second time'), csv);
});

test('a "Name -> ROLE-ID" line in scrub.local.txt is substituted', () => {
  // The spelling the author used is not in the roster, so nothing else can resolve it.
  const { status, csv } = qmRun({ tasks: [{ ...QM_TASK, notes: 'Ask Hazel first' }], scrub: 'Hazel -> ASPL-QM\n' });
  assert.equal(status, 0);
  assert.ok(csv.includes('Ask ASPL-QM first'), csv);
});

test('refuses to guess which of two people a shared surname means', () => {
  // Birchwood is both ACD and CHO in this roster. Picking one would file the task under the
  // wrong person silently, so the importer stops and reports the field, never the name.
  const { status, stdout } = qmRun({ tasks: [{ ...QM_TASK, notes: 'Birchwood has the key' }] });
  assert.equal(status, 1);
  assert.match(stdout, /REFUSING to write/);
  assert.match(stdout, /qm-do-a-thing\.notes/);
  assert.ok(!/birchwood/i.test(stdout), 'the report must not print the name itself');
});

test('a name in the title is scrubbed and the id re-slugged', () => {
  const { status, csv } = qmRun({ tasks: [{ ...QM_TASK, id: 'qm-collect-juniper-thorne-list', name: 'QM: Collect Juniper Thorne list' }] });
  assert.equal(status, 0);
  assert.ok(csv.includes('qm-collect-the-adult-qm-list'), csv);
  assert.ok(!/juniper|thorne/i.test(csv), csv);
});

test('re-running replaces the qm-tasks rows instead of duplicating them', () => {
  const extras = 'id,name,duration_min,type,audience,delivery,soft_vs_hard,tags,notes,source\n'
    + 'qm-stale,Stale,60,staff_task,staff,Staff,soft,qm,,qm-tasks\n'
    + 'hand-written,Kept,60,staff_task,staff,Staff,soft,,,extras\n';
  const { status, csv } = qmRun({ tasks: [QM_TASK], extras });
  assert.equal(status, 0);
  assert.ok(!csv.includes('qm-stale'), 'the previous qm-tasks rows are replaced');
  assert.ok(csv.includes('hand-written'), 'rows from another source survive');
});

test('off-grid durations are snapped to 15 minutes and reported', () => {
  const { status, stdout, csv } = qmRun({ tasks: [{ ...QM_TASK, duration_min: 20 }] });
  assert.equal(status, 0);
  assert.match(stdout, /20 -> 15/);
  assert.ok(csv.includes(',15,'), csv);
});
