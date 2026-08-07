import { useEffect, useMemo, useState } from "react";
import Icon from "../components/Icon";
import WineVersionCard from "../components/WineVersionCard";
import { useDownloads } from "../context/DownloadsProvider";
import type { WineVersion } from "@shared/wine";
import "./Downloads.scss";

type MajorFilter = number | "all";

function Downloads(): React.JSX.Element {
  const { statuses, progress, stages, startDownload, deleteVersion } =
    useDownloads();
  const [versions, setVersions] = useState<WineVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [major, setMajor] = useState<MajorFilter>("all");

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

  const handleRefresh = async (): Promise<void> => {
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

  return (
    <section>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-wine-light">Downloads</h1>
          <p className="mt-1 text-neutral-400">
            All Wine releases from WineHQ. Filter by major version and download
            the build you need.
          </p>
        </div>
        <button
          type="button"
          className="btn btn--ghost"
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
          <button type="button" className="btn mt-4" onClick={handleRefresh}>
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
    </section>
  );
}

export default Downloads;
