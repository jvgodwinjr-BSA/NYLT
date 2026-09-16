#!/usr/bin/env node
// Manage the roster of real names without ever printing them by accident.
//
//   npm run roster -- pull              decrypt public/roster.enc -> roster.local.csv (new machine)
//   npm run roster -- push              encrypt roster.local.csv -> public/roster.enc
//   npm run roster -- list              every role id and whether a name is set — NO names printed
//   npm run roster -- show              ids AND names (asks for confirmation; this one prints them)
//   npm run roster -- set <id> "<name>" set or rename one person, then re-encrypt
//   npm run roster -- unset <id>        clear one person, then re-encrypt
//   npm run roster -- check             names cover the roles in resources.csv, and roster.enc is current
//
// Why this exists: editing roster.local.csv by hand means opening a file full of
// youth names, and an agent doing it means those names land in a transcript. Every
// command here does its job without displaying a name unless you explicitly ask.
//
// The password comes from ROSTER_PASSWORD, --password, or a hidden prompt.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseCsv, toCsv } from '../src/csv.js';
import { encryptRoster, decryptRosterNode, ask, generatePassphrase } from './encrypt-roster.mjs';
import { PACK_ID } from '../src/config.js';

const ROSTER = 'roster.local.csv';
const ENC = 'public/roster.enc';
const RESOURCES = `packs/${PACK_ID}/resources.csv`;
const SCRUB = 'scripts/scrub.local.txt';

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (f) => argv.includes(f);
const opt = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const positional = argv.slice(1).filter((a, i, arr) => !a.startsWith('--') && !(i > 0 && arr[i - 1] === '--password'));
const die = (m) => { console.error(m); process.exit(1); };

let cachedPassword = opt('--password') ?? process.env.ROSTER_PASSWORD;
async function password(confirm = false) {
  if (cachedPassword) return cachedPassword;
  if (!process.stdin.isTTY) die('No password. Pass --password, set ROSTER_PASSWORD, or run in a terminal.');
  const p = await ask('Shared password: ');
  if (confirm && (await ask('Again: ')) !== p) die('Passwords differ.');
  if (p.length < 8) die('Use at least 8 characters.');
  return (cachedPassword = p);
}

const readRoster = () => existsSync(ROSTER)
  ? parseCsv(readFileSync(ROSTER, 'utf8')).filter((r) => r.id).map((r) => ({ id: r.id.trim(), name: (r.name ?? '').trim() }))
  : null;
const writeRoster = (rows) => writeFileSync(ROSTER, toCsv(rows, ['id', 'name']));
const writeEnc = (text) => { mkdirSync(dirname(ENC), { recursive: true }); writeFileSync(ENC, text); };
const readEnc = () => existsSync(ENC) ? JSON.parse(readFileSync(ENC, 'utf8')) : null;

async function loadNamed() {
  const local = readRoster();
  if (local) return local;
  const blob = readEnc();
  if (!blob) die(`Neither ${ROSTER} nor ${ENC} exists. Nothing to work from.`);
  console.log(`${ROSTER} not found — reading from ${ENC}.`);
  return decryptOrDie(blob, await password());
}
function decryptOrDie(blob, pw) {
  try { return decryptRosterNode(blob, pw); }
  catch { die('Wrong password — could not decrypt ' + ENC + '.'); }
}
function encryptTo(rows, pw) {
  const named = rows.filter((r) => r.name);
  const blob = encryptRoster(named, pw);
  if (decryptRosterNode(blob, pw).length !== named.length) die('Round-trip check failed; nothing written.');
  writeEnc(JSON.stringify(blob, null, 1) + '\n');
  return named.length;
}
const roleIds = () => existsSync(RESOURCES) ? parseCsv(readFileSync(RESOURCES, 'utf8')).map((r) => r.id).filter(Boolean) : [];

