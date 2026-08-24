import { dialog, shell } from "electron";
import { spawn } from "child_process";
import { promises as fsp } from "fs";
import { basename, join, resolve, sep } from "path";
import type { InstalledApp, WineArch, WineConfig } from "@shared/wine";
import { CXWINE_VERSION_ID } from "@shared/wine";
import { configsDir, prefixesDir } from "./appPaths";
import { listInstalled, resolveWineboot, resolveWineTool } from "./wineManager";
import { parseLnk } from "./lnk";
import { extractIconDataUri } from "./peIcon";
import { findUninstallers, type Uninstaller } from "./registry";

const NAME_RE = /^[\w .()-]{1,64}$/;

function configFile(name: string): string {
  return join(configsDir(), name, "config.json");
}

export async function getConfig(name: string): Promise<WineConfig | null> {
  if (!NAME_RE.test(name)) return null;
  try {
    const raw = await fsp.readFile(configFile(name), "utf8");
    return JSON.parse(raw) as WineConfig;
  } catch {
    return null;
  }
}

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

  if (wineVersion !== CXWINE_VERSION_ID) {
    const installed = await listInstalled();
    if (!installed.includes(wineVersion)) {
      throw new Error(`Wine version is not installed: ${wineVersion}`);
    }
  }

  const boot = await resolveWineboot(wineVersion);
  if (!boot) {
    throw new Error(
      wineVersion === CXWINE_VERSION_ID
        ? `The custom D3DMetal Wine build is not ready yet — compile or import it first.`
        : `Wine ${wineVersion.replace(/^wine-/, "")} has no runnable "wineboot" ` +
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

export async function deleteConfig(name: string): Promise<void> {
  if (!NAME_RE.test(name)) {
    throw new Error("Invalid instance name.");
  }
  await fsp.rm(join(configsDir(), name), {
    recursive: true,
    force: true,
    maxRetries: 3,
  });
  await fsp.rm(prefixDir(name), {
    recursive: true,
    force: true,
    maxRetries: 3,
  });
}

async function collectShortcuts(dir: string): Promise<InstalledApp[]> {
  const entries = await fsp
    .readdir(dir, { withFileTypes: true })
    .catch(() => []);
  const apps: InstalledApp[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      apps.push(...(await collectShortcuts(full)));
    } else if (entry.name.toLowerCase().endsWith(".lnk")) {
      apps.push({ name: entry.name.replace(/\.lnk$/i, ""), path: full });
    }
  }
  return apps;
}

const ENV_PATHS: Record<string, string> = {
  "%systemroot%": "C:\\windows",
  "%windir%": "C:\\windows",
  "%programfiles%": "C:\\Program Files",
  "%programfiles(x86)%": "C:\\Program Files (x86)",
};

function winPathToPrefix(name: string, winPath: string): string | null {
  const expanded = winPath
    .trim()
    .replace(/%[^%]+%/g, (m) => ENV_PATHS[m.toLowerCase()] ?? m);
  const match = /^([a-zA-Z]):\\?(.*)$/.exec(expanded);
  if (!match) return null;
  const rest = match[2].replace(/\\/g, "/");
  return join(prefixDir(name), `drive_${match[1].toLowerCase()}`, rest);
}

async function resolveIcon(
  name: string,
  lnkPath: string,
): Promise<string | undefined> {
  try {
    const info = parseLnk(await fsp.readFile(lnkPath));
    if (!info) return undefined;

    const sources: Array<{ win: string; index: number }> = [];
    if (info.iconLocation && /\.(exe|dll|ico)$/i.test(info.iconLocation)) {
      sources.push({ win: info.iconLocation, index: info.iconIndex });
    }
    if (info.target) sources.push({ win: info.target, index: info.iconIndex });

    for (const src of sources) {
      const unix = winPathToPrefix(name, src.win);
      if (!unix) continue;
      if (/\.ico$/i.test(unix)) {
        const raw = await fsp.readFile(unix).catch(() => null);
        if (raw) return `data:image/x-icon;base64,${raw.toString("base64")}`;
        continue;
      }
      const icon = await extractIconDataUri(unix, src.index);
      if (icon) return icon;
    }
  } catch {
    // Any failure just means we fall back to the default icon.
  }
  return undefined;
}

export async function listApps(name: string): Promise<InstalledApp[]> {
  if (!NAME_RE.test(name)) return [];
  const driveC = join(prefixDir(name), "drive_c");
  const startMenu = join("Microsoft", "Windows", "Start Menu", "Programs");

  const menus = [join(driveC, "ProgramData", startMenu)];
  const users = await fsp
    .readdir(join(driveC, "users"), { withFileTypes: true })
    .catch(() => []);
  for (const user of users) {
    if (user.isDirectory()) {
      menus.push(
        join(driveC, "users", user.name, "AppData", "Roaming", startMenu),
      );
    }
  }

  const found = (await Promise.all(menus.map(collectShortcuts))).flat();
  const byName = new Map(found.map((a) => [a.name, a]));
  const withIcons = await Promise.all(
    Array.from(byName.values()).map(async (app) => ({
      ...app,
      icon: await resolveIcon(name, app.path),
    })),
  );
  return withIcons.sort((a, b) => a.name.localeCompare(b.name));
}

export async function runApp(name: string, appPath: string): Promise<void> {
  const config = await getConfig(name);
  if (!config) throw new Error(`Unknown instance: ${name}`);

  const root = prefixDir(name);
  const target = resolve(appPath);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error("Refusing to launch a file outside the prefix.");
  }

  const wine = await resolveWineTool(config.wineVersion, "wine");
  if (!wine) throw new Error("wine is not available for this Wine version.");

  const child = spawn(wine, ["start", "/unix", target], {
    env: {
      ...process.env,
      WINEPREFIX: root,
      WINEARCH: config.arch,
    },
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

function splitCommandLine(input: string): string[] {
  const args: string[] = [];
  let cur = "";
  let quoted = false;
  for (const c of input) {
    if (c === '"') quoted = !quoted;
    else if (!quoted && /\s/.test(c)) {
      if (cur) args.push(cur);
      cur = "";
    } else cur += c;
  }
  if (cur) args.push(cur);
  return args;
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function matchUninstaller(
  appName: string,
  list: Uninstaller[],
): Uninstaller | null {
  const target = normalizeName(appName);
  if (!target) return null;
  let partial: Uninstaller | null = null;
  for (const u of list) {
    const dn = normalizeName(u.displayName);
    if (!dn) continue;
    if (dn === target) return u; // exact match wins outright
    if (!partial && (dn.includes(target) || target.includes(dn))) partial = u;
  }
  return partial;
}

function runAndWait(
  cmd: string,
  args: string[],
  prefix: string,
  arch: WineArch,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      env: {
        ...process.env,
        WINEPREFIX: prefix,
        WINEARCH: arch,
        WINEDEBUG: "-all",
      },
      stdio: "ignore",
    });
    child.on("error", reject);
    child.on("close", () => resolve());
  });
}

