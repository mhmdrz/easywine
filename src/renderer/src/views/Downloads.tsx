import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "../components/Icon";
import WineVersionCard from "../components/WineVersionCard";
import CxwineReleaseCard from "../components/CxwineReleaseCard";
import { useDownloads } from "../context/DownloadsProvider";
import type { CxwineRelease, WineVersion } from "@shared/wine";
import "./Downloads.scss";

type MajorFilter = number | "all";
type Tab = "wine" | "cxwine";

function Downloads(): React.JSX.Element {
  const {
    statuses,
    progress,
    stages,
    startDownload,
    deleteVersion,
    cxStatuses,
    cxProgress,
    cxStages,
    installedCxTag,
    startCxwineDownload,
  } = useDownloads();

  const [tab, setTab] = useState<Tab>("wine");

  // Official WineHQ catalog
  const [versions, setVersions] = useState<WineVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [major, setMajor] = useState<MajorFilter>("all");

  const [releases, setReleases] = useState<CxwineRelease[]>([]);
  const [cxLoading, setCxLoading] = useState(true);
  const [cxError, setCxError] = useState(false);
  const [cxRefreshing, setCxRefreshing] = useState(false);

  const applyCatalog = (list: WineVersion[]): void => {
    setVersions(list);
    if (list.length > 0) setMajor(list[0].major);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    window.easywine.wine
      .catalog()
      .then((list) => {
        if (!cancelled) applyCatalog(list);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const loadReleases = useCallback(async (): Promise<void> => {
    setCxError(false);
    try {
      setReleases(await window.easywine.cxwine.releases());
    } catch {
      setCxError(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setCxLoading(true);
    window.easywine.cxwine
      .releases()
      .then((list) => {
        if (!cancelled) setReleases(list);
      })
      .catch(() => {
        if (!cancelled) setCxError(true);
      })
      .finally(() => {
        if (!cancelled) setCxLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const majors = useMemo(
    () =>
      Array.from(new Set(versions.map((v) => v.major))).sort((a, b) => b - a),
    [versions],
  );

  const visible = useMemo(
    () =>
      major === "all" ? versions : versions.filter((v) => v.major === major),
    [versions, major],
  );

  const handleWineRefresh = async (): Promise<void> => {
    setRefreshing(true);
    setError(false);
    try {
      applyCatalog(await window.easywine.wine.refreshCatalog());
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
  };

  const handleCxRefresh = async (): Promise<void> => {
    setCxRefreshing(true);
    await loadReleases();
    setCxRefreshing(false);
  };

  const refreshing_ = tab === "wine" ? refreshing : cxRefreshing;
  const onRefresh = tab === "wine" ? handleWineRefresh : handleCxRefresh;

  return (
    <section>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-wine-light">Downloads</h1>
          <p className="mt-1 text-neutral-400">
            {tab === "wine"
              ? "All Wine releases from WineHQ. Filter by major version and download the build you need."
              : "Compiled cxwine + D3DMetal builds from the EasyWine Wine repo, for game-exclusive prefixes."}
          </p>
        </div>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onRefresh}
          disabled={refreshing_ || (tab === "wine" ? loading : cxLoading)}
        >
          <Icon
            name="refresh"
            className={`text-lg ${refreshing_ ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      <div className="mt-5 flex gap-1 tabs">
        <button
          type="button"
          className={`tab ${tab === "wine" ? "tab--active" : ""}`}
          onClick={() => setTab("wine")}
        >
          <Icon name="sports_bar" className="text-lg" />
          Official Wine
        </button>
        <button
          type="button"
          className={`tab ${tab === "cxwine" ? "tab--active" : ""}`}
          onClick={() => setTab("cxwine")}
        >
          <Icon name="sports_esports" className="text-lg" />
          cxwine
        </button>
      </div>

      {tab === "wine" ? (
        <>
          {!loading && !error && majors.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                className={`chip ${major === "all" ? "chip--active" : ""}`}
                onClick={() => setMajor("all")}
              >
                All
              </button>
              {majors.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`chip ${major === m ? "chip--active" : ""}`}
                  onClick={() => setMajor(m)}
                >
                  {m}.x
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="mt-10 flex items-center justify-center gap-2 text-neutral-400">
              <Icon name="progress_activity" className="animate-spin text-xl" />
              Fetching Wine releases…
            </div>
          ) : error ? (
            <div className="card mt-6 text-center">
              <Icon name="cloud_off" className="text-4xl text-red-400" />
              <p className="mt-2 text-neutral-300">
                Could not reach WineHQ. Check your connection and try again.
              </p>
              <button
                type="button"
                className="btn mt-4"
                onClick={handleWineRefresh}
              >
                <Icon name="refresh" className="text-lg" />
                Retry
              </button>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((version) => (
                <WineVersionCard
                  key={version.id}
                  version={version}
                  status={statuses[version.id] ?? "available"}
                  stage={stages[version.id] ?? "downloading"}
                  progress={progress[version.id] ?? 0}
                  onDownload={startDownload}
                  onDelete={deleteVersion}
                />
              ))}
            </div>
          )}
        </>
      ) : cxLoading ? (
        <div className="mt-10 flex items-center justify-center gap-2 text-neutral-400">
          <Icon name="progress_activity" className="animate-spin text-xl" />
          Fetching cxwine builds…
        </div>
      ) : cxError ? (
        <div className="card mt-6 text-center">
          <Icon name="cloud_off" className="text-4xl text-red-400" />
          <p className="mt-2 text-neutral-300">
            Could not reach the Wine repo. Check your connection and try again.
          </p>
          <button type="button" className="btn mt-4" onClick={handleCxRefresh}>
            <Icon name="refresh" className="text-lg" />
            Retry
          </button>
        </div>
      ) : releases.length === 0 ? (
        <p className="mt-6 text-neutral-500">No cxwine builds published yet.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
    </section>
  );
}

export default Downloads;
