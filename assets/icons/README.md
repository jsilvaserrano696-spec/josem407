# App icons

Place a Windows `.ico` file here named `icon.ico` before running `npm run dist`
(electron-builder's `win.icon` config points here). Without it, `npm start` still
works fine — Electron just falls back to a default window icon — but packaging a
real installer needs a proper multi-resolution `.ico` (16/32/48/256px).
