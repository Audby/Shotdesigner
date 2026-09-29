# Shot Designer

A local filmmaking workspace for shot lists, 2D blocking and lighting diagrams, and interactive 3D previsualization. Built with React, TypeScript, Konva, Three.js, and Electron.

## Run

On macOS, double-click **Open Shot Designer.command** in this folder. It builds
the current version and opens the desktop app directly from local files, without
starting a web server. The small Terminal window can be closed after the app
opens. Quit Shot Designer with **⌘Q**, **Quit** in the app menu, or by
closing its window. Your scene files stay in `scenes/` and shot lists in `shotlists/`.

```sh
npm install
npm run dev          # Browser workspace
npm run electron:dev # Desktop workspace with native scene files
```

For development only: stop either command by pressing **Control-C** in the
Terminal window where you started it, then close the browser tab. Closing a
browser tab alone does not stop a development server. The double-click launcher
does not need either development command.

## Plan a shot

1. **Shot list** — create scenes, describe coverage, assign subjects, track readiness, and link a diagram. Use Project tools for the subject library, glossary, and shortcuts.
2. **2D plan** — search or choose an element category, place blocking and lighting symbols, and edit their properties. Library and Inspector can be hidden to give the plan more space.
3. **3D studio** — build the set, then choose Compose shot. Drag to pan/tilt, shift-drag to truck, and scroll to dolly. Choose a subject and a framing preset in the Camera inspector. Set another composition later on the timeline to create a camera move.

See [3D_STUDIO.md](3D_STUDIO.md) for camera controls, model imports, reference exports, and current limits.

Scene operations live under File, with Save scene always visible. The shot list saves separately. The browser stores saved documents locally; export JSON for a portable copy. The Electron version provides native file storage. Built-in 3D assets and system fonts work offline.

## Checks

```sh
npm test
npm run lint
npm run build
```

Tests cover diagram/3D synchronization, camera projection and interpolation, direct camera controls, framing presets, procedural model bounds, and shot-list/CSV compatibility.
