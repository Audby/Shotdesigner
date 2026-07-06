import type { Scene } from './types';

interface SceneFileSaveResult {
  scene: Scene;
  relativePath: string;
}

declare global {
  interface Window {
    shotDesignerFiles?: {
      listScenes: () => Scene[];
      saveScene: (scene: Scene) => SceneFileSaveResult;
      deleteScene: (storageFileName: string) => boolean;
      getScenesDirectoryLabel: () => string;
    };
  }
}

export {};
