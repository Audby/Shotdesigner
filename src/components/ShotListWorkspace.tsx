import { useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type {
  Scene,
  Shot,
  ShotListProject,
  ShotListScene,
  ShotListSubject,
  ShotStatus,
} from '../types';
import {
  createShot,
  createShotListScene,
  deleteShotListProject,
  getSavedShotLists,
} from '../utils/shotListUtils';

interface Props {
  project: ShotListProject;
  isDirty: boolean;
  uiScale: number;
  selectedSceneId: string;
  selectedShotId: string | null;
  savedScenes: Scene[];
  storageLabel: string;
  onProjectChange: (project: ShotListProject) => void;
  onSelectScene: (sceneId: string) => void;
  onSelectShot: (shotId: string | null) => void;
  onNew: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onLoad: (project: ShotListProject) => void;
  onBrowse: () => void;
  onImportCsv: () => void;
  onExportCsv: () => void;
  onExportJson: () => void;
  onCreateCanvas: (sceneId: string, shotId: string) => void;
  onOpenCanvas: (sceneId: string, shotId: string) => void;
  onLinkCanvas: (sceneId: string, shotId: string, linkedSceneId?: string) => void;
}

const SHOT_STATUSES: Array<{ value: ShotStatus; label: string }> = [
  { value: 'planned', label: 'Planned' },
  { value: 'ready', label: 'Ready' },
  { value: 'shot', label: 'Shot' },
  { value: 'cut', label: 'Cut' },
];

type ShotColumnKey =
  | 'number'
  | 'description'
  | 'subjects'
  | 'framing'
  | 'movement'
  | 'setup'
  | 'status'
  | 'canvas';

const COLUMN_DEFAULTS: Record<ShotColumnKey, number> = {
  number: 72,
  description: 300,
  subjects: 150,
  framing: 110,
  movement: 140,
  setup: 100,
  status: 105,
  canvas: 165,
};

const COLUMN_MINIMUMS: Record<ShotColumnKey, number> = {
  number: 56,
  description: 160,
  subjects: 90,
  framing: 76,
  movement: 90,
  setup: 72,
  status: 88,
  canvas: 125,
};

const COLUMN_DEFINITIONS: Array<{ key: ShotColumnKey; label: string }> = [
  { key: 'number', label: 'Shot' },
  { key: 'description', label: 'Description' },
  { key: 'subjects', label: 'Subjects' },
  { key: 'framing', label: 'Frame' },
  { key: 'movement', label: 'Movement' },
  { key: 'setup', label: 'Setup' },
  { key: 'status', label: 'Status' },
  { key: 'canvas', label: 'Canvas' },
];

const wrappedRowCount = (value: string, width: number): number => {
  const charactersPerLine = Math.max(18, Math.floor((width - 18) / 6.4));
  const rows = value.split('\n').reduce(
    (total, line) => total + Math.max(1, Math.ceil(line.length / charactersPerLine)),
    0,
  );
  return Math.max(1, Math.min(6, rows));
};

const parseSubjectNames = (value: string): string[] =>
  value.split(',').map((name) => name.trim()).filter(Boolean);

interface SubjectPickerProps {
  value: string;
  subjects: ShotListSubject[];
  onChange: (value: string) => void;
}

const SubjectPicker: React.FC<SubjectPickerProps> = ({ value, subjects, onChange }) => {
  const selectedNames = parseSubjectNames(value);
  const selectedKeys = new Set(selectedNames.map((name) => name.toLocaleLowerCase()));
  const availableSubjects = subjects.filter(
    (subject) => !selectedKeys.has(subject.name.toLocaleLowerCase()),
  );

  return (
    <div className="shot-subject-picker" onClick={(event) => event.stopPropagation()}>
      <div className="shot-subject-selections">
        {selectedNames.map((name) => (
          <button
            key={name.toLocaleLowerCase()}
            type="button"
            className="shot-subject-chip"
            onClick={() => onChange(
              selectedNames.filter((selected) => selected !== name).join(', '),
            )}
            title={`Remove ${name}`}
          >
            {name}<span>×</span>
          </button>
        ))}
      </div>
      <select
        value=""
        onChange={(event) => {
          const name = event.target.value;
          if (name) onChange([...selectedNames, name].join(', '));
        }}
        aria-label="Add subject"
      >
        <option value="">
          {subjects.length === 0 ? 'Define subjects…' : selectedNames.length === 0 ? 'Select subjects…' : '+ Add'}
        </option>
        {availableSubjects.map((subject) => (
          <option key={subject.id} value={subject.name}>{subject.name}</option>
        ))}
      </select>
    </div>
  );
};

const nextShotNumber = (scene: ShotListScene): string => {
  const index = scene.shots.length;
  const suffix = index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
  return `${scene.number}${suffix}`;
};

const moveItem = <T,>(items: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

const ShotListWorkspace: React.FC<Props> = ({
  project,
  isDirty,
  uiScale,
  selectedSceneId,
  selectedShotId,
  savedScenes,
  storageLabel,
  onProjectChange,
  onSelectScene,
  onSelectShot,
  onNew,
  onSave,
  onSaveAs,
  onLoad,
  onBrowse,
  onImportCsv,
  onExportCsv,
  onExportJson,
  onCreateCanvas,
  onOpenCanvas,
  onLinkCanvas,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ShotStatus>('all');
  const [showGlossary, setShowGlossary] = useState(false);
  const [showSubjects, setShowSubjects] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [savedProjects, setSavedProjects] = useState<ShotListProject[]>([]);
  const [scenePanelWidth, setScenePanelWidth] = useState(() => {
    const saved = localStorage.getItem('shotdesigner_shotlist_scenew');
    return saved ? parseInt(saved) : 220;
  });
  const [inspectorWidth, setInspectorWidth] = useState(() => {
    const saved = localStorage.getItem('shotdesigner_shotlist_inspectorw');
    return saved ? parseInt(saved) : 300;
  });
  const [columnWidths, setColumnWidths] = useState<Record<ShotColumnKey, number>>(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem('shotdesigner_shotlist_columns') ?? '{}',
      ) as Partial<Record<ShotColumnKey, number>>;
      return Object.fromEntries(
        (Object.keys(COLUMN_DEFAULTS) as ShotColumnKey[]).map((key) => [
          key,
          Number.isFinite(saved[key]) ? Math.max(COLUMN_MINIMUMS[key], saved[key] as number) : COLUMN_DEFAULTS[key],
        ]),
      ) as Record<ShotColumnKey, number>;
    } catch {
      return { ...COLUMN_DEFAULTS };
    }
  });
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!showProjectMenu) return;
    const closeMenu = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowProjectMenu(false);
      }
    };
    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, [showProjectMenu]);

  useEffect(() => {
    localStorage.setItem('shotdesigner_shotlist_scenew', String(scenePanelWidth));
  }, [scenePanelWidth]);

  useEffect(() => {
    localStorage.setItem('shotdesigner_shotlist_inspectorw', String(inspectorWidth));
  }, [inspectorWidth]);

  useEffect(() => {
    localStorage.setItem('shotdesigner_shotlist_columns', JSON.stringify(columnWidths));
  }, [columnWidths]);

  const activeScene = project.scenes.find((scene) => scene.id === selectedSceneId) ?? project.scenes[0];
  const selectedShot = activeScene?.shots.find((shot) => shot.id === selectedShotId) ?? null;
  const savedSceneById = useMemo(
    () => new Map(savedScenes.map((scene) => [scene.id, scene])),
    [savedScenes],
  );

  const filteredShots = useMemo(() => {
    if (!activeScene) return [];
    const query = search.trim().toLowerCase();
    return activeScene.shots.filter((shot) => {
      const matchesStatus = statusFilter === 'all' || shot.status === statusFilter;
      const matchesSearch = !query || [
        shot.number,
        shot.description,
        shot.subjects,
        shot.framing,
        shot.angle,
        shot.movement,
        shot.equipment,
        shot.cameraLens,
        shot.setup,
      ].some((value) => value.toLowerCase().includes(query));
      return matchesStatus && matchesSearch;
    });
  }, [activeScene, search, statusFilter]);

  const updateProject = (updates: Partial<ShotListProject>) => {
    onProjectChange({ ...project, ...updates });
  };

  const updateScene = (sceneId: string, updates: Partial<ShotListScene>) => {
    updateProject({
      scenes: project.scenes.map((scene) => scene.id === sceneId ? { ...scene, ...updates } : scene),
    });
  };

  const updateShot = (sceneId: string, shotId: string, updates: Partial<Shot>) => {
    updateProject({
      scenes: project.scenes.map((scene) => scene.id === sceneId
        ? { ...scene, shots: scene.shots.map((shot) => shot.id === shotId ? { ...shot, ...updates } : shot) }
        : scene),
    });
  };

  const addSubject = () => {
    const name = newSubjectName.trim();
    if (!name || project.subjects.some((subject) => subject.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      return;
    }
    updateProject({
      subjects: [...project.subjects, { id: uuidv4(), name }],
    });
    setNewSubjectName('');
  };

  const renameSubject = (subjectId: string, nextValue: string): boolean => {
    const subject = project.subjects.find((item) => item.id === subjectId);
    const name = nextValue.trim();
    if (!subject || !name) return false;
    if (project.subjects.some(
      (item) => item.id !== subjectId && item.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    )) return false;

    const replaceName = (value: string) => parseSubjectNames(value)
      .map((selectedName) => selectedName.toLocaleLowerCase() === subject.name.toLocaleLowerCase()
        ? name
        : selectedName)
      .join(', ');
    onProjectChange({
      ...project,
      subjects: project.subjects.map((item) => item.id === subjectId ? { ...item, name } : item),
      scenes: project.scenes.map((scene) => ({
        ...scene,
        shots: scene.shots.map((shot) => ({ ...shot, subjects: replaceName(shot.subjects) })),
      })),
    });
    return true;
  };

  const removeSubject = (subject: ShotListSubject) => {
    if (!window.confirm(`Delete subject "${subject.name}" and remove it from all shots?`)) return;
    const removeName = (value: string) => parseSubjectNames(value)
      .filter((selectedName) => selectedName.toLocaleLowerCase() !== subject.name.toLocaleLowerCase())
      .join(', ');
    onProjectChange({
      ...project,
      subjects: project.subjects.filter((item) => item.id !== subject.id),
      scenes: project.scenes.map((scene) => ({
        ...scene,
        shots: scene.shots.map((shot) => ({ ...shot, subjects: removeName(shot.subjects) })),
      })),
    });
  };

  const addScene = () => {
    const scene = createShotListScene(String(project.scenes.length + 1), 'Untitled Scene');
    updateProject({ scenes: [...project.scenes, scene] });
    onSelectScene(scene.id);
    onSelectShot(null);
  };

  const deleteScene = (sceneId: string) => {
    const scene = project.scenes.find((item) => item.id === sceneId);
    if (!scene || !window.confirm(`Delete scene "${scene.number} • ${scene.title}" and all its shots?`)) return;
    const scenes = project.scenes.filter((item) => item.id !== sceneId);
    const nextScenes = scenes.length > 0 ? scenes : [createShotListScene()];
    updateProject({ scenes: nextScenes });
    onSelectScene(nextScenes[0].id);
    onSelectShot(null);
  };

  const moveScene = (sceneId: string, direction: -1 | 1) => {
    const index = project.scenes.findIndex((scene) => scene.id === sceneId);
    updateProject({ scenes: moveItem(project.scenes, index, index + direction) });
  };

  const addShot = () => {
    if (!activeScene) return;
    const shot = createShot(nextShotNumber(activeScene));
    updateScene(activeScene.id, { shots: [...activeScene.shots, shot] });
    onSelectShot(shot.id);
  };

  const duplicateShot = (shot: Shot) => {
    if (!activeScene) return;
    const duplicate = { ...shot, id: uuidv4(), number: `${shot.number} copy` };
    const index = activeScene.shots.findIndex((item) => item.id === shot.id);
    const shots = [...activeScene.shots];
    shots.splice(index + 1, 0, duplicate);
    updateScene(activeScene.id, { shots });
    onSelectShot(duplicate.id);
  };

  const deleteShot = (shot: Shot) => {
    if (!activeScene || !window.confirm(`Delete shot "${shot.number}"?`)) return;
    updateScene(activeScene.id, { shots: activeScene.shots.filter((item) => item.id !== shot.id) });
    if (selectedShotId === shot.id) onSelectShot(null);
  };

  const moveShot = (shotId: string, direction: -1 | 1) => {
    if (!activeScene) return;
    const index = activeScene.shots.findIndex((shot) => shot.id === shotId);
    updateScene(activeScene.id, { shots: moveItem(activeScene.shots, index, index + direction) });
  };

  const toggleProjectMenu = () => {
    setShowProjectMenu((open) => {
      if (!open) setSavedProjects(getSavedShotLists());
      return !open;
    });
  };

  const removeSavedProject = (
    event: { stopPropagation: () => void },
    savedProject: ShotListProject,
  ) => {
    event.stopPropagation();
    if (!window.confirm(`Delete shot list "${savedProject.name}"? This cannot be undone.`)) return;
    if (deleteShotListProject(savedProject)) setSavedProjects(getSavedShotLists());
  };

  const glossaryByCategory = useMemo(() => {
    const groups = new Map<string, ShotListProject['glossary']>();
    project.glossary.forEach((entry) => {
      groups.set(entry.category, [...(groups.get(entry.category) ?? []), entry]);
    });
    return Array.from(groups.entries());
  }, [project.glossary]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing = target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || Boolean(target?.isContentEditable);
      if (isEditing) return;

      const modifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (key === '/' && !modifier) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (event.key === '?') {
        event.preventDefault();
        setShowShortcuts((visible) => !visible);
        return;
      }
      if (key === 'n' && !modifier) {
        event.preventDefault();
        if (event.shiftKey) {
          const scene = createShotListScene(String(project.scenes.length + 1), 'Untitled Scene');
          onProjectChange({ ...project, scenes: [...project.scenes, scene] });
          onSelectScene(scene.id);
          onSelectShot(null);
        } else if (activeScene) {
          const shot = createShot(nextShotNumber(activeScene));
          onProjectChange({
            ...project,
            scenes: project.scenes.map((scene) => scene.id === activeScene.id
              ? { ...scene, shots: [...scene.shots, shot] }
              : scene),
          });
          setSearch('');
          setStatusFilter('all');
          onSelectShot(shot.id);
        }
        return;
      }
      if (modifier && key === 'd' && selectedShot && activeScene) {
        event.preventDefault();
        const duplicate = { ...selectedShot, id: uuidv4(), number: `${selectedShot.number} copy` };
        const index = activeScene.shots.findIndex((shot) => shot.id === selectedShot.id);
        const shots = [...activeScene.shots];
        shots.splice(index + 1, 0, duplicate);
        onProjectChange({
          ...project,
          scenes: project.scenes.map((scene) => scene.id === activeScene.id
            ? { ...scene, shots }
            : scene),
        });
        onSelectShot(duplicate.id);
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedShot && activeScene) {
        event.preventDefault();
        if (!window.confirm(`Delete shot "${selectedShot.number}"?`)) return;
        onProjectChange({
          ...project,
          scenes: project.scenes.map((scene) => scene.id === activeScene.id
            ? { ...scene, shots: scene.shots.filter((shot) => shot.id !== selectedShot.id) }
            : scene),
        });
        onSelectShot(null);
        return;
      }
      if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && activeScene.shots.length > 0) {
        event.preventDefault();
        const direction = event.key === 'ArrowUp' ? -1 : 1;
        const currentIndex = selectedShot
          ? activeScene.shots.findIndex((shot) => shot.id === selectedShot.id)
          : direction > 0 ? -1 : activeScene.shots.length;
        if (event.altKey && selectedShot) {
          onProjectChange({
            ...project,
            scenes: project.scenes.map((scene) => scene.id === activeScene.id
              ? { ...scene, shots: moveItem(scene.shots, currentIndex, currentIndex + direction) }
              : scene),
          });
        } else {
          const nextIndex = Math.max(0, Math.min(activeScene.shots.length - 1, currentIndex + direction));
          onSelectShot(activeScene.shots[nextIndex].id);
        }
        return;
      }
      if (key === 'c' && !modifier && selectedShot && activeScene) {
        event.preventDefault();
        if (selectedShot.linkedSceneId && savedSceneById.has(selectedShot.linkedSceneId)) {
          onOpenCanvas(activeScene.id, selectedShot.id);
        } else {
          onCreateCanvas(activeScene.id, selectedShot.id);
        }
        return;
      }
      if (event.key === 'Escape') {
        setShowShortcuts(false);
        setShowGlossary(false);
        setShowSubjects(false);
        onSelectShot(null);
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [
    activeScene,
    onCreateCanvas,
    onOpenCanvas,
    onProjectChange,
    onSelectScene,
    onSelectShot,
    project,
    savedSceneById,
    selectedShot,
  ]);

  const startPanelResize = (side: 'scenes' | 'inspector') => (event: React.MouseEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = side === 'scenes' ? scenePanelWidth : inspectorWidth;
    const onMove = (moveEvent: MouseEvent) => {
      const rawDelta = side === 'scenes'
        ? moveEvent.clientX - startX
        : startX - moveEvent.clientX;
      const delta = rawDelta / uiScale;
      const limits = side === 'scenes' ? [170, 420] : [240, 520];
      const width = Math.max(limits[0], Math.min(limits[1], startWidth + delta));
      if (side === 'scenes') setScenePanelWidth(width);
      else setInspectorWidth(width);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const startColumnResize = (column: ShotColumnKey) => (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = columnWidths[column];
    const onMove = (moveEvent: MouseEvent) => {
      const width = Math.max(
        COLUMN_MINIMUMS[column],
        Math.min(720, startWidth + moveEvent.clientX - startX),
      );
      setColumnWidths((current) => ({ ...current, [column]: width }));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const tableWidth = Object.values(columnWidths).reduce((total, width) => total + width, 96);

  if (!activeScene) return null;

  return (
    <div className="shot-list-workspace">
      <div className="shot-list-actionbar">
        <div className="shot-list-title-wrap">
          <input
            className="shot-list-title-input"
            value={project.name}
            onChange={(event) => updateProject({ name: event.target.value })}
            aria-label="Shot list name"
          />
          {isDirty && <span className="dirty-dot" title="Unsaved changes" />}
        </div>
        <div className="shot-list-actions">
          <button className="shot-action-btn" onClick={onNew}>New</button>
          <div className="shot-project-menu-wrap" ref={menuRef}>
            <button className="shot-action-btn" onClick={toggleProjectMenu}>Open</button>
            {showProjectMenu && (
              <div className="shot-project-menu">
                <div className="dropdown-note">Saved in {storageLabel}</div>
                {savedProjects.map((savedProject) => (
                  <div
                    key={savedProject.id}
                    className="shot-project-item"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      onLoad(savedProject);
                      setShowProjectMenu(false);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        onLoad(savedProject);
                        setShowProjectMenu(false);
                      }
                    }}
                  >
                    <span>{savedProject.name}</span>
                    <span
                      className="shot-project-delete"
                      role="button"
                      tabIndex={0}
                      onClick={(event) => removeSavedProject(event, savedProject)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') removeSavedProject(event, savedProject);
                      }}
                    >
                      Delete
                    </span>
                  </div>
                ))}
                {savedProjects.length === 0 && <div className="dropdown-empty">No saved shot lists yet</div>}
                <button className="shot-project-browse" onClick={() => {
                  setShowProjectMenu(false);
                  onBrowse();
                }}>
                  Browse for a shot-list file…
                </button>
              </div>
            )}
          </div>
          <button className={`shot-action-btn primary ${isDirty ? 'needs-save' : ''}`} onClick={onSave}>Save</button>
          <button className="shot-action-btn" onClick={onSaveAs}>Save As</button>
          <span className="shot-action-divider" />
          <button className="shot-action-btn" onClick={onImportCsv}>Import CSV</button>
          <button className="shot-action-btn" onClick={onExportCsv}>Export CSV</button>
          <button className="shot-action-btn" onClick={onExportJson}>Export JSON</button>
          <button
            className={`shot-action-btn ${showSubjects ? 'active' : ''}`}
            onClick={() => setShowSubjects((show) => !show)}
          >
            Subjects ({project.subjects.length})
          </button>
          <button
            className={`shot-action-btn ${showGlossary ? 'active' : ''}`}
            onClick={() => setShowGlossary((show) => !show)}
            disabled={project.glossary.length === 0}
          >
            Glossary ({project.glossary.length})
          </button>
          <button
            className={`shot-action-btn ${showShortcuts ? 'active' : ''}`}
            onClick={() => setShowShortcuts((visible) => !visible)}
            title="Keyboard shortcuts (?)"
          >
            Shortcuts
          </button>
        </div>
      </div>

      {showShortcuts && (
        <div className="shot-shortcuts-bar">
          <span><kbd>N</kbd> New shot</span>
          <span><kbd>Shift</kbd> + <kbd>N</kbd> New scene</span>
          <span><kbd>↑</kbd><kbd>↓</kbd> Select shot</span>
          <span><kbd>Alt</kbd> + <kbd>↑</kbd><kbd>↓</kbd> Move shot</span>
          <span><kbd>⌘/Ctrl</kbd> + <kbd>D</kbd> Duplicate</span>
          <span><kbd>C</kbd> Open/create canvas</span>
          <span><kbd>/</kbd> Search</span>
          <span><kbd>Delete</kbd> Delete shot</span>
          <span><kbd>⌘/Ctrl</kbd> + <kbd>S</kbd> Save</span>
        </div>
      )}

      {showSubjects && (
        <div className="shot-subject-library">
          <div className="shot-subject-library-heading">
            <div>
              <span className="shot-eyebrow">Project library</span>
              <strong>Subjects</strong>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                addSubject();
              }}
            >
              <input
                value={newSubjectName}
                onChange={(event) => setNewSubjectName(event.target.value)}
                placeholder="Add actor, character, vehicle…"
                aria-label="New subject name"
              />
              <button type="submit" className="shot-add-btn">Add subject</button>
            </form>
          </div>
          <div className="shot-subject-library-items">
            {project.subjects.map((subject) => (
              <div className="shot-subject-library-item" key={subject.id}>
                <input
                  defaultValue={subject.name}
                  aria-label={`Rename ${subject.name}`}
                  onBlur={(event) => {
                    if (!renameSubject(subject.id, event.target.value)) {
                      event.target.value = subject.name;
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                  }}
                />
                <button
                  type="button"
                  onClick={() => removeSubject(subject)}
                  title={`Delete ${subject.name}`}
                >
                  ×
                </button>
              </div>
            ))}
            {project.subjects.length === 0 && (
              <span className="shot-subject-library-empty">
                Define subjects once, then select them on any shot.
              </span>
            )}
          </div>
        </div>
      )}

      {showGlossary && (
        <div className="shot-glossary">
          {glossaryByCategory.map(([category, entries]) => (
            <div className="shot-glossary-group" key={category}>
              <h4>{category}</h4>
              {entries.map((entry) => (
                <div className="shot-glossary-entry" key={entry.id}>
                  <strong>{entry.term}</strong>
                  <span>{entry.description}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="shot-list-layout">
        <aside
          className="shot-scenes-panel"
          style={{ width: Math.round(scenePanelWidth * uiScale) }}
        >
          <div className="shot-panel-heading">
            <div>
              <span className="shot-eyebrow">Project</span>
              <h3>Scenes</h3>
            </div>
            <button className="shot-icon-btn" onClick={addScene} title="Add scene (Shift+N)">+</button>
          </div>
          <div className="shot-scenes-list">
            {project.scenes.map((scene, index) => (
              <div
                key={scene.id}
                className={`shot-scene-item ${scene.id === activeScene.id ? 'active' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => {
                  onSelectScene(scene.id);
                  onSelectShot(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    onSelectScene(scene.id);
                    onSelectShot(null);
                  }
                }}
              >
                <span className="shot-scene-number">{scene.number || '—'}</span>
                <span className="shot-scene-copy">
                  <strong>{scene.title || 'Untitled Scene'}</strong>
                  <small>{scene.shots.length} shot{scene.shots.length === 1 ? '' : 's'}</small>
                </span>
                <span className="shot-scene-order">
                  <span
                    role="button"
                    tabIndex={0}
                    className={index === 0 ? 'disabled' : ''}
                    onClick={(event) => { event.stopPropagation(); moveScene(scene.id, -1); }}
                  >↑</span>
                  <span
                    role="button"
                    tabIndex={0}
                    className={index === project.scenes.length - 1 ? 'disabled' : ''}
                    onClick={(event) => { event.stopPropagation(); moveScene(scene.id, 1); }}
                  >↓</span>
                </span>
              </div>
            ))}
          </div>
          <div className="shot-scene-edit">
            <label>
              Scene number
              <input
                value={activeScene.number}
                onChange={(event) => updateScene(activeScene.id, { number: event.target.value })}
              />
            </label>
            <label>
              Scene title
              <input
                value={activeScene.title}
                onChange={(event) => updateScene(activeScene.id, { title: event.target.value })}
              />
            </label>
            <button className="shot-danger-btn" onClick={() => deleteScene(activeScene.id)}>Delete scene</button>
          </div>
        </aside>
        <div
          className="shot-list-resize-handle"
          onMouseDown={startPanelResize('scenes')}
          onDoubleClick={() => setScenePanelWidth(220)}
          title="Drag to resize; double-click to reset"
        />

        <main className="shot-table-panel">
          <div className="shot-table-header">
            <div>
              <span className="shot-eyebrow">Scene {activeScene.number}</span>
              <h2>{activeScene.title}</h2>
            </div>
            <div className="shot-table-tools">
              <input
                ref={searchRef}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search shots…"
              />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as 'all' | ShotStatus)}
              >
                <option value="all">All statuses</option>
                {SHOT_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>{status.label}</option>
                ))}
              </select>
              <button className="shot-add-btn" onClick={addShot} title="New shot (N)">+ Add shot</button>
            </div>
          </div>

          <div className="shot-table-scroll">
            <table className="shot-table" style={{ width: tableWidth }}>
              <colgroup>
                {COLUMN_DEFINITIONS.map((column) => (
                  <col key={column.key} style={{ width: columnWidths[column.key] }} />
                ))}
                <col style={{ width: 96 }} />
              </colgroup>
              <thead>
                <tr>
                  {COLUMN_DEFINITIONS.map((column) => (
                    <th key={column.key}>
                      <span>{column.label}</span>
                      <button
                        type="button"
                        className="shot-column-resize"
                        onMouseDown={startColumnResize(column.key)}
                        onDoubleClick={() => setColumnWidths((current) => ({
                          ...current,
                          [column.key]: COLUMN_DEFAULTS[column.key],
                        }))}
                        title={`Resize ${column.label} column; double-click to reset`}
                        aria-label={`Resize ${column.label} column`}
                      />
                    </th>
                  ))}
                  <th className="shot-col-actions" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filteredShots.map((shot) => {
                  const linkedScene = shot.linkedSceneId ? savedSceneById.get(shot.linkedSceneId) : undefined;
                  const hasBrokenLink = Boolean(shot.linkedSceneId && !linkedScene);
                  return (
                    <tr
                      key={shot.id}
                      className={shot.id === selectedShotId ? 'selected' : ''}
                      onClick={() => onSelectShot(shot.id)}
                    >
                      <td>
                        <input
                          value={shot.number}
                          onChange={(event) => updateShot(activeScene.id, shot.id, { number: event.target.value })}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </td>
                      <td>
                        <textarea
                          value={shot.description}
                          rows={wrappedRowCount(shot.description, columnWidths.description)}
                          onChange={(event) => updateShot(activeScene.id, shot.id, { description: event.target.value })}
                          onClick={(event) => event.stopPropagation()}
                          placeholder="Describe the shot"
                        />
                      </td>
                      <td>
                        <SubjectPicker
                          value={shot.subjects}
                          subjects={project.subjects}
                          onChange={(subjects) => updateShot(activeScene.id, shot.id, { subjects })}
                        />
                      </td>
                      <td><input value={shot.framing} onChange={(event) => updateShot(activeScene.id, shot.id, { framing: event.target.value })} onClick={(event) => event.stopPropagation()} /></td>
                      <td><input value={shot.movement} onChange={(event) => updateShot(activeScene.id, shot.id, { movement: event.target.value })} onClick={(event) => event.stopPropagation()} /></td>
                      <td><input value={shot.setup} onChange={(event) => updateShot(activeScene.id, shot.id, { setup: event.target.value })} onClick={(event) => event.stopPropagation()} /></td>
                      <td>
                        <select
                          value={shot.status}
                          className={`shot-status status-${shot.status}`}
                          onChange={(event) => updateShot(activeScene.id, shot.id, { status: event.target.value as ShotStatus })}
                          onClick={(event) => event.stopPropagation()}
                        >
                          {SHOT_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                        </select>
                      </td>
                      <td>
                        <div className="shot-canvas-cell" onClick={(event) => event.stopPropagation()}>
                          {linkedScene ? (
                            <button className="shot-link-btn linked" onClick={() => onOpenCanvas(activeScene.id, shot.id)}>
                              Open
                            </button>
                          ) : (
                            <button className={`shot-link-btn ${hasBrokenLink ? 'broken' : ''}`} onClick={() => onCreateCanvas(activeScene.id, shot.id)}>
                              {hasBrokenLink ? 'Missing' : 'New'}
                            </button>
                          )}
                          <select
                            value=""
                            aria-label={`Link canvas for shot ${shot.number}`}
                            onChange={(event) => onLinkCanvas(activeScene.id, shot.id, event.target.value || undefined)}
                          >
                            <option value="">Link…</option>
                            {savedScenes.map((scene) => <option key={scene.id} value={scene.id}>{scene.name}</option>)}
                          </select>
                        </div>
                      </td>
                      <td>
                        <div className="shot-row-actions" onClick={(event) => event.stopPropagation()}>
                          <button onClick={() => moveShot(shot.id, -1)} title="Move up">↑</button>
                          <button onClick={() => moveShot(shot.id, 1)} title="Move down">↓</button>
                          <button onClick={() => duplicateShot(shot)} title="Duplicate">⧉</button>
                          <button className="danger" onClick={() => deleteShot(shot)} title="Delete">×</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredShots.length === 0 && (
              <div className="shot-empty">
                <h3>{activeScene.shots.length === 0 ? 'No shots yet' : 'No matching shots'}</h3>
                <p>{activeScene.shots.length === 0 ? 'Add the first shot or import a CSV to begin.' : 'Try another search or status filter.'}</p>
                {activeScene.shots.length === 0 && <button className="shot-add-btn" onClick={addShot}>+ Add first shot</button>}
              </div>
            )}
          </div>
        </main>
        <div
          className="shot-list-resize-handle"
          onMouseDown={startPanelResize('inspector')}
          onDoubleClick={() => setInspectorWidth(300)}
          title="Drag to resize; double-click to reset"
        />

        <aside
          className="shot-inspector"
          style={{ width: Math.round(inspectorWidth * uiScale) }}
        >
          <div className="shot-panel-heading">
            <div>
              <span className="shot-eyebrow">Details</span>
              <h3>{selectedShot ? `Shot ${selectedShot.number}` : 'Shot inspector'}</h3>
            </div>
          </div>
          {selectedShot ? (
            <div className="shot-inspector-form">
              <label>
                Description
                <textarea rows={5} value={selectedShot.description} onChange={(event) => updateShot(activeScene.id, selectedShot.id, { description: event.target.value })} />
              </label>
              <div className="shot-field-pair">
                <label>
                  Subjects
                  <SubjectPicker
                    value={selectedShot.subjects}
                    subjects={project.subjects}
                    onChange={(subjects) => updateShot(activeScene.id, selectedShot.id, { subjects })}
                  />
                </label>
                <label>Framing<input value={selectedShot.framing} onChange={(event) => updateShot(activeScene.id, selectedShot.id, { framing: event.target.value })} /></label>
              </div>
              <label>Angle<input value={selectedShot.angle} onChange={(event) => updateShot(activeScene.id, selectedShot.id, { angle: event.target.value })} /></label>
              <label>Movement<input value={selectedShot.movement} onChange={(event) => updateShot(activeScene.id, selectedShot.id, { movement: event.target.value })} /></label>
              <label>Equipment<input value={selectedShot.equipment} onChange={(event) => updateShot(activeScene.id, selectedShot.id, { equipment: event.target.value })} /></label>
              <label>Camera and lens<input value={selectedShot.cameraLens} onChange={(event) => updateShot(activeScene.id, selectedShot.id, { cameraLens: event.target.value })} /></label>
              <label>Setup<input value={selectedShot.setup} onChange={(event) => updateShot(activeScene.id, selectedShot.id, { setup: event.target.value })} /></label>
              <label>Production notes<textarea rows={4} value={selectedShot.notes} onChange={(event) => updateShot(activeScene.id, selectedShot.id, { notes: event.target.value })} /></label>
              <div className="shot-canvas-card">
                <span className="shot-eyebrow">Linked canvas</span>
                {selectedShot.linkedSceneId && savedSceneById.has(selectedShot.linkedSceneId) ? (
                  <>
                    <strong>{savedSceneById.get(selectedShot.linkedSceneId)?.name}</strong>
                    <div className="shot-canvas-actions">
                      <button className="shot-add-btn" onClick={() => onOpenCanvas(activeScene.id, selectedShot.id)}>Open canvas</button>
                      <button className="shot-action-btn" onClick={() => onLinkCanvas(activeScene.id, selectedShot.id, undefined)}>Unlink</button>
                    </div>
                  </>
                ) : (
                  <>
                    <strong>{selectedShot.linkedSceneId ? 'Linked canvas is missing' : 'No canvas linked'}</strong>
                    <button className="shot-add-btn" onClick={() => onCreateCanvas(activeScene.id, selectedShot.id)}>Create canvas</button>
                  </>
                )}
                <select
                  value={selectedShot.linkedSceneId && savedSceneById.has(selectedShot.linkedSceneId) ? selectedShot.linkedSceneId : ''}
                  onChange={(event) => onLinkCanvas(activeScene.id, selectedShot.id, event.target.value || undefined)}
                >
                  <option value="">Choose an existing canvas…</option>
                  {savedScenes.map((scene) => <option key={scene.id} value={scene.id}>{scene.name}</option>)}
                </select>
              </div>
            </div>
          ) : (
            <div className="shot-inspector-empty">
              <p>Select a shot to edit all production details and manage its canvas link.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

export default ShotListWorkspace;
