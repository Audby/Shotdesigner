import { v4 as uuidv4 } from 'uuid';
import type {
  Shot,
  ShotListGlossaryEntry,
  ShotListProject,
  ShotListScene,
  ShotListSubject,
  ShotStatus,
} from '../types';

const SHOT_LISTS_STORAGE_KEY = 'shotdesigner_shotlists';
const SHOT_STATUSES: ShotStatus[] = ['planned', 'ready', 'shot', 'cut'];

export interface ShotListSaveResult {
  project: ShotListProject;
  relativePath: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const asStatus = (value: unknown): ShotStatus =>
  typeof value === 'string' && SHOT_STATUSES.includes(value as ShotStatus)
    ? (value as ShotStatus)
    : 'planned';

export function createShot(number = ''): Shot {
  return {
    id: uuidv4(),
    number,
    description: '',
    subjects: '',
    framing: '',
    angle: '',
    movement: '',
    equipment: '',
    cameraLens: '',
    setup: '',
    status: 'planned',
    notes: '',
  };
}

export function createShotListScene(number = '1', title = 'Untitled Scene'): ShotListScene {
  return {
    id: uuidv4(),
    number,
    title,
    shots: [],
  };
}

export function createShotListProject(name = 'Untitled Shot List'): ShotListProject {
  const timestamp = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: uuidv4(),
    name,
    scenes: [createShotListScene()],
    glossary: [],
    subjects: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const normalizeShot = (value: unknown): Shot => {
  const source = isRecord(value) ? value : {};
  return {
    id: asString(source.id) || uuidv4(),
    number: asString(source.number),
    description: asString(source.description),
    subjects: asString(source.subjects),
    framing: asString(source.framing),
    angle: asString(source.angle),
    movement: asString(source.movement),
    equipment: asString(source.equipment),
    cameraLens: asString(source.cameraLens),
    setup: asString(source.setup),
    status: asStatus(source.status),
    notes: asString(source.notes),
    ...(asString(source.linkedSceneId) ? { linkedSceneId: asString(source.linkedSceneId) } : {}),
  };
};

const normalizeScene = (value: unknown, index: number): ShotListScene => {
  const source = isRecord(value) ? value : {};
  return {
    id: asString(source.id) || uuidv4(),
    number: asString(source.number, String(index + 1)),
    title: asString(source.title, 'Untitled Scene'),
    shots: Array.isArray(source.shots) ? source.shots.map(normalizeShot) : [],
  };
};

const normalizeGlossaryEntry = (value: unknown): ShotListGlossaryEntry | null => {
  const source = isRecord(value) ? value : {};
  const term = asString(source.term).trim();
  const description = asString(source.description).trim();
  if (!term && !description) return null;
  return {
    id: asString(source.id) || uuidv4(),
    category: asString(source.category, 'Other'),
    term,
    description,
  };
};

const normalizeSubject = (value: unknown): ShotListSubject | null => {
  const source = isRecord(value) ? value : {};
  const name = asString(source.name).trim();
  if (!name) return null;
  return {
    id: asString(source.id) || uuidv4(),
    name,
  };
};

export function normalizeShotListProject(value: unknown): ShotListProject {
  const source = isRecord(value) ? value : {};
  const timestamp = new Date().toISOString();
  const scenes = Array.isArray(source.scenes)
    ? source.scenes.map(normalizeScene)
    : [createShotListScene()];
  const glossary = Array.isArray(source.glossary)
    ? source.glossary.map(normalizeGlossaryEntry).filter((entry): entry is ShotListGlossaryEntry => Boolean(entry))
    : [];
  const explicitSubjects = Array.isArray(source.subjects)
    ? source.subjects.map(normalizeSubject).filter((subject): subject is ShotListSubject => Boolean(subject))
    : [];
  const subjectNames = new Set(explicitSubjects.map((subject) => subject.name.toLocaleLowerCase()));
  const derivedSubjects = scenes
    .flatMap((scene) => scene.shots)
    .flatMap((shot) => shot.subjects.split(','))
    .map((name) => name.trim())
    .filter((name) => {
      const key = name.toLocaleLowerCase();
      if (!name || subjectNames.has(key)) return false;
      subjectNames.add(key);
      return true;
    })
    .map((name) => ({ id: uuidv4(), name }));

  return {
    schemaVersion: 1,
    id: asString(source.id) || uuidv4(),
    name: asString(source.name, 'Untitled Shot List'),
    scenes: scenes.length > 0 ? scenes : [createShotListScene()],
    glossary,
    subjects: [...explicitSubjects, ...derivedSubjects],
    ...(asString(source.storageFileName) ? { storageFileName: asString(source.storageFileName) } : {}),
    ...(asString(source.storageFilePath) ? { storageFilePath: asString(source.storageFilePath) } : {}),
    createdAt: asString(source.createdAt, timestamp),
    updatedAt: asString(source.updatedAt, timestamp),
  };
}

export function stripShotListStorageMetadata(project: ShotListProject): ShotListProject {
  const cleanProject = { ...project };
  delete cleanProject.storageFileName;
  delete cleanProject.storageFilePath;
  return cleanProject;
}

export function makeShotListSnapshot(project: ShotListProject): string {
  const cleanProject = stripShotListStorageMetadata(project);
  const content = { ...cleanProject } as Partial<ShotListProject>;
  delete content.updatedAt;
  return JSON.stringify(content);
}

const getLocalStorageShotLists = (): ShotListProject[] => {
  const data = localStorage.getItem(SHOT_LISTS_STORAGE_KEY);
  if (!data) return [];
  try {
    const parsed = JSON.parse(data) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeShotListProject);
  } catch {
    return [];
  }
};

export function saveShotListProject(project: ShotListProject): ShotListSaveResult {
  const nextProject = normalizeShotListProject({
    ...project,
    updatedAt: new Date().toISOString(),
  });

  if (window.shotDesignerFiles?.saveShotList) {
    return window.shotDesignerFiles.saveShotList(nextProject);
  }

  const cleanProject = stripShotListStorageMetadata(nextProject);
  const projects = getLocalStorageShotLists();
  const index = projects.findIndex((saved) => saved.id === cleanProject.id);
  if (index >= 0) projects[index] = cleanProject;
  else projects.push(cleanProject);
  localStorage.setItem(SHOT_LISTS_STORAGE_KEY, JSON.stringify(projects));

  return {
    project: cleanProject,
    relativePath: 'browser local storage',
  };
}

export function getSavedShotLists(): ShotListProject[] {
  if (window.shotDesignerFiles?.listShotLists) {
    return window.shotDesignerFiles.listShotLists().map(normalizeShotListProject);
  }
  return getLocalStorageShotLists();
}

export function getShotListsStorageLabel(): string {
  return window.shotDesignerFiles?.getShotListsDirectoryLabel?.() ?? 'browser local storage';
}

export function deleteShotListProject(project: ShotListProject): boolean {
  if (window.shotDesignerFiles?.deleteShotList) {
    return project.storageFileName
      ? window.shotDesignerFiles.deleteShotList(project.storageFileName)
      : false;
  }

  const projects = getLocalStorageShotLists().filter((saved) => saved.id !== project.id);
  localStorage.setItem(SHOT_LISTS_STORAGE_KEY, JSON.stringify(projects));
  return true;
}

export function exportShotListProject(project: ShotListProject): void {
  const data = JSON.stringify(stripShotListStorageMetadata(project), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${project.name.replace(/[^a-z0-9]/gi, '_')}.shotdesigner-shotlist.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export type ShotListBrowseResult =
  | { status: 'ok'; project: ShotListProject }
  | { status: 'canceled' }
  | { status: 'error' };

export type ShotListSaveAsResult =
  | { status: 'ok'; project: ShotListProject; relativePath: string }
  | { status: 'canceled' }
  | { status: 'error' };

const chooseShotListFile = (): Promise<ShotListBrowseResult> =>
  new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.shotdesigner-shotlist.json,.json';
    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) {
        resolve({ status: 'canceled' });
        return;
      }
      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        try {
          const parsed = JSON.parse(loadEvent.target?.result as string) as unknown;
          resolve({ status: 'ok', project: stripShotListStorageMetadata(normalizeShotListProject(parsed)) });
        } catch {
          resolve({ status: 'error' });
        }
      };
      reader.onerror = () => resolve({ status: 'error' });
      reader.readAsText(file);
    };
    input.click();
  });

export async function browseForShotList(): Promise<ShotListBrowseResult> {
  if (window.shotDesignerFiles?.browseShotList) {
    const result = await window.shotDesignerFiles.browseShotList();
    return result.status === 'ok'
      ? { status: 'ok', project: normalizeShotListProject(result.project) }
      : result;
  }
  return chooseShotListFile();
}

export async function saveShotListAs(project: ShotListProject): Promise<ShotListSaveAsResult> {
  const nextProject = normalizeShotListProject({
    ...project,
    updatedAt: new Date().toISOString(),
  });
  if (window.shotDesignerFiles?.saveShotListAs) {
    return window.shotDesignerFiles.saveShotListAs(nextProject);
  }
  exportShotListProject(nextProject);
  return { status: 'ok', project: nextProject, relativePath: 'your downloads folder' };
}
