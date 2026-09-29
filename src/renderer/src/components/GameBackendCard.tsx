import { useEffect, useState } from "react";
import Icon from "./Icon";
import type { GameOptions, GraphicsBackend, GraphicsInfo } from "@shared/wine";
import "./CreateConfigModal.scss";

const RESOLUTIONS = [
  "1280x720",
  "1366x768",
  "1600x900",
  "1920x1080",
  "2560x1440",
  "3440x1440",
  "3840x2160",
];

const FRAME_CAPS = [0, 30, 60, 90, 120, 144, 165, 240];

function SelectChevron({ busy }: { busy?: boolean }): React.JSX.Element {
  if (busy) {
    return (
      <span className="modal__chevron">
        <Icon name="progress_activity" className="block animate-spin text-lg" />
      </span>
    );
  }
  return <Icon name="expand_more" className="modal__chevron text-lg" />;
}

interface ToggleRowProps {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  busy?: boolean;
  onChange: (next: boolean) => void;
}

function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  busy,
  onChange,
}: ToggleRowProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div>
        <p className="text-sm font-medium text-wine-light">{label}</p>
        <p className="text-xs text-neutral-500">{hint}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {busy && (
          <Icon
            name="progress_activity"
            className="animate-spin text-base text-neutral-400"
          />
        )}
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          disabled={disabled || busy}
          onClick={() => onChange(!checked)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
            checked ? "bg-wine-accent" : "bg-white/15"
          } ${disabled || busy ? "opacity-40" : ""}`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
              checked ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
}

function Field({ label, hint, children }: FieldProps): React.JSX.Element {
  return (
    <div>
      <p className="text-sm font-medium text-wine-light">{label}</p>
      {hint && <p className="text-xs text-neutral-500">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

interface GameBackendCardProps {
  name: string;
}

function GameBackendCard({ name }: GameBackendCardProps): React.JSX.Element {
  const [graphics, setGraphics] = useState<GraphicsInfo | null>(null);
  const [switching, setSwitching] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [opts, setOpts] = useState<Required<GameOptions>>({
    metalHud: false,
    metalFx: true,
    rosettaAvx: true,
    esync: false,
    dxvkHud: false,
    debugLogging: false,
    frameRateCap: 0,
    d3dmHudStats: false,
    d3dmDxr: false,
    d3dmMtl4: false,
  });
  const [virtualDesktop, setVirtualDesktop] = useState(false);
  const [desktopSize, setDesktopSize] = useState("1920x1080");
  const [applyingDisplay, setApplyingDisplay] = useState(false);
  const [uiScale, setUiScale] = useState(192);
  const [applyingScale, setApplyingScale] = useState(false);
  const [savingKeys, setSavingKeys] = useState<
    Partial<Record<keyof GameOptions, boolean>>
  >({});

  const isDxvk = graphics?.backend === "dxvk";

  useEffect(() => {
    window.easywine.config.graphicsInfo(name).then(setGraphics);
    window.easywine.config.get(name).then((c) => {
      if (!c) return;
      setOpts({
        metalHud: Boolean(c.metalHud),
        metalFx: c.metalFx !== false,
        rosettaAvx: c.rosettaAvx !== false,
        esync: Boolean(c.esync),
        dxvkHud: Boolean(c.dxvkHud),
        debugLogging: Boolean(c.debugLogging),
        frameRateCap: c.frameRateCap ?? 0,
        d3dmHudStats: Boolean(c.d3dmHudStats),
        d3dmDxr: Boolean(c.d3dmDxr),
        d3dmMtl4: Boolean(c.d3dmMtl4),
      });
      setVirtualDesktop(Boolean(c.virtualDesktop));
      if (c.desktopSize) setDesktopSize(c.desktopSize);
      if (c.dpi) setUiScale(c.dpi);
    });
  }, [name]);

  const changeBackend = async (backend: GraphicsBackend): Promise<void> => {
    setSwitching(true);
    setError(null);
    setNote(
      `Switching graphics backend to ${backend === "dxvk" ? "DXVK" : "D3DMetal"}…`,
    );
    try {
      await window.easywine.config.setGraphics(name, backend);
      setGraphics((g) => (g ? { ...g, backend } : g));
      setNote(
        `Graphics backend set to ${backend === "dxvk" ? "DXVK" : "D3DMetal"}.`,
      );
    } catch (err) {
      setNote(null);
      setError(
        err instanceof Error ? err.message : "Could not switch backend.",
      );
    } finally {
      setSwitching(false);
    }
  };

  const patchOption = async <K extends keyof GameOptions>(
    key: K,
    value: GameOptions[K],
  ): Promise<void> => {
    const prev = opts;
    setOpts((o) => ({ ...o, [key]: value }));
    setError(null);
    setSavingKeys((s) => ({ ...s, [key]: true }));
    try {
      await window.easywine.config.setOptions(name, { [key]: value });
    } catch (err) {
      setOpts(prev);
      setError(
        err instanceof Error ? err.message : "Could not save the setting.",
      );
    } finally {
      setSavingKeys((s) => ({ ...s, [key]: false }));
    }
  };

  const applyDisplay = async (
    enabled: boolean,
    size: string,
  ): Promise<void> => {
    const prevEnabled = virtualDesktop;
    const prevSize = desktopSize;
    setVirtualDesktop(enabled);
    setDesktopSize(size);
    setApplyingDisplay(true);
    setError(null);
    setNote("Applying display mode…");
    try {
      await window.easywine.config.setDisplay(name, enabled, size);
      setNote(
        enabled
          ? `Virtual desktop ${size} — applies on the next launch.`
          : "Display set to native (game controls the display).",
      );
    } catch (err) {
      setVirtualDesktop(prevEnabled);
      setDesktopSize(prevSize);
      setNote(null);
      setError(
        err instanceof Error ? err.message : "Could not change display mode.",
      );
    } finally {
      setApplyingDisplay(false);
    }
  };

  const applyScale = async (dpi: number): Promise<void> => {
    const prev = uiScale;
    setUiScale(dpi);
    setApplyingScale(true);
    setError(null);
    setNote("Applying UI scale…");
    try {
      await window.easywine.config.setDpi(name, dpi);
      setNote(
        `UI scale set to ${Math.round((dpi / 96) * 100)}% — applies on the next launch.`,
      );
    } catch (err) {
      setUiScale(prev);
      setNote(null);
      setError(
        err instanceof Error ? err.message : "Could not change UI scale.",
      );
    } finally {
      setApplyingScale(false);
    }
  };

  return (
    <div className="card mt-6">
      <h2 className="text-lg font-semibold text-wine-light">
        Graphics &amp; runtime backend
      </h2>
      <p className="mt-1 text-sm text-neutral-400">
        Rendering backend and launch tweaks. All apply on the next launch.
      </p>

      <div className="mt-4 grid gap-x-8 gap-y-5 border-t border-white/10 pt-4 md:grid-cols-2">
        <div className="space-y-5">
          <Field
            label="Graphics backend"
            hint="D3DMetal to Metal directly. DXVK routes through Vulkan (MoltenVK)."
          >
            <div className="modal__select">
              <select
                className="modal__input"
                value={graphics?.backend ?? "d3dmetal"}
                disabled={!graphics || switching}
                onChange={(e) =>
                  changeBackend(e.target.value as GraphicsBackend)
                }
              >
                <option value="d3dmetal">D3DMetal (Metal)</option>
                <option value="dxvk" disabled={!graphics?.dxvkAvailable}>
                  DXVK (Vulkan){graphics?.dxvkAvailable ? "" : " — not built"}
                </option>
              </select>
              <SelectChevron busy={switching} />
            </div>
          </Field>

          <Field
            label="Display mode"
            hint="Native = game decides. Virtual desktop = fixed-size window (match your screen for fullscreen-windowed)."
          >
            <div className="modal__select">
              <select
                className="modal__input"
                value={virtualDesktop ? "desktop" : "native"}
                disabled={applyingDisplay}
                onChange={(e) =>
                  applyDisplay(e.target.value === "desktop", desktopSize)
                }
              >
                <option value="native">Native (game decides)</option>
                <option value="desktop">Virtual desktop (windowed)</option>
              </select>
              <SelectChevron busy={applyingDisplay} />
            </div>
          </Field>

          {virtualDesktop && (
            <Field
              label="Resolution"
              hint="Size of the virtual desktop window."
            >
              <div className="modal__select">
                <select
                  className="modal__input"
                  value={desktopSize}
                  disabled={applyingDisplay}
                  onChange={(e) => applyDisplay(true, e.target.value)}
                >
                  {RESOLUTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r.replace("x", " × ")}
                    </option>
                  ))}
                </select>
                <SelectChevron busy={applyingDisplay} />
              </div>
            </Field>
          )}

          <Field
            label="Frame rate cap"
            hint="Limits FPS on either backend (D3DM_MAX_FPS / DXVK_FRAME_RATE)."
          >
            <div className="modal__select">
              <select
                className="modal__input"
                value={opts.frameRateCap}
                disabled={Boolean(savingKeys.frameRateCap)}
                onChange={(e) =>
                  patchOption("frameRateCap", Number(e.target.value))
                }
              >
                {FRAME_CAPS.map((f) => (
                  <option key={f} value={f}>
                    {f === 0 ? "Uncapped" : `${f} FPS`}
                  </option>
                ))}
              </select>
              <SelectChevron busy={Boolean(savingKeys.frameRateCap)} />
            </div>
          </Field>

          <Field
            label="UI scale (DPI)"
            hint="Retina renders at native density — raise DPI so apps and winecfg aren't tiny. 200% suits most Retina displays."
          >
            <div className="modal__select">
              <select
                className="modal__input"
                value={uiScale}
                disabled={applyingScale}
                onChange={(e) => applyScale(Number(e.target.value))}
              >
                <option value={96}>100% (96 dpi)</option>
                <option value={120}>125% (120 dpi)</option>
                <option value={144}>150% (144 dpi)</option>
                <option value={192}>200% (192 dpi)</option>
              </select>
              <SelectChevron busy={applyingScale} />
            </div>
          </Field>
        </div>

        <div className="divide-y divide-white/5 md:border-l md:border-white/10 md:pl-8">
          <ToggleRow
            label="Metal performance HUD"
            hint="Overlay FPS, frame time and memory (Apple Metal HUD)."
            checked={opts.metalHud}
            busy={savingKeys.metalHud}
            onChange={(v) => patchOption("metalHud", v)}
          />

          {isDxvk ? (
            <ToggleRow
              label="DXVK HUD"
              hint="On-screen DXVK stats (FPS, frame times, GPU load)."
              checked={opts.dxvkHud}
              busy={savingKeys.dxvkHud}
              onChange={(v) => patchOption("dxvkHud", v)}
            />
          ) : (
            <>
              <ToggleRow
                label="MetalFX upscaling"
                hint="Let D3DMetal upscale frames with MetalFX. On by default."
                checked={opts.metalFx}
                busy={savingKeys.metalFx}
                onChange={(v) => patchOption("metalFx", v)}
              />
              <ToggleRow
                label="D3DMetal HUD stats"
                hint="D3DMetal's own on-screen stats overlay (D3DM_SHOW_HUD_STATS)."
                checked={opts.d3dmHudStats}
                busy={savingKeys.d3dmHudStats}
                onChange={(v) => patchOption("d3dmHudStats", v)}
              />
              <ToggleRow
                label="Ray tracing (DXR)"
                hint="Enable DirectX Raytracing support in D3DMetal (D3DM_SUPPORT_DXR)."
                checked={opts.d3dmDxr}
                busy={savingKeys.d3dmDxr}
                onChange={(v) => patchOption("d3dmDxr", v)}
              />
              <ToggleRow
                label="Metal 4 API"
                hint="Use the newer Metal 4 path in D3DMetal (D3DM_MTL4). Experimental."
                checked={opts.d3dmMtl4}
                busy={savingKeys.d3dmMtl4}
                onChange={(v) => patchOption("d3dmMtl4", v)}
              />
            </>
          )}

          <ToggleRow
            label="Advertise AVX (Rosetta)"
            hint="Expose AVX under Rosetta 2 — some games require it."
            checked={opts.rosettaAvx}
            busy={savingKeys.rosettaAvx}
            onChange={(v) => patchOption("rosettaAvx", v)}
          />
          <ToggleRow
            label="Esync"
            hint="Faster synchronization. Try off if a game hangs."
            checked={opts.esync}
            busy={savingKeys.esync}
            onChange={(v) => patchOption("esync", v)}
          />
          <ToggleRow
            label="Debug logging"
            hint="Wine warnings/fixmes to the log. Slower — for troubleshooting."
            checked={opts.debugLogging}
            busy={savingKeys.debugLogging}
            onChange={(v) => patchOption("debugLogging", v)}
          />
        </div>
      </div>

      {note && !error && (
        <p className="mt-3 text-sm text-neutral-400">{note}</p>
      )}
      {error && (
        <p className="mt-3 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export default GameBackendCard;
