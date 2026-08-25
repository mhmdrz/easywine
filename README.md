# EasyWine

A customizable GUI for running Windows software and games on macOS with [Wine](https://www.winehq.org/), powered by Electron.

EasyWine lets you create and manage isolated Wine prefixes ("instances"), install and launch Windows apps, and tweak per‑instance settings — without touching the command line. It also ships a dedicated **Game exclusive** workflow built around a custom [CrossOver](https://www.codeweavers.com/crossover) + Apple **D3DMetal** Wine build, which translates Direct3D to Metal for native‑feeling game performance on Apple hardware.

## Features

- **Instance manager** — create, configure, and delete independent Wine prefixes (win64 / win32).
- **App management** — install Windows installers, launch installed apps, and open the prefix's `C:` drive.
- **Game exclusive mode** — a CrossOver + D3DMetal pipeline with automatic gaming defaults:
  - Metal / DXMT launch environment (D3DMetal frameworks, MetalFX, MoltenVK ICD).
  - Common gaming DLL overrides (XInput / DirectInput / XAudio2 / D3DCompiler, etc.).
  - Windows 10 mode, Retina/DPI, and a graphics‑backend switch (D3DMetal ↔ DXVK).
  - One‑click Mono, Gecko, and Visual C++ redistributable installs.
- **Metal HUD toggle** for on‑screen performance stats.
- **Bundled runtime libraries** — required Homebrew dylibs (FreeType, GnuTLS, and their closure) are pulled into the build automatically, with a Tips panel flagging anything that still needs a Homebrew install or OS linking.
- **Built‑in updater** that checks the project's GitHub releases.

## Tested on

- **macOS Tahoe 26.5.2** on an **M1 Pro MacBook Pro**. The main app runs natively on `arm64`.
- The **Game exclusive** CrossOver + D3DMetal build is `x86_64` and runs via **Rosetta 2**, so an Apple Silicon Mac with Rosetta installed is recommended for that workflow.
- Verified in‑game with **Stronghold Crusader: Definitive Edition**.
- **Electron 43** / Node 22.

## Getting started

```bash
npm install     # install dependencies
npm run dev     # launch in development with hot reload
npm run build   # typecheck + build for production
npm start       # preview a production build
```

### Building a binary

```bash
npm run pack    # build an unpacked .app in dist/ (fast, for testing)
npm run dist    # build a distributable (DMG) with electron-builder
```

## Acknowledgements

EasyWine stands on the shoulders of a lot of great open‑source and third‑party work:

- **[Wine](https://www.winehq.org/)** — the compatibility layer that makes running Windows software on macOS possible. Wine is licensed under the LGPL.
- **[CrossOver](https://www.codeweavers.com/crossover)** by CodeWeavers — the Wine distribution whose build powers the Game exclusive mode. CrossOver is a CodeWeavers product based on Wine. The Wine‑derived source CodeWeavers publishes is LGPL and can be compiled freely; the commercial CrossOver application, its GUI, and the "CrossOver" trademark require a CodeWeavers license.
- **Apple D3DMetal** — Apple's Direct3D‑to‑Metal translation layer, part of the [Game Porting Toolkit](https://developer.apple.com/games/game-porting-toolkit/).
- **[MoltenVK](https://github.com/KhronosGroup/MoltenVK)** — Vulkan‑over‑Metal used by the DXVK backend.
- **[DXVK](https://github.com/doitsujin/dxvk)** — Direct3D‑to‑Vulkan translation, offered as an alternative graphics backend.
- **[Wine Mono](https://gitlab.winehq.org/wine/wine-mono)** and **[Wine Gecko](https://gitlab.winehq.org/wine/wine-gecko)** — .NET and HTML runtimes for prefixes.
- Bundled native libraries via **[Homebrew](https://brew.sh/)**: **FreeType**, **GnuTLS**, and their dependency closure (GMP, Nettle, libtasn1, p11‑kit, libidn2, gettext, and friends).

### Built with

- [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/) and [electron-builder](https://www.electron.build/)
- [React](https://react.dev/) and [React Router](https://reactrouter.com/)
- [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vitejs.dev/)
- [Tailwind CSS](https://tailwindcss.com/) + [Sass](https://sass-lang.com/)
- [Material Symbols](https://fonts.google.com/icons) and the [Montserrat](https://fonts.google.com/specimen/Montserrat) typeface

## License

EasyWine is released under the [MIT License](./LICENSE).

Note that the third‑party components listed under **Acknowledgements** carry their own licenses (Wine and MoltenVK under LGPL/Apache, CrossOver under CodeWeavers' commercial license, Apple D3DMetal under Apple's terms). You are responsible for complying with the licenses of any Wine build, game, or application you use with EasyWine.
