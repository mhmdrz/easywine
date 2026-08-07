import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";
import type { StorageUsage, WineProgress, WineVersion } from "@shared/wine";

// The API surface exposed to the renderer. Extend this as the
// wine-management features (prefixes, running apps, config) come online.
export const api = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  wine: {
    /** Full catalog scraped from WineHQ (cached). */
    catalog: (): Promise<WineVersion[]> => ipcRenderer.invoke("wine:catalog"),
    /** Force a fresh scrape of the catalog. */
    refreshCatalog: (): Promise<WineVersion[]> =>
      ipcRenderer.invoke("wine:refresh-catalog"),
    listInstalled: (): Promise<string[]> =>
      ipcRenderer.invoke("wine:list-installed"),
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
