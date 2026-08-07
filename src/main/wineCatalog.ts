import { net } from "electron";
import { promises as fsp } from "fs";
import { join } from "path";
import type { WineChannel, WineVersion } from "@shared/wine";
import { cacheDir } from "./appPaths";

const SOURCE_INDEX = "https://dl.winehq.org/wine/source/";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

let memoryCatalog: WineVersion[] | null = null;

function cacheFile(): string {
  return join(cacheDir(), "catalog.json");
}

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = net.request(url);
    request.on("response", (response) => {
      const status = response.statusCode ?? 0;
      if (status >= 300) {
        reject(new Error(`Request failed (HTTP ${status}) for ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      response.on("error", reject);
    });
    request.on("error", reject);
    request.end();
  });
}

function channelFor(version: string): WineChannel {
  return /^\d+\.0$/.test(version) ? "stable" : "development";
}

function versionKey(version: string): number[] {
  const [core, rc] = version.split("-rc");
  const parts = core.split(".").map((n) => parseInt(n, 10) || 0);
  parts.push(rc ? parseInt(rc, 10) : Number.MAX_SAFE_INTEGER);
  return parts;
}

function compareDesc(a: WineVersion, b: WineVersion): number {
  const ka = versionKey(a.version);
  const kb = versionKey(b.version);
  const len = Math.max(ka.length, kb.length);
  for (let i = 0; i < len; i++) {
    const diff = (kb[i] ?? 0) - (ka[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

const ROW_RE =
  /href="(wine-\d[^"]*\.tar\.xz)">wine-[^<]+<\/a><\/td>\s*<td>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>/g;

function parseSeries(html: string, seriesUrl: string): WineVersion[] {
  const versions: WineVersion[] = [];
  let match: RegExpExecArray | null;
  ROW_RE.lastIndex = 0;
  while ((match = ROW_RE.exec(html)) !== null) {
    const [, file, dateRaw, sizeRaw] = match;
    const version = file.replace(/^wine-/, "").replace(/\.tar\.xz$/, "");
    const major = parseInt(version, 10);
    if (Number.isNaN(major)) continue;
    versions.push({
      id: `wine-${version}`,
      version,
      major,
      channel: channelFor(version),
      releaseDate: dateRaw.trim().split(" ")[0],
      size: sizeRaw.trim(),
      url: seriesUrl + file,
    });
  }
  return versions;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

async function scrape(): Promise<WineVersion[]> {
  const index = await fetchText(SOURCE_INDEX);

  const seriesRe = /href="(\d+\.(?:0|x))\/"/g;
  const series: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = seriesRe.exec(index)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      series.push(m[1]);
    }
  }

  const perSeries = await mapLimit(series, 6, async (s) => {
    const url = `${SOURCE_INDEX}${s}/`;
    try {
      return parseSeries(await fetchText(url), url);
    } catch {
      return [] as WineVersion[];
    }
  });

  return perSeries.flat().sort(compareDesc);
}

async function readDiskCache(): Promise<WineVersion[] | null> {
  try {
    const raw = await fsp.readFile(cacheFile(), "utf8");
    const data = JSON.parse(raw) as {
      fetchedAt: number;
      versions: WineVersion[];
    };
    if (
      Date.now() - data.fetchedAt < CACHE_TTL_MS &&
      Array.isArray(data.versions) &&
      data.versions.length > 0
    ) {
      return data.versions;
    }
  } catch {
    // No / invalid cache.
  }
  return null;
}

async function writeDiskCache(versions: WineVersion[]): Promise<void> {
  try {
    await fsp.writeFile(
      cacheFile(),
      JSON.stringify({ fetchedAt: Date.now(), versions }),
    );
  } catch {
    // Best-effort cache; ignore failures.
  }
}

export async function getCatalog(force = false): Promise<WineVersion[]> {
  if (!force && memoryCatalog) return memoryCatalog;
  if (!force) {
    const cached = await readDiskCache();
    if (cached) {
      memoryCatalog = cached;
      return cached;
    }
  }
  const versions = await scrape();
  memoryCatalog = versions;
  await writeDiskCache(versions);
  return versions;
}

export function findVersion(id: string): WineVersion | undefined {
  return memoryCatalog?.find((v) => v.id === id);
}
