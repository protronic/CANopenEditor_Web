const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const { execFile } = require('child_process');
const fs = require('fs');

let mainWindow;

function getConverterPath() {
  const platform = process.platform;
  let rel;
  if (platform === 'win32') {
    rel = path.join('bin', 'win', 'EDSSharp.exe');
  } else if (platform === 'linux') {
    rel = path.join('bin', 'linux', 'EDSSharp');
  } else {
    return null;
  }

  const appDir = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');

  // Packaged: unpacked files (asarUnpack) live in app.asar.unpacked next to app.asar
  const candidates = [
    path.join(appDir, rel),
    path.join(appDir, 'app.asar.unpacked', rel)
  ];
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

function getIconPath() {
  const rel = path.join('assets', 'icons', '256x256.png');
  const appDir = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');

  // Packaged: unpacked files (asarUnpack) live in app.asar.unpacked next to app.asar
  const candidates = [
    path.join(appDir, rel),
    path.join(appDir, 'app.asar.unpacked', rel)
  ];
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: getIconPath(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:4200');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/canopen-editor-web/browser/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: isMac ? 'Cmd+N' : 'Ctrl+N',
          click: () => mainWindow?.webContents.send('menu-action', 'new')
        },
        {
          label: 'Open...',
          accelerator: isMac ? 'Cmd+O' : 'Ctrl+O',
          click: () => mainWindow?.webContents.send('menu-action', 'open')
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: isMac ? 'Cmd+S' : 'Ctrl+S',
          click: () => mainWindow?.webContents.send('menu-action', 'save'),
          id: 'menu-save'
        },
        {
          label: 'Save as...',
          accelerator: isMac ? 'Cmd+Shift+S' : 'Ctrl+Shift+S',
          click: () => mainWindow?.webContents.send('menu-action', 'saveAs'),
          id: 'menu-save-as'
        },
        { type: 'separator' },
        {
          label: 'Insert Profile',
          click: () => mainWindow?.webContents.send('menu-action', 'insertProfile'),
          id: 'menu-insert-profile',
          enabled: false
        },
        { type: 'separator' },
        {
          label: 'Import from',
          submenu: [
            {
              label: 'DCF...',
              click: () => showImportDialog('dcf'),
              enabled: process.platform !== 'darwin'
            },
            {
              label: 'EDS...',
              click: () => showImportDialog('eds'),
              enabled: process.platform !== 'darwin'
            },
            {
              label: 'XDC...',
              click: () => showImportDialog('xdc'),
              enabled: process.platform !== 'darwin'
            },
            {
              label: 'XPD...',
              click: () => showImportDialog('xpd')
            }
          ]
        },
        {
          label: 'Export to',
          submenu: [
            {
              label: 'DCF...',
              click: () => showExportDialog('dcf'),
              enabled: process.platform !== 'darwin'
            },
            {
              label: 'EDS...',
              click: () => showExportDialog('eds'),
              enabled: process.platform !== 'darwin'
            },
            {
              label: 'JSON...',
              click: () => showExportDialog('json'),
              enabled: process.platform !== 'darwin'
            },
            {
              label: 'XDC...',
              click: () => showExportDialog('xdc'),
              enabled: process.platform !== 'darwin'
            },
            {
              label: 'C Source...',
              click: () => showExportDialog('c'),
              enabled: process.platform !== 'darwin'
            }
          ]
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: isMac ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Cut', accelerator: isMac ? 'Cmd+X' : 'Ctrl+X', role: 'cut' },
        { label: 'Copy', accelerator: isMac ? 'Cmd+C' : 'Ctrl+C', role: 'copy' },
        { label: 'Paste', accelerator: isMac ? 'Cmd+V' : 'Ctrl+V', role: 'paste' },
        { label: 'Select All', accelerator: isMac ? 'Cmd+A' : 'Ctrl+A', role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: isMac ? 'Cmd+R' : 'Ctrl+R', role: 'forceReload' },
        { label: 'Toggle Developer Tools', accelerator: isMac ? 'Cmd+Option+I' : 'Ctrl+Shift+I', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Actual Size', accelerator: isMac ? 'Cmd+0' : 'Ctrl+0', role: 'resetZoom' },
        { label: 'Zoom In', accelerator: isMac ? 'Cmd+=' : 'Ctrl+=', role: 'zoomIn' },
        { label: 'Zoom Out', accelerator: isMac ? 'Cmd+-' : 'Ctrl+-', role: 'zoomOut' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'About', click: () => showAboutDialog() }
      ]
    }
  ];

  if (isMac) {
    template.unshift({
      label: app.name,
      submenu: [
        { label: 'About', click: () => showAboutDialog() },
        { type: 'separator' },
        { label: 'Services', role: 'services' },
        { type: 'separator' },
        { label: `Hide ${app.name}`, role: 'hide' },
        { label: 'Hide Others', role: 'hideOthers' },
        { label: 'Show All', role: 'unhide' },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'Cmd+Q', click: () => app.quit() }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

async function showImportDialog(format) {
  if (!mainWindow) return;

  // XPD is XML and parsed directly by the app - no EDSSharp conversion needed
  if (format === 'xpd') {
    const xpdPath = await showCustomFileBrowser({
      title: 'Import from XPD file',
      extensions: ['xpd'],
      startPath: app.getPath('home')
    });
    if (!xpdPath) return;
    mainWindow.webContents.send('load-converted-file', { path: xpdPath });
    return;
  }

  const filters = getFiltersForFormat(format);
  const extensions = filters.length > 0 && filters[0].extensions ? filters[0].extensions.filter(e => e !== '*') : [];

  // Use custom HTML file browser instead of native dialog
  const filePath = await showCustomFileBrowser({
    title: `Import from ${format.toUpperCase()} file`,
    extensions: extensions,
    startPath: app.getPath('home')
  });

  if (!filePath) {
    return; // User cancelled
  }

  // In development mode, show the command that will be executed
  const isDev = !app.isPackaged || process.env.NODE_ENV === 'development';
  
  if (isDev) {
    const converterPath = getConverterPath();
    const tempDir = path.join(app.getPath('temp'), 'canopen-editor');
    const tempOutputPath = path.join(tempDir, `converted_${Date.now()}.xdd`);
    const args = getEdsSharpArgs(filePath, tempOutputPath, format, true);

    const command = `${converterPath} ${args.join(' ')}`;

    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'EDSSharp Command (Development Mode)',
      message: 'The following command will be executed:',
      detail: command,
      buttons: ['Cancel', 'Execute'],
      cancelId: 0
    });

    if (response === 1) {
      convertAndLoad(filePath, 'xdd');
    }
  } else {
    convertAndLoad(filePath, 'xdd');
  }
}

// Custom HTML file browser
function showCustomFileBrowser(options) {
  return new Promise((resolve) => {
    let resolved = false;
    
    const browserWindow = new BrowserWindow({
      width: 800,
      height: 600,
      title: options.title || 'Select file',
      parent: mainWindow,
      modal: true,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });
    browserWindow.setMenu(null);

    const onFileSelected = (event, filePath) => {
      if (event.sender !== browserWindow.webContents) return;
      cleanup();
      if (!browserWindow.isDestroyed()) {
        browserWindow.close();
      }
      safeResolve(filePath);
    };

    const onFileCancelled = (event) => {
      if (event.sender !== browserWindow.webContents) return;
      cleanup();
      if (!browserWindow.isDestroyed()) {
        browserWindow.close();
      }
      safeResolve(null);
    };

    const cleanup = () => {
      ipcMain.removeListener('file-selected', onFileSelected);
      ipcMain.removeListener('file-cancelled', onFileCancelled);
    };

    const safeResolve = (value) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(value);
      }
    };

    ipcMain.on('file-selected', onFileSelected);
    ipcMain.on('file-cancelled', onFileCancelled);

    browserWindow.loadFile(path.join(__dirname, 'file-browser.html'));

    browserWindow.webContents.on('did-finish-load', () => {
      if (!browserWindow.isDestroyed()) {
        browserWindow.webContents.send('init', {
          currentPath: options.startPath || app.getPath('home'),
          extensions: options.extensions || [],
          mode: options.mode || 'open',
          defaultFilename: options.defaultFilename || ''
        });
      }
    });

    browserWindow.on('closed', () => {
      safeResolve(null);
    });
  });
}

