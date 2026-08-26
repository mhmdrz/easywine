import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import GameExclusive from "./views/GameExclusive";
import Instances from "./views/Instances";
import Instance from "./views/Instance";
import Downloads from "./views/Downloads";
import Settings from "./views/Settings";

function App(): React.JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Instances />} />
        <Route path="game-exclusive" element={<GameExclusive />} />
        <Route path="instance/:name" element={<Instance />} />
        <Route path="downloads" element={<Downloads />} />
        <Route path="settings" element={<Settings />} />
        {/* Unknown paths fall back to instances. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
