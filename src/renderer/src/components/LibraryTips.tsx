import { useState } from "react";
import Icon from "./Icon";
import type { LibTip, LibTips } from "@shared/wine";

const BREW = "arch -x86_64 /usr/local/bin/brew install";
const BREW_INSTALL =
  'arch -x86_64 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"';

function CopyableCommand({ command }: { command: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const copy = (): void => {
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      type="button"
      onClick={copy}
      title="Click to copy"
      className="mt-1 flex w-full items-center gap-2 overflow-x-auto rounded-md bg-black/40 px-2.5 py-1.5 text-left font-mono text-xs text-neutral-300 transition-colors hover:bg-black/60"
    >
      <Icon
        name={copied ? "check" : "content_copy"}
        className={`shrink-0 text-sm ${copied ? "text-green-400" : "text-neutral-500"}`}
      />
      <span className="whitespace-nowrap">{command}</span>
    </button>
  );
}

function TipRow({ tip }: { tip: LibTip }): React.JSX.Element {
  const needsInstall = tip.source === "brew" && !tip.present;
  const badge =
    tip.source === "bundled"
      ? { icon: "check_circle", cls: "text-green-400", label: "Bundled" }
      : tip.source === "os"
        ? { icon: "check_circle", cls: "text-green-400", label: "macOS" }
        : tip.present
          ? { icon: "check_circle", cls: "text-green-400", label: "Installed" }
          : { icon: "warning", cls: "text-amber-400", label: "Missing" };

  return (
    <li className="flex gap-3 py-3">
      <Icon name={badge.icon} className={`mt-0.5 text-lg ${badge.cls}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-wine-light">{tip.name}</span>
          <span className={`text-xs ${badge.cls}`}>{badge.label}</span>
        </div>
        <p className="text-xs text-neutral-400">{tip.purpose}</p>
        {needsInstall && tip.formula && (
          <CopyableCommand command={`${BREW} ${tip.formula}`} />
        )}
      </div>
    </li>
  );
}

function LibraryTips({ tips }: { tips: LibTips | null }): React.JSX.Element | null {
  if (!tips) return null;
  const missing = tips.tips.filter((t) => t.source === "brew" && !t.present);

  return (
    <div className="card mt-6">
      <div className="flex items-center gap-2">
        <Icon name="tips_and_updates" className="text-xl text-wine-accent" />
        <h2 className="text-lg font-semibold text-wine-light">
          System libraries
        </h2>
      </div>
      <p className="mt-1 text-sm text-neutral-400">
        These are loaded from x86_64 Homebrew (<code>/usr/local</code>) or macOS.
        Fonts &amp; TLS are already bundled into the build.
        {missing.length > 0
          ? ` ${missing.length} optional ${missing.length === 1 ? "library is" : "libraries are"} missing.`
          : " Everything needed is available."}
      </p>

      {!tips.brewPresent && (
        <div className="mt-3 rounded-md border border-amber-400/30 bg-amber-400/5 p-3">
          <p className="text-sm text-amber-300">
            No x86_64 Homebrew found under <code>/usr/local</code>. Because the
            Wine build is Intel (x86_64), these libraries must come from the
            Intel Homebrew, not the arm64 one in <code>/opt/homebrew</code>.
            Install it with:
          </p>
          <CopyableCommand command={BREW_INSTALL} />
        </div>
      )}

      <ul className="mt-2 divide-y divide-white/10">
        {tips.tips.map((tip) => (
          <TipRow key={tip.name} tip={tip} />
        ))}
      </ul>
    </div>
  );
}

export default LibraryTips;
