// WOFF 1.0 → TrueType/OpenType. The card renderer (resvg) only reads sfnt fonts, and the
// fonts we already ship (@fontsource) come as WOFF: each table is just zlib-compressed.
// https://www.w3.org/TR/WOFF/
import { inflateSync } from 'node:zlib';

export function woffToSfnt(woff: Buffer): Buffer {
  if (woff.toString('latin1', 0, 4) !== 'wOFF') throw new Error('not a WOFF 1.0 font');
  const flavor = woff.readUInt32BE(4);
  const numTables = woff.readUInt16BE(12);

  const tables: { tag: number; checksum: number; data: Buffer }[] = [];
  for (let i = 0; i < numTables; i++) {
    const e = 44 + i * 20;
    const tag = woff.readUInt32BE(e);
    const offset = woff.readUInt32BE(e + 4);
    const compLength = woff.readUInt32BE(e + 8);
    const origLength = woff.readUInt32BE(e + 12);
    const checksum = woff.readUInt32BE(e + 16);
    const raw = woff.subarray(offset, offset + compLength);
    const data = compLength < origLength ? inflateSync(raw) : Buffer.from(raw);
    if (data.length !== origLength) throw new Error('WOFF table has the wrong length');
    tables.push({ tag, checksum, data });
  }
  tables.sort((a, b) => a.tag - b.tag); // sfnt directories are sorted by tag

  let pow = 1;
  let log = 0;
  while (pow * 2 <= numTables) {
    pow *= 2;
    log++;
  }
  const headerSize = 12 + numTables * 16;
  const pad = (n: number) => (n + 3) & ~3;
  const total = headerSize + tables.reduce((s, t) => s + pad(t.data.length), 0);
  const out = Buffer.alloc(total);
  out.writeUInt32BE(flavor, 0);
  out.writeUInt16BE(numTables, 4);
  out.writeUInt16BE(pow * 16, 6);
  out.writeUInt16BE(log, 8);
  out.writeUInt16BE(numTables * 16 - pow * 16, 10);
  let offset = headerSize;
  tables.forEach((t, i) => {
    const d = 12 + i * 16;
    out.writeUInt32BE(t.tag, d);
    out.writeUInt32BE(t.checksum, d + 4);
    out.writeUInt32BE(offset, d + 8);
    out.writeUInt32BE(t.data.length, d + 12);
    t.data.copy(out, offset);
    offset += pad(t.data.length);
  });
  return out;
}
