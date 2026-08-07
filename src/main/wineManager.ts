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
import { cacheDir, downloadsDir } from "./appPaths";
import { findVersion, getCatalog } from "./wineCatalog";

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

function sha256Of(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
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

  // The tarball unpacks to a single "Wine <Channel>.app" bundle.
  const entries = await fsp.readdir(staging);
  const root = entries.length === 1 ? join(staging, entries[0]) : staging;

  const target = installDir(id);
  await fsp.rm(target, { recursive: true, force: true, maxRetries: 3 });
  await fsp.rename(root, target);
  await fsp.rm(staging, { recursive: true, force: true, maxRetries: 3 });

  await fsp.rm(tarPath, { force: true });
}

async function verify(tarPath: string, expected?: string): Promise<void> {
  if (!expected) return;
  const actual = await sha256Of(tarPath);
  if (actual !== expected.toLowerCase()) {
    throw new Error(
      `Checksum mismatch: expected ${expected.slice(0, 12)}…, got ${actual.slice(0, 12)}…`,
    );
  }
}

export async function downloadVersion(
  id: string,
  onProgress: (percent: number) => void,
): Promise<void> {
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
          onProgress(Math.min(Math.round((received / total) * 100), 100));
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
          verify(dest, version.sha256)
            .then(() => extractVersion(id))
            .then(() => {
              onProgress(100);
              resolve();
            })
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
