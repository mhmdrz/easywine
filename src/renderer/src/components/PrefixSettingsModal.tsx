import { useState } from "react";
import Icon from "./Icon";
import { CXWINE_VERSION_ID } from "@shared/wine";
import "./CreateConfigModal.scss";

interface PrefixSettingsModalProps {
  name: string;
  wineVersion: string;
  onClose: () => void;
}

function PrefixSettingsModal({
  name,
  wineVersion,
  onClose,
}: PrefixSettingsModalProps): React.JSX.Element {
  const [launching, setLaunching] = useState(false);
  const [installing, setInstalling] = useState<
    "mono" | "gecko" | "vcrun" | null
  >(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isGame = wineVersion === CXWINE_VERSION_ID;

  const RUNTIME_LABEL: Record<"mono" | "gecko" | "vcrun", string> = {
    mono: "Mono",
    gecko: "Gecko",
    vcrun: "Visual C++ runtimes",
  };

  const installRuntime = async (
    kind: "mono" | "gecko" | "vcrun",
  ): Promise<void> => {
    const label = RUNTIME_LABEL[kind];
    setInstalling(kind);
    setError(null);
    setNote(`Installing ${label}… (this can take a while)`);
    try {
      const { version } = await window.easywine.config.installRuntime(
        name,
        kind,
      );
      setNote(`${label} ${version} installed.`);
    } catch (err) {
      setNote(null);
      setError(
        err instanceof Error ? err.message : `Could not install ${label}.`,
      );
    } finally {
      setInstalling(null);
    }
  };

  const runWinecfg = async (): Promise<void> => {
    setLaunching(true);
    setError(null);
    try {
      await window.easywine.config.winecfg(name);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not launch winecfg.",
      );
    } finally {
      setLaunching(false);
    }
  };

  const openDriveC = async (): Promise<void> => {
    setError(null);
    try {
      await window.easywine.config.openDriveC(name);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not open drive C.",
      );
    }
  };

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal card">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-semibold text-wine-light">
            Prefix settings
          </h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close"
            onClick={onClose}
          >
            <Icon name="close" className="text-lg" />
          </button>
        </div>

        <p className="mt-2 text-sm text-neutral-400">
          Configure the Wine prefix for “{name}”.
        </p>

        <div className="mt-4 flex items-center justify-between gap-4 border-t border-white/10 pt-4">
          <div>
            <p className="text-sm font-medium text-wine-light">
              Wine Configuration
            </p>
            <p className="text-xs text-neutral-500">
              Open winecfg to adjust Windows version, drives, and libraries.
            </p>
          </div>
          <button
            type="button"
            className="btn"
            onClick={runWinecfg}
            disabled={launching}
          >
            <Icon name="tune" className="text-lg" />
            {launching ? "Launching…" : "Run winecfg"}
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between gap-4 border-t border-white/10 pt-4">
          <div>
            <p className="text-sm font-medium text-wine-light">Drive C</p>
            <p className="text-xs text-neutral-500">
              Open the prefix's drive_c folder in Finder.
            </p>
          </div>
          <button type="button" className="btn" onClick={openDriveC}>
            <Icon name="folder_open" className="text-lg" />
            Open drive C
          </button>
        </div>

        {isGame && (
          <div className="mt-4 flex items-center justify-between gap-4 border-t border-white/10 pt-4">
            <div>
              <p className="text-sm font-medium text-wine-light">
                .NET & HTML support
              </p>
              <p className="text-xs text-neutral-500">
                The custom build ships without Mono/Gecko. Install them here if a
                game needs .NET or an embedded browser.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                className="btn"
                onClick={() => installRuntime("mono")}
                disabled={installing !== null}
              >
                <Icon
                  name={installing === "mono" ? "progress_activity" : "download"}
                  className={`text-lg ${installing === "mono" ? "animate-spin" : ""}`}
                />
                Mono
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => installRuntime("gecko")}
                disabled={installing !== null}
              >
                <Icon
                  name={installing === "gecko" ? "progress_activity" : "download"}
                  className={`text-lg ${installing === "gecko" ? "animate-spin" : ""}`}
                />
                Gecko
              </button>
            </div>
          </div>
        )}

        {isGame && (
          <div className="mt-4 flex items-center justify-between gap-4 border-t border-white/10 pt-4">
            <div>
              <p className="text-sm font-medium text-wine-light">
                Visual C++ runtimes
              </p>
              <p className="text-xs text-neutral-500">
                Installs the Microsoft Visual C++ 2015–2022 redistributables that
                most games need. Downloads from Microsoft — can take a minute.
              </p>
            </div>
            <button
              type="button"
              className="btn shrink-0"
              onClick={() => installRuntime("vcrun")}
              disabled={installing !== null}
            >
              <Icon
                name={installing === "vcrun" ? "progress_activity" : "download"}
                className={`text-lg ${installing === "vcrun" ? "animate-spin" : ""}`}
              />
              Install
            </button>
          </div>
        )}

        {note && !error && (
          <p className="mt-3 text-sm text-neutral-400">{note}</p>
        )}

        {error && (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export default PrefixSettingsModal;
