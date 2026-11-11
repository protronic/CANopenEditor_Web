const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  // Create the browser window
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

  // Load the Angular app
  // In production: load from dist folder
  // In development: load from dev server
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:4200');
    // Open dev tools in development
    mainWindow.webContents.openDevTools();
  } else {
    // Angular 19+ uses browser/ subdirectory
    mainWindow.loadFile(path.join(__dirname, '../dist/canopen-editor-web/browser/index.html'));
  }

  // Handle window closing
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Electron is ready
app.whenReady().then(createWindow);

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Re-create window on macOS when dock icon is clicked
app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Handle IPC communication if needed
ipcMain.on('get-app-version', (event) => {
  event.returnValue = app.getVersion();
});
