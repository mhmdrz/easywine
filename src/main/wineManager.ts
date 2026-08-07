import { net } from "electron";
import { createWriteStream, promises as fsp, renameSync, rmSync } from "fs";
import { join } from "path";
import { cacheDir, downloadsDir } from "./appPaths";
import { findVersion, getCatalog } from "./wineCatalog";

function isValidId(id: string): boolean {
  return /^wine-\d+(\.\d+)*(-rc\d+)?$/.test(id);
}

function destFor(id: string): string {
  return join(downloadsDir(), `${id}.tar.xz`);
}

export async function listInstalled(): Promise<string[]> {
  const files = await fsp.readdir(downloadsDir()).catch(() => [] as string[]);
  return files
    .filter((f) => f.endsWith(".tar.xz"))
    .map((f) => f.replace(/\.tar\.xz$/, ""));
}

export function deleteVersion(id: string): void {
  if (!isValidId(id)) return;
  rmSync(destFor(id), { force: true });
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

  const dest = destFor(id);
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
          renameSync(partial, dest);
          onProgress(100);
          resolve();
        });
      });

      response.on("error", (error) => {
        file.destroy();
        rmSync(partial, { force: true });
        reject(error);
      });
    });

    request.on("error", reject);
    request.end();
  });
}
