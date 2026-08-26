import { CXWINE_VERSION_ID } from "@shared/wine";

export function formatVersionId(id: string): string {
  if (id === CXWINE_VERSION_ID) return "CrossOver · D3DMetal";
  const match = /^wine-(.+)-(devel|staging|stable)$/.exec(id);
  return match ? `${match[1]} · ${match[2]}` : id.replace(/^wine-/, "");
}

const UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    UNITS.length - 1,
  );
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${UNITS[i]}`;
}
