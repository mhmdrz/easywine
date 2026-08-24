export type WineChannel = "stable" | "development" | "staging";

export const CXWINE_VERSION_ID = "cxwine";

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

export type GraphicsBackend = "d3dmetal" | "dxvk";

export interface WineConfig {
  name: string;
  wineVersion: string;
  arch: WineArch;
  createdAt: string;
  graphicsBackend?: GraphicsBackend;
}

export interface GraphicsInfo {
  backend: GraphicsBackend;
  dxvkAvailable: boolean;
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

export interface CxwineStatus {
  sourceReady: boolean;
  buildReady: boolean;
  redistReady: boolean;
}

export type LibSource = "bundled" | "os" | "brew";

export interface LibTip {
  name: string;
  purpose: string;
  source: LibSource;
  formula?: string;
  present: boolean;
}

export interface LibTips {
  brewPresent: boolean;
  tips: LibTip[];
}
