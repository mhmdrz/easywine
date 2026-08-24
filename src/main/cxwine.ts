import { app, dialog } from "electron";
import { spawn } from "child_process";
import { constants as fsConstants, promises as fsp } from "fs";
import { join } from "path";
import type { CxwineStatus } from "@shared/wine";
import { cacheDir, cxwineBuildDir, cxwineSourceDir } from "./appPaths";

const HELPER_SCRIPTS = ["build-cxwine.sh", "cxwine-helpers.sh"] as const;

async function isExecutable(path: string): Promise<boolean> {
  return fsp
    .access(path, fsConstants.X_OK)
    .then(() => true)
    .catch(() => false);
}

async function isDir(path: string): Promise<boolean> {
  return fsp
    .stat(path)
    .then((s) => s.isDirectory())
    .catch(() => false);
}

async function hasWineBuild(dir: string): Promise<boolean> {
  const bin = join(dir, "bin");
  for (const tool of ["wine64", "wine", "cxwine"]) {
    if (await isExecutable(join(bin, tool))) return true;
  }
  return false;
}

export async function getCxwineStatus(): Promise<CxwineStatus> {
  const source = cxwineSourceDir();
  const build = cxwineBuildDir();

  const [sourceReady, buildReady, redistReady] = await Promise.all([
    isDir(join(source, "wine")),
    hasWineBuild(build),
    isDir(join(build, "lib", "external")),
  ]);

  return { sourceReady, buildReady, redistReady };
}

async function helpersSourceDir(): Promise<string | null> {
  const candidates = [
    join(app.getAppPath(), "src", "helpers"),
    join(process.resourcesPath, "helpers"),
  ];
  for (const dir of candidates) {
    if (await isDir(dir)) return dir;
  }
  return null;
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else
        reject(new Error(`${cmd} exited with code ${code}: ${stderr.trim()}`));
    });
  });
}

async function findWineRoot(
  root: string,
  maxDepth = 3,
): Promise<string | null> {
  const queue: Array<{ dir: string; depth: number }> = [
    { dir: root, depth: 0 },
  ];
  while (queue.length > 0) {
    const { dir, depth } = queue.shift()!;
    if (await isDir(join(dir, "wine"))) return dir;
    if (depth >= maxDepth) continue;
    const entries = await fsp
      .readdir(dir, { withFileTypes: true })
      .catch(() => []);
    for (const entry of entries) {
      if (entry.isDirectory()) {
        queue.push({ dir: join(dir, entry.name), depth: depth + 1 });
      }
    }
  }
  return null;
}

async function installHelperScripts(sourceRoot: string): Promise<void> {
  const helpers = await helpersSourceDir();
  if (!helpers) return; // Scripts unavailable (e.g. packaged without them).

  for (const name of HELPER_SCRIPTS) {
    let contents = await fsp.readFile(join(helpers, name), "utf8");
    if (name === "build-cxwine.sh") {
      // "fix the paths of both source and prefix output to app folder"
      contents = contents
        .replace(
          /^SRC_ROOT="\$\{SRC_ROOT:-.*\}"$/m,
          `SRC_ROOT="\${SRC_ROOT:-${sourceRoot}}"`,
        )
        .replace(
          /^PREFIX="\$\{PREFIX:-.*\}"$/m,
          `PREFIX="\${PREFIX:-${cxwineBuildDir()}}"`,
        );
    }
    const dest = join(sourceRoot, name);
    await fsp.writeFile(dest, contents);
    await fsp.chmod(dest, 0o755);
  }
}

export async function importCxwineSource(): Promise<{ imported: boolean }> {
  const result = await dialog.showOpenDialog({
    title: "Select the CrossOver source archive",
    properties: ["openFile"],
    filters: [
      {
        name: "CrossOver source",
        extensions: ["gz", "tgz", "xz", "bz2", "tar"],
      },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { imported: false };
  }
  const archive = result.filePaths[0];

  const staging = join(cacheDir(), "cxwine-extract");
  await fsp.rm(staging, { recursive: true, force: true, maxRetries: 3 });
  await fsp.mkdir(staging, { recursive: true });

  try {
    await run("tar", ["-xf", archive, "-C", staging]);

    const root = await findWineRoot(staging);
    if (!root) {
      throw new Error(
        "That archive does not look like CrossOver source (no wine/ folder inside).",
      );
    }

    const target = cxwineSourceDir();
    await fsp.rm(target, { recursive: true, force: true, maxRetries: 3 });
    await fsp.mkdir(join(target, ".."), { recursive: true });
    await fsp.rename(root, target);

    await installHelperScripts(target);
  } finally {
    await fsp.rm(staging, { recursive: true, force: true, maxRetries: 3 });
  }

  return { imported: true };
}

export async function importCxwineBuild(): Promise<{ imported: boolean }> {
  const result = await dialog.showOpenDialog({
    title: "Select the compiled Wine build folder",
    properties: ["openDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { imported: false };
  }
  const source = result.filePaths[0];

  if (!(await hasWineBuild(source))) {
    throw new Error(
      "That folder is not a Wine build — it has no bin/wine, wine64 or cxwine.",
    );
  }

  const build = cxwineBuildDir();
  await fsp.rm(build, { recursive: true, force: true, maxRetries: 3 });
  await fsp.mkdir(build, { recursive: true });
  // ditto preserves symlinks, frameworks and xattrs (matches the helper script).
  await run("ditto", [source, build]);

  return { imported: true };
}

export async function openCxwineCompiler(): Promise<void> {
  const script = join(cxwineSourceDir(), "build-cxwine.sh");
  if (!(await isExecutable(script))) {
    throw new Error(
      "Import the CrossOver source first — the compile helper was not found.",
    );
  }
  await run("open", ["-a", "Terminal", script]);
}