export async function uninstallApp(
  name: string,
  appPath: string,
): Promise<{ uninstaller: boolean }> {
  const config = await getConfig(name);
  if (!config) throw new Error(`Unknown instance: ${name}`);

  const root = prefixDir(name);
  const target = resolve(appPath);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error("Refusing to modify a file outside the prefix.");
  }

  const appName = basename(target).replace(/\.lnk$/i, "");
  const match = matchUninstaller(appName, await findUninstallers(root));

  if (match) {
    const wine = await resolveWineTool(config.wineVersion, "wine");
    if (!wine) throw new Error("wine is not available for this Wine version.");
    const argv = splitCommandLine(match.uninstallString);
    if (argv.length > 0) await runAndWait(wine, argv, root, config.arch);
  }

  await fsp.rm(target, { force: true });
  return { uninstaller: Boolean(match) };
}

export async function openDriveC(name: string): Promise<void> {
  const config = await getConfig(name);
  if (!config) throw new Error(`Unknown instance: ${name}`);
  const driveC = join(prefixDir(name), "drive_c");
  const error = await shell.openPath(driveC);
  if (error) throw new Error(error);
}

export async function runWinecfg(name: string): Promise<void> {
  const config = await getConfig(name);
  if (!config) throw new Error(`Unknown instance: ${name}`);

  const winecfg = await resolveWineTool(config.wineVersion, "winecfg");
  if (!winecfg) {
    throw new Error("winecfg is not available for this Wine version.");
  }

  const child = spawn(winecfg, {
    env: {
      ...process.env,
      WINEPREFIX: prefixDir(name),
      WINEARCH: config.arch,
    },
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

export async function installApp(name: string): Promise<string | null> {
  const config = await getConfig(name);
  if (!config) throw new Error(`Unknown instance: ${name}`);

  const wine = await resolveWineTool(config.wineVersion, "wine");
  if (!wine) throw new Error("wine is not available for this Wine version.");

  const result = await dialog.showOpenDialog({
    title: "Select a Windows installer",
    properties: ["openFile"],
    filters: [{ name: "Windows programs", extensions: ["exe", "msi"] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const installer = result.filePaths[0];
  const args = installer.toLowerCase().endsWith(".msi")
    ? ["msiexec", "/i", installer]
    : [installer];

  const child = spawn(wine, args, {
    env: {
      ...process.env,
      WINEPREFIX: prefixDir(name),
      WINEARCH: config.arch,
    },
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return installer;
}
