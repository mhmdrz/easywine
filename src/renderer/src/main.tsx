import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { DownloadsProvider } from "./context/DownloadsProvider";
import "@fontsource-variable/montserrat";
import "material-symbols/outlined.css";
import "./styles/main.scss";

ReactDOM.createRoot(document.getElementById("app") as HTMLElement).render(
  <React.StrictMode>
    <DownloadsProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </DownloadsProvider>
  </React.StrictMode>,
);
