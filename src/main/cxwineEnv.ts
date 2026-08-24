import { cxwineBuildDir } from "./appPaths";

export function cxwineLaunchEnv(): Record<string, string> {
  const build = cxwineBuildDir();
  const existing = process.env.DYLD_FALLBACK_LIBRARY_PATH ?? "/usr/lib";
  return {
    DYLD_FALLBACK_LIBRARY_PATH: `${build}/lib:${build}/lib/external:/usr/local/lib:${existing}`,
    D3DM_ENABLE_METALFX: process.env.D3DM_ENABLE_METALFX ?? "1",
    ROSETTA_ADVERTISE_AVX: process.env.ROSETTA_ADVERTISE_AVX ?? "1",
    VK_ICD_FILENAMES: `${build}/share/vulkan/icd.d/MoltenVK_icd.json`,
  };
}
