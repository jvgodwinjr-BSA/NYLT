#!/usr/bin/env node
// roster.local.csv (id,name) -> public/roster.enc  (AES-256-GCM, key from PBKDF2-SHA256 of the shared password)
//
//   npm run encrypt-roster                      prompts for the password
//   npm run encrypt-roster -- --generate        prints a fresh passphrase, then encrypts with it
//   ROSTER_PASSWORD=... npm run encrypt-roster  non-interactive
//   --in roster.local.csv  --out public/roster.enc
//
// The output can be committed: it is ciphertext. The password is the only secret and never goes in the repo.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from 'node:crypto';
import { createInterface } from 'node:readline';
import { parseCsv } from '../src/csv.js';

export const KDF = { name: 'PBKDF2-SHA256', iterations: 210000, keyBytes: 32, saltBytes: 16, ivBytes: 12 };

export function encryptRoster(entries, password) {
  const salt = randomBytes(KDF.saltBytes), iv = randomBytes(KDF.ivBytes);
  const key = pbkdf2Sync(Buffer.from(password, 'utf8'), salt, KDF.iterations, KDF.keyBytes, 'sha256');
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plain = Buffer.from(JSON.stringify(entries), 'utf8');
  const ct = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]); // WebCrypto expects ciphertext||tag
  return { format: 'program-scheduler/roster', version: 1, kdf: KDF.name, iterations: KDF.iterations,
    salt: salt.toString('base64'), iv: iv.toString('base64'), ct: ct.toString('base64'), count: entries.length, createdAt: new Date().toISOString() };
}

export function decryptRosterNode(blob, password) {
  const salt = Buffer.from(blob.salt, 'base64'), iv = Buffer.from(blob.iv, 'base64'), ct = Buffer.from(blob.ct, 'base64');
  const key = pbkdf2Sync(Buffer.from(password, 'utf8'), salt, blob.iterations, KDF.keyBytes, 'sha256');
  const d = createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(ct.subarray(ct.length - 16));
  return JSON.parse(Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]).toString('utf8'));
}

const WORDS = 'amber basin cabin cedar cliff creek delta ember falcon field flint forest garnet glacier granite harbor hollow island juniper kestrel lantern lumen maple meadow mesa mica north orchard osprey pebble pine quarry raven ridge river saddle sage slate spruce summit tamarack thistle timber trail tundra valley walnut willow yarrow zenith'.split(' ');
export const generatePassphrase = () => Array.from({ length: 4 }, () => WORDS[randomBytes(1)[0] % WORDS.length]).join('-') + '-' + (randomBytes(1)[0] % 90 + 10);

export function ask(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = rl._writeToOutput; let muted = false;
    rl._writeToOutput = (s) => { if (!muted) write.call(rl, s); };
    rl.question(question, (a) => { muted = false; process.stdout.write('\n'); rl.close(); resolve(a); });
    muted = true;
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const inPath = opt('--in', 'roster.local.csv'), outPath = opt('--out', 'public/roster.enc');
  const entries = parseCsv(readFileSync(inPath, 'utf8')).filter((r) => r.id && r.name).map((r) => ({ id: r.id.trim(), name: r.name.trim() }));
  if (!entries.length) { console.error(`${inPath}: no id,name rows`); process.exit(1); }
  let password = opt('--password', process.env.ROSTER_PASSWORD);
  if (argv.includes('--generate')) { password = generatePassphrase(); console.log(`Passphrase (share this with staff, keep it out of the repo):\n\n    ${password}\n`); }
  if (!password) { password = await ask('Shared password: '); const again = await ask('Again: '); if (password !== again) { console.error('Passwords differ'); process.exit(1); } }
  if (password.length < 8) { console.error('Use at least 8 characters'); process.exit(1); }
  const blob = encryptRoster(entries, password);
  const check = decryptRosterNode(blob, password);
  if (check.length !== entries.length) { console.error('Round-trip check failed'); process.exit(1); }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(blob, null, 1) + '\n');
  console.log(`Wrote ${outPath}: ${entries.length} names encrypted (${blob.kdf}, ${blob.iterations} iterations, AES-256-GCM). Round-trip verified.`);
}
