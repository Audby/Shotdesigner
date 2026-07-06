const fs = require('fs');
const path = require('path');
const { contextBridge, ipcRenderer } = require('electron');

const SCENES_KEY = 'shotdesigner_scenes';

const getArgValue = (prefix) => {
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : '';
};

const projectRootPath = getArgValue('--shotdesigner-project-root=') || process.cwd();
const userDataPath = getArgValue('--shotdesigner-user-data=');
const workspaceAppDataPath = getArgValue('--shotdesigner-workspace-appdata=');
const scenesPath = getArgValue('--shotdesigner-scenes-path=') || path.join(projectRootPath, 'scenes');

const normalizeSlashes = (value) => value.replace(/\\/g, '/');

const getScenesDirectoryLabel = () => {
  const relativePath = path.relative(projectRootPath, scenesPath) || path.basename(scenesPath);
  const normalized = normalizeSlashes(relativePath);
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
};

const ensureScenesDirectory = () => {
  fs.mkdirSync(scenesPath, { recursive: true });
};

const tryParseScenes = (value) => {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const sanitizeSceneName = (name) => {
  const trimmed = (name || 'Untitled Scene').trim();
  return trimmed
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, '-')
    .replace(/\.+$/g, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'untitled-scene';
};

const buildSceneFileName = (scene) => {
  const slug = sanitizeSceneName(scene.name);
  const idSuffix = (scene.id || 'scene').slice(0, 8);
  return `${slug}__${idSuffix}.shotdesigner.json`;
};

const readSceneFile = (filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object' || !parsed.id) return null;

    return {
      ...parsed,
      storageFileName: path.basename(filePath),
    };
  } catch {
    return null;
  }
};

const sortScenes = (scenes) => {
  return scenes.sort((a, b) => {
    const aTime = Date.parse(a.updatedAt || a.createdAt || 0);
    const bTime = Date.parse(b.updatedAt || b.createdAt || 0);
    return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
  });
};

const listSceneFiles = () => {
  ensureScenesDirectory();

  const scenes = fs.readdirSync(scenesPath)
    .filter((fileName) => fileName.endsWith('.shotdesigner.json'))
    .map((fileName) => readSceneFile(path.join(scenesPath, fileName)))
    .filter(Boolean);

  return sortScenes(scenes);
};

const saveSceneFile = (scene) => {
  ensureScenesDirectory();

  const nextFileName = buildSceneFileName(scene);
  const nextScene = {
    ...scene,
    storageFileName: nextFileName,
  };

  const nextFilePath = path.join(scenesPath, nextFileName);
  fs.writeFileSync(nextFilePath, JSON.stringify(nextScene, null, 2), 'utf8');

  if (scene.storageFileName && scene.storageFileName !== nextFileName) {
    const previousFilePath = path.join(scenesPath, scene.storageFileName);
    if (fs.existsSync(previousFilePath)) {
      try {
        fs.unlinkSync(previousFilePath);
      } catch {
        // Ignore stale file cleanup failures.
      }
    }
  }

  return {
    scene: nextScene,
    relativePath: `${getScenesDirectoryLabel()}${nextFileName}`,
  };
};

const extractJsonArray = (text, startIndex) => {
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startIndex; i < text.length; i += 1) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '[') {
      depth += 1;
    } else if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(startIndex, i + 1);
      }
    }
  }

  return '';
};

const extractScenesFromText = (text) => {
  const scenes = [];
  let searchIndex = 0;

  while (searchIndex < text.length) {
    const keyIndex = text.indexOf(SCENES_KEY, searchIndex);
    if (keyIndex === -1) break;

    const arrayStart = text.indexOf('[', keyIndex);
    if (arrayStart === -1) break;

    const jsonArray = extractJsonArray(text, arrayStart);
    if (jsonArray) {
      scenes.push(...tryParseScenes(jsonArray));
      searchIndex = arrayStart + jsonArray.length;
    } else {
      searchIndex = keyIndex + SCENES_KEY.length;
    }
  }

  return scenes;
};

