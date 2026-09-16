import { SLOT_MIN } from './config.js?v=3';

export const pad = (n) => String(n).padStart(2, '0');
export const minToHHMM = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
export const hhmmToMin = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
export const fmt12 = (m) => { let h = Math.floor(m / 60) % 24; const mm = m % 60; const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return mm ? `${h}:${pad(mm)} ${ap}` : `${h} ${ap}`; };
export const fmtRange = (a, b) => `${fmt12(a)} – ${fmt12(b)}`;
export const snap = (m) => Math.round(m / SLOT_MIN) * SLOT_MIN;
export const uid = () => Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 8);

/** "2027-02-12T18:00" -> { date: "2027-02-12", min: 1080 } (no timezone math; everything is camp-local). */
export function parseLocal(iso) { const [date, t] = String(iso).trim().split('T'); return { date, min: t ? hhmmToMin(t) : 0 }; }
export function addDays(date, n) { const [y, m, d] = date.split('-').map(Number); const dt = new Date(y, m - 1, d + n); return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`; }
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function dayLabel(date) { const [y, m, d] = date.split('-').map(Number); return `${DOW[new Date(y, m - 1, d).getDay()]} ${m}/${d}`; }
export function dowOf(date) { const [y, m, d] = date.split('-').map(Number); return DOW[new Date(y, m - 1, d).getDay()]; }

/** Tiny DOM helper: el('div.cls#id', {attr, onClick}, ...children) */
export function el(spec, attrs = {}, ...children) {
  const [tag, ...rest] = spec.split(/(?=[.#])/);
  const node = document.createElement(tag || 'div');
  for (const r of rest) r[0] === '.' ? node.classList.add(r.slice(1)) : (node.id = r.slice(1));
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'class') node.className = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c.nodeType ? c : document.createTextNode(String(c)));
  return node;
}
export const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); return node; };
