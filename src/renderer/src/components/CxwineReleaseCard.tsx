import Icon from "./Icon";
import type {
  CxwineRelease,
  DownloadStage,
  DownloadStatus,
} from "@shared/wine";
import "../styles/WineVersionCard.scss";

interface CxwineReleaseCardProps {
  release: CxwineRelease;
  status: DownloadStatus;
  stage: DownloadStage;
  progress: number;
  installed: boolean;
  onDownload: (release: CxwineRelease) => void;
}

const STAGE_LABEL: Record<DownloadStage, string> = {
  downloading: "Downloading",
  verifying: "Verifying",
  extracting: "Installing",
};

function formatDate(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

function CxwineReleaseCard({
  release,
  status,
  stage,
  progress,
  installed,
  onDownload,
}: CxwineReleaseCardProps): React.JSX.Element {
  const isActive = installed && status !== "downloading";

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-wine-light">
            cxwine {release.name}
          </h3>
          {release.publishedAt && (
            <p className="text-xs text-neutral-500">
              Released {formatDate(release.publishedAt)}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {release.size && (
          <span className="badge bg-white/10 text-neutral-300">
            <Icon name="folder_zip" className="mr-1 text-sm" />
            {release.size}
          </span>
        )}
        <span className="badge bg-white/10 text-neutral-300">x86_64</span>
      </div>

      <div className="mt-auto pt-1">
        {status === "downloading" ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span className="font-medium">{STAGE_LABEL[stage]}</span>
              <span className="tabular-nums">
                {stage === "extracting" ? "" : `${progress}%`}
              </span>
            </div>
            <div className="progress">
              <div
                className={
                  stage === "extracting"
                    ? "progress__bar progress__bar--indeterminate"
                    : "progress__bar"
                }
                style={
                  stage === "extracting" ? undefined : { width: `${progress}%` }
                }
              />
            </div>
          </div>
        ) : isActive ? (
          <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-400">
            <Icon name="check_circle" filled className="text-lg" />
            Active build
          </span>
        ) : status === "error" ? (
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-sm text-red-400">
              <Icon name="error" filled className="text-lg" />
              Failed
            </span>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => onDownload(release)}
            >
              <Icon name="refresh" className="text-lg" />
              Retry
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn w-full"
            onClick={() => onDownload(release)}
          >
            <Icon name="download" className="text-lg" />
            {installed ? "Reinstall" : "Install"}
          </button>
        )}
      </div>
    </div>
  );
}

export default CxwineReleaseCard;
