import { promises as fsp } from "fs";
import { join } from "path";
import type { LibSource, LibTip, LibTips } from "@shared/wine";

// x86_64 Homebrew (the build is x86_64, so the arm64 /opt/homebrew copies can't
// be used — these must be the Intel ones under /usr/local).
const BREW_LIB = "/usr/local/lib";
const BREW_BIN = "/usr/local/bin/brew";

interface Spec {
  name: string;
  purpose: string;
  source: LibSource;
  dylib?: string;
  formula?: string;
}

const SPECS: Spec[] = [
  {
    name: "SDL2",
    purpose: "Game controller / gamepad input",
    source: "brew",
    dylib: "libSDL2-2.0.0.dylib",
    formula: "sdl2",
  },
  {
    name: "FFmpeg",
    purpose: "Video cutscenes & audio/video decoding",
    source: "brew",
    dylib: "libavcodec.62.dylib",
    formula: "ffmpeg",
  },
  {
    name: "GStreamer",
    purpose: "In-game media playback (mfplat / winegstreamer)",
    source: "brew",
    dylib: "libgstreamer-1.0.0.dylib",
    formula: "gstreamer gst-plugins-base gst-plugins-good",
  },
  {
    name: "Vulkan loader",
    purpose: "Vulkan for the DXVK / vkd3d graphics backends",
    source: "brew",
    dylib: "libvulkan.1.dylib",
    formula: "vulkan-loader",
  },
  {
    name: "FreeType + GnuTLS",
    purpose:
      "Font rendering & HTTPS/TLS — bundled into the build, self-contained",
    source: "bundled",
  },
  {
    name: "libxml2 / libxslt",
    purpose: "XML (MSXML) parsing & transforms — provided by macOS",
    source: "os",
  },
];

async function exists(path: string): Promise<boolean> {
  return fsp
    .access(path)
    .then(() => true)
    .catch(() => false);
}

export async function getLibTips(): Promise<LibTips> {
  const brewPresent = await exists(BREW_BIN);
  const tips: LibTip[] = [];
  for (const spec of SPECS) {
    const present =
      spec.source === "brew" && spec.dylib
        ? await exists(join(BREW_LIB, spec.dylib))
        : true; // bundled / OS libraries are always available.
    tips.push({
      name: spec.name,
      purpose: spec.purpose,
      source: spec.source,
      formula: spec.formula,
      present,
    });
  }
  return { brewPresent, tips };
}
