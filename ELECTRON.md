# Electron Integration for CANopen Editor

This document describes how to build and run the CANopen Editor as a desktop application using Electron.

## Prerequisites

- Node.js 18+ 
- npm or yarn
- All Angular dependencies installed (`npm install`)

## Installation

The Electron dependencies are already included in the project's `devDependencies`. If you need to reinstall them:

```bash
npm install electron electron-builder wait-on concurrently --save-dev
```

## Running the Application

### Development Mode

Run the Angular development server with Electron hot-reload:

```bash
npm run electron:dev
```

This command:
1. Starts the Angular development server on `http://localhost:4200`
2. Waits for the server to be ready
3. Launches Electron with the development configuration
4. Opens DevTools automatically

### Production Build

Build the Angular app and run Electron:

```bash
npm run electron:build
npm run electron:start
```

Or use the combined command:

```bash
npm run electron:build && npm run electron:start
```

## Packaging for Distribution

### Windows

```bash
npm run electron:package:win
```

This creates an installer in the `release/` directory.

### Linux

```bash
npm run electron:package:linux
```

This creates AppImage, deb, rpm, and tar.gz packages in the `release/` directory.

### macOS

```bash
npm run electron:package:mac
```

This creates a dmg and zip file in the `release/` directory.

### All Platforms

To build packages for all platforms:

```bash
npm run electron:package
```

## Project Structure

```
electron/
  main.js      # Electron main process
  preload.js   # Preload script for safe context bridge

electron-builder.yml  # Configuration for electron-builder

scripts/
  electron-dev.js     # Development helper script
  generate-icon.js    # Icon generation script

assets/icons/
  icon.svg     # Application icon (SVG format)
  icon.png     # Application icon (PNG format)
```

## Configuration

### Main Process (electron/main.js)

The main process creates the browser window and loads the Angular application. In development mode, it connects to the Angular dev server. In production mode, it loads the built files from the `dist/canopen-editor-web/browser/` directory.

### Preload Script (electron/preload.js)

The preload script provides a safe way to expose Electron APIs to the renderer process. It uses `contextBridge` to expose a limited API surface:

```javascript
// In your Angular components, you can access:
window.electronAPI.getAppVersion();
```

### Package Configuration (electron-builder.yml)

The electron-builder configuration defines:
- Application metadata (appId, productName)
- Files to include in the package
- Platform-specific settings (icons, categories)
- Output directory

### Angular Configuration (angular.json)

The Angular build configuration has been updated to support Electron:
- Added `electron` configuration with `baseHref: "./"`
- This ensures that assets are loaded correctly from the local filesystem

## Customizing the Electron Window

Edit `electron/main.js` to customize the window:

```javascript
mainWindow = new BrowserWindow({
  width: 1200,
  height: 800,
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    enableRemoteModule: false,
    preload: path.join(__dirname, 'preload.js')
  }
});
```

## Adding Native Features

To add native features (file system access, system dialogs, etc.), you can:

1. Add methods to the preload script
2. Expose them via `contextBridge.exposeInMainWorld`
3. Use them in your Angular components

Example: Adding file read capability

In `electron/preload.js`:

```javascript
const { ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  readFile: (path) => ipcRenderer.invoke('read-file', path),
  // ... other methods
});
```

In `electron/main.js`:

```javascript
const { ipcMain } = require('electron');
const fs = require('fs');

ipcMain.handle('read-file', async (event, path) => {
  return fs.readFileSync(path, 'utf-8');
});
```

In Angular components:

```typescript
const content = await (window as any).electronAPI.readFile('/path/to/file.txt');
```

## Troubleshooting

### White screen in production

- Ensure `baseHref` is set to `"./"` in angular.json
- Check that the build output is in `dist/canopen-editor-web/browser/`
- Verify that `index.html` has `<base href="./">`

### Electron can't find the app

- Make sure `main` in package.json points to `electron/main.js`
- Check that the `electron:build` script runs before `electron:start`

### DevTools not opening

- In development mode, DevTools should open automatically
- To manually open: Press `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Option+I` (macOS)

## Updating Dependencies

To update Electron and electron-builder:

```bash
npm update electron electron-builder wait-on concurrently
```

## License

This Electron integration is part of the CANopen Editor project and inherits its GPL-3.0-only license.
