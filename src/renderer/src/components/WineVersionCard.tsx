import Icon from "./Icon";
import type { DownloadStatus, WineChannel, WineVersion } from "@shared/wine";
import "./WineVersionCard.scss";

interface WineVersionCardProps {
  version: WineVersion;
  status: DownloadStatus;
  progress: number;
  onDownload: (id: string) => void;
  onDelete: (id: string) => void;
}

const CHANNEL_BADGE: Record<WineChannel, string> = {
  stable: "bg-emerald-500/15 text-emerald-400",
  development: "bg-sky-500/15 text-sky-400",
  staging: "bg-amber-500/15 text-amber-400",
};

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

function WineVersionCard({
  version,
  status,
  progress,
  onDownload,
  onDelete,
}: WineVersionCardProps): React.JSX.Element {
  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-wine-light">
            Wine {version.version}
          </h3>
          <p className="text-xs text-neutral-500">
            Released {formatDate(version.releaseDate)}
          </p>
        </div>
        <span className={`badge ${CHANNEL_BADGE[version.channel]}`}>
          {version.channel}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="badge bg-white/10 text-neutral-300">
          <Icon name="folder_zip" className="mr-1 text-sm" />
          {version.size}
        </span>
      </div>

      <div className="mt-auto pt-1">
        {status === "downloading" ? (
          <div className="flex items-center gap-3">
            <div className="progress">
              <div className="progress__bar" style={{ width: `${progress}%` }} />
            </div>
            <span className="w-10 text-right text-xs tabular-nums text-neutral-400">
              {progress}%
            </span>
          </div>
        ) : status === "installed" ? (
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-400">
              <Icon name="check_circle" filled className="text-lg" />
              Installed
            </span>
            <button
              type="button"
              className="icon-btn"
              title="Delete download"
              aria-label={`Delete Wine ${version.version}`}
              onClick={() => onDelete(version.id)}
            >
              <Icon name="delete" className="text-lg" />
            </button>
          </div>
        ) : status === "error" ? (
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-sm text-red-400">
              <Icon name="error" filled className="text-lg" />
              Failed
            </span>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => onDownload(version.id)}
            >
              <Icon name="refresh" className="text-lg" />
              Retry
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn w-full"
            onClick={() => onDownload(version.id)}
          >
            <Icon name="download" className="text-lg" />
            Download
          </button>
        )}
      </div>
    </div>
  );
}

export default WineVersionCard;
