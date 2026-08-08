import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Icon from "../components/Icon";
import PrefixSettingsModal from "../components/PrefixSettingsModal";
import { formatVersionId } from "../utils/format";
import type { InstalledApp, WineConfig } from "@shared/wine";

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

function Instance(): React.JSX.Element {
  const { name = "" } = useParams();
  const navigate = useNavigate();
  const [config, setConfig] = useState<WineConfig | null>(null);
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const loadApps = useCallback((): void => {
    window.easywine.config.apps(name).then(setApps);
  }, [name]);

  useEffect(() => {
    let cancelled = false;
    window.easywine.config.get(name).then((c) => {
      if (cancelled) return;
      setConfig(c);
      setLoading(false);
    });
    window.easywine.config.apps(name).then((list) => {
      if (!cancelled) setApps(list);
    });
    return () => {
      cancelled = true;
    };
  }, [name]);

  const handleInstall = async (): Promise<void> => {
    setInstalling(true);
    setNote(null);
    try {
      const installer = await window.easywine.config.install(name);
      if (installer) {
        const file = installer.split("/").pop() ?? installer;
        setNote(
          `Running “${file}” — the app will appear here once installation finishes.`,
        );
        loadApps();
      }
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not start installer.");
    } finally {
      setInstalling(false);
    }
  };

  return (
    <section>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => navigate("/")}
      >
        <Icon name="arrow_back" className="text-lg" />
        Instances
      </button>

      {loading ? (
        <div className="mt-10 flex items-center justify-center gap-2 text-neutral-400">
          <Icon name="progress_activity" className="animate-spin text-xl" />
          Loading instance…
        </div>
      ) : !config ? (
        <div className="card mt-6 text-center">
          <Icon name="error" className="text-4xl text-red-400" />
          <p className="mt-2 text-neutral-300">
            Instance “{name}” could not be found.
          </p>
          <Link to="/" className="btn mt-4">
            Back to Instances
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-wine-light">
                {config.name}
              </h1>
              <p className="mt-1 text-neutral-400">
                Wine {formatVersionId(config.wineVersion)} · {config.arch} ·
                created {formatDate(config.createdAt)}
              </p>
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => setSettingsOpen(true)}
            >
              <Icon name="settings" className="text-lg" />
              Settings
            </button>
          </div>

          <div className="card mt-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-wine-light">
                Installed applications
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="icon-btn"
                  title="Refresh"
                  aria-label="Refresh applications"
                  onClick={loadApps}
                >
                  <Icon name="refresh" className="text-lg" />
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={handleInstall}
                  disabled={installing}
                >
                  <Icon name="download" className="text-lg" />
                  {installing ? "Opening…" : "Install"}
                </button>
              </div>
            </div>

            {note && (
              <p className="mt-3 text-sm text-neutral-400">{note}</p>
            )}

            {apps.length === 0 ? (
              <p className="mt-3 text-sm text-neutral-500">
                No applications found in this prefix yet.
              </p>
            ) : (
              <ul className="mt-3 flex flex-col divide-y divide-white/10">
                {apps.map((app) => (
                  <li
                    key={app.path}
                    className="flex items-center gap-3 py-2.5 text-sm text-neutral-200"
                  >
                    <Icon
                      name="desktop_windows"
                      className="text-lg text-wine-accent"
                    />
                    {app.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {settingsOpen && config && (
        <PrefixSettingsModal
          name={config.name}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </section>
  );
}

export default Instance;
