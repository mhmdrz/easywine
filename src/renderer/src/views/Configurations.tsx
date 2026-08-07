import Icon from "../components/Icon";

function Configurations(): React.JSX.Element {
  return (
    <section>
      <h1 className="text-2xl font-bold text-wine-light">Configurations</h1>
      <p className="mt-1 text-neutral-400">
        Create and manage your Wine prefixes and their settings.
      </p>
      <div className="card mt-6">
        <Icon name="folder" className="text-4xl text-wine-accent" />
        <p className="placeholder mt-4">
          🍷 Placeholder — the list of Wine configurations will live here.
        </p>
      </div>
    </section>
  );
}

export default Configurations;
