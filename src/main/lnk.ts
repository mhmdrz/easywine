export interface LnkInfo {
  target?: string; // Windows path to the target, e.g. C:\...\app.exe
  iconLocation?: string; // Windows path to an explicit icon source
  iconIndex: number;
}

function readCStringAnsi(buf: Buffer, start: number): string {
  let end = start;
  while (end < buf.length && buf[end] !== 0) end++;
  return buf.subarray(start, end).toString("latin1");
}

function readCStringUnicode(buf: Buffer, start: number): string {
  let end = start;
  while (end + 1 < buf.length && buf.readUInt16LE(end) !== 0) end += 2;
  return buf.subarray(start, end).toString("utf16le");
}

export function parseLnk(buf: Buffer): LnkInfo | null {
  if (buf.length < 0x4c || buf.readUInt32LE(0) !== 0x4c) return null;

  const flags = buf.readUInt32LE(0x14);
  const iconIndex = buf.readInt32LE(0x38);
  const isUnicode = (flags & 0x80) !== 0;

  let off = 0x4c;

  if (flags & 0x01) {
    if (off + 2 > buf.length) return { iconIndex };
    off += 2 + buf.readUInt16LE(off);
  }

  let target: string | undefined;

  if (flags & 0x02) {
    const start = off;
    if (start + 12 > buf.length) return { iconIndex };
    const infoSize = buf.readUInt32LE(start);
    const headerSize = buf.readUInt32LE(start + 4);
    const infoFlags = buf.readUInt32LE(start + 8);

    if (infoFlags & 0x01) {
      if (headerSize >= 0x24) {
        const uniOff = buf.readUInt32LE(start + 0x1c);
        if (uniOff) target = readCStringUnicode(buf, start + uniOff);
      }
      if (!target) {
        const baseOff = buf.readUInt32LE(start + 0x10);
        if (baseOff) {
          target = readCStringAnsi(buf, start + baseOff);
          const suffixOff = buf.readUInt32LE(start + 0x18);
          if (suffixOff) target += readCStringAnsi(buf, start + suffixOff);
        }
      }
    }
    off = start + infoSize;
  }

  const readString = (): string => {
    if (off + 2 > buf.length) return "";
    const count = buf.readUInt16LE(off);
    off += 2;
    const bytes = isUnicode ? count * 2 : count;
    const slice = buf.subarray(off, off + bytes);
    off += bytes;
    return isUnicode ? slice.toString("utf16le") : slice.toString("latin1");
  };

  if (flags & 0x04) readString(); // NAME_STRING
  if (flags & 0x08) readString(); // RELATIVE_PATH
  if (flags & 0x10) readString(); // WORKING_DIR
  if (flags & 0x20) readString(); // COMMAND_LINE_ARGUMENTS

  let iconLocation: string | undefined;
  if (flags & 0x40) iconLocation = readString(); // ICON_LOCATION

  return { target, iconLocation, iconIndex };
}
