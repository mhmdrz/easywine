import { contextBridge } from "electron";

// The API surface exposed to the renderer. Extend this as the
// wine-management features (prefixes, running apps, config) come online.
export const api = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
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