const getLevelDbScenes = (basePath) => {
  if (!basePath) return [];

  const levelDbPath = path.join(basePath, 'Local Storage', 'leveldb');
  if (!fs.existsSync(levelDbPath)) return [];

  const scenes = [];
  const files = fs.readdirSync(levelDbPath)
    .filter((fileName) => /\.(log|ldb|sst)$/i.test(fileName))
    .map((fileName) => {
      const filePath = path.join(levelDbPath, fileName);
      return {
        filePath,
        modified: fs.statSync(filePath).mtimeMs,
      };
    })
    .sort((a, b) => a.modified - b.modified);

  for (const file of files) {
    try {
      const content = fs.readFileSync(file.filePath).toString('latin1');
      scenes.push(...extractScenesFromText(content));
    } catch {
      // Ignore unreadable leveldb fragments.
    }
  }

  return scenes;
};

const mergeScenes = (...sceneCollections) => {
  const byId = new Map();

  for (const collection of sceneCollections) {
    for (const scene of collection) {
      if (!scene || typeof scene !== 'object' || !scene.id) continue;

      const existing = byId.get(scene.id);
      if (!existing) {
        byId.set(scene.id, scene);
        continue;
      }

      const existingUpdatedAt = Date.parse(existing.updatedAt || existing.createdAt || 0);
      const nextUpdatedAt = Date.parse(scene.updatedAt || scene.createdAt || 0);
      if (Number.isNaN(existingUpdatedAt) || nextUpdatedAt >= existingUpdatedAt) {
        byId.set(scene.id, scene);
      }
    }
  }

  return sortScenes(Array.from(byId.values()));
};

// The legacy localStorage/LevelDB import is expensive and can resurrect
// scenes the user deleted, so it runs at most once: a marker file records
// that the one-time import already happened.
const MIGRATION_MARKER = '.legacy-import-done';
let migrationChecked = false;

const migrateLegacyScenesToFiles = () => {
  if (migrationChecked) return;
  migrationChecked = true;

  try {
    ensureScenesDirectory();
    const markerPath = path.join(scenesPath, MIGRATION_MARKER);
    if (fs.existsSync(markerPath)) return;

    const existingScenes = listSceneFiles();
    const runtimeScenes = globalThis.localStorage
      ? tryParseScenes(globalThis.localStorage.getItem(SCENES_KEY))
      : [];
    const userDataScenes = getLevelDbScenes(userDataPath);
    const workspaceScenes = getLevelDbScenes(workspaceAppDataPath);
    const mergedScenes = mergeScenes(existingScenes, runtimeScenes, userDataScenes, workspaceScenes);
    const existingIds = new Set(existingScenes.map((scene) => scene.id));

    for (const scene of mergedScenes) {
      if (existingIds.has(scene.id)) continue;
      saveSceneFile(scene);
    }

    fs.writeFileSync(markerPath, new Date().toISOString(), 'utf8');
  } catch {
    // Ignore migration failures and let the app continue normally.
  }
};

const deleteSceneFile = (storageFileName) => {
  if (typeof storageFileName !== 'string' || !storageFileName.endsWith('.shotdesigner.json')) {
    return false;
  }

  const filePath = path.join(scenesPath, path.basename(storageFileName));
  if (!fs.existsSync(filePath)) return false;

  try {
    fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
};

contextBridge.exposeInMainWorld('shotDesignerFiles', {
  listScenes: () => {
    migrateLegacyScenesToFiles();
    return listSceneFiles();
  },
  saveScene: (scene) => {
    migrateLegacyScenesToFiles();
    return saveSceneFile(scene);
  },
  deleteScene: (storageFileName) => deleteSceneFile(storageFileName),
  browseScene: async () => {
    const filePath = await ipcRenderer.invoke('shotdesigner:browse-scene');
    if (!filePath) return { status: 'canceled' };

    const scene = readSceneFile(filePath);
    if (!scene) return { status: 'error' };

    // Only keep the storage link when the file lives in the scenes folder;
    // files opened from elsewhere are saved as a new copy in scenes/.
    const inScenesDir = path.resolve(path.dirname(filePath)) === path.resolve(scenesPath);
    if (!inScenesDir) {
      delete scene.storageFileName;
    }
    return { status: 'ok', scene };
  },
  getScenesDirectoryLabel: () => getScenesDirectoryLabel(),
});
