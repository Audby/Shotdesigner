const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development';

const projectRootPath = process.cwd();
const workspaceAppDataPath = path.join(projectRootPath, 'appdata');
const scenesPath = path.join(projectRootPath, 'scenes');

// Native "Open Scene" file picker, invoked from the renderer via preload.
ipcMain.handle('shotdesigner:browse-scene', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: 'Open Scene',
    defaultPath: scenesPath,
    filters: [
      { name: 'Shot Designer Scene', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// Native "Save Scene As" picker. Normalizes the extension so files saved
// into the scenes folder are picked up by the scene list.
ipcMain.handle('shotdesigner:save-scene-as', async (event, suggestedName) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(win, {
    title: 'Save Scene As',
    defaultPath: path.join(scenesPath, suggestedName || 'scene.shotdesigner.json'),
    filters: [
      { name: 'Shot Designer Scene', extensions: ['json'] },
    ],
  });
  if (result.canceled || !result.filePath) return null;

  let filePath = result.filePath;
  if (!filePath.endsWith('.shotdesigner.json')) {
    filePath = filePath.replace(/\.shotdesigner$/i, '').replace(/\.json$/i, '') + '.shotdesigner.json';
  }
  return filePath;
});

function createWindow() {
  const userDataPath = app.getPath('userData');
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'Shot Designer',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#0f0f17',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.cjs'),
      additionalArguments: [
        `--shotdesigner-project-root=${projectRootPath}`,
        `--shotdesigner-user-data=${userDataPath}`,
        `--shotdesigner-workspace-appdata=${workspaceAppDataPath}`,
        `--shotdesigner-scenes-path=${scenesPath}`,
      ],
    },
    show: false,
  });

  Menu.setApplicationMenu(null);

  win.once('ready-to-show', () => {
    win.show();
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
