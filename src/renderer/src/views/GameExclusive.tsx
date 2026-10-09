import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../components/Icon";
import CreateGameInstanceModal from "../components/CreateGameInstanceModal";
import CxwineSetup from "../components/CxwineSetup";
import { CXWINE_VERSION_ID } from "@shared/wine";
import type { CxwineStatus, LibTips, WineConfig } from "@shared/wine";
import LibraryTips from "../components/LibraryTips";

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

function GameExclusive(): React.JSX.Element {
  const [status, setStatus] = useState<CxwineStatus | null>(null);
  const [configs, setConfigs] = useState<WineConfig[]>([]);
  const [showSetup, setShowSetup] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [libTips, setLibTips] = useState<LibTips | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    const [next, list, tips] = await Promise.all([
      window.easywine.cxwine.status(),
      window.easywine.config.list(),
      window.easywine.cxwine.libTips(),
    ]);
    setStatus(next);
    setConfigs(list.filter((c) => c.wineVersion === CXWINE_VERSION_ID));
    setLibTips(tips);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDelete = async (name: string): Promise<void> => {
    const ok = window.confirm(
      `Delete instance “${name}”? This permanently removes its Wine prefix and all installed apps.`,
    );
    if (!ok) return;
    setDeleting(name);
    try {
      await window.easywine.config.delete(name);
      setConfigs((prev) => prev.filter((c) => c.name !== name));
    } finally {
      setDeleting(null);
    }
  };

  // Once the custom Wine is built, this view becomes an instance manager.
  const showManager = Boolean(status?.buildReady) && !showSetup;

  return (
    <section>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-wine-light">Game exclusive</h1>
          {showManager ? (
            <p className="mt-1 max-w-2xl text-neutral-400">
              Create and manage game instances backed by your custom{" "}
              <strong>CrossOver + D3DMetal</strong> Wine build.
            </p>
          ) : (
            <p className="mt-1 max-w-2xl text-neutral-400">
              For the best gaming performance, EasyWine can build a custom Wine
              based on the <strong>CrossOver</strong> sources with Apple&rsquo;s{" "}
              <strong>D3DMetal</strong> — a fast Direct3D to Metal translation
              layer. Follow the steps below to set it up.
            </p>
          )}
        </div>
        {showManager && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setShowSetup(true)}
            >
              <Icon name="build" className="text-lg" />
              Manage build
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setModalOpen(true)}
            >
              <Icon name="add" className="text-lg" />
              Add
            </button>
          </div>
        )}
      </div>

      {showManager ? (
        <>
          {!status?.redistReady && (
            <div className="cx-error mt-5">
              <Icon name="warning" className="text-lg text-amber-400" />
              <span>
                D3DMetal is not overlaid on the build yet. Open “Manage build” →
                compile helper and run the D3DMetal step for full performance.
              </span>
            </div>
          )}

          {configs.length === 0 ? (
            <p className="mt-6 text-neutral-500">
              No game instances yet — click “Add” to create one backed by your
              D3DMetal Wine build.
            </p>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {configs.map((config) => (
                <div key={config.name} className="card flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Icon
                      name={config.icon ?? "sports_esports"}
                      filled
                      className="text-xl text-wine-accent"
                    />
                    <h3 className="min-w-0 flex-1 truncate text-lg font-semibold text-wine-light">
                      {config.name}
                    </h3>
                    <button
                      type="button"
                      className="icon-btn shrink-0 text-neutral-400 hover:text-red-400"
                      title={`Delete ${config.name}`}
                      aria-label={`Delete ${config.name}`}
                      onClick={() => handleDelete(config.name)}
                      disabled={deleting === config.name}
                    >
                      <Icon
                        name={
                          deleting === config.name
                            ? "progress_activity"
                            : "delete"
                        }
                        className={
                          deleting === config.name
                            ? "animate-spin text-lg"
                            : "text-lg"
                        }
                      />
                    </button>
                  </div>
                  <p className="text-sm text-neutral-400">
                    D3DMetal · {config.arch}
                  </p>
                  <p className="text-xs text-neutral-500">
                    Created {formatDate(config.createdAt)}
                  </p>
                  <Link
                    to={`/instance/${encodeURIComponent(config.name)}`}
                    className="btn btn--ghost mt-2"
                  >
                    <Icon name="open_in_new" className="text-lg" />
                    Open
                  </Link>
                </div>
              ))}
            </div>
          )}

          <LibraryTips tips={libTips} />
        </>
      ) : (
        <>
          {status?.buildReady && (
            <button
              type="button"
              className="btn btn--ghost mt-5"
              onClick={() => setShowSetup(false)}
            >
              <Icon name="arrow_back" className="text-lg" />
              Back to game instances
            </button>
          )}

          <CxwineSetup onStatusChange={setStatus} />
        </>
      )}

      {modalOpen && (
        <CreateGameInstanceModal
          onClose={() => setModalOpen(false)}
          onCreated={(config) => setConfigs((prev) => [config, ...prev])}
        />
      )}
    </section>
  );
}

export default GameExclusive;
