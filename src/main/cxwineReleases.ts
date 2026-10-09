import { net } from "electron";
import { createWriteStream, promises as fsp, renameSync } from "fs";
import { join } from "path";
import type { CxwineRelease, DownloadStage } from "@shared/wine";
import { cacheDir, cxwineBuildDir } from "./appPaths";
import { findCxwineBuildRoot, installCxwineBuildFromDir } from "./cxwine";
import { extractArchive } from "./archive";

const REPO = "mhmdrz/wine";
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases?per_page=30`;

const TAG_MARKER = ".easywine-cxwine-tag";

type ProgressFn = (stage: DownloadStage, percent: number) => void;

interface GitHubAsset {
  name?: string;
  size?: number;
  browser_download_url?: string;
}

interface GitHubRelease {
  tag_name?: string;
  name?: string;
  published_at?: string;
  prerelease?: boolean;
  assets?: GitHubAsset[];
}

function isBuildAsset(name: string): boolean {
  return /\.(tar\.gz|tgz|tar\.xz|txz|tar|zip)$/i.test(name);
}

function formatSize(bytes: number): string {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function fetchJson(url: string): Promise<GitHubRelease[]> {
  return new Promise((resolve, reject) => {
    const request = net.request(url);
    request.setHeader("User-Agent", "EasyWine");
    request.setHeader("Accept", "application/vnd.github+json");
    request.on("response", (response) => {
      const status = response.statusCode ?? 0;
      let body = "";
      response.on("data", (chunk) => (body += chunk.toString()));
      response.on("end", () => {
        if (status >= 400) {
          reject(new Error(`GitHub API returned HTTP ${status}`));
          return;
        }
        try {
          resolve(JSON.parse(body) as GitHubRelease[]);
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

export async function listCxwineReleases(): Promise<CxwineRelease[]> {
  const releases = await fetchJson(RELEASES_API);
  const out: CxwineRelease[] = [];
  for (const release of releases) {
    const tag = release.tag_name ?? "";
    if (!tag) continue;
    const asset = (release.assets ?? []).find((a) =>
      isBuildAsset(a.name ?? ""),
    );
    if (!asset?.browser_download_url) continue;
    out.push({
      id: `cxwine-${tag}`,
      tag,
      name: release.name || tag,
      url: asset.browser_download_url,
      size: formatSize(asset.size ?? 0),
      publishedAt: release.published_at,
    });
  }
  return out;
}

export async function installedCxwineTag(): Promise<string | null> {
  return fsp
    .readFile(join(cxwineBuildDir(), TAG_MARKER), "utf8")
    .then((s) => s.trim() || null)
    .catch(() => null);
}

function tarbarFor(tag: string): string {
  return join(cacheDir(), `cxwine-${tag}.tar`);
}

interface ActiveDownload {
  stage: DownloadStage;
  progress: number;
}

const active = new Map<string, ActiveDownload>();
const inflight = new Map<string, Promise<void>>();

export function getActiveCxwineDownload():
  | ({ id: string } & ActiveDownload)
  | null {
  for (const [id, a] of active) return { id, ...a };
  return null;
}

export function downloadCxwineRelease(
  release: CxwineRelease,
  onProgress: ProgressFn,
): Promise<void> {
  const existing = inflight.get(release.id);
  if (existing) return existing;

  const report: ProgressFn = (stage, percent) => {
    active.set(release.id, { stage, progress: percent });
    onProgress(stage, percent);
  };

  const promise = runInstall(release, report).finally(() => {
    inflight.delete(release.id);
    active.delete(release.id);
  });
  inflight.set(release.id, promise);
  return promise;
}

function downloadTo(
  url: string,
  dest: string,
  onProgress: ProgressFn,
): Promise<void> {
  const partial = `${dest}.part`;
  return new Promise((resolve, reject) => {
    const request = net.request(url);
    request.on("response", (response) => {
      const status = response.statusCode ?? 0;
      if (status >= 300) {
        reject(new Error(`Download failed (HTTP ${status})`));
        return;
      }
      const header = response.headers["content-length"];
      const total = Number(Array.isArray(header) ? header[0] : header) || 0;
      let received = 0;
      const file = createWriteStream(partial);
      file.on("error", reject);
      response.on("data", (chunk: Buffer) => {
        received += chunk.length;
        file.write(chunk);
        if (total > 0) {
          onProgress(
            "downloading",
            Math.min(Math.round((received / total) * 100), 100),
          );
        }
      });
      response.on("end", () => {
        file.end(() => {
          try {
            renameSync(partial, dest);
            resolve();
          } catch (error) {
            reject(error as Error);
          }
        });
      });
      response.on("error", (error) => {
        file.destroy();
        void fsp.rm(partial, { force: true });
        reject(error);
      });
    });
    request.on("error", reject);
    request.end();
  });
}

async function runInstall(
  release: CxwineRelease,
  onProgress: ProgressFn,
): Promise<void> {
  const tar = tarbarFor(release.tag);
  const staging = join(cacheDir(), `cxwine-${release.tag}-extract`);

  try {
    await downloadTo(release.url, tar, onProgress);

    onProgress("extracting", 100);
    await fsp.rm(staging, { recursive: true, force: true, maxRetries: 3 });
    await fsp.mkdir(staging, { recursive: true });
    await extractArchive(tar, staging);

    const root = await findCxwineBuildRoot(staging);
    if (!root) {
      throw new Error(
        "The downloaded archive does not contain a Wine build (no bin/wine64).",
      );
    }

    await installCxwineBuildFromDir(root, { move: true });
    await fsp
      .writeFile(join(cxwineBuildDir(), TAG_MARKER), release.tag)
      .catch(() => undefined);
  } finally {
    await fsp.rm(tar, { force: true });
    await fsp.rm(staging, { recursive: true, force: true, maxRetries: 3 });
  }
}
