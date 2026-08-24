import { execFile } from "child_process";
import { promises as fsp } from "fs";
import { basename, join } from "path";
import { promisify } from "util";

const exec = promisify(execFile);

const SEEDS = ["libfreetype.6.dylib", "libgnutls.30.dylib"];

// arm64 /opt/homebrew copies.
const BREW_LIB = "/usr/local/lib";

function isExternal(p: string): boolean {
  return p.startsWith("/usr/local/") || p.startsWith("/opt/homebrew/");
}

async function otoolDeps(file: string): Promise<string[]> {
  const { stdout } = await exec("otool", ["-L", file]);
  return stdout
    .split("\n")
    .slice(1)
    .map((l) => l.trim().split(" (")[0])
    .filter(Boolean);
}

export async function bundleExternalLibs(
  build: string,
): Promise<{ bundled: string[] }> {
  const dest = join(build, "lib");

  // BFS the closure: basename -> resolved real file on disk.
  const realOf = new Map<string, string>();
  const seen = new Set<string>();
  const queue: string[] = [];

  const enqueue = async (ref: string, name: string): Promise<void> => {
    const real = await fsp.realpath(ref).catch(() => null);
    if (!real) return;
    realOf.set(name, real);
    if (!seen.has(real)) {
      seen.add(real);
      queue.push(real);
    }
  };

  for (const seed of SEEDS) {
    await enqueue(join(BREW_LIB, seed), seed);
  }
  if (queue.length === 0) return { bundled: [] }; // Nothing to bundle (no brew).

  for (let i = 0; i < queue.length; i++) {
    let deps: string[];
    try {
      deps = await otoolDeps(queue[i]);
    } catch {
      return { bundled: [] }; // otool unavailable — skip bundling entirely.
    }
    for (const dep of deps) {
      if (isExternal(dep)) await enqueue(dep, basename(dep));
    }
  }

  // Copy every closure member into build/lib under its referenced basename.
  for (const [name, real] of realOf) {
    await fsp.copyFile(real, join(dest, name));
    await fsp.chmod(join(dest, name), 0o755);
  }

  // Rewrite ids + cross-references to @loader_path, then ad-hoc re-sign (which
  // install_name_tool invalidates).
  for (const name of realOf.keys()) {
    const file = join(dest, name);
    await exec("install_name_tool", ["-id", `@loader_path/${name}`, file]);
    for (const dep of await otoolDeps(file)) {
      const depName = basename(dep);
      if (isExternal(dep) && realOf.has(depName)) {
        await exec("install_name_tool", [
          "-change",
          dep,
          `@loader_path/${depName}`,
          file,
        ]);
      }
    }
    await exec("codesign", ["--force", "--sign", "-", file]);
  }

  return { bundled: [...realOf.keys()] };
}