async function showExportDialog(format) {
  if (!mainWindow) return;

  // XPD is XML: write the current XDD serialization with .xpd extension - no EDSSharp needed
  if (format === 'xpd') {
    const xddContent = await mainWindow.webContents.executeJavaScript('window.getCurrentXddContent?.()');
    if (!xddContent) {
      dialog.showMessageBoxSync(mainWindow, { type: 'error', title: 'No file open', message: 'Please open a file first before exporting.' });
      return;
    }
    const xpdPath = await showCustomFileBrowser({
      title: 'Export to XPD file',
      extensions: ['xpd'],
      startPath: app.getPath('home'),
      mode: 'save',
      defaultFilename: 'device.xpd'
    });
    if (!xpdPath) return;
    try {
      fs.writeFileSync(xpdPath, xddContent, 'utf-8');
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Export Successful',
        message: 'File successfully exported to XPD format.'
      });
    } catch (err) {
      dialog.showMessageBoxSync(mainWindow, { type: 'error', title: 'Export Error', message: String(err.message || err) });
    }
    return;
  }

  // Check if a device is open
  const xddContent = await mainWindow.webContents.executeJavaScript('window.getCurrentXddContent?.()');
  if (!xddContent) {
    dialog.showMessageBoxSync(mainWindow, { type: 'error', title: 'No file open', message: 'Please open a file first before exporting.' });
    return;
  }
  
  const filters = getFiltersForFormat(format);
  const extensions = filters.length > 0 && filters[0].extensions ? filters[0].extensions.filter(e => e !== '*') : [];
  const defaultExt = extensions[0] || format;
  const defaultFilename = format === 'c' ? 'OD.c' : 'device.' + defaultExt;

  // Use custom HTML file browser in save mode
  const targetPath = await showCustomFileBrowser({
    title: `Export to ${format.toUpperCase()} file`,
    extensions: extensions,
    startPath: app.getPath('home'),
    mode: 'save',
    defaultFilename: defaultFilename
  });

  if (!targetPath) {
    return; // User cancelled
  }

  // In development mode, show the command that will be executed
  const isDev = !app.isPackaged || process.env.NODE_ENV === 'development';
  
  if (isDev) {
    const converterPath = getConverterPath();
    const tempDir = path.join(app.getPath('temp'), 'canopen-editor');
    const tempXddPath = path.join(tempDir, `temp_${Date.now()}.xdd`);
    const args = getEdsSharpArgs(tempXddPath, targetPath, format, false);

    const command = `${converterPath} ${args.join(' ')}`;

    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'EDSSharp Command (Development Mode)',
      message: 'The following command will be executed:',
      detail: command,
      buttons: ['Cancel', 'Execute'],
      cancelId: 0
    });

    if (response === 1) {
      exportToFormat(xddContent, targetPath, format);
    }
  } else {
    exportToFormat(xddContent, targetPath, format);
  }
}

