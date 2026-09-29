import { useEffect, useState } from "react";
import Icon from "./Icon";
import type { InstalledApp } from "@shared/wine";
import "./CreateConfigModal.scss";

interface LaunchOptionsModalProps {
  instance: string;
  app: InstalledApp;
  onClose: () => void;
}

function LaunchOptionsModal({
  instance,
  app,
  onClose,
}: LaunchOptionsModalProps): React.JSX.Element {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.easywine.config
      .getLaunchOptions(instance, app.path)
      .then((opts) => {
        if (!cancelled) {
          setValue(opts);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [instance, app.path]);

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      await window.easywine.config.setLaunchOptions(instance, app.path, value);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save launch options.",
      );
      setSaving(false);
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
            Launch options
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
          Arguments passed to “{app.name}” on launch (e.g.{" "}
          <code className="text-neutral-300">-windowed -novid</code>).
        </p>

        <div className="modal__field">
          <label className="modal__label" htmlFor="launch-options">
            Arguments
          </label>
          <input
            id="launch-options"
            className="modal__input"
            placeholder={loading ? "Loading…" : "e.g. -windowed -console"}
            value={value}
            disabled={loading || saving}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
            autoFocus
          />
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleSave}
            disabled={loading || saving}
          >
            {saving && (
              <Icon name="progress_activity" className="animate-spin text-lg" />
            )}
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default LaunchOptionsModal;
