const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'electronAPI', {
    getAppVersion: () => ipcRenderer.sendSync('get-app-version'),
    // Add more API methods here as needed
    // For example, to access Node.js APIs safely:
    // readFile: (path) => ipcRenderer.invoke('read-file', path)
  }
);

// Also expose process.env.NODE_ENV for Angular
contextBridge.exposeInMainWorld('process', {
  env: {
    NODE_ENV: process.env.NODE_ENV
  }
});