function exportToFormat(xddContent, targetPath, format) {
  if (!mainWindow) return;
  const converterPath = getConverterPath();
  if (!converterPath || !fs.existsSync(converterPath)) {
    dialog.showMessageBoxSync(mainWindow, { type: 'error', title: 'Error', message: 'EDSSharp converter is not available for this platform' });
    return;
  }
  const tempDir = path.join(app.getPath('temp'), 'canopen-editor');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const tempXddPath = path.join(tempDir, `temp_${Date.now()}.xdd`);
  fs.writeFileSync(tempXddPath, xddContent, 'utf-8');
  
  const args = getEdsSharpArgs(tempXddPath, targetPath, format, false);
  
  execFile(converterPath, args, (error, stdout, stderr) => {
    try { fs.unlinkSync(tempXddPath); } catch (e) {}
    if (error) {
      console.error('Export error:', stderr);
      dialog.showMessageBoxSync(mainWindow, { type: 'error', title: 'Export Error', message: stderr.toString() || error.message });
      return;
    }
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Export Successful',
      message: `File successfully exported to ${format.toUpperCase()} format.`
    });
  });
}

function convertAndLoad(inputPath, targetFormat) {
  if (!mainWindow) return;
  const converterPath = getConverterPath();
  if (!converterPath || !fs.existsSync(converterPath)) {
    dialog.showMessageBoxSync(mainWindow, { type: 'error', title: 'Error', message: 'EDSSharp converter is not available for this platform' });
    return;
  }
  const tempDir = path.join(app.getPath('temp'), 'canopen-editor');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const tempOutputPath = path.join(tempDir, `converted_${Date.now()}.xdd`);
  
  const args = getEdsSharpArgs(inputPath, tempOutputPath, targetFormat, true);
  
  execFile(converterPath, args, (error, stdout, stderr) => {
    if (error) {
      console.error('Conversion error:', stderr);
      dialog.showMessageBoxSync(mainWindow, { type: 'error', title: 'Conversion Error', message: stderr.toString() || error.message });
      return;
    }
    mainWindow.webContents.send('load-converted-file', { path: tempOutputPath });
  });
}