switch (cmd) {
  case 'pull': {
    const blob = readEnc() ?? die(`${ENC} does not exist.`);
    if (existsSync(ROSTER) && !flag('--force')) die(`${ROSTER} already exists. Use --force to overwrite it.`);
    const rows = decryptOrDie(blob, await password());
    writeRoster(rows);
    console.log(`Wrote ${ROSTER}: ${rows.length} entries. It is gitignored and stays on this machine.`);
    if (!existsSync(SCRUB)) {
      mkdirSync(dirname(SCRUB), { recursive: true });
      writeFileSync(SCRUB,
        '# Extra names the importer and name guard must refuse (e.g. last year\'s staff), one per line.\n'
        + '# A line starting with "-" allows that word on its own; the full-name phrase is still refused.\n'
        + '# "Name -> ROLE-ID" also tells the importers to substitute that role wherever the name appears.\n'
        + '# Words that are ordinary English AND names are already handled by scripts/common-name-words.txt.\n');
      console.log(`Created ${SCRUB} (empty — add past staff names if you re-import the catalog).`);
    }
    console.log('Run `npm run check:names` to confirm the full name scan is active.');
    break;
  }
  case 'push': {
    const rows = readRoster() ?? die(`${ROSTER} does not exist. Run: npm run roster -- pull`);
    const n = encryptTo(rows, await password(!existsSync(ENC)));
    console.log(`Wrote ${ENC}: ${n} names encrypted. Commit it and push to deploy.`);
    break;
  }
  case 'list': {
    const rows = await loadNamed();
    const have = new Map(rows.map((r) => [r.id, !!r.name]));
    const roles = roleIds();
    const ids = [...new Set([...roles, ...rows.map((r) => r.id)])];
    for (const id of ids) {
      const known = roles.includes(id);
      console.log(`  ${have.get(id) ? 'named  ' : 'MISSING'}  ${id}${known ? '' : '   (not a role in resources.csv)'}`);
    }
    console.log(`\n${[...have.values()].filter(Boolean).length} named, ${roles.filter((r) => !have.get(r)).length} missing, ${ids.length} total. Names not shown — use \`show\` for those.`);
    break;
  }
  case 'show': {
    if (!flag('--yes')) {
      if (!process.stdin.isTTY) die('Refusing to print names to a non-terminal. Pass --yes if you really mean it.');
      const ok = await ask('This prints every real name to the screen. Type "yes" to continue: ');
      if (ok.trim().toLowerCase() !== 'yes') die('Cancelled.');
    }
    for (const r of await loadNamed()) console.log(`  ${r.id.padEnd(10)} ${r.name}`);
    break;
  }
  case 'set': {
    const [id, name] = positional;
    if (!id || !name) die('Usage: npm run roster -- set <id> "<name>"');
    const roles = roleIds();
    if (roles.length && !roles.includes(id) && !flag('--force')) die(`"${id}" is not a role id in ${RESOURCES}. Add the role first, or pass --force.`);
    const rows = await loadNamed();
    const existing = rows.find((r) => r.id === id);
    const was = existing?.name ? 'renamed' : 'set';
    if (existing) existing.name = name; else rows.push({ id, name });
    writeRoster(rows);
    const n = encryptTo(rows, await password());
    console.log(`${id} ${was}. ${ROSTER} updated and ${ENC} re-encrypted with the same password (${n} names).`);
    console.log(`Commit ${ENC} and push; everyone keeps the password they already have.`);
    break;
  }
  case 'unset': {
    const [id] = positional;
    if (!id) die('Usage: npm run roster -- unset <id>');
    const rows = await loadNamed();
    if (!rows.some((r) => r.id === id)) die(`"${id}" is not in the roster.`);
    const kept = rows.filter((r) => r.id !== id);
    writeRoster(kept);
    const n = encryptTo(kept, await password());
    console.log(`${id} cleared. ${ENC} re-encrypted (${n} names).`);
    break;
  }
  case 'check': {
    const rows = await loadNamed();
    const named = new Set(rows.filter((r) => r.name).map((r) => r.id));
    const roles = roleIds();
    const missing = roles.filter((r) => !named.has(r));
    const extra = [...named].filter((id) => roles.length && !roles.includes(id));
    const blob = readEnc();
    let stale = false;
    if (blob && existsSync(ROSTER)) {
      const inEnc = decryptOrDie(blob, await password());
      stale = inEnc.length !== named.size || inEnc.some((e) => rows.find((r) => r.id === e.id)?.name !== e.name);
    }
    console.log(`  ${named.size} named of ${roles.length} roles`);
    if (missing.length) console.log(`  missing a name: ${missing.join(', ')}`);
    if (extra.length) console.log(`  in roster but not a role: ${extra.join(', ')}`);
    if (stale) console.log(`  ${ENC} is OUT OF DATE — run: npm run roster -- push`);
    if (!missing.length && !extra.length && !stale) console.log('  roster OK');
    process.exit(missing.length || extra.length || stale ? 1 : 0);
  }
  case 'generate-password': {
    console.log(`\n    ${generatePassphrase()}\n\nUse it with: npm run roster -- push`);
    break;
  }
  default:
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(2, 17).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    process.exit(cmd ? 1 : 0);
}
