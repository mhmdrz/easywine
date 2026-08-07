import { app, shell, BrowserWindow } from "electron";
import { join } from "path";
import { fileURLToPath } from "url";
import { registerIpc } from "./ipc";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 640,
    minHeight: 480,
    show: false,
    backgroundColor: "#1a1a1a",
    autoHideMenuBar: true,
    title: "EasyWine",
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
