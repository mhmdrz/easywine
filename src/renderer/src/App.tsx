function App(): React.JSX.Element {
  return (
    <main className="app-shell">
      <div className="app-shell__card">
        <h1 className="text-3xl font-bold text-wine-light">EasyWine</h1>
        <p className="mt-2 text-neutral-400">A GUI for Wine on macOS.</p>
        <p className="app-shell__placeholder mt-6">
          🍷 Placeholder — the wine management interface will live here.
        </p>
      </div>
    </main>
  )
}

export default App
