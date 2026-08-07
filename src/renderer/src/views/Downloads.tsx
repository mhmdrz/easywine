import Icon from "../components/Icon";

function Downloads(): React.JSX.Element {
  return (
    <section>
      <h1 className="text-2xl font-bold text-wine-light">Downloads</h1>
      <p className="mt-1 text-neutral-400">
        Download and manage Wine builds and dependencies.
      </p>
      <div className="card mt-6">
        <Icon name="download" className="text-4xl text-wine-accent" />
        <p className="placeholder mt-4">
          🍷 Placeholder — available downloads will live here.
        </p>
      </div>
    </section>
  );
}

export default Downloads;
