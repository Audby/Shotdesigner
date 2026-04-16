import { v4 as uuidv4 } from 'uuid';
import { Scene, SceneElement, ElementTemplate } from '../types';

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

export function createElementFromTemplate(
  template: ElementTemplate,
  x: number,
  y: number,
  zIndex: number
): SceneElement {
  const isTextBox = ['text-label', 'text-heading', 'text-note'].includes(template.type);
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
    labelOffsetY: Math.max(template.width, template.height) / 2 + 6,
    showCone: template.showCone,
    coneAngle: template.coneAngle,
    coneLength: template.coneLength,
    ...(isTextBox && {
      textContent: template.type === 'text-heading' ? 'Heading' : template.type === 'text-note' ? 'Add notes here...' : 'Text',
      fontSize: template.type === 'text-heading' ? 28 : template.type === 'text-note' ? 14 : 18,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontStyle: template.type === 'text-heading' ? 'bold' : 'normal',
      textAlign: template.type === 'text-note' ? 'left' : 'center',
    }),
  };
}

export function saveSceneToLocalStorage(scene: Scene): void {
  const scenes = getSavedScenes();
  const idx = scenes.findIndex((s) => s.id === scene.id);
  scene.updatedAt = new Date().toISOString();
  if (idx >= 0) {
    scenes[idx] = scene;
  } else {
    scenes.push(scene);
  }
  localStorage.setItem('shotdesigner_scenes', JSON.stringify(scenes));
}

export function getSavedScenes(): Scene[] {
  const data = localStorage.getItem('shotdesigner_scenes');
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export function deleteSceneFromLocalStorage(id: string): void {
  const scenes = getSavedScenes().filter((s) => s.id !== id);
  localStorage.setItem('shotdesigner_scenes', JSON.stringify(scenes));
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
          const scene = JSON.parse(ev.target?.result as string) as Scene;
          scene.id = uuidv4();
          resolve(scene);
        } catch {
          reject(new Error('Invalid file format'));
        }
      };
      reader.readAsText(file);
    };
    input.click();
  });
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
    label: `${element.label} (copy)`,
  };
}
