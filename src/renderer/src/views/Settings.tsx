import Icon from "../components/Icon";

function Settings(): React.JSX.Element {
  return (
    <section>
      <h1 className="text-2xl font-bold text-wine-light">Settings</h1>
      <p className="mt-1 text-neutral-400">
        Configure EasyWine and default Wine behavior.
      </p>
      <div className="card mt-6">
        <Icon name="settings" className="text-4xl text-wine-accent" />
        <p className="placeholder mt-4">
          🍷 Placeholder — application settings will live here.
        </p>
      </div>
    </section>
  );
}

export default Settings;
