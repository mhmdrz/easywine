import { app, shell, BrowserWindow } from "electron";
import { join } from "path";
import { fileURLToPath } from "url";
import { registerIpc } from "./ipc";
import { buildAppMenu } from "./menu";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const BANNER = `
███▄ ▄███▓ ██░ ██  ███▄ ▄███▓▓█████▄  ██▀███  ▒███████▒
▓██▒▀█▀ ██▒▓██░ ██▒▓██▒▀█▀ ██▒▒██▀ ██▌▓██ ▒ ██▒▒ ▒ ▒ ▄▀░
▓██    ▓██░▒██▀▀██░▓██    ▓██░░██   █▌▓██ ░▄█ ▒░ ▒ ▄▀▒░
▒██    ▒██ ░▓█ ░██ ▒██    ▒██ ░▓█▄   ▌▒██▀▀█▄    ▄▀▒   ░
▒██▒   ░██▒░▓█▒░██▓▒██▒   ░██▒░▒████▓ ░██▓ ▒██▒▒███████▒
░ ▒░   ░  ░ ▒ ░░▒░▒░ ▒░   ░  ░ ▒▒▓  ▒ ░ ▒▓ ░▒▓░░▒▒ ▓░▒░▒
░  ░      ░ ▒ ░▒░ ░░  ░      ░ ░ ▒  ▒   ░▒ ░ ▒░░░▒ ▒ ░ ▒
░      ░    ░  ░░ ░░      ░    ░ ░  ░   ░░   ░ ░ ░ ░ ░ ░
       ░    ░  ░  ░       ░      ░       ░       ░ ░
                               ░               ░
`;
console.log(BANNER);

app.setName("EasyWine");

// Credit the GitHub handle rather than the real name in the macOS About panel.
app.setAboutPanelOptions({
  applicationName: "EasyWine",
  version: app.getVersion(),
  copyright: "© mhmdrz",
  authors: ["mhmdrz"],
  website: "https://github.com/mhmdrz",
});

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    show: false,
    backgroundColor: "#1a1a1a",
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
  buildAppMenu();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
