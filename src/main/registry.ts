import { promises as fsp } from "fs";
import { join } from "path";

export interface Uninstaller {
  displayName: string;
  uninstallString: string;
}

function unescapeReg(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && i + 1 < s.length) {
      const next = s[++i];
      if (next === "n") out += "\n";
      else if (next === "0") out += "";
      else out += next; // \\ -> \, \" -> ", etc.
    } else {
      out += c;
    }
  }
  return out;
}

function readQuoted(
  line: string,
  start: number,
): { value: string; end: number } | null {
  if (line[start] !== '"') return null;
  let raw = "";
  for (let i = start + 1; i < line.length; i++) {
    const c = line[i];
    if (c === "\\" && i + 1 < line.length) {
      raw += c + line[++i];
      continue;
    }
    if (c === '"') return { value: unescapeReg(raw), end: i };
    raw += c;
  }
  return null; // unterminated
}

function parseValueLine(line: string): { name: string; value: string } | null {
  const nameRes = readQuoted(line, 0);
  if (!nameRes) return null;
  const rest = line.slice(nameRes.end + 1);
  if (!rest.startsWith('="')) return null;
  const valRes = readQuoted(rest, 1);
  if (!valRes) return null;
  return { name: nameRes.value, value: valRes.value };
}

function parseUninstallers(content: string): Uninstaller[] {
  const out: Uninstaller[] = [];
  let inSection = false;
  let displayName: string | undefined;
  let uninstallString: string | undefined;

  const flush = (): void => {
    if (inSection && uninstallString) {
      out.push({ displayName: displayName ?? "", uninstallString });
    }
    displayName = undefined;
    uninstallString = undefined;
  };

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("[")) {
      flush();
      const end = line.indexOf("]");
      const key = (end >= 0 ? line.slice(1, end) : line.slice(1))
        .replace(/\\\\/g, "\\")
        .toLowerCase();
      inSection = key.includes("currentversion\\uninstall\\");
      continue;
    }
    if (!inSection || !line.startsWith('"')) continue;
    const kv = parseValueLine(line);
    if (!kv) continue;
    const key = kv.name.toLowerCase();
    if (key === "displayname") displayName = kv.value;
    else if (key === "uninstallstring") uninstallString = kv.value;
  }
  flush();
  return out;
}

export async function findUninstallers(prefix: string): Promise<Uninstaller[]> {
  const hives = ["system.reg", "user.reg"];
  const all: Uninstaller[] = [];
  for (const hive of hives) {
    const content = await fsp
      .readFile(join(prefix, hive), "utf8")
      .catch(() => "");
    if (content) all.push(...parseUninstallers(content));
  }
  return all;
}
