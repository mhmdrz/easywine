import { spawn } from "child_process";
import { promises as fsp } from "fs";
import { join } from "path";
import type { WineArch, WineConfig } from "@shared/wine";
import { configsDir, prefixesDir } from "./appPaths";
import { listInstalled, resolveWineboot } from "./wineManager";

const NAME_RE = /^[\w .()-]{1,64}$/;

function configFile(name: string): string {
  return join(configsDir(), name, "config.json");
}

/** The WINEPREFIX lives in its own top-level app folder: prefixes/<name>. */
function prefixDir(name: string): string {
  return join(prefixesDir(), name);
}

export async function listConfigs(): Promise<WineConfig[]> {
  const entries = await fsp
    .readdir(configsDir(), { withFileTypes: true })
    .catch(() => []);
  const configs = await Promise.all(
    entries
      .filter((e) => e.isDirectory())
      .map(async (dir) => {
        try {
          const raw = await fsp.readFile(configFile(dir.name), "utf8");
          return JSON.parse(raw) as WineConfig;
        } catch {
          return null;
        }
      }),
  );
  return configs
    .filter((c): c is WineConfig => c !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function initPrefix(
  boot: { cmd: string; args: string[] },
  prefix: string,
  arch: WineArch,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(boot.cmd, [...boot.args, "-i"], {
      env: {
        ...process.env,
        WINEPREFIX: prefix,
        WINEARCH: arch,
        WINEDEBUG: "-all",
      },
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else
        reject(new Error(`wineboot failed (code ${code}): ${stderr.trim()}`));
    });
  });
}

export async function createConfig(
  name: string,
  wineVersion: string,
  arch: WineArch,
): Promise<WineConfig> {
  const trimmed = name.trim();
  if (!NAME_RE.test(trimmed)) {
    throw new Error("Invalid instance name.");
  }

  const installed = await listInstalled();
  if (!installed.includes(wineVersion)) {
    throw new Error(`Wine version is not installed: ${wineVersion}`);
  }

  const boot = await resolveWineboot(wineVersion);
  if (!boot) {
    throw new Error(
      `Wine ${wineVersion.replace(/^wine-/, "")} has no runnable "wineboot" ` +
        `(it is a source distribution). A pre-built Wine is required to create a prefix.`,
    );
  }

  const dir = join(configsDir(), trimmed);
  await fsp.mkdir(dir).catch((err: NodeJS.ErrnoException) => {
    if (err.code === "EEXIST") {
      throw new Error(`An instance named "${trimmed}" already exists.`);
    }
    throw err;
  });

  try {
    await initPrefix(boot, prefixDir(trimmed), arch);
  } catch (err) {
    await fsp.rm(dir, { recursive: true, force: true, maxRetries: 3 });
    await fsp.rm(prefixDir(trimmed), {
      recursive: true,
      force: true,
      maxRetries: 3,
    });
    throw err;
  }

  const config: WineConfig = {
    name: trimmed,
    wineVersion,
    arch,
    createdAt: new Date().toISOString(),
  };
  await fsp.writeFile(configFile(trimmed), JSON.stringify(config, null, 2));
  return config;
}
