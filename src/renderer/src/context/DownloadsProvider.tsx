import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type {
  CxwineRelease,
  DownloadStage,
  DownloadStatus,
} from "@shared/wine";

interface DownloadsContextValue {
  statuses: Record<string, DownloadStatus>;
  progress: Record<string, number>;
  stages: Record<string, DownloadStage>;
  startDownload: (id: string) => void;
  deleteVersion: (id: string) => Promise<void>;
  cxStatuses: Record<string, DownloadStatus>;
  cxProgress: Record<string, number>;
  cxStages: Record<string, DownloadStage>;
  installedCxTag: string | null;
  startCxwineDownload: (release: CxwineRelease) => void;
}

const DownloadsContext = createContext<DownloadsContextValue | null>(null);

export function DownloadsProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [statuses, setStatuses] = useState<Record<string, DownloadStatus>>({});
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [stages, setStages] = useState<Record<string, DownloadStage>>({});

  const [cxStatuses, setCxStatuses] = useState<Record<string, DownloadStatus>>(
    {},
  );
  const [cxProgress, setCxProgress] = useState<Record<string, number>>({});
  const [cxStages, setCxStages] = useState<Record<string, DownloadStage>>({});
  const [installedCxTag, setInstalledCxTag] = useState<string | null>(null);

  useEffect(() => {
    window.easywine.wine.listInstalled().then((ids) => {
      setStatuses((prev) => {
        const next = { ...prev };
        ids.forEach((id) => {
          if (next[id] !== "downloading") next[id] = "installed";
        });
        return next;
      });
    });

    window.easywine.wine.activeDownloads().then((list) => {
      list.forEach(({ id, stage, progress }) => {
        setStatuses((s) => ({ ...s, [id]: "downloading" }));
        setStages((s) => ({ ...s, [id]: stage }));
        setProgress((p) => ({ ...p, [id]: progress }));
      });
    });

    const unsubscribe = window.easywine.wine.onProgress(
      ({ id, stage, progress }) => {
        setProgress((prev) => ({ ...prev, [id]: progress }));
        setStages((prev) => ({ ...prev, [id]: stage }));
        setStatuses((prev) =>
          prev[id] === "downloading" ? prev : { ...prev, [id]: "downloading" },
        );
      },
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    window.easywine.cxwine.installedTag().then(setInstalledCxTag);

    window.easywine.cxwine.activeReleaseDownload().then((active) => {
      if (!active) return;
      setCxStatuses((s) => ({ ...s, [active.id]: "downloading" }));
      setCxStages((s) => ({ ...s, [active.id]: active.stage }));
      setCxProgress((p) => ({ ...p, [active.id]: active.progress }));
    });

    const unsubscribe = window.easywine.cxwine.onReleaseProgress(
      ({ id, stage, progress }) => {
        setCxProgress((prev) => ({ ...prev, [id]: progress }));
        setCxStages((prev) => ({ ...prev, [id]: stage }));
        setCxStatuses((prev) =>
          prev[id] === "downloading" ? prev : { ...prev, [id]: "downloading" },
        );
      },
    );
    return unsubscribe;
  }, []);

  const startDownload = useCallback((id: string): void => {
    setStatuses((s) => ({ ...s, [id]: "downloading" }));
    setProgress((p) => ({ ...p, [id]: 0 }));
    setStages((st) => ({ ...st, [id]: "downloading" }));
    window.easywine.wine
      .download(id)
      .then(() => setStatuses((s) => ({ ...s, [id]: "installed" })))
      .catch((err) => {
        console.error(`Failed to download ${id}:`, err);
        setStatuses((s) => ({ ...s, [id]: "error" }));
      });
  }, []);

  const deleteVersion = useCallback(async (id: string): Promise<void> => {
    await window.easywine.wine.remove(id);
    setStatuses((s) => ({ ...s, [id]: "available" }));
    setProgress((p) => ({ ...p, [id]: 0 }));
  }, []);

  const startCxwineDownload = useCallback((release: CxwineRelease): void => {
    const { id, tag } = release;
    setCxStatuses((s) => ({ ...s, [id]: "downloading" }));
    setCxProgress((p) => ({ ...p, [id]: 0 }));
    setCxStages((st) => ({ ...st, [id]: "downloading" }));
    window.easywine.cxwine
      .downloadRelease(release)
      .then(() => {
        setCxStatuses((s) => ({ ...s, [id]: "installed" }));
        setInstalledCxTag(tag);
      })
      .catch((err) => {
        console.error(`Failed to download cxwine ${tag}:`, err);
        setCxStatuses((s) => ({ ...s, [id]: "error" }));
      });
  }, []);

  return (
    <DownloadsContext.Provider
      value={{
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
      }}
    >
      {children}
    </DownloadsContext.Provider>
  );
}

export function useDownloads(): DownloadsContextValue {
  const ctx = useContext(DownloadsContext);
  if (!ctx) {
    throw new Error("useDownloads must be used within a DownloadsProvider");
  }
  return ctx;
}
