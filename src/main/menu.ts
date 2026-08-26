import { app, Menu, shell, type MenuItemConstructorOptions } from "electron";
import { checkForUpdates } from "./updates";

const GITHUB_URL = "https://github.com/mhmdrz/easywine";
const AUTHOR_GITHUB_URL = "https://github.com/mhmdrz";

export function buildAppMenu(): void {
  const isMac = process.platform === "darwin";

  const checkForUpdatesItem: MenuItemConstructorOptions = {
    label: "Check for Updates…",
    click: () => void checkForUpdates(true),
  };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              checkForUpdatesItem,
              { type: "separator" },
              {
                label: "Developer on GitHub",
                click: () => void shell.openExternal(AUTHOR_GITHUB_URL),
              },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          } as MenuItemConstructorOptions,
        ]
      : []),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? ([{ type: "separator" }, { role: "front" }] as MenuItemConstructorOptions[])
          : ([{ role: "close" }] as MenuItemConstructorOptions[])),
      ],
    },
    {
      role: "help",
      submenu: [
        {
          label: "EasyWine on GitHub",
          click: () => void shell.openExternal(GITHUB_URL),
        },
        ...(!isMac ? [checkForUpdatesItem] : []),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
