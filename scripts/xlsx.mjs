// Minimal .xlsx reader with zero dependencies (zip + zlib + regex over the XML).
// Enough for the import script: shared strings, inline strings, numbers, formulas' cached values.
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

function readZip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('Not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Bad central directory');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    const lnlen = buf.readUInt16LE(lho + 26);
    const lelen = buf.readUInt16LE(lho + 28);
    const start = lho + 30 + lnlen + lelen;
    const data = buf.subarray(start, start + csize);
    files.set(name, method === 8 ? inflateRawSync(data) : data);
    p += 46 + nlen + elen + clen;
  }
  return files;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescape = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENT[e] ?? m));

const textOf = (xml) => unescape([...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));

export function colToIndex(col) { let n = 0; for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; }

export function readWorkbook(path) {
  const files = readZip(readFileSync(path));
  const text = (name) => files.get(name)?.toString('utf8') ?? '';
  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const rels = new Map([...text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)].map((m) => {
    const id = /Id="([^"]+)"/.exec(m[0])[1];
    let target = /Target="([^"]+)"/.exec(m[0])[1];
    if (target.startsWith('/')) target = target.slice(1); else if (!target.startsWith('xl/')) target = 'xl/' + target;
    return [id, target];
  }));
  const sheets = [];
  for (const m of text('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)) {
    const name = unescape(/name="([^"]+)"/.exec(m[0])[1]);
    const rid = /r:id="([^"]+)"/.exec(m[0])[1];
    sheets.push({ name, path: rels.get(rid) });
  }
  const wb = { sheetNames: sheets.map((s) => s.name), sheets: {} };
  for (const s of sheets) {
    const cells = new Map();
    for (const c of text(s.path).matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, col, row, attrs, inner] = c;
      if (!inner) continue;
      const t = /t="([^"]+)"/.exec(attrs)?.[1];
      let v;
      if (t === 's') v = shared[Number(/<v>([^<]*)<\/v>/.exec(inner)?.[1])];
      else if (t === 'inlineStr') v = textOf(inner);
      else if (t === 'str' || t === 'e') v = unescape(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '');
      else if (t === 'b') v = /<v>1<\/v>/.test(inner);
      else { const raw = /<v>([^<]*)<\/v>/.exec(inner)?.[1]; v = raw === undefined ? undefined : Number(raw); }
      if (v !== undefined && v !== '') cells.set(col + row, { col: colToIndex(col), row: Number(row) - 1, v });
    }
    wb.sheets[s.name] = cells;
  }
  return wb;
}

/** 2D array of values (row-major), trimming strings. */
export function sheetRows(cells) {
  const rows = [];
  for (const { col, row, v } of cells.values()) {
    (rows[row] ??= [])[col] = typeof v === 'string' ? v.trim() : v;
  }
  return rows;
}

/** Excel fractional day -> minutes since midnight. */
export const excelTimeToMinutes = (v) => Math.round(((v % 1) + 1) % 1 * 1440);
