import { promises as fsp } from "fs";
import { join } from "path";
import type { StorageUsage } from "@shared/wine";
import { appDir, cacheDir } from "./appPaths";

async function directorySize(dir: string): Promise<number> {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }

  let total = 0;
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await directorySize(full);
    } else {
      try {
        total += (await fsp.stat(full)).size;
      } catch {
        // File vanished mid-scan — ignore.
      }
    }
  }
  return total;
}

export async function getUsage(): Promise<StorageUsage> {
  const path = appDir();
  return { path, bytes: await directorySize(path) };
}

export async function clearCache(): Promise<number> {
  const dir = cacheDir();
  const freed = await directorySize(dir);
  await fsp.rm(dir, { recursive: true, force: true });
  cacheDir(); // recreate the (now empty) folder
  return freed;
}
