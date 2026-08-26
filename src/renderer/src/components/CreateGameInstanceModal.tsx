import { useState } from "react";
import Icon from "./Icon";
import { CXWINE_VERSION_ID } from "@shared/wine";
import type { WineArch, WineConfig } from "@shared/wine";
import "./CreateConfigModal.scss";

interface CreateGameInstanceModalProps {
  onClose: () => void;
  onCreated: (config: WineConfig) => void;
}

function CreateGameInstanceModal({
  onClose,
  onCreated,
}: CreateGameInstanceModalProps): React.JSX.Element {
  const [name, setName] = useState("");
  const [arch, setArch] = useState<WineArch>("win64");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && !submitting;

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const config = await window.easywine.config.create(
        name.trim(),
        CXWINE_VERSION_ID,
        arch,
      );
      onCreated(config);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create instance.",
      );
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form className="modal card" onSubmit={handleSubmit}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-semibold text-wine-light">
            New game instance
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
          Creates a Wine prefix backed by your custom CrossOver + D3DMetal build.
        </p>

        <label className="modal__field">
          <span className="modal__label">Name</span>
          <input
            className="modal__input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Steam, My Game"
            autoFocus
            maxLength={64}
          />
        </label>

        <label className="modal__field">
          <span className="modal__label">Architecture</span>
          <div className="modal__select">
            <select
              className="modal__input"
              value={arch}
              onChange={(e) => setArch(e.target.value as WineArch)}
            >
              <option value="win64">64-bit (win64)</option>
              <option value="win32">32-bit (win32)</option>
            </select>
            <Icon name="expand_more" className="modal__chevron text-lg" />
          </div>
        </label>

        {error && (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={!canSubmit}>
            <Icon
              name={submitting ? "progress_activity" : "add"}
              className={`text-lg ${submitting ? "animate-spin" : ""}`}
            />
            {submitting ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default CreateGameInstanceModal;
