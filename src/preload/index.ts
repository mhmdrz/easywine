import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";
import type {
  CxwineStatus,
  GraphicsBackend,
  GraphicsInfo,
  InstalledApp,
  StorageUsage,
  WineArch,
  WineConfig,
  WineProgress,
  WineVersion,
} from "@shared/wine";

// The API surface exposed to the renderer. Extend this as the
// wine-management features (prefixes, running apps, config) come online.
export const api = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  app: {
    /** The application version (from package.json). */
    version: (): Promise<string> => ipcRenderer.invoke("app:version"),
    /** Open an https URL in the user's default browser. */
    openExternal: (url: string): Promise<void> =>
      ipcRenderer.invoke("app:open-external", url),
  },
  cxwine: {
    /** State of the custom CrossOver + D3DMetal Wine build. */
    status: (): Promise<CxwineStatus> => ipcRenderer.invoke("cxwine:status"),
    /** Pick + extract the CrossOver source and drop in the compile helpers. */
    importSource: (): Promise<{ imported: boolean }> =>
      ipcRenderer.invoke("cxwine:import-source"),
    /** Copy a previously compiled build into the app folder (no recompile). */
    importBuild: (): Promise<{ imported: boolean }> =>
      ipcRenderer.invoke("cxwine:import-build"),
    /** Open the compile helper script in Terminal. */
    openCompiler: (): Promise<void> =>
      ipcRenderer.invoke("cxwine:open-compiler"),
  },
  wine: {
    /** Full catalog scraped from WineHQ (cached). */
    catalog: (): Promise<WineVersion[]> => ipcRenderer.invoke("wine:catalog"),
    /** Force a fresh scrape of the catalog. */
    refreshCatalog: (): Promise<WineVersion[]> =>
      ipcRenderer.invoke("wine:refresh-catalog"),
    listInstalled: (): Promise<string[]> =>
      ipcRenderer.invoke("wine:list-installed"),
    /** In-flight downloads, so the UI can rehydrate after navigation. */
    activeDownloads: (): Promise<WineProgress[]> =>
      ipcRenderer.invoke("wine:active-downloads"),
    download: (id: string): Promise<void> =>
      ipcRenderer.invoke("wine:download", id),
    remove: (id: string): Promise<void> => ipcRenderer.invoke("wine:delete", id),
    /** Subscribe to download progress; returns an unsubscribe function. */
    onProgress: (callback: (data: WineProgress) => void): (() => void) => {
      const handler = (_event: IpcRendererEvent, data: WineProgress): void =>
        callback(data);
      ipcRenderer.on("wine:progress", handler);
      return () => {
        ipcRenderer.removeListener("wine:progress", handler);
      };
    },
  },
  config: {
    list: (): Promise<WineConfig[]> => ipcRenderer.invoke("config:list"),
    get: (name: string): Promise<WineConfig | null> =>
      ipcRenderer.invoke("config:get", name),
    apps: (name: string): Promise<InstalledApp[]> =>
      ipcRenderer.invoke("config:apps", name),
    winecfg: (name: string): Promise<void> =>
      ipcRenderer.invoke("config:winecfg", name),
    openDriveC: (name: string): Promise<void> =>
      ipcRenderer.invoke("config:open-drive-c", name),
    install: (name: string): Promise<string | null> =>
      ipcRenderer.invoke("config:install", name),
    run: (name: string, appPath: string): Promise<void> =>
      ipcRenderer.invoke("config:run", name, appPath),
    uninstall: (
      name: string,
      appPath: string,
    ): Promise<{ uninstaller: boolean }> =>
      ipcRenderer.invoke("config:uninstall", name, appPath),
    create: (
      name: string,
      wineVersion: string,
      arch: WineArch,
    ): Promise<WineConfig> =>
      ipcRenderer.invoke("config:create", name, wineVersion, arch),
    delete: (name: string): Promise<void> =>
      ipcRenderer.invoke("config:delete", name),
    installRuntime: (
      name: string,
      kind: "mono" | "gecko",
    ): Promise<{ version: string }> =>
      ipcRenderer.invoke("config:install-runtime", name, kind),
    graphicsInfo: (name: string): Promise<GraphicsInfo> =>
      ipcRenderer.invoke("config:graphics-info", name),
    setGraphics: (name: string, backend: GraphicsBackend): Promise<void> =>
      ipcRenderer.invoke("config:set-graphics", name, backend),
  },
  storage: {
    usage: (): Promise<StorageUsage> => ipcRenderer.invoke("storage:usage"),
    clearCache: (): Promise<number> => ipcRenderer.invoke("storage:clear-cache"),
    openFolder: (): Promise<string> => ipcRenderer.invoke("storage:open-folder"),
  },
};

export type EasyWineApi = typeof api;

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("easywine", api);
  } catch (error) {
    console.error(error);
  }
} else {
  // Fallback when context isolation is disabled.
  // @ts-ignore (window.easywine is declared for the renderer in index.d.ts)
  window.easywine = api;
}
