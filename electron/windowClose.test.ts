import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import path from 'node:path';

// Exercise the real main-process listener without launching another desktop window.
describe('desktop unsaved close prompt', () => {
  for (const choice of [0, 1]) it(choice ? 'allows an explicitly discarded close' : 'keeps unsaved work open by default', () => {
    const listeners = new Map<string, (event: {preventDefault: () => void}) => void>();
    const showMessageBoxSync = vi.fn(() => choice);
    class Window {
      webContents = { on: (name: string, fn: (event: {preventDefault: () => void}) => void) => listeners.set(name, fn) };
      once() {}
      loadFile() {}
      loadURL() {}
    }
    const electron = {
      BrowserWindow: Window,
      app: { setName() {}, getPath: () => '/tmp', whenReady: () => ({then: (fn: () => void) => fn()}), on() {} },
      Menu: { setApplicationMenu() {}, buildFromTemplate() {} },
      ipcMain: { handle() {} },
      dialog: { showMessageBoxSync },
    };
    runInNewContext(readFileSync(new URL('./main.cjs', import.meta.url), 'utf8'), {
      require: (id: string) => id === 'electron' ? electron : path,
      __dirname: '/tmp', process: {env: {}, argv: [], cwd: () => '/tmp', platform: 'darwin'},
    });
    const preventDefault = vi.fn();
    listeners.get('will-prevent-unload')!({preventDefault});
    expect(showMessageBoxSync).toHaveBeenCalledOnce();
    expect(showMessageBoxSync.mock.calls[0][1]).toMatchObject({defaultId:0,cancelId:0});
    expect(preventDefault).toHaveBeenCalledTimes(choice);
  });
});
