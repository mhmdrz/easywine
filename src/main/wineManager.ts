import { net } from "electron";
import { spawn } from "child_process";
import { createHash } from "crypto";
import {
  constants as fsConstants,
  createReadStream,
  createWriteStream,
  promises as fsp,
  renameSync,
} from "fs";
import { join } from "path";
import type { DownloadStage } from "@shared/wine";
import { cacheDir, downloadsDir } from "./appPaths";
import { findVersion, getCatalog } from "./wineCatalog";

type ProgressFn = (stage: DownloadStage, percent: number) => void;

function isValidId(id: string): boolean {
  return /^wine-\d+(\.\d+)*(_\d+)?-(devel|staging|stable)$/.test(id);
}

function installDir(id: string): string {
  return join(downloadsDir(), id);
}

function tarFor(id: string): string {
  return join(cacheDir(), `${id}.tar.xz`);
}

async function isExecutable(path: string): Promise<boolean> {
  return fsp
    .access(path, fsConstants.X_OK)
    .then(() => true)
    .catch(() => false);
}

export async function resolveWineboot(
  id: string,
): Promise<{ cmd: string; args: string[] } | null> {
  const bin = join(installDir(id), "Contents", "Resources", "wine", "bin");
  const wineboot = join(bin, "wineboot");
  if (await isExecutable(wineboot)) return { cmd: wineboot, args: [] };
  const wine = join(bin, "wine");
  if (await isExecutable(wine)) return { cmd: wine, args: ["wineboot"] };
  return null;
}

export async function listInstalled(): Promise<string[]> {
  const entries = await fsp
    .readdir(downloadsDir(), { withFileTypes: true })
    .catch(() => []);
  return entries
    .filter((e) => e.isDirectory() && isValidId(e.name))
    .map((e) => e.name);
}

export async function deleteVersion(id: string): Promise<void> {
  if (!isValidId(id)) return;
  await fsp.rm(tarFor(id), { force: true });
  await fsp.rm(installDir(id), {
    recursive: true,
    force: true,
    maxRetries: 3,
  });
}

function sha256Of(
  filePath: string,
  total: number,
  onProgress?: (percent: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    let read = 0;
    stream.on("error", reject);
    stream.on("data", (chunk) => {
      hash.update(chunk);
      read += chunk.length;
      if (total > 0 && onProgress) {
        onProgress(Math.min(Math.round((read / total) * 100), 100));
      }
    });
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function runTar(tarPath: string, outDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("tar", ["-xf", tarPath, "-C", outDir]);
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`tar exited with code ${code}: ${stderr.trim()}`));
    });
  });
}

async function extractVersion(id: string): Promise<void> {
  const tarPath = tarFor(id);
  const staging = join(cacheDir(), `${id}-extract`);
  await fsp.rm(staging, { recursive: true, force: true, maxRetries: 3 });
  await fsp.mkdir(staging, { recursive: true });

  await runTar(tarPath, staging);

  const entries = await fsp.readdir(staging);
  const root = entries.length === 1 ? join(staging, entries[0]) : staging;

  const target = installDir(id);
  await fsp.rm(target, { recursive: true, force: true, maxRetries: 3 });
  await fsp.rename(root, target);
  await fsp.rm(staging, { recursive: true, force: true, maxRetries: 3 });

  await fsp.rm(tarPath, { force: true });
}

async function verify(
  tarPath: string,
  expected: string | undefined,
  onProgress: (percent: number) => void,
): Promise<void> {
  if (!expected) return;
  const { size } = await fsp.stat(tarPath);
  const actual = await sha256Of(tarPath, size, onProgress);
  if (actual !== expected.toLowerCase()) {
    throw new Error(
      `Checksum mismatch: expected ${expected.slice(0, 12)}…, got ${actual.slice(0, 12)}…`,
    );
  }
}

interface ActiveDownload {
  stage: DownloadStage;
  progress: number;
}

const active = new Map<string, ActiveDownload>();
const inflight = new Map<string, Promise<void>>();

export function getActiveDownloads(): Array<{ id: string } & ActiveDownload> {
  return Array.from(active, ([id, a]) => ({ id, ...a }));
}

export function downloadVersion(
  id: string,
  onProgress: ProgressFn,
): Promise<void> {
  const existing = inflight.get(id);
  if (existing) return existing;

  const report: ProgressFn = (stage, percent) => {
    active.set(id, { stage, progress: percent });
    onProgress(stage, percent);
  };

  const promise = runDownload(id, report).finally(() => {
    inflight.delete(id);
    active.delete(id);
  });
  inflight.set(id, promise);
  return promise;
}

async function runDownload(id: string, onProgress: ProgressFn): Promise<void> {
  if (!isValidId(id)) {
    throw new Error(`Invalid version id: ${id}`);
  }

  const version =
    findVersion(id) ?? (await getCatalog()).find((v) => v.id === id);
  if (!version) {
    throw new Error(`Unknown Wine version: ${id}`);
  }

  const dest = tarFor(id);
  const partial = join(cacheDir(), `${id}.tar.xz.part`);

  return new Promise((resolve, reject) => {
    const request = net.request(version.url);

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
          } catch (error) {
            reject(error as Error);
            return;
          }
          verify(dest, version.sha256, (p) => onProgress("verifying", p))
            .then(() => {
              onProgress("extracting", 100);
              return extractVersion(id);
            })
            .then(resolve)
            .catch(async (error) => {
              // Bad or half-written download: drop it so a retry starts clean.
              await fsp.rm(dest, { force: true });
              reject(error);
            });
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
