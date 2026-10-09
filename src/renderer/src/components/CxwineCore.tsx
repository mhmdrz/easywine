import { useCallback, useEffect, useState } from "react";
import Icon from "./Icon";
import CxwineReleaseCard from "./CxwineReleaseCard";
import CxwineSetup from "./CxwineSetup";
import LibraryTips from "./LibraryTips";
import { useDownloads } from "../context/DownloadsProvider";
import type { CxwineRelease, LibTips } from "@shared/wine";

function CxwineCore(): React.JSX.Element {
  const {
    cxStatuses,
    cxProgress,
    cxStages,
    installedCxTag,
    startCxwineDownload,
  } = useDownloads();

  const [releases, setReleases] = useState<CxwineRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [libTips, setLibTips] = useState<LibTips | null>(null);

  const loadReleases = useCallback(async (): Promise<void> => {
    setError(false);
    try {
      setReleases(await window.easywine.cxwine.releases());
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    window.easywine.cxwine
      .releases()
      .then((list) => {
        if (!cancelled) setReleases(list);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    window.easywine.cxwine.libTips().then((tips) => {
      if (!cancelled) setLibTips(tips);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRefresh = async (): Promise<void> => {
    setRefreshing(true);
    await loadReleases();
    setRefreshing(false);
  };

  return (
    <div>
      <div className="mt-6 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-wine-light">
            Download a prebuilt build
          </h2>
          <p className="mt-0.5 text-sm text-neutral-400">
            Ready-made cxwine builds from the public Wine repo.
          </p>
        </div>
        <button
          type="button"
          className="btn btn--ghost shrink-0"
          onClick={handleRefresh}
          disabled={refreshing || loading}
        >
          <Icon
            name="refresh"
            className={`text-lg ${refreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="mt-6 flex items-center justify-center gap-2 text-neutral-400">
          <Icon name="progress_activity" className="animate-spin text-xl" />
          Fetching cxwine builds…
        </div>
      ) : error ? (
        <div className="card mt-4 text-center">
          <Icon name="cloud_off" className="text-4xl text-red-400" />
          <p className="mt-2 text-neutral-300">
            Could not reach the Wine repo. Check your connection and try again.
          </p>
          <button type="button" className="btn mt-4" onClick={handleRefresh}>
            <Icon name="refresh" className="text-lg" />
            Retry
          </button>
        </div>
      ) : releases.length === 0 ? (
        <p className="mt-4 text-neutral-500">No cxwine builds published yet.</p>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {releases.map((release) => (
            <CxwineReleaseCard
              key={release.id}
              release={release}
              status={
                cxStatuses[release.id] ??
                (installedCxTag === release.tag ? "installed" : "available")
              }
              stage={cxStages[release.id] ?? "downloading"}
              progress={cxProgress[release.id] ?? 0}
              installed={installedCxTag === release.tag}
              onDownload={startCxwineDownload}
            />
          ))}
        </div>
      )}

      <div className="mt-10 border-t border-white/10 pt-6">
        <h2 className="text-lg font-semibold text-wine-light">
          Or compile your own
        </h2>
        <p className="mt-0.5 text-sm text-neutral-400">
          Build from the CrossOver sources with Apple&rsquo;s D3DMetal.
        </p>
        <CxwineSetup showLibTips={false} />
      </div>

      {/* ---- Shared System libraries (applies to both) ---- */}
      <LibraryTips tips={libTips} />
    </div>
  );
}

export default CxwineCore;
