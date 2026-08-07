import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Configurations from "./views/Configurations";
import Downloads from "./views/Downloads";
import Settings from "./views/Settings";

function App(): React.JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Configurations />} />
        <Route path="downloads" element={<Downloads />} />
        <Route path="settings" element={<Settings />} />
        {/* Unknown paths fall back to configurations. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
