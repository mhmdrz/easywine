import { app, ipcMain, shell } from "electron";
import type { GameOptions, WineArch } from "@shared/wine";
import { appDir } from "./appPaths";
import { getCatalog } from "./wineCatalog";
import { clearCache, getUsage } from "./storage";
import {
  deleteVersion,
  downloadVersion,
  getActiveDownloads,
  listInstalled,
} from "./wineManager";
import {
  addApp,
  createConfig,
  deleteConfig,
  getConfig,
  installApp,
  listApps,
  listConfigs,
  openDriveC,
  runApp,
  runWinecfg,
  setDisplayMode,
  setGameOptions,
  setMetalHud,
  uninstallApp,
} from "./configManager";
import {
  getCxwineStatus,
  importCxwineBuild,
  importCxwineSource,
  openCxwineCompiler,
} from "./cxwine";
import { installRuntime, type RuntimeKind } from "./prefixRuntime";
import { getLibTips } from "./libTips";
import { checkForUpdates } from "./updates";
import { getGraphicsInfo, setGraphicsBackend } from "./cxwineBackend";
import type { GraphicsBackend } from "@shared/wine";

export function registerIpc(): void {
  ipcMain.handle("app:version", () => app.getVersion());

  ipcMain.handle("wine:catalog", () => getCatalog());
  ipcMain.handle("wine:refresh-catalog", () => getCatalog(true));

  ipcMain.handle("wine:list-installed", () => listInstalled());
  ipcMain.handle("wine:active-downloads", () => getActiveDownloads());

  ipcMain.handle("wine:download", async (event, id: string) => {
    await downloadVersion(id, (stage, progress) => {
      event.sender.send("wine:progress", { id, stage, progress });
    });
  });

  ipcMain.handle("wine:delete", (_event, id: string) => deleteVersion(id));

  ipcMain.handle("config:list", () => listConfigs());
  ipcMain.handle("config:get", (_event, name: string) => getConfig(name));
  ipcMain.handle("config:apps", (_event, name: string) => listApps(name));
  ipcMain.handle("config:winecfg", (_event, name: string) => runWinecfg(name));
  ipcMain.handle("config:open-drive-c", (_event, name: string) =>
    openDriveC(name),
  );
  ipcMain.handle("config:install", (_event, name: string) => installApp(name));
  ipcMain.handle("config:add-app", (_event, name: string) => addApp(name));
  ipcMain.handle("config:run", (_event, name: string, appPath: string) =>
    runApp(name, appPath),
  );
  ipcMain.handle("config:uninstall", (_event, name: string, appPath: string) =>
    uninstallApp(name, appPath),
  );
  ipcMain.handle(
    "config:create",
    (_event, name: string, wineVersion: string, arch: WineArch) =>
      createConfig(name, wineVersion, arch),
  );
  ipcMain.handle("config:delete", (_event, name: string) => deleteConfig(name));
  ipcMain.handle(
    "config:set-metal-hud",
    (_event, name: string, enabled: boolean) => setMetalHud(name, enabled),
  );
  ipcMain.handle(
    "config:set-options",
    (_event, name: string, patch: GameOptions) => setGameOptions(name, patch),
  );
  ipcMain.handle(
    "config:set-display",
    (_event, name: string, virtualDesktop: boolean, size: string) =>
      setDisplayMode(name, virtualDesktop, size),
  );
  ipcMain.handle(
    "config:install-runtime",
    (_event, name: string, kind: RuntimeKind) => installRuntime(name, kind),
  );
  ipcMain.handle("config:graphics-info", (_event, name: string) =>
    getGraphicsInfo(name),
  );
  ipcMain.handle(
    "config:set-graphics",
    (_event, name: string, backend: GraphicsBackend) =>
      setGraphicsBackend(name, backend),
  );

  ipcMain.handle("cxwine:status", () => getCxwineStatus());
  ipcMain.handle("cxwine:import-source", () => importCxwineSource());
  ipcMain.handle("cxwine:import-build", () => importCxwineBuild());
  ipcMain.handle("cxwine:open-compiler", () => openCxwineCompiler());
  ipcMain.handle("cxwine:lib-tips", () => getLibTips());
  ipcMain.handle("app:open-external", (_event, url: string) => {
    if (/^https:\/\//i.test(url)) return shell.openExternal(url);
    return Promise.resolve();
  });
  ipcMain.handle("app:check-updates", () => checkForUpdates(true));

  ipcMain.handle("storage:usage", () => getUsage());
  ipcMain.handle("storage:clear-cache", () => clearCache());
  ipcMain.handle("storage:open-folder", () => shell.openPath(appDir()));
}