function getFiltersForFormat(format) {
  const filtersMap = {
    xdd: [{ name: 'XDD Files', extensions: ['xdd', 'xml'] }],
    eds: [{ name: 'EDS Files', extensions: ['eds'] }],
    dcf: [{ name: 'DCF Files', extensions: ['dcf'] }],
    xdc: [{ name: 'XDC Files', extensions: ['xdc'] }],
    c: [{ name: 'C Source Files', extensions: ['c', 'h'] }],
    json: [{ name: 'JSON Files', extensions: ['json'] }],
    xpd: [{ name: 'XPD Profile Files', extensions: ['xpd'] }]
  };
  const formatKey = format.toLowerCase();
  const filters = filtersMap[formatKey] || [];
  return [...filters, { name: 'All Files', extensions: ['*'] }];
}

// Build EDSSharp arguments based on conversion type and format
function getEdsSharpArgs(inputPath, outputPath, format, isImport) {
  let args;
  let type;

  // For import: convert FROM <format> TO XDD
  if (isImport) {
    args = ['--infile', inputPath, '--outfile', outputPath, '--type', 'CanOpenXDDv1.1'];
  }
  // For export: convert FROM XDD TO <format>
  else {
    if (format == 'eds') {
      type = 'ElectronicDataSheet';
    } else if (format == 'dcf') {
      type = 'DeviceConfigurationFile';
    } else if (format == 'xdc') {
      type = 'CanOpenXDCv1.1';
    } else if (format == 'c') {
      type = 'CanOpenNodeV4';
    } else if (format == 'json') {
      type = 'CanOpenNodeProtobuf(json)';
    }
    args = ['--infile', inputPath, '--outfile', outputPath, '--type', type];
  }
  
  return args;
}

const REPO_URL = 'https://github.com/protronic/CANopenEditor_Web';

