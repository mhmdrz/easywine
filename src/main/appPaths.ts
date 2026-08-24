import { app } from "electron";
import { mkdirSync } from "fs";
import { join } from "path";

export function appDir(): string {
  return app.getPath("userData");
}

function ensure(dir: string): string {
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function downloadsDir(): string {
  return ensure(join(appDir(), "downloads"));
}

export function configsDir(): string {
  return ensure(join(appDir(), "configs"));
}

export function prefixesDir(): string {
  return ensure(join(appDir(), "prefixes"));
}

export function cacheDir(): string {
  return ensure(join(appDir(), "cache"));
}

export function cxwineDir(): string {
  return ensure(join(appDir(), "cxwine"));
}

export function cxwineSourceDir(): string {
  return join(cxwineDir(), "source");
}

export function cxwineBuildDir(): string {
  return join(cxwineDir(), "build");
}
