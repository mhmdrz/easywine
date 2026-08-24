import { spawn } from "child_process";
import { promises as fsp } from "fs";
import { join } from "path";
import type { GraphicsBackend, GraphicsInfo, WineConfig } from "@shared/wine";
import { CXWINE_VERSION_ID } from "@shared/wine";
import { configsDir, cxwineBuildDir, prefixesDir } from "./appPaths";
import { cxwineLaunchEnv } from "./cxwineEnv";
import { getConfig } from "./configManager";
import { resolveWineTool } from "./wineManager";

const D3D_DLLS = [
  "d3d8",
  "d3d9",
  "d3d10",
  "d3d10_1",
  "d3d10core",
  "d3d11",
  "dxgi",
];

function prefixDir(name: string): string {
  return join(prefixesDir(), name);
}

function system32Dir(name: string): string {
  return join(prefixDir(name), "drive_c", "windows", "system32");
}

function dxvkStageDir(): string {
  return join(cxwineBuildDir(), "share", "dxvk", "x64");
}

async function listDxvkDlls(): Promise<string[]> {
  const entries = await fsp.readdir(dxvkStageDir()).catch(() => [] as string[]);
  return entries.filter((f) => f.toLowerCase().endsWith(".dll"));
}

export async function getGraphicsInfo(name: string): Promise<GraphicsInfo> {
  const config = await getConfig(name);
  const backend = config?.graphicsBackend ?? "d3dmetal";
  const dxvkAvailable = (await listDxvkDlls()).length > 0;
  return { backend, dxvkAvailable };
}

function runReg(
  wine: string,
  args: string[],
  prefix: string,
  arch: string,
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
      stdio: "ignore",
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`reg exited with ${code}`)),
    );
  });
}

async function setOverride(
  wine: string,
  prefix: string,
  arch: string,
  dll: string,
  mode: "native" | "builtin",
): Promise<void> {
  await runReg(
    wine,
    [
      "reg",
      "add",
      "HKEY_CURRENT_USER\\Software\\Wine\\DllOverrides",
      "/v",
      dll,
      "/t",
      "REG_SZ",
      "/d",
      mode,
      "/f",
    ],
    prefix,
    arch,
  );
}

export async function setGraphicsBackend(
  name: string,
  backend: GraphicsBackend,
): Promise<void> {
  const config = await getConfig(name);
  if (!config) throw new Error(`Unknown instance: ${name}`);
  if (config.wineVersion !== CXWINE_VERSION_ID) {
    throw new Error(
      "Graphics backend is only configurable for game instances.",
    );
  }

  const wine = await resolveWineTool(config.wineVersion, "wine");
  if (!wine) throw new Error("wine is not available for this instance.");

  const prefix = prefixDir(name);

  if (backend === "dxvk") {
    const dlls = await listDxvkDlls();
    if (dlls.length === 0) {
      throw new Error("DXVK was not built into this Wine — rebuild it first.");
    }
    const sys32 = system32Dir(name);
    await fsp.mkdir(sys32, { recursive: true });
    for (const dll of dlls) {
      await fsp.copyFile(join(dxvkStageDir(), dll), join(sys32, dll));
      await setOverride(
        wine,
        prefix,
        config.arch,
        dll.replace(/\.dll$/i, ""),
        "native",
      );
    }
  } else {
    // D3DMetal: use the builtin D3D DLLs (which are D3DMetal in this build) and
    // ignore any DXVK copies left in system32.
    for (const dll of D3D_DLLS) {
      await setOverride(wine, prefix, config.arch, dll, "builtin");
    }
  }

  const updated: WineConfig = { ...config, graphicsBackend: backend };
  await fsp.writeFile(
    join(configsDir(), name, "config.json"),
    JSON.stringify(updated, null, 2),
  );
}
