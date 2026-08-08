import { app, ipcMain, shell } from "electron";
import type { WineArch } from "@shared/wine";
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
  createConfig,
  getConfig,
  installApp,
  listApps,
  listConfigs,
  openDriveC,
  runApp,
  runWinecfg,
  uninstallApp,
} from "./configManager";

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

  ipcMain.handle("storage:usage", () => getUsage());
  ipcMain.handle("storage:clear-cache", () => clearCache());
  ipcMain.handle("storage:open-folder", () => shell.openPath(appDir()));
}
