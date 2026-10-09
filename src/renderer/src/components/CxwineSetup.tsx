import { useCallback, useEffect, useState } from "react";
import Icon from "./Icon";
import LibraryTips from "./LibraryTips";
import type { CxwineStatus, LibTips } from "@shared/wine";
import "./CxwineSetup.scss";

const CROSSOVER_URL = "https://www.codeweavers.com/crossover/source";
const GPTK_URL = "https://developer.apple.com/games/game-porting-toolkit/";

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

interface CxwineSetupProps {
  /** Notified whenever the build status changes (e.g. a build is imported). */
  onStatusChange?: (status: CxwineStatus) => void;
}

/**
 * The built-in CrossOver + D3DMetal compiler flow: download sources, import
 * them, compile with the helper script, and detect the finished build.
 */
function CxwineSetup({ onStatusChange }: CxwineSetupProps): React.JSX.Element {
  const [status, setStatus] = useState<CxwineStatus | null>(null);
  const [libTips, setLibTips] = useState<LibTips | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    const [next, tips] = await Promise.all([
      window.easywine.cxwine.status(),
      window.easywine.cxwine.libTips(),
    ]);
    setStatus(next);
    setLibTips(tips);
    onStatusChange?.(next);
  }, [onStatusChange]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openLink = (url: string): void => {
    window.easywine.app.openExternal(url);
  };

  const act = async (key: string, fn: () => Promise<unknown>): Promise<void> => {
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

  return (
    <>
      {error && (
        <div className="cx-error mt-5">
          <Icon name="error" className="text-lg text-red-400" />
          <span>{error}</span>
        </div>
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
            Windows games&rdquo; image so <code>redist/lib</code> is available.
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
            Pick the downloaded archive. EasyWine automatically extracts it into
            its app folder and copies the compile helper scripts into the source
            folder (with the source and build paths already pointed at the app
            folder).
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
            phases, then overlay D3DMetal from the mounted GPTK volume. It runs
            interactively (it asks for your password and takes a while) and
            installs the finished Wine into the app folder. This only needs to
            happen once.
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
                name={busy === "build" ? "progress_activity" : "download_done"}
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

      <LibraryTips tips={libTips} />
    </>
  );
}

export default CxwineSetup;
