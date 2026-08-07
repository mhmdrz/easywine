import { ipcMain, shell } from "electron";
import type { WineArch } from "@shared/wine";
import { appDir } from "./appPaths";
import { getCatalog } from "./wineCatalog";
import { clearCache, getUsage } from "./storage";
import { deleteVersion, downloadVersion, listInstalled } from "./wineManager";
import { createConfig, listConfigs } from "./configManager";

export function registerIpc(): void {
  ipcMain.handle("wine:catalog", () => getCatalog());
  ipcMain.handle("wine:refresh-catalog", () => getCatalog(true));

  ipcMain.handle("wine:list-installed", () => listInstalled());

  ipcMain.handle("wine:download", async (event, id: string) => {
    await downloadVersion(id, (progress) => {
      event.sender.send("wine:progress", { id, progress });
    });
  });

  ipcMain.handle("wine:delete", (_event, id: string) => deleteVersion(id));

  ipcMain.handle("config:list", () => listConfigs());
  ipcMain.handle(
    "config:create",
    (_event, name: string, wineVersion: string, arch: WineArch) =>
      createConfig(name, wineVersion, arch),
  );

  ipcMain.handle("storage:usage", () => getUsage());
  ipcMain.handle("storage:clear-cache", () => clearCache());
  ipcMain.handle("storage:open-folder", () => shell.openPath(appDir()));
}
