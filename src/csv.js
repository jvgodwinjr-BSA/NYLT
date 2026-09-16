// RFC 4180 CSV parse/serialize. No dependencies. Handles quoted fields, embedded commas/newlines/quotes, CRLF.

/** @returns {Record<string,string>[]} rows keyed by header */
export function parseCsv(text) {
  const rows = parseRows(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.some((c) => c !== '')).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

export function parseRows(text) {
  const rows = [];
  let row = [], field = '', i = 0, quoted = false;
  const s = text.startsWith('﻿') ? text.slice(1) : text;
  while (i < s.length) {
    const c = s[i];
    if (quoted) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i += 2; continue; } quoted = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { quoted = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const quote = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** @param {object[]} rows @param {string[]} [columns] defaults to keys of the first row */
export function toCsv(rows, columns) {
  const cols = columns ?? (rows[0] ? Object.keys(rows[0]) : []);
  return [cols.join(','), ...rows.map((r) => cols.map((c) => quote(r[c])).join(','))].join('\n') + '\n';
}
