import type { Scene, ShotListProject } from './types';

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

interface ShotListFileSaveResult {
  project: ShotListProject;
  relativePath: string;
}

type ShotListBrowseResult =
  | { status: 'ok'; project: ShotListProject }
  | { status: 'canceled' }
  | { status: 'error' };

type ShotListSaveAsResult =
  | { status: 'ok'; project: ShotListProject; relativePath: string }
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
      listShotLists: () => ShotListProject[];
      saveShotList: (project: ShotListProject) => ShotListFileSaveResult;
      deleteShotList: (storageFileName: string) => boolean;
      browseShotList: () => Promise<ShotListBrowseResult>;
      saveShotListAs: (project: ShotListProject) => Promise<ShotListSaveAsResult>;
      getShotListsDirectoryLabel: () => string;
    };
  }
}

export {};
