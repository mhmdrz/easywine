import { promises as fsp } from "fs";

export async function extractIconDataUri(
  filePath: string,
  iconIndex = 0,
): Promise<string | null> {
  try {
    const buf = await fsp.readFile(filePath);
    return extractFromBuffer(buf, iconIndex);
  } catch {
    return null;
  }
}

const RT_ICON = 3;
const RT_GROUP_ICON = 14;

interface DirEntry {
  id: number;
  named: boolean;
  isDir: boolean;
  offset: number;
}

interface GrpEntry {
  width: number;
  height: number;
  colorCount: number;
  planes: number;
  bitCount: number;
  id: number;
}

function extractFromBuffer(buf: Buffer, iconIndex: number): string | null {
  if (buf.length < 0x40 || buf.readUInt16LE(0) !== 0x5a4d) return null; // 'MZ'
  const peOff = buf.readUInt32LE(0x3c);
  if (peOff + 24 > buf.length || buf.readUInt32LE(peOff) !== 0x00004550) {
    return null; // 'PE\0\0'
  }

  const coff = peOff + 4;
  const numSections = buf.readUInt16LE(coff + 2);
  const optSize = buf.readUInt16LE(coff + 16);
  const optOff = coff + 20;
  const magic = buf.readUInt16LE(optOff);
  const resDirEntry = optOff + (magic === 0x20b ? 112 : 96) + 2 * 8;
  if (resDirEntry + 8 > buf.length) return null;
  const resRva = buf.readUInt32LE(resDirEntry);
  if (!resRva) return null;

  const secOff = optOff + optSize;
  const sections: Array<{ va: number; vs: number; ptr: number; size: number }> =
    [];
  for (let i = 0; i < numSections; i++) {
    const s = secOff + i * 40;
    if (s + 40 > buf.length) break;
    sections.push({
      vs: buf.readUInt32LE(s + 8),
      va: buf.readUInt32LE(s + 12),
      size: buf.readUInt32LE(s + 16),
      ptr: buf.readUInt32LE(s + 20),
    });
  }
  const rvaToOff = (rva: number): number => {
    for (const s of sections) {
      const span = Math.max(s.vs, s.size);
      if (rva >= s.va && rva < s.va + span) return s.ptr + (rva - s.va);
    }
    return -1;
  };

  const resBase = rvaToOff(resRva);
  if (resBase < 0) return null;

  const readDir = (relOffset: number): DirEntry[] => {
    const off = resBase + relOffset;
    if (off + 16 > buf.length) return [];
    const total = buf.readUInt16LE(off + 12) + buf.readUInt16LE(off + 14);
    const entries: DirEntry[] = [];
    for (let i = 0; i < total; i++) {
      const e = off + 16 + i * 8;
      if (e + 8 > buf.length) break;
      const name = buf.readUInt32LE(e);
      const dataOff = buf.readUInt32LE(e + 4);
      entries.push({
        id: name & 0x7fffffff,
        named: (name & 0x80000000) !== 0,
        isDir: (dataOff & 0x80000000) !== 0,
        offset: dataOff & 0x7fffffff,
      });
    }
    return entries;
  };

  const readLeafBytes = (relOffset: number): Buffer | null => {
    const off = resBase + relOffset;
    if (off + 8 > buf.length) return null;
    const rva = buf.readUInt32LE(off);
    const size = buf.readUInt32LE(off + 4);
    const start = rvaToOff(rva);
    if (start < 0 || start + size > buf.length) return null;
    return buf.subarray(start, start + size);
  };

  const firstLeaf = (dirRelOffset: number): Buffer | null => {
    const langs = readDir(dirRelOffset);
    const leaf = langs.find((e) => !e.isDir);
    return leaf ? readLeafBytes(leaf.offset) : null;
  };

  const types = readDir(0);
  const groupType = types.find((e) => e.id === RT_GROUP_ICON && e.isDir);
  const iconType = types.find((e) => e.id === RT_ICON && e.isDir);
  if (!groupType || !iconType) return null;

  const groups = readDir(groupType.offset).filter((e) => e.isDir);
  if (groups.length === 0) return null;

  let group = groups[0];
  if (iconIndex < 0) {
    group = groups.find((e) => !e.named && e.id === -iconIndex) ?? groups[0];
  } else if (iconIndex > 0 && iconIndex < groups.length) {
    group = groups[iconIndex];
  }

  const grpData = firstLeaf(group.offset);
  if (!grpData || grpData.length < 6) return null;

  const count = grpData.readUInt16LE(4);
  const grpEntries: GrpEntry[] = [];
  for (let i = 0; i < count; i++) {
    const e = 6 + i * 14;
    if (e + 14 > grpData.length) break;
    grpEntries.push({
      width: grpData.readUInt8(e),
      height: grpData.readUInt8(e + 1),
      colorCount: grpData.readUInt8(e + 2),
      planes: grpData.readUInt16LE(e + 4),
      bitCount: grpData.readUInt16LE(e + 6),
      id: grpData.readUInt16LE(e + 12),
    });
  }
  if (grpEntries.length === 0) return null;

  const iconDirs = new Map<number, DirEntry>();
  for (const d of readDir(iconType.offset)) {
    if (d.isDir && !d.named) iconDirs.set(d.id, d);
  }

  const images: Array<{ meta: GrpEntry; data: Buffer }> = [];
  for (const g of grpEntries) {
    const dir = iconDirs.get(g.id);
    if (!dir) continue;
    const data = firstLeaf(dir.offset);
    if (data) images.push({ meta: g, data });
  }
  if (images.length === 0) return null;

  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(1, 2); // idType = icon
  header.writeUInt16LE(images.length, 4);
  let dataOffset = 6 + images.length * 16;
  for (let i = 0; i < images.length; i++) {
    const { meta, data } = images[i];
    const e = 6 + i * 16;
    header.writeUInt8(meta.width, e);
    header.writeUInt8(meta.height, e + 1);
    header.writeUInt8(meta.colorCount, e + 2);
    header.writeUInt16LE(meta.planes, e + 4);
    header.writeUInt16LE(meta.bitCount, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(dataOffset, e + 12);
    dataOffset += data.length;
  }
  const ico = Buffer.concat([header, ...images.map((i) => i.data)]);
  return `data:image/x-icon;base64,${ico.toString("base64")}`;
}
