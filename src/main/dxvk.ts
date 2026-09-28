import { net } from "electron";
import { spawn } from "child_process";
import { createWriteStream, promises as fsp } from "fs";
import { join } from "path";
import { cacheDir, cxwineBuildDir } from "./appPaths";
import type { DxvkStatus } from "@shared/wine";

const REPO = "Gcenx/DXVK-macOS";
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases`;
const REQUIRED_DLLS = ["d3d9.dll", "d3d10core.dll", "d3d11.dll", "dxgi.dll"];

interface ReleaseAsset {
  name?: string;
  browser_download_url?: string;
}
interface Release {
  tag_name?: string;
  assets?: ReleaseAsset[];
}

function shareDxvkDir(): string {
  return join(cxwineBuildDir(), "share", "dxvk");
}
function versionFile(): string {
  return join(shareDxvkDir(), "VERSION");
}

export async function getDxvkStatus(): Promise<DxvkStatus> {
  const installed = await fsp
    .readFile(versionFile(), "utf8")
    .then((s) => s.trim() || null)
    .catch(() => null);
  const x64 = await fsp
    .readdir(join(shareDxvkDir(), "x64"))
    .catch(() => [] as string[]);
  const hasDlls = x64.some((f) => f.toLowerCase().endsWith(".dll"));
  return { installed, hasDlls };
}

function fetchJson<T>(url: string): Promise<T> {
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
          resolve(JSON.parse(body) as T);
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

async function findLatest(): Promise<{ tag: string; url: string }> {
  const releases = await fetchJson<Release[]>(RELEASES_API);
  for (const rel of releases) {
    const asset = (rel.assets ?? []).find((a) => {
      const n = (a.name ?? "").toLowerCase();
      return (
        n.startsWith("dxvk-macos-async-") &&
        n.endsWith(".tar.gz") &&
        !n.includes("builtin") &&
        !n.includes("repack")
      );
    });
    if (asset?.browser_download_url && rel.tag_name) {
      return { tag: rel.tag_name, url: asset.browser_download_url };
    }
  }
  throw new Error("No complete DXVK-macOS release asset was found.");
}

export async function checkLatestDxvk(): Promise<string> {
  return (await findLatest()).tag;
}

function download(
  url: string,
  dest: string,
  onProgress: (p: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = net.request(url); // net follows redirects (GitHub → S3).
    request.setHeader("User-Agent", "EasyWine");
    request.on("response", (response) => {
      const status = response.statusCode ?? 0;
      if (status >= 400) {
        reject(new Error(`Download failed (HTTP ${status})`));
        return;
      }
      const header = response.headers["content-length"];
      const total = Number(Array.isArray(header) ? header[0] : header) || 0;
      let received = 0;
      const file = createWriteStream(dest);
      file.on("error", reject);
      response.on("data", (chunk: Buffer) => {
        received += chunk.length;
        file.write(chunk);
        if (total > 0) {
          onProgress(Math.min(Math.round((received / total) * 100), 100));
        }
      });
      response.on("end", () => file.end(() => resolve()));
      response.on("error", (err) => {
        file.destroy();
        reject(err);
      });
    });
    request.on("error", reject);
    request.end();
  });
}

function runTar(tarPath: string, outDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("tar", ["-xzf", tarPath, "-C", outDir]);
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`tar exited with ${code}: ${stderr.trim()}`)),
    );
  });
}

async function findArchDir(
  root: string,
  arch: "x64" | "x32",
): Promise<string | null> {
  const walk = async (dir: string, depth: number): Promise<string | null> => {
    if (depth > 3) return null;
    const entries = await fsp
      .readdir(dir, { withFileTypes: true })
      .catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === arch) return join(dir, entry.name);
      const found = await walk(join(dir, entry.name), depth + 1);
      if (found) return found;
    }
    return null;
  };
  return walk(root, 0);
}

async function copyDlls(from: string, to: string): Promise<void> {
  await fsp.mkdir(to, { recursive: true });
  for (const f of await fsp.readdir(from)) {
    if (f.toLowerCase().endsWith(".dll")) {
      await fsp.copyFile(join(from, f), join(to, f));
    }
  }
}

export async function downloadDxvk(
  onProgress: (stage: string, progress: number) => void = () => {},
): Promise<string> {
  const buildExists = await fsp
    .stat(cxwineBuildDir())
    .then((s) => s.isDirectory())
    .catch(() => false);
  if (!buildExists) {
    throw new Error(
      "Import the game (D3DMetal) build first — no cxwine build found.",
    );
  }

  onProgress("checking", 0);
  const { tag, url } = await findLatest();

  const tarPath = join(cacheDir(), "dxvk-macos.tar.gz");
  const staging = join(cacheDir(), "dxvk-extract");
  await fsp.mkdir(cacheDir(), { recursive: true });
  await fsp.rm(staging, { recursive: true, force: true });
  await fsp.mkdir(staging, { recursive: true });

  try {
    await download(url, tarPath, (p) => onProgress("downloading", p));
    onProgress("extracting", 100);
    await runTar(tarPath, staging);

    const x64 = await findArchDir(staging, "x64");
    if (!x64) throw new Error("The DXVK archive had no x64 DLLs.");
    const x64files = (await fsp.readdir(x64)).map((f) => f.toLowerCase());
    const missing = REQUIRED_DLLS.filter((d) => !x64files.includes(d));
    if (missing.length > 0) {
      throw new Error(
        `DXVK archive is incomplete (missing ${missing.join(", ")}).`,
      );
    }

    await copyDlls(x64, join(shareDxvkDir(), "x64"));
    const x32 = await findArchDir(staging, "x32");
    if (x32) await copyDlls(x32, join(shareDxvkDir(), "x32"));

    await fsp.writeFile(versionFile(), tag);
    onProgress("done", 100);
    return tag;
  } finally {
    await fsp.rm(tarPath, { force: true });
    await fsp.rm(staging, { recursive: true, force: true });
  }
}
