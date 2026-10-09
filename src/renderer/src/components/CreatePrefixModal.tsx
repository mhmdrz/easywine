import { useEffect, useState } from "react";
import Icon from "./Icon";
import { CXWINE_VERSION_ID } from "@shared/wine";
import type { WineArch, WineConfig } from "@shared/wine";
import { formatVersionId } from "../utils/format";
import "./CreateConfigModal.scss";

interface CreatePrefixModalProps {
  onClose: () => void;
  onCreated: (config: WineConfig) => void;
}

type Core = "wine" | "cxwine";

// Curated Material Symbol names offered as prefix icons.
const ICON_CHOICES = [
  "sports_esports",
  "stadia_controller",
  "casino",
  "rocket_launch",
  "bolt",
  "wine_bar",
  "sports_bar",
  "desktop_windows",
  "apps",
  "folder",
  "terminal",
  "brush",
  "movie",
  "music_note",
  "code",
  "extension",
];

function CreatePrefixModal({
  onClose,
  onCreated,
}: CreatePrefixModalProps): React.JSX.Element {
  const [core, setCore] = useState<Core>("wine");
  const [name, setName] = useState("");
  const [arch, setArch] = useState<WineArch>("win64");
  const [icon, setIcon] = useState<string>(ICON_CHOICES[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [installed, setInstalled] = useState<string[]>([]);
  const [version, setVersion] = useState("");
  const [cxReady, setCxReady] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      window.easywine.wine.listInstalled(),
      window.easywine.cxwine.status(),
    ]).then(([wineList, status]) => {
      setInstalled(wineList);
      setVersion(wineList[0] ?? "");
      setCxReady(status.buildReady);
      setLoaded(true);
    });
  }, []);

  const coreAvailable = core === "wine" ? installed.length > 0 : cxReady;
  const canSubmit =
    name.trim().length > 0 &&
    coreAvailable &&
    (core === "cxwine" || version !== "") &&
    !submitting;

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const wineVersion = core === "cxwine" ? CXWINE_VERSION_ID : version;
      const config = await window.easywine.config.create(
        name.trim(),
        wineVersion,
        arch,
        icon,
      );
      onCreated(config);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create prefix.",
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
          <h2 className="text-xl font-semibold text-wine-light">New prefix</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close"
            onClick={onClose}
          >
            <Icon name="close" className="text-lg" />
          </button>
        </div>

        <div className="modal__field">
          <span className="modal__label">Core</span>
          <div className="modal__segment">
            <button
              type="button"
              className={`modal__segment-btn ${core === "wine" ? "active" : ""}`}
              onClick={() => setCore("wine")}
            >
              <span className="modal__segment-title">
                <Icon name="sports_bar" className="text-lg" />
                Wine
              </span>
              <span className="modal__segment-desc">
                Official WineHQ build
              </span>
            </button>
            <button
              type="button"
              className={`modal__segment-btn ${core === "cxwine" ? "active" : ""}`}
              onClick={() => setCore("cxwine")}
              disabled={loaded && !cxReady}
              title={
                loaded && !cxReady
                  ? "No cxwine build installed — get one from Downloads."
                  : undefined
              }
            >
              <span className="modal__segment-title">
                <Icon name="wine_bar" className="text-lg" />
                cxwine
              </span>
              <span className="modal__segment-desc">
                CrossOver + D3DMetal
              </span>
            </button>
          </div>
        </div>

        <label className="modal__field">
          <span className="modal__label">Name</span>
          <input
            className="modal__input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Games, Office"
            autoFocus
            maxLength={64}
          />
        </label>

        {core === "wine" && (
          <label className="modal__field">
            <span className="modal__label">Wine version</span>
            <div className="modal__select">
              <select
                className="modal__input"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                disabled={installed.length === 0}
              >
                {installed.length === 0 ? (
                  <option value="">No Wine versions installed</option>
                ) : (
                  installed.map((id) => (
                    <option key={id} value={id}>
                      Wine {formatVersionId(id)}
                    </option>
                  ))
                )}
              </select>
              <Icon name="expand_more" className="modal__chevron text-lg" />
            </div>
          </label>
        )}

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

        <div className="modal__field">
          <span className="modal__label">Icon</span>
          <div className="modal__icons">
            {ICON_CHOICES.map((name) => (
              <button
                key={name}
                type="button"
                className={`modal__icon-btn ${icon === name ? "active" : ""}`}
                onClick={() => setIcon(name)}
                aria-label={name}
                aria-pressed={icon === name}
              >
                <Icon name={name} filled={icon === name} className="text-xl" />
              </button>
            ))}
          </div>
        </div>

        {loaded && !coreAvailable && (
          <p className="mt-3 text-sm text-amber-400">
            {core === "wine"
              ? "No Wine versions installed yet — download one from Downloads first."
              : "No cxwine build installed yet — get one from the Downloads → cxwine tab."}
          </p>
        )}

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

export default CreatePrefixModal;
