import { useCallback, useEffect, useState } from "react";
import Icon from "../components/Icon";
import { formatBytes } from "../utils/format";
import type { StorageUsage } from "@shared/wine";

function Settings(): React.JSX.Element {
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [clearing, setClearing] = useState(false);
  const [version, setVersion] = useState("");
  const [checking, setChecking] = useState(false);

  const refresh = useCallback((): void => {
    window.easywine.storage.usage().then(setUsage);
  }, []);

  useEffect(() => {
    refresh();
    window.easywine.app.version().then(setVersion);
  }, [refresh]);

  const handleCheckUpdates = async (): Promise<void> => {
    setChecking(true);
    try {
      await window.easywine.app.checkForUpdates();
    } finally {
      setChecking(false);
    }
  };

  const handleClearCache = async (): Promise<void> => {
    setClearing(true);
    try {
      await window.easywine.storage.clearCache();
      refresh();
    } finally {
      setClearing(false);
    }
  };

  return (
    <section>
      <h1 className="text-2xl font-bold text-wine-light">Settings</h1>
      <p className="mt-1 text-neutral-400">
        Configure EasyWine and default Wine behavior.
      </p>

      <div className="card mt-6">
        <div className="flex items-start gap-4">
          <Icon name="storage" className="text-3xl text-wine-accent" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-wine-light">
              Storage &amp; Cache
            </h2>
            <p className="mt-1 text-sm text-neutral-400">
              Downloads and instances are stored in the app data folder.
            </p>

            <div className="mt-4 flex items-baseline justify-between border-t border-white/10 pt-4">
              <span className="text-sm text-neutral-400">App data used</span>
              <span className="text-xl font-semibold tabular-nums text-wine-light">
                {usage ? formatBytes(usage.bytes) : "…"}
              </span>
            </div>
            {usage && (
              <p className="mt-1 break-all text-xs text-neutral-500">
                {usage.path}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn"
                onClick={handleClearCache}
                disabled={clearing}
              >
                <Icon name="cleaning_services" className="text-lg" />
                {clearing ? "Clearing…" : "Clear cache"}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => window.easywine.storage.openFolder()}
              >
                <Icon name="folder_open" className="text-lg" />
                Open folder
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card mt-6">
        <div className="flex items-start gap-4">
          <Icon name="info" className="text-3xl text-wine-accent" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-wine-light">About</h2>
            <p className="mt-1 text-sm text-neutral-400">
              EasyWine {version ? `v${version}` : ""}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
              <button
                type="button"
                className="btn"
                onClick={handleCheckUpdates}
                disabled={checking}
              >
                <Icon
                  name={checking ? "progress_activity" : "update"}
                  className={`text-lg ${checking ? "animate-spin" : ""}`}
                />
                {checking ? "Checking…" : "Check for updates"}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() =>
                  window.easywine.app.openExternal(
                    "https://github.com/mhmdrz/easywine/releases",
                  )
                }
              >
                <Icon name="open_in_new" className="text-lg" />
                Releases
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Settings;
