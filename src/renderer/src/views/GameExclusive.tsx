import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../components/Icon";
import CreateGameInstanceModal from "../components/CreateGameInstanceModal";
import { CXWINE_VERSION_ID } from "@shared/wine";
import type { CxwineStatus, WineConfig } from "@shared/wine";
import "./GameExclusive.scss";

const CROSSOVER_URL = "https://www.codeweavers.com/crossover/source";
const GPTK_URL = "https://developer.apple.com/games/game-porting-toolkit/";

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

interface StepProps {
  index: number;
  title: string;
  done?: boolean;
  children: React.ReactNode;
}

function Step({ index, title, done, children }: StepProps): React.JSX.Element {
  return (
    <div className="cx-step">
      <div className={`cx-step__num ${done ? "cx-step__num--done" : ""}`}>
        {done ? <Icon name="check" className="text-lg" /> : index}
      </div>
      <div className="cx-step__body">
        <h3 className="cx-step__title">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function GameExclusive(): React.JSX.Element {
  const [status, setStatus] = useState<CxwineStatus | null>(null);
  const [configs, setConfigs] = useState<WineConfig[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    const [next, list] = await Promise.all([
      window.easywine.cxwine.status(),
      window.easywine.config.list(),
    ]);
    setStatus(next);
    setConfigs(list.filter((c) => c.wineVersion === CXWINE_VERSION_ID));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openLink = (url: string): void => {
    window.easywine.app.openExternal(url);
  };

  const act = async (
    key: string,
    fn: () => Promise<unknown>,
  ): Promise<void> => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
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

      {error && (
        <div className="cx-error mt-5">
          <Icon name="error" className="text-lg text-red-400" />
          <span>{error}</span>
        </div>
      )}

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
                      name="sports_esports"
                      filled
                      className="text-xl text-wine-accent"
                    />
                    <h3 className="text-lg font-semibold text-wine-light">
                      {config.name}
                    </h3>
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

          <div className="card mt-6">
            <Step index={1} title="Download the source & Apple GPTK">
              <p className="cx-step__desc">
                Download the CrossOver{" "}
                <code>crossover-sources-&lt;version&gt;.tar.gz</code> archive and
                Apple&rsquo;s Game Porting Toolkit (which contains D3DMetal). You
                must sign in with an Apple Account to get the GPTK — a{" "}
                <strong>free</strong> developer account is enough. Mount the GPTK{" "}
                <code>.dmg</code> and its inner &ldquo;Evaluation environment for
                Windows games&rdquo; image so <code>redist/lib</code> is
                available.
              </p>
              <div className="cx-step__actions">
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => openLink(CROSSOVER_URL)}
                >
                  <Icon name="open_in_new" className="text-lg" />
                  CrossOver sources
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => openLink(GPTK_URL)}
                >
                  <Icon name="open_in_new" className="text-lg" />
                  Apple GPTK
                </button>
              </div>
            </Step>

            <Step
              index={2}
              title="Import the CrossOver source"
              done={status?.sourceReady}
            >
              <p className="cx-step__desc">
                Pick the downloaded archive. EasyWine automatically extracts it
                into its app folder and copies the compile helper scripts into
                the source folder (with the source and build paths already
                pointed at the app folder).
              </p>
              <div className="cx-step__actions">
                <button
                  type="button"
                  className="btn"
                  disabled={busy !== null}
                  onClick={() =>
                    act("source", () => window.easywine.cxwine.importSource())
                  }
                >
                  <Icon
                    name={busy === "source" ? "progress_activity" : "folder_zip"}
                    className={`text-lg ${busy === "source" ? "animate-spin" : ""}`}
                  />
                  {status?.sourceReady
                    ? "Re-import source"
                    : "Select source archive"}
                </button>
              </div>
            </Step>

            <Step index={3} title="Compile the custom Wine">
              <p className="cx-step__desc">
                Open the compile helper in Terminal and use its menu to build all
                phases, then overlay D3DMetal from the mounted GPTK volume. It
                runs interactively (it asks for your password and takes a while)
                and installs the finished Wine into the app folder. This only
                needs to happen once.
              </p>
              <div className="cx-step__actions">
                <button
                  type="button"
                  className="btn"
                  disabled={busy !== null || !status?.sourceReady}
                  onClick={() =>
                    act("compile", () => window.easywine.cxwine.openCompiler())
                  }
                >
                  <Icon name="terminal" className="text-lg" />
                  Open compile helper
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={busy !== null}
                  onClick={() =>
                    act("build", () => window.easywine.cxwine.importBuild())
                  }
                >
                  <Icon
                    name={
                      busy === "build" ? "progress_activity" : "download_done"
                    }
                    className={`text-lg ${busy === "build" ? "animate-spin" : ""}`}
                  />
                  Import compiled build folder
                </button>
              </div>
            </Step>

            <Step
              index={4}
              title="Check for the compiled Wine"
              done={status?.buildReady}
            >
              <p className="cx-step__desc">
                {status?.buildReady ? (
                  <>
                    A custom Wine build is installed in the app folder
                    {status.redistReady
                      ? " with D3DMetal overlaid."
                      : ". Overlay D3DMetal via the compile helper's menu to finish."}
                  </>
                ) : (
                  <>
                    No compiled Wine found in the app folder yet. Once the helper
                    finishes, refresh to detect it.
                  </>
                )}
              </p>
              <div className="cx-step__actions">
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={busy !== null}
                  onClick={() => act("refresh", () => refresh())}
                >
                  <Icon
                    name="refresh"
                    className={`text-lg ${busy === "refresh" ? "animate-spin" : ""}`}
                  />
                  Refresh
                </button>
              </div>
            </Step>
          </div>

          {status?.buildReady && status?.redistReady && (
            <div className="cx-ready mt-6">
              <Icon name="rocket_launch" className="text-xl text-wine-light" />
              <span>Your D3DMetal Wine build is ready in the app folder.</span>
            </div>
          )}
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
