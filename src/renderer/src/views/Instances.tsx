import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../components/Icon";
import CreateConfigModal from "../components/CreateConfigModal";
import type { WineConfig } from "@shared/wine";
import { CXWINE_VERSION_ID } from "@shared/wine";
import { formatVersionId } from "../utils/format";

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

function Instances(): React.JSX.Element {
  const [configs, setConfigs] = useState<WineConfig[]>([]);
  const [installed, setInstalled] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    window.easywine.config
      .list()
      .then((list) =>
        setConfigs(list.filter((c) => c.wineVersion !== CXWINE_VERSION_ID)),
      );
  }, []);

  const openModal = async (): Promise<void> => {
    setInstalled(await window.easywine.wine.listInstalled());
    setModalOpen(true);
  };

  return (
    <section>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-wine-light">Instances</h1>
          <p className="mt-1 text-neutral-400">
            Create and manage your Wine prefixes and their settings.
          </p>
        </div>
        <button type="button" className="btn" onClick={openModal}>
          <Icon name="add" className="text-lg" />
          Add
        </button>
      </div>

      {configs.length === 0 ? (
        <p className="mt-6 text-neutral-500">
          No instances yet — click “Add” to create your first Wine prefix.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {configs.map((config) => (
            <div key={config.name} className="card flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Icon name="folder" filled className="text-xl text-wine-accent" />
                <h3 className="text-lg font-semibold text-wine-light">
                  {config.name}
                </h3>
              </div>
              <p className="text-sm text-neutral-400">
                Wine {formatVersionId(config.wineVersion)} · {config.arch}
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

      {modalOpen && (
        <CreateConfigModal
          installed={installed}
          onClose={() => setModalOpen(false)}
          onCreated={(config) => setConfigs((prev) => [config, ...prev])}
        />
      )}
    </section>
  );
}

export default Instances;
