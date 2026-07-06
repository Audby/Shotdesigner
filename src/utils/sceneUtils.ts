import { v4 as uuidv4 } from 'uuid';
import { Scene, SceneElement, ElementTemplate } from '../types';

const SCENES_STORAGE_KEY = 'shotdesigner_scenes';

export interface SceneSaveResult {
  scene: Scene;
  relativePath: string;
}

const stripSceneStorageMetadata = (scene: Scene): Scene => {
  const rest = { ...scene };
  delete rest.storageFileName;
  delete rest.storageFilePath;
  return rest;
};

const getLocalStorageScenes = (): Scene[] => {
  const data = localStorage.getItem(SCENES_STORAGE_KEY);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
};

export function createScene(name: string = 'Untitled Scene'): Scene {
  return {
    id: uuidv4(),
    name,
    elements: [],
    stageWidth: 4000,
    stageHeight: 4000,
    backgroundColor: '#1a1a2e',
    gridSize: 20,
    showGrid: true,
    gridStyle: 'lines',
    gridColor: '#ffffff',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function duplicateScene(source: Scene): Scene {
  const timestamp = new Date().toISOString();
  const clonedScene = stripSceneStorageMetadata(JSON.parse(JSON.stringify(source)) as Scene);

  return {
    ...clonedScene,
    id: uuidv4(),
    name: source.name.includes('(copy)') ? source.name : `${source.name} (copy)`,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createElementFromTemplate(
  template: ElementTemplate,
  x: number,
  y: number,
  zIndex: number
): SceneElement {
  const isTextBox = ['text-label', 'text-heading', 'text-note'].includes(template.type);
  const defaultLabelFontSize = 18;
  const defaultLabelPaddingY = 6;
  const defaultLabelHeight = Math.max(20, Math.ceil(defaultLabelFontSize * 1.2 + defaultLabelPaddingY * 2));
  return {
    id: uuidv4(),
    type: template.type,
    category: template.category,
    label: template.label,
    x,
    y,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    color: template.defaultColor,
    opacity: 1,
    locked: false,
    visible: true,
    iconPath: template.iconPath,
    width: template.width,
    height: template.height,
    zIndex,
    showLabel: false,
    labelOffsetX: 0,
    labelOffsetY: Math.max(template.width, template.height) / 2 + defaultLabelHeight / 2 + 6,
    labelWidth: 120,
    labelAutoWidth: true,
    labelFontSize: defaultLabelFontSize,
    labelTextColor: '#ffffff',
    labelBackgroundColor: '#121212',
    labelBackgroundOpacity: 0,
    labelPaddingX: 12,
    labelPaddingY: 6,
    labelCornerRadius: 10,
    labelShadowColor: '#000000',
    labelShadowOpacity: 0.35,
    showCone: template.showCone,
    coneAngle: template.coneAngle,
    coneLength: template.coneLength,
    shadowEnabled: true,
    ...(isTextBox && {
      textContent: template.type === 'text-heading' ? 'Heading' : template.type === 'text-note' ? 'Add notes here...' : 'Text',
      fontSize: template.type === 'text-heading' ? 28 : template.type === 'text-note' ? 14 : 18,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontStyle: template.type === 'text-heading' ? 'bold' : 'normal',
      textAlign: template.type === 'text-note' ? 'left' : 'center',
    }),
  };
}

export function saveSceneToLocalStorage(scene: Scene): SceneSaveResult {
  const nextScene = {
    ...scene,
    updatedAt: new Date().toISOString(),
  };

  if (window.shotDesignerFiles) {
    return window.shotDesignerFiles.saveScene(nextScene);
  }

  const cleanScene = stripSceneStorageMetadata(nextScene);
  const scenes = getLocalStorageScenes();
  const idx = scenes.findIndex((savedScene) => savedScene.id === cleanScene.id);
  if (idx >= 0) {
    scenes[idx] = cleanScene;
  } else {
    scenes.push(cleanScene);
  }
  localStorage.setItem(SCENES_STORAGE_KEY, JSON.stringify(scenes));

  return {
    scene: cleanScene,
    relativePath: 'browser local storage',
  };
}

export function getSavedScenes(): Scene[] {
  if (window.shotDesignerFiles) {
    return window.shotDesignerFiles.listScenes();
  }

  return getLocalStorageScenes();
}

export function getScenesStorageLabel(): string {
  if (window.shotDesignerFiles) {
    return window.shotDesignerFiles.getScenesDirectoryLabel();
  }

  return 'browser local storage';
}

export function deleteScene(scene: Scene): boolean {
  if (window.shotDesignerFiles) {
    return scene.storageFileName
      ? window.shotDesignerFiles.deleteScene(scene.storageFileName)
      : false;
  }

  const scenes = getLocalStorageScenes().filter((saved) => saved.id !== scene.id);
  localStorage.setItem(SCENES_STORAGE_KEY, JSON.stringify(scenes));
  return true;
}

export function exportSceneToFile(scene: Scene): void {
  const data = JSON.stringify(scene, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${scene.name.replace(/[^a-z0-9]/gi, '_')}.shotdesigner.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importSceneFromFile(): Promise<Scene> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return reject(new Error('No file selected'));
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const parsedScene = JSON.parse(ev.target?.result as string) as Scene;
          const importedScene = stripSceneStorageMetadata(parsedScene);
          importedScene.id = uuidv4();
          resolve(importedScene);
        } catch {
          reject(new Error('Invalid file format'));
        }
      };
      reader.readAsText(file);
    };
    input.click();
  });
}

export type SceneSaveAsResult =
  | { status: 'ok'; scene: Scene; relativePath: string }
  | { status: 'canceled' }
  | { status: 'error' };

/** Save the scene to a user-chosen file: native dialog in Electron, download in the browser. */
export async function saveSceneAs(scene: Scene): Promise<SceneSaveAsResult> {
  const nextScene = { ...scene, updatedAt: new Date().toISOString() };

  if (window.shotDesignerFiles?.saveSceneAs) {
    return window.shotDesignerFiles.saveSceneAs(nextScene);
  }

  exportSceneToFile(nextScene);
  return { status: 'ok', scene: nextScene, relativePath: 'your downloads folder' };
}

export type SceneBrowseResult =
  | { status: 'ok'; scene: Scene }
  | { status: 'canceled' }
  | { status: 'error' };

/** Open a scene from an arbitrary file: native dialog in Electron, file input in the browser. */
export async function browseForScene(): Promise<SceneBrowseResult> {
  if (window.shotDesignerFiles?.browseScene) {
    return window.shotDesignerFiles.browseScene();
  }

  try {
    const scene = await importSceneFromFile();
    return { status: 'ok', scene };
  } catch {
    return { status: 'error' };
  }
}

export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

export function duplicateElement(element: SceneElement): SceneElement {
  return {
    ...element,
    id: uuidv4(),
    x: element.x + 20,
    y: element.y + 20,
  };
}
