import { app, BrowserWindow, dialog, net, shell } from "electron";

const REPO = "mhmdrz/easywine";
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const RELEASES_PAGE = `https://github.com/${REPO}/releases`;

interface Release {
  tag_name?: string;
  html_url?: string;
  name?: string;
}

function fetchJson(url: string): Promise<Release> {
  return new Promise((resolve, reject) => {
    const request = net.request(url);
    request.setHeader("User-Agent", "EasyWine");
    request.setHeader("Accept", "application/vnd.github+json");
    request.on("response", (response) => {
      const status = response.statusCode ?? 0;
      let body = "";
      response.on("data", (chunk) => (body += chunk.toString()));
      response.on("end", () => {
        if (status === 404) {
          reject(new Error("NO_RELEASES"));
          return;
        }
        if (status >= 400) {
          reject(new Error(`GitHub API returned HTTP ${status}`));
          return;
        }
        try {
          resolve(JSON.parse(body) as Release);
        } catch (err) {
          reject(err as Error);
        }
      });
      response.on("error", reject);
    });
    request.on("error", reject);
    request.end();
  });
}

/** Compare dotted versions; returns true when `a` is strictly newer than `b`. */
function isNewer(a: string, b: string): boolean {
  const pa = a.replace(/^v/, "").split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, "").split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/**
 * Check the repo's latest GitHub release against the running version.
 * When `interactive`, always shows a dialog (up-to-date / error); otherwise it
 * only surfaces a dialog when a newer release exists.
 */
export async function checkForUpdates(interactive: boolean): Promise<void> {
  const current = app.getVersion();
  const win =
    BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];

  try {
    const release = await fetchJson(RELEASES_API);
    const latest = (release.tag_name ?? "").replace(/^v/, "");
    if (latest && isNewer(latest, current)) {
      const result = await dialog.showMessageBox(win, {
        type: "info",
        message: `EasyWine ${latest} is available`,
        detail: `You have ${current}. Open the releases page to download it?`,
        buttons: ["Open Releases", "Later"],
        defaultId: 0,
        cancelId: 1,
      });
      if (result.response === 0) {
        await shell.openExternal(release.html_url ?? RELEASES_PAGE);
      }
    } else if (interactive) {
      await dialog.showMessageBox(win, {
        type: "info",
        message: "You’re up to date",
        detail: `EasyWine ${current} is the latest version.`,
        buttons: ["OK"],
      });
    }
  } catch (err) {
    if (!interactive) return;
    const noReleases = err instanceof Error && err.message === "NO_RELEASES";
    await dialog.showMessageBox(win, {
      type: noReleases ? "info" : "warning",
      message: noReleases
        ? "No releases yet"
        : "Couldn’t check for updates",
      detail: noReleases
        ? `EasyWine ${current} — there are no published releases to compare against yet.`
        : err instanceof Error
          ? err.message
          : String(err),
      buttons: ["OK"],
    });
  }
}
