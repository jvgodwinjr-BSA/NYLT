// Encrypted roster: id -> display name. Decrypted in the browser with WebCrypto; never written to disk or the network.
const ROSTER_URL = './public/roster.enc';
const CACHE_KEY = 'program-scheduler:roster';
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function fetchRosterBlob() {
  try { const r = await fetch(ROSTER_URL, { cache: 'no-store' }); if (!r.ok) return null; const j = await r.json(); return j?.format === 'program-scheduler/roster' ? j : null; }
  catch { return null; }
}

export const cryptoAvailable = () => !!(globalThis.crypto && globalThis.crypto.subtle);

/** @returns {Promise<Map<string,string>>} throws on a wrong password */
export async function decryptRoster(blob, password) {
  if (!cryptoAvailable()) throw new Error('This page needs HTTPS (or localhost) to decrypt names.');
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: b64(blob.salt), iterations: blob.iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  let plain;
  try { plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(blob.iv) }, key, b64(blob.ct)); }
  catch { throw new Error('Wrong password.'); }
  const entries = JSON.parse(new TextDecoder().decode(plain));
  return new Map(entries.map((e) => [e.id, e.name]));
}

export function cacheRoster(map) { try { sessionStorage.setItem(CACHE_KEY, JSON.stringify([...map])); } catch {} }
export function loadCachedRoster() { try { const raw = sessionStorage.getItem(CACHE_KEY); return raw ? new Map(JSON.parse(raw)) : null; } catch { return null; } }
export function forgetRoster() { try { sessionStorage.removeItem(CACHE_KEY); } catch {} }
