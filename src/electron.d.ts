import type { Scene } from './types';

interface SceneFileSaveResult {
  scene: Scene;
  relativePath: string;
}

type SceneBrowseResult =
  | { status: 'ok'; scene: Scene }
  | { status: 'canceled' }
  | { status: 'error' };

type SceneSaveAsResult =
  | { status: 'ok'; scene: Scene; relativePath: string }
  | { status: 'canceled' }
  | { status: 'error' };

declare global {
  interface Window {
    shotDesignerFiles?: {
      listScenes: () => Scene[];
      saveScene: (scene: Scene) => SceneFileSaveResult;
      deleteScene: (storageFileName: string) => boolean;
      browseScene: () => Promise<SceneBrowseResult>;
      saveSceneAs: (scene: Scene) => Promise<SceneSaveAsResult>;
      getScenesDirectoryLabel: () => string;
    };
  }
}

export {};
