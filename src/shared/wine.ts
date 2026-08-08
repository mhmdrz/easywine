export type WineChannel = "stable" | "development" | "staging";

export interface WineVersion {
  id: string;
  version: string;
  major: number;
  channel: WineChannel;
  releaseDate: string;
  size: string;
  url: string;
  sha256?: string;
}

export type WineArch = "win64" | "win32";
export interface WineConfig {
  name: string;
  wineVersion: string;
  arch: WineArch;
  createdAt: string;
}

export interface InstalledApp {
  name: string;
  path: string;
  icon?: string;
}

export type DownloadStatus =
  | "available"
  | "downloading"
  | "installed"
  | "error";

export type DownloadStage = "downloading" | "verifying" | "extracting";

export interface WineProgress {
  id: string;
  stage: DownloadStage;
  progress: number;
}

export interface StorageUsage {
  path: string;
  bytes: number;
}
