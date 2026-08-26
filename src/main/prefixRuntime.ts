import { net } from "electron";
import { spawn } from "child_process";
import { createWriteStream, promises as fsp } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { WineArch } from "@shared/wine";
import { cxwineBuildDir, prefixesDir } from "./appPaths";
import { cxwineLaunchEnv } from "./cxwineEnv";
import { getConfig } from "./configManager";
import { resolveWineTool } from "./wineManager";

export type RuntimeKind = "mono" | "gecko" | "vcrun";

const MONO_BASE = "https://dl.winehq.org/wine/wine-mono";
const GECKO_BASE = "https://dl.winehq.org/wine/wine-gecko";

// Latest Visual C++ 2015–2022 redistributables (official Microsoft evergreen URLs).
const VCRUN_URLS: Record<string, string> = {
  x64: "https://aka.ms/vs/17/release/vc_redist.x64.exe",
  x86: "https://aka.ms/vs/17/release/vc_redist.x86.exe",
};

function prefixDir(name: string): string {
  return join(prefixesDir(), name);
}

async function readVersion(marker: string): Promise<string | null> {
  const dirs = ["x86_64-windows", "i386-windows"];
  for (const arch of dirs) {
    const appwiz = join(cxwineBuildDir(), "lib", "wine", arch, "appwiz.cpl");
    const buf = await fsp.readFile(appwiz).catch(() => null);
    if (!buf) continue;
    const text = buf.toString("latin1");
    const urlIdx = text.indexOf(marker);
    if (urlIdx < 0) continue;

    // Isolated version tokens: a null-terminated string that is exactly x.y.z.
    const token = /\x00(\d+\.\d+\.\d+)\x00/g;
    let best: string | null = null;
    for (let m = token.exec(text); m; m = token.exec(text)) {
      if (m.index < urlIdx) best = m[1];
      else break;
    }
    if (best) return best;
  }
  return null;
}

function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = net.request(url);
    request.on("response", (response) => {
      const status = response.statusCode ?? 0;
      if (status >= 300) {
        reject(new Error(`Download failed (HTTP ${status}) for ${url}`));
        return;
      }
      const file = createWriteStream(dest);
      file.on("error", reject);
      response.on("data", (chunk: Buffer) => file.write(chunk));
      response.on("end", () => file.end(() => resolve()));
      response.on("error", reject);
    });
    request.on("error", reject);
    request.end();
  });
}

async function ensureCached(dest: string, url: string): Promise<void> {
  const exists = await fsp
    .access(dest)
    .then(() => true)
    .catch(() => false);
  if (exists) return;
  const part = `${dest}.part`;
  await download(url, part);
  await fsp.rename(part, dest);
}

function runWine(
  wine: string,
  args: string[],
  prefix: string,
  arch: WineArch,
  allow: number[] = [0],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(wine, args, {
      env: {
        ...process.env,
        ...cxwineLaunchEnv(),
        WINEPREFIX: prefix,
        WINEARCH: arch,
        WINEDEBUG: "-all",
      },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== null && allow.includes(code)) resolve();
      else
        reject(
          new Error(
            `Installer failed (code ${code}): ${stderr.trim().slice(-400)}`,
          ),
        );
    });
  });
}

async function installVcrun(
  wine: string,
  prefix: string,
  arch: WineArch,
): Promise<{ version: string }> {
  const cache = join(homedir(), ".cache", "easywine");
  await fsp.mkdir(cache, { recursive: true });

  const arches = arch === "win64" ? ["x64", "x86"] : ["x86"];
  for (const a of arches) {
    const file = join(cache, `vc_redist.${a}.exe`);
    await ensureCached(file, VCRUN_URLS[a]);
    // /install /quiet /norestart; tolerate benign codes: 1638 (newer already
    // installed) and 3010 (reboot required — irrelevant under Wine).
    await runWine(
      wine,
      [file, "/install", "/quiet", "/norestart"],
      prefix,
      arch,
      [0, 1638, 3010],
    );
  }
  return { version: "2015–2022" };
}

export async function installRuntime(
  name: string,
  kind: RuntimeKind,
): Promise<{ version: string }> {
  const config = await getConfig(name);
  if (!config) throw new Error(`Unknown instance: ${name}`);

  const wine = await resolveWineTool(config.wineVersion, "wine");
  if (!wine) throw new Error("wine is not available for this instance.");

  if (kind === "vcrun") {
    return installVcrun(wine, prefixDir(name), config.arch);
  }

  const marker = kind === "mono" ? "winemono.php" : "winegecko.php";
  const version = await readVersion(marker);
  if (!version) {
    throw new Error(
      `Could not determine the required ${kind} version for this build.`,
    );
  }

  const cache = join(homedir(), ".cache", "wine");
  await fsp.mkdir(cache, { recursive: true });

  const files: string[] =
    kind === "mono"
      ? [`wine-mono-${version}-x86.msi`]
      : (config.arch === "win64" ? ["x86", "x86_64"] : ["x86"]).map(
          (a) => `wine-gecko-${version}-${a}.msi`,
        );
  const base = kind === "mono" ? MONO_BASE : GECKO_BASE;

  for (const file of files) {
    await ensureCached(join(cache, file), `${base}/${version}/${file}`);
  }

  const prefix = prefixDir(name);
  for (const file of files) {
    await runWine(
      wine,
      ["msiexec", "/i", join(cache, file)],
      prefix,
      config.arch,
    );
  }

  return { version };
}
