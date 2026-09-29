const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development' && !process.argv.includes('--shotdesigner-desktop');

const workspaceArgument = process.argv.find((argument) => argument.startsWith('--shotdesigner-workspace='));
const projectRootPath = workspaceArgument
  ? path.resolve(workspaceArgument.slice('--shotdesigner-workspace='.length))
  : process.cwd();
app.setName('Shot Designer');
const workspaceAppDataPath = path.join(projectRootPath, 'appdata');
const scenesPath = path.join(projectRootPath, 'scenes');
const shotListsPath = path.join(projectRootPath, 'shotlists');

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

ipcMain.handle('shotdesigner:browse-shotlist', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: 'Open Shot List',
    defaultPath: shotListsPath,
    filters: [
      { name: 'Shot Designer Shot List', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('shotdesigner:save-shotlist-as', async (event, suggestedName) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(win, {
    title: 'Save Shot List As',
    defaultPath: path.join(shotListsPath, suggestedName || 'shot-list.shotdesigner-shotlist.json'),
    filters: [{ name: 'Shot Designer Shot List', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return null;

  let filePath = result.filePath;
  if (!filePath.endsWith('.shotdesigner-shotlist.json')) {
    filePath = filePath
      .replace(/\.shotdesigner-shotlist$/i, '')
      .replace(/\.json$/i, '') + '.shotdesigner-shotlist.json';
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
    backgroundColor: '#19211f',
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
        `--shotdesigner-shotlists-path=${shotListsPath}`,
      ],
    },
    show: false,
  });

  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      { role: 'windowMenu' },
    ]));
  } else {
    Menu.setApplicationMenu(null);
  }

  // Electron silently cancels renderer beforeunload unless we provide a native choice.
  win.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Keep editing', 'Discard changes and close'],
      defaultId: 0,
      cancelId: 0,
      title: 'Unsaved changes',
      message: 'Close Shot Designer without saving?',
      detail: 'Your scene or shot list has unsaved changes. Choose Keep editing to save them first.',
      noLink: true,
    });
    if (choice === 1) event.preventDefault();
  });

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
