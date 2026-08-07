import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { DownloadStage, DownloadStatus } from "@shared/wine";

interface DownloadsContextValue {
  statuses: Record<string, DownloadStatus>;
  progress: Record<string, number>;
  stages: Record<string, DownloadStage>;
  startDownload: (id: string) => void;
  deleteVersion: (id: string) => Promise<void>;
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

  return (
    <DownloadsContext.Provider
      value={{ statuses, progress, stages, startDownload, deleteVersion }}
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
