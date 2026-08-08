import { useState } from "react";
import Icon from "./Icon";

interface PrefixSettingsModalProps {
  name: string;
  onClose: () => void;
}

function PrefixSettingsModal({
  name,
  onClose,
}: PrefixSettingsModalProps): React.JSX.Element {
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
