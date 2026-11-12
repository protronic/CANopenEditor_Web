const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'electronAPI', {
    getAppVersion: () => ipcRenderer.sendSync('get-app-version'),
    convertFile: (options) => ipcRenderer.invoke('convert-file', options),
    checkConverterAvailable: () => ipcRenderer.invoke('check-converter-available'),
    onLoadConvertedFile: (callback) => ipcRenderer.on('load-converted-file', (event, data) => callback(data)),
    onExportFile: (callback) => ipcRenderer.on('export-file', (event, data) => callback(data)),
    openFileDialog: (options) => ipcRenderer.invoke('open-file-dialog', options),
    saveFileDialog: (options) => ipcRenderer.invoke('save-file-dialog', options),
    readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
    writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
    // Resolve in the renderer process: a File passed over IPC loses its disk backing,
    // so webUtils.getPathForFile must be called here, where the original File lives
    getPathForFile: (file) => {
      const { webUtils } = require('electron');
      try {
        return webUtils.getPathForFile(file);
      } catch {
        return (file && file.path) || '';
      }
    },
    importDroppedFile: (options) => ipcRenderer.invoke('import-dropped-file', options),
    setFileOpenState: (isOpen) => ipcRenderer.send('set-file-open-state', isOpen),
    onMenuAction: (callback) => ipcRenderer.on('menu-action', (event, action) => callback(action))
  }
);

contextBridge.exposeInMainWorld('process', {
  env: {
    NODE_ENV: process.env.NODE_ENV
  }
});
