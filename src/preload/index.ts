import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";
import type {
  CxwineStatus,
  DxvkStatus,
  GameOptions,
  GraphicsBackend,
  GraphicsInfo,
  InstalledApp,
  LibTips,
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
    /** Check GitHub releases for a newer version (shows a native dialog). */
    checkForUpdates: (): Promise<void> =>
      ipcRenderer.invoke("app:check-updates"),
  },
  dxvk: {
    /** Installed DXVK build info (no network). */
    status: (): Promise<DxvkStatus> => ipcRenderer.invoke("dxvk:status"),
    /** Latest DXVK-macOS release tag available on GitHub. */
    check: (): Promise<string> => ipcRenderer.invoke("dxvk:check"),
    /** Download + stage the latest DXVK build; resolves to the installed tag. */
    download: (): Promise<string> => ipcRenderer.invoke("dxvk:download"),
    /** Subscribe to download progress; returns an unsubscribe function. */
    onProgress: (
      callback: (data: { stage: string; progress: number }) => void,
    ): (() => void) => {
      const handler = (
        _event: IpcRendererEvent,
        data: { stage: string; progress: number },
      ): void => callback(data);
      ipcRenderer.on("dxvk:progress", handler);
      return () => {
        ipcRenderer.removeListener("dxvk:progress", handler);
      };
    },
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
    /** System libraries the build needs: bundled / OS / Homebrew status. */
    libTips: (): Promise<LibTips> => ipcRenderer.invoke("cxwine:lib-tips"),
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
    addApp: (name: string): Promise<InstalledApp | null> =>
      ipcRenderer.invoke("config:add-app", name),
    run: (name: string, appPath: string): Promise<void> =>
      ipcRenderer.invoke("config:run", name, appPath),
    getLaunchOptions: (name: string, appPath: string): Promise<string> =>
      ipcRenderer.invoke("config:get-launch-options", name, appPath),
    setLaunchOptions: (
      name: string,
      appPath: string,
      options: string,
    ): Promise<void> =>
      ipcRenderer.invoke("config:set-launch-options", name, appPath, options),
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
    setMetalHud: (name: string, enabled: boolean): Promise<void> =>
      ipcRenderer.invoke("config:set-metal-hud", name, enabled),
    setOptions: (name: string, patch: GameOptions): Promise<WineConfig> =>
      ipcRenderer.invoke("config:set-options", name, patch),
    setDisplay: (
      name: string,
      virtualDesktop: boolean,
      size: string,
    ): Promise<WineConfig> =>
      ipcRenderer.invoke("config:set-display", name, virtualDesktop, size),
    setDpi: (name: string, dpi: number): Promise<WineConfig> =>
      ipcRenderer.invoke("config:set-dpi", name, dpi),
    installRuntime: (
      name: string,
      kind: "mono" | "gecko" | "vcrun",
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
