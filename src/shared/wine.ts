// Shared between the main and renderer processes.
// The catalog is scraped live from WineHQ by the main process; the renderer
// receives it over IPC and only ever sends a version `id` back for downloads.

export type WineChannel = "stable" | "development";

export interface WineVersion {
  /** Stable unique id / download key, e.g. "wine-11.14". */
  id: string;
  /** Version string, e.g. "11.14" or "11.0-rc1". */
  version: string;
  /** Major version number, e.g. 11. Used for filtering. */
  major: number;
  /** Release channel. Stable = x.0 finals, development = everything else. */
  channel: WineChannel;
  /** Release date as YYYY-MM-DD (from the WineHQ index). */
  releaseDate: string;
  /** Human-readable download size, e.g. "44.4 MiB". */
  size: string;
  /** Direct download URL (resolved in the main process). */
  url: string;
  /** Expected SHA-512 of the tarball, from WineHQ's sha512sums.asc (if available). */
  sha512?: string;
}

export type DownloadStatus = "available" | "downloading" | "installed" | "error";

/** Progress event payload emitted by the main process during a download. */
export interface WineProgress {
  id: string;
  progress: number;
}

/** Reported by the storage IPC handlers. */
export interface StorageUsage {
  path: string;
  bytes: number;
}
