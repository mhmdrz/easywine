import { dialog, shell } from "electron";
import { spawn } from "child_process";
import { promises as fsp } from "fs";
import { basename, dirname, join, relative, resolve, sep } from "path";
import type {
  GameOptions,
  InstalledApp,
  WineArch,
  WineConfig,
} from "@shared/wine";
import { CXWINE_VERSION_ID } from "@shared/wine";
import { configsDir, prefixesDir } from "./appPaths";
import { cxwineLaunchEnv } from "./cxwineEnv";
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

async function ensurePrefixTemp(prefix: string): Promise<void> {
  const usersDir = join(prefix, "drive_c", "users");
  const entries = await fsp
    .readdir(usersDir, { withFileTypes: true })
    .catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "Public") continue;
    const home = join(usersDir, entry.name);
    await fsp.mkdir(join(home, "Temp"), { recursive: true }).catch(() => {});
    await fsp
      .mkdir(join(home, "AppData", "Local", "Temp"), { recursive: true })
      .catch(() => {});
  }
  await fsp
    .mkdir(join(prefix, "drive_c", "windows", "temp"), { recursive: true })
    .catch(() => {});
}

function wineEnv(
  wineVersion: string,
  prefix: string,
  arch: WineArch,
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...(wineVersion === CXWINE_VERSION_ID ? cxwineLaunchEnv() : {}),
    WINEPREFIX: prefix,
    WINEARCH: arch,
  };
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
  extraEnv: NodeJS.ProcessEnv = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(boot.cmd, [...boot.args, "-i"], {
      env: {
        ...process.env,
        ...extraEnv,
        WINEPREFIX: prefix,
        WINEARCH: arch,
        WINEDEBUG: "-all",
        // Disable the Mono/Gecko installer dialogs; otherwise wineboot blocks
        // on a modal prompt and prefix creation never completes.
        WINEDLLOVERRIDES: "mscoree,mshtml=",
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

const DLLOVERRIDE_KEY = "HKEY_CURRENT_USER\\Software\\Wine\\DllOverrides";

// Common gaming DLLs set to native,builtin: a game-bundled or redist-installed
// copy wins, otherwise Wine's builtin (FAudio for XAudio, its own xinput/dinput,
// etc.) is used. Harmless when no native copy exists — it just falls back.
const GAMING_DLLS = [
  // Input
  "xinput1_1",
  "xinput1_2",
  "xinput1_3",
  "xinput1_4",
  "xinput9_1_0",
  "dinput",
  "dinput8",
  // Sound
  "xaudio2_7",
  "xaudio2_8",
  "xaudio2_9",
  "x3daudio1_7",
  "xactengine3_7",
  "xapofx1_5",
  // Shader compiler (games often bundle / need the redist)
  "d3dcompiler_43",
  "d3dcompiler_47",
];

async function applyGameDefaults(
  wineVersion: string,
  prefix: string,
  arch: WineArch,
  extraEnv: NodeJS.ProcessEnv,
): Promise<void> {
  const wine = await resolveWineTool(wineVersion, "wine");
  if (!wine) return;

  const settings: Array<[string, string, string]> = [
    ["HKEY_CURRENT_USER\\Software\\Wine", "Version", "win10"],
    ["HKEY_CURRENT_USER\\Software\\Wine\\Mac Driver", "RetinaMode", "y"],
    ...GAMING_DLLS.map((dll): [string, string, string] => [
      DLLOVERRIDE_KEY,
      dll,
      "native,builtin",
    ]),
  ];

  for (const [key, name, data] of settings) {
    await new Promise<void>((resolve) => {
      const child = spawn(
        wine,
        ["reg", "add", key, "/v", name, "/t", "REG_SZ", "/d", data, "/f"],
        {
          env: {
            ...process.env,
            ...extraEnv,
            WINEPREFIX: prefix,
            WINEARCH: arch,
            WINEDEBUG: "-all",
          },
          stdio: "ignore",
        },
      );
      child.on("error", () => resolve());
      child.on("close", () => resolve());
    });
  }
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

  const isGame = wineVersion === CXWINE_VERSION_ID;
  const gameEnv: NodeJS.ProcessEnv = isGame ? cxwineLaunchEnv() : {};

  const dir = join(configsDir(), trimmed);
  try {
    await fsp.mkdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    // A folder already exists. If it holds a real config it's a genuine
    // duplicate; otherwise it's a leftover from a failed attempt we can reuse.
    if (await getConfig(trimmed)) {
      throw new Error(`An instance named "${trimmed}" already exists.`);
    }
    await fsp.rm(prefixDir(trimmed), {
      recursive: true,
      force: true,
      maxRetries: 3,
    });
  }

  try {
    await initPrefix(boot, prefixDir(trimmed), arch, gameEnv);
  } catch (err) {
    await fsp.rm(dir, { recursive: true, force: true, maxRetries: 3 });
    await fsp.rm(prefixDir(trimmed), {
      recursive: true,
      force: true,
      maxRetries: 3,
    });
    throw err;
  }

  await ensurePrefixTemp(prefixDir(trimmed));

  // Game instances get sensible defaults (Windows 10 + Retina HiDPI) applied
  // straight into the prefix registry. Best-effort: a failure here shouldn't
  // undo an otherwise-created instance.
  if (isGame) {
    await applyGameDefaults(
      wineVersion,
      prefixDir(trimmed),
      arch,
      gameEnv,
    ).catch(() => undefined);
  }

  const config: WineConfig = {
    name: trimmed,
    wineVersion,
    arch,
    createdAt: new Date().toISOString(),
    ...(isGame ? { graphicsBackend: "d3dmetal" as const } : {}),
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

function toWinPath(root: string, unixPath: string): string | null {
  const rel = relative(root, unixPath);
  const match = /^drive_([a-z])[/\\](.*)$/i.exec(rel);
  if (!match) return null;
  return `${match[1].toUpperCase()}:\\${match[2].replace(/\//g, "\\")}`;
}

function buildLnk(winTargetPath: string): Buffer {
  const header = Buffer.alloc(0x4c);
  header.writeUInt32LE(0x4c, 0x00); // HeaderSize
  // LinkCLSID: 00021401-0000-0000-C000-000000000046
  Buffer.from([
    0x01, 0x14, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0xc0, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x46,
  ]).copy(header, 0x04);
  header.writeUInt32LE(0x00000002, 0x14); // LinkFlags: HasLinkInfo
  header.writeUInt32LE(0x00000020, 0x18); // FileAttributes: ARCHIVE
  header.writeUInt32LE(1, 0x3c); // ShowCommand: SW_SHOWNORMAL

  // VolumeID (empty label, DRIVE_FIXED).
  const volLabel = Buffer.from("\0", "latin1");
  const volId = Buffer.alloc(0x10 + volLabel.length);
  volId.writeUInt32LE(volId.length, 0x00);
  volId.writeUInt32LE(3, 0x04); // DRIVE_FIXED
  volId.writeUInt32LE(0x10, 0x0c); // VolumeLabelOffset
  volLabel.copy(volId, 0x10);

  const pathAnsi = Buffer.from(winTargetPath + "\0", "latin1");
  const suffix = Buffer.from("\0", "latin1"); // empty CommonPathSuffix

  const headerSize = 0x1c;
  const volumeIdOffset = headerSize;
  const localBasePathOffset = volumeIdOffset + volId.length;
  const commonPathSuffixOffset = localBasePathOffset + pathAnsi.length;
  const linkInfoSize = commonPathSuffixOffset + suffix.length;

  const linkInfo = Buffer.alloc(linkInfoSize);
  linkInfo.writeUInt32LE(linkInfoSize, 0x00);
  linkInfo.writeUInt32LE(headerSize, 0x04);
  linkInfo.writeUInt32LE(0x00000001, 0x08); // VolumeIDAndLocalBasePath
  linkInfo.writeUInt32LE(volumeIdOffset, 0x0c);
  linkInfo.writeUInt32LE(localBasePathOffset, 0x10);
  linkInfo.writeUInt32LE(commonPathSuffixOffset, 0x18);
  volId.copy(linkInfo, volumeIdOffset);
  pathAnsi.copy(linkInfo, localBasePathOffset);
  suffix.copy(linkInfo, commonPathSuffixOffset);

  // ExtraData terminal block.
  return Buffer.concat([header, linkInfo, Buffer.alloc(4)]);
}

export async function addApp(name: string): Promise<InstalledApp | null> {
  const config = await getConfig(name);
  if (!config) throw new Error(`Unknown instance: ${name}`);

  const root = prefixDir(name);
  const result = await dialog.showOpenDialog({
    title: "Select an application to add",
    defaultPath: join(root, "drive_c"),
    properties: ["openFile"],
    filters: [{ name: "Windows programs", extensions: ["exe"] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  // Canonicalize both sides: userData resolves to a differently-cased on-disk
  // path (and may cross symlinks), so compare/derive from realpaths.
  const realRoot = await fsp.realpath(root);
  const target = await fsp.realpath(result.filePaths[0]).catch(() => "");
  const winPath = target ? toWinPath(realRoot, target) : null;
  if (!winPath) {
    throw new Error("Choose an application inside this instance’s folder.");
  }

  const appName = basename(target).replace(/\.exe$/i, "");
  const programs = join(
    root,
    "drive_c",
    "ProgramData",
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
  );
  await fsp.mkdir(programs, { recursive: true });

  // Pick a shortcut filename that doesn't clobber an existing one.
  let lnkPath = join(programs, `${appName}.lnk`);
  for (let i = 2; ; i++) {
    const taken = await fsp
      .stat(lnkPath)
      .then(() => true)
      .catch(() => false);
    if (!taken) break;
    lnkPath = join(programs, `${appName} (${i}).lnk`);
  }

  await fsp.writeFile(lnkPath, buildLnk(winPath));

  const icon = await resolveIcon(name, lnkPath);
  return {
    name: basename(lnkPath).replace(/\.lnk$/i, ""),
    path: lnkPath,
    icon,
  };
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

  await ensurePrefixTemp(root);

  const env = wineEnv(config.wineVersion, root, config.arch);
  if (config.wineVersion === CXWINE_VERSION_ID) {
    env.D3DM_ENABLE_METALFX = config.metalFx === false ? "0" : "1";
    env.ROSETTA_ADVERTISE_AVX = config.rosettaAvx === false ? "0" : "1";
    env.WINEESYNC = config.esync ? "1" : "0";
    env.WINEDEBUG = config.debugLogging ? "warn+all,fixme+all" : "-all";
    if (config.dxvkHud) env.DXVK_HUD = "fps,frametimes,gpuload,version";
    if (config.frameRateCap && config.frameRateCap > 0) {
      // D3DMetal reads D3DM_MAX_FPS, DXVK reads DXVK_FRAME_RATE. Only one
      // backend is active at a time, so setting both is harmless and makes the
      // cap work regardless of the selected graphics backend.
      env.D3DM_MAX_FPS = String(config.frameRateCap);
      env.DXVK_FRAME_RATE = String(config.frameRateCap);
    }
    if (config.d3dmHudStats) env.D3DM_SHOW_HUD_STATS = "1";
    if (config.d3dmDxr) env.D3DM_SUPPORT_DXR = "1";
    if (config.d3dmMtl4) env.D3DM_MTL4 = "1";
  }
  if (config.metalHud) env.MTL_HUD_ENABLED = "1";

  const child = spawn(wine, ["start", "/unix", target], {
    env,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

export async function setMetalHud(
  name: string,
  enabled: boolean,
): Promise<void> {
  const config = await getConfig(name);
  if (!config) throw new Error(`Unknown instance: ${name}`);
  const updated: WineConfig = { ...config, metalHud: enabled };
  await fsp.writeFile(configFile(name), JSON.stringify(updated, null, 2));
}

export async function setGameOptions(
  name: string,
  patch: GameOptions,
): Promise<WineConfig> {
  const config = await getConfig(name);
  if (!config) throw new Error(`Unknown instance: ${name}`);
  const updated: WineConfig = { ...config, ...patch };
  await fsp.writeFile(configFile(name), JSON.stringify(updated, null, 2));
  return updated;
}

const DESKTOP_KEY = "HKEY_CURRENT_USER\\Software\\Wine\\Explorer";
const DESKTOPS_KEY = `${DESKTOP_KEY}\\Desktops`;
const DESKTOP_NAME = "Default";
const RES_RE = /^\d{3,5}x\d{3,5}$/;

function regCommand(
  wineVersion: string,
  prefix: string,
  arch: WineArch,
  wine: string,
  args: string[],
): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn(wine, args, {
      env: {
        ...process.env,
        ...(wineVersion === CXWINE_VERSION_ID ? cxwineLaunchEnv() : {}),
        WINEPREFIX: prefix,
        WINEARCH: arch,
        WINEDEBUG: "-all",
      },
      stdio: "ignore",
    });
    child.on("error", () => resolve());
    child.on("close", () => resolve());
  });
}

export async function setDisplayMode(
  name: string,
  virtualDesktop: boolean,
  size: string,
): Promise<WineConfig> {
  const config = await getConfig(name);
  if (!config) throw new Error(`Unknown instance: ${name}`);
  if (virtualDesktop && !RES_RE.test(size)) {
    throw new Error(`Invalid resolution: ${size}`);
  }

  const wine = await resolveWineTool(config.wineVersion, "wine");
  if (!wine) throw new Error("wine is not available for this Wine version.");
  const prefix = prefixDir(name);
  await ensurePrefixTemp(prefix);

  if (virtualDesktop) {
    await regCommand(config.wineVersion, prefix, config.arch, wine, [
      "reg",
      "add",
      DESKTOPS_KEY,
      "/v",
      DESKTOP_NAME,
      "/t",
      "REG_SZ",
      "/d",
      size,
      "/f",
    ]);
    await regCommand(config.wineVersion, prefix, config.arch, wine, [
      "reg",
      "add",
      DESKTOP_KEY,
      "/v",
      "Desktop",
      "/t",
      "REG_SZ",
      "/d",
      DESKTOP_NAME,
      "/f",
    ]);
  } else {
    await regCommand(config.wineVersion, prefix, config.arch, wine, [
      "reg",
      "delete",
      DESKTOP_KEY,
      "/v",
      "Desktop",
      "/f",
    ]);
  }

  const updated: WineConfig = { ...config, virtualDesktop, desktopSize: size };
  await fsp.writeFile(configFile(name), JSON.stringify(updated, null, 2));
  return updated;
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

  // Prefer a standalone winecfg binary; CrossOver builds only ship the wine
  // loader, so fall back to running the winecfg builtin via `wine winecfg`.
  const standalone = await resolveWineTool(config.wineVersion, "winecfg");
  const wine = standalone
    ? null
    : await resolveWineTool(config.wineVersion, "wine");
  if (!standalone && !wine) {
    throw new Error("winecfg is not available for this Wine version.");
  }
  const cmd = standalone ?? (wine as string);
  const args = standalone ? [] : ["winecfg"];

  const child = spawn(cmd, args, {
    env: wineEnv(config.wineVersion, prefixDir(name), config.arch),
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

  // Guard against "unable to write data to disk" when an installer unpacks to
  // %TEMP% in a prefix whose temp dirs were never created.
  await ensurePrefixTemp(prefixDir(name));

  const args = installer.toLowerCase().endsWith(".msi")
    ? ["msiexec", "/i", installer]
    : [installer];

  // Run the installer in place, from its own directory, so any adjacent data
  // files (.cab, .bin, …) resolve exactly as when double-clicked.
  const child = spawn(wine, args, {
    env: wineEnv(config.wineVersion, prefixDir(name), config.arch),
    cwd: dirname(installer),
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return installer;
}
