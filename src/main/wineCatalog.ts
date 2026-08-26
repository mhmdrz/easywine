import { net } from "electron";
import { promises as fsp } from "fs";
import { join } from "path";
import type { WineChannel, WineVersion } from "@shared/wine";
import { cacheDir } from "./appPaths";

const RELEASES_API =
  "https://api.github.com/repos/Gcenx/macOS_Wine_builds/releases?per_page=100";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const ASSET_RE = /^wine-(devel|staging|stable)-(.+)-osx64\.tar\.xz$/;

const CHANNEL_FOR: Record<string, WineChannel> = {
  stable: "stable",
  devel: "development",
  staging: "staging",
};

interface GithubAsset {
  name: string;
  size: number;
  browser_download_url: string;
  digest: string | null;
}
interface GithubRelease {
  published_at: string;
  assets: GithubAsset[];
}

let memoryCatalog: WineVersion[] | null = null;

function cacheFile(): string {
  return join(cacheDir(), "catalog-v2.json");
}

function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = net.request(url);
    request.setHeader("User-Agent", "EasyWine");
    request.setHeader("Accept", "application/vnd.github+json");
    request.on("response", (response) => {
      const status = response.statusCode ?? 0;
      if (status >= 300) {
        reject(new Error(`Request failed (HTTP ${status}) for ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as T);
        } catch (err) {
          reject(err as Error);
        }
      });
      response.on("error", reject);
    });
    request.on("error", reject);
    request.end();
  });
}

function formatSize(bytes: number): string {
  const mib = bytes / (1024 * 1024);
  return `${mib.toFixed(1)} MiB`;
}

function versionKey(version: string): number[] {
  return version.split(".").map((n) => parseInt(n, 10) || 0);
}

function compareDesc(a: WineVersion, b: WineVersion): number {
  const ka = versionKey(a.version);
  const kb = versionKey(b.version);
  const len = Math.max(ka.length, kb.length);
  for (let i = 0; i < len; i++) {
    const diff = (kb[i] ?? 0) - (ka[i] ?? 0);
    if (diff !== 0) return diff;
  }
  const order: Record<WineChannel, number> = {
    stable: 0,
    development: 1,
    staging: 2,
  };
  return order[a.channel] - order[b.channel];
}

async function scrape(): Promise<WineVersion[]> {
  const releases = await fetchJson<GithubRelease[]>(RELEASES_API);
  const versions: WineVersion[] = [];

  for (const release of releases) {
    const date = release.published_at?.split("T")[0] ?? "";
    for (const asset of release.assets ?? []) {
      const match = ASSET_RE.exec(asset.name);
      if (!match) continue;
      const [, channelToken, version] = match;
      const major = parseInt(version, 10);
      if (Number.isNaN(major)) continue;
      versions.push({
        id: `wine-${version}-${channelToken}`,
        version,
        major,
        channel: CHANNEL_FOR[channelToken],
        releaseDate: date,
        size: formatSize(asset.size),
        url: asset.browser_download_url,
        sha256: asset.digest?.replace(/^sha256:/, ""),
      });
    }
  }

  return versions.sort(compareDesc);
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