function showAboutDialog() {
  const aboutWindow = new BrowserWindow({
    width: 480,
    height: 240,
    title: 'About CANopen Editor',
    parent: mainWindow,
    modal: true,
    resizable: false,
    center: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  aboutWindow.setMenu(null);

  // Open links in the system browser instead of a new Electron window
  aboutWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      require('electron').shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: "Segoe UI", "Noto Sans", "Liberation Sans", sans-serif; font-size: 14px; margin: 0; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; background: #f5f5f5; color: #222; }
    h1 { font-size: 18px; margin: 0 0 6px; }
    p { margin: 5px 0; }
    a { color: #4a90d9; }
    p:last-of-type { margin-bottom: 0; }
    button { margin-top: 24px; padding: 6px 28px; font-size: 14px; cursor: pointer; border: 1px solid #aaa; border-radius: 4px; background: #4a90d9; color: #fff; border-color: #3a7bc8; }
    button:hover { background: #3a7bc8; }
  </style>
</head>
<body>
  <h1>CANopen Editor Web</h1>
  <p>Version: ${app.getVersion()}</p>
  <p>Angular-based user interface for the CANopen object dictionary.</p>
  <p>Repository: <a href="${REPO_URL}" target="_blank">${REPO_URL}</a></p>
  <button type="button" onclick="window.close()">Close</button>
</body>
</html>`;
  aboutWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

app.whenReady().then(() => {
  createWindow();
  createMenu();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

ipcMain.on('get-app-version', (event) => {
  event.returnValue = app.getVersion();
});

ipcMain.handle('convert-file', async (event, { inputPath, outputPath, format, isImport }) => {
  return new Promise((resolve, reject) => {
    const converterPath = getConverterPath();
    if (!converterPath) {
      reject(new Error('Converter not available for this platform'));
      return;
    }
    if (!fs.existsSync(converterPath)) {
      reject(new Error(`Converter binary not found at: ${converterPath}`));
      return;
    }
    const args = getEdsSharpArgs(inputPath, outputPath, format, isImport);
    execFile(converterPath, args, (error, stdout, stderr) => {
      if (error) {
        console.error('Conversion error:', stderr);
        reject({ error: stderr.toString(), code: error.code, message: error.message });
      } else {
        resolve({ success: true, output: stdout.toString(), outputPath });
      }
    });
  });
});

ipcMain.handle('check-converter-available', async () => {
  const converterPath = getConverterPath();
  if (!converterPath) {
    return { available: false, reason: 'Platform not supported' };
  }
  if (!fs.existsSync(converterPath)) {
    return { available: false, reason: 'Binary not found' };
  }
  return { available: true, path: converterPath };
});

// List directory contents for custom file browser
ipcMain.handle('list-directory', async (event, dirPath, showHidden) => {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries
      .filter(entry => showHidden || !entry.name.startsWith('.'))
      .map(entry => {
        const fullPath = path.join(dirPath, entry.name);
        let size = null;
        let mtime = null;
        try {
          const stat = fs.statSync(fullPath);
          size = stat.size;
          mtime = stat.mtime.toISOString();
        } catch (e) {}
        return {
          name: entry.name,
          isDirectory: entry.isDirectory(),
          size: size,
          mtime: mtime
        };
      });
  } catch (err) {
    throw new Error(`Cannot read directory: ${err.message}`);
  }
});

// Get home directory
ipcMain.handle('get-home-directory', async () => {
  return app.getPath('home');
});

// Open path in system file manager
ipcMain.handle('open-in-file-manager', async (event, dirPath) => {
  const { shell } = require('electron');
  await shell.openPath(dirPath);
});

// Open file dialog from renderer (Angular app) - uses custom HTML browser
ipcMain.handle('open-file-dialog', async (event, options) => {
  if (!mainWindow) return null;
  const filters = getFiltersForFormat(options.format || 'xdd');
  const extensions = filters.length > 0 && filters[0].extensions ? filters[0].extensions.filter(e => e !== '*') : [];
  
  return await showCustomFileBrowser({
    title: options.title || 'Open file',
    extensions: extensions,
    startPath: app.getPath('home'),
    mode: 'open'
  });
});

// Save file dialog from renderer (Angular app) - uses custom HTML browser
ipcMain.handle('save-file-dialog', async (event, options) => {
  if (!mainWindow) return null;
  const filters = getFiltersForFormat(options.format || 'xdd');
  const extensions = filters.length > 0 && filters[0].extensions ? filters[0].extensions.filter(e => e !== '*') : [];
  const defaultExt = extensions[0] || 'xdd';
  
  return await showCustomFileBrowser({
    title: options.title || 'Save file',
    extensions: extensions,
    startPath: app.getPath('home'),
    mode: 'save',
    defaultFilename: options.defaultFilename || ('device.' + defaultExt)
  });
});

// Read file content
ipcMain.handle('read-file', async (event, filePath) => {
  return fs.readFileSync(filePath, 'utf-8');
});

// Write file content
ipcMain.handle('write-file', async (event, filePath, content) => {
  fs.writeFileSync(filePath, content, 'utf-8');
  return true;
});

// Import a dropped EDS/DCF/XDC file: convert to a temporary XDD and return its content
ipcMain.handle('import-dropped-file', async (event, { filePath, format }) => {
  const converterPath = getConverterPath();
  if (!converterPath || !fs.existsSync(converterPath)) {
    throw new Error('EDSSharp converter is not available for this platform');
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const tempDir = path.join(app.getPath('temp'), 'canopen-editor');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const tempOutputPath = path.join(tempDir, `import_${Date.now()}.xdd`);
  const args = getEdsSharpArgs(filePath, tempOutputPath, format, true);
  await new Promise((resolve, reject) => {
    execFile(converterPath, args, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.toString() || error.message));
      } else {
        resolve();
      }
    });
  });
  const content = fs.readFileSync(tempOutputPath, 'utf-8');
  try { fs.unlinkSync(tempOutputPath); } catch (e) {}
  return { content, fileName: path.basename(filePath) };
});

// Update menu state based on whether a file is open
let hasOpenFile = false;
ipcMain.on('set-file-open-state', (event, isOpen) => {
  hasOpenFile = isOpen;
  updateMenuState();
});

function updateMenuState() {
  const menu = Menu.getApplicationMenu();
  if (!menu) return;
  
  // Find File menu
  const fileMenu = menu.items.find(item => item.label === 'File');
  if (!fileMenu || !fileMenu.submenu) return;
  
  // Enable/disable Save and Save As
  const saveItem = fileMenu.submenu.items.find(item => item.id === 'menu-save');
  const saveAsItem = fileMenu.submenu.items.find(item => item.id === 'menu-save-as');
  if (saveItem) saveItem.enabled = hasOpenFile;
  if (saveAsItem) saveAsItem.enabled = hasOpenFile;
  
  const insertProfileItem = fileMenu.submenu.items.find(item => item.id === 'menu-insert-profile');
  if (insertProfileItem) insertProfileItem.enabled = hasOpenFile;
  
  // Enable/disable Export submenu items
  const exportMenu = fileMenu.submenu.items.find(item => item.label === 'Export to');
  if (!exportMenu || !exportMenu.submenu) return;
  
  exportMenu.submenu.items.forEach(item => {
    item.enabled = hasOpenFile && process.platform !== 'darwin';
  });
}
