import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Scene, SceneElement, ElementTemplate, Tool, Shot, ShotListProject, WorkspaceMode } from './types';
import {
  createScene,
  createElementFromTemplate,
  saveSceneToLocalStorage,
  getScenesStorageLabel,
  duplicateScene,
  getSavedScenes,
  exportSceneToFile,
  importSceneFromFile,
  browseForScene,
  saveSceneAs,
  duplicateElement,
} from './utils/sceneUtils';
import { useHistory } from './hooks/useHistory';
import { useWorkspacePanels } from './hooks/useWorkspacePanels';
import { elementTemplates } from './data/elementLibrary';
import SceneCanvas, { SceneCanvasHandle } from './components/SceneCanvas';
import ElementLibrary from './components/ElementLibrary';
import PropertiesPanel from './components/PropertiesPanel';
import Toolbar from './components/Toolbar';
import ShortcutDialog from './components/ShortcutDialog';
import ElementList from './components/ElementList';
import ShotListWorkspace from './components/ShotListWorkspace';
import {
  browseForShotList,
  createShot,
  createShotListProject,
  exportShotListProject,
  getShotListsStorageLabel,
  makeShotListSnapshot,
  nextShotNumber,
  normalizeShotListProject,
  saveShotListAs,
  saveShotListProject,
  sceneForSet,
  shotSetId,
  shotsInSet,
} from './utils/shotListUtils';
import ShotContextBar from './components/ShotContextBar';
import { exportShotListCsv, importShotListCsv } from './utils/shotListCsv';
import Konva from 'konva';
const PrevisWorkspace = lazy(() => import('./previs/PrevisWorkspace'));
import type { PrevisScene, Vec3 } from './previs/types';
import { createPrevisScene, createPrevisShot, reconcilePrevis } from './previs/model';

/** Each shot is a camera in its scene's set; the first visit creates it from the shot's lens. */
function ensureShotCamera(data: PrevisScene, shot: Shot, activeCameraId: string | null) {
  const existing = data.shots.find((camera) => camera.id === shot.previsShotId);
  if (existing) return { data, cameraId: existing.id, created: false };
  const from = data.shots.find((camera) => camera.id === activeCameraId) ?? data.shots[0];
  const first = from?.keyframes[0];
  const camera = createPrevisShot(`${shot.number}${shot.description ? ` · ${shot.description.slice(0, 32)}` : ''}`, first?.position as Vec3 | undefined, first?.target as Vec3 | undefined);
  const lens = Number(/(\d+(?:\.\d+)?)\s*mm/i.exec(shot.cameraLens)?.[1]);
  camera.keyframes[0].lens = lens >= 8 && lens <= 300 ? lens : first?.lens ?? 35;
  return { data: { ...data, shots: [...data.shots, camera] }, cameraId: camera.id, created: true };
}

function App() {
  const {
    state: content,
    set: setContent,
    undo,
    redo,
    canUndo,
    canRedo,
    reset: resetContent,
  } = useHistory<{ elements: SceneElement[]; previs?: PrevisScene }>({ elements: [] });
  const elements = content.elements;
  const setElements = useCallback((next: SceneElement[] | ((prev: SceneElement[]) => SceneElement[])) => {
    setContent(prev => ({ ...prev, elements: typeof next === 'function' ? next(prev.elements) : next }));
  }, [setContent]);
  const resetElements = useCallback((next: SceneElement[], nextPrevis?: PrevisScene) => {
    resetContent({ elements: next, previs: nextPrevis });
  }, [resetContent]);
  const [activePrevisShotId, setActivePrevisShotId] = useState<string | null>(null);

  const [scene, setScene] = useState<Scene>(createScene);
  const [workspace, setWorkspace] = useState<WorkspaceMode>('canvas');
  const previs = useMemo(() => content.previs ?? (workspace === 'previs' ? createPrevisScene(scene, elements) : undefined), [content.previs, workspace, scene, elements]);
  const { state: shotList, set: setShotList, replace: replaceShotList, reset: resetShotList, undo: undoShotList, redo: redoShotList, canUndo: canUndoShotList, canRedo: canRedoShotList } = useHistory<ShotListProject>(useMemo(createShotListProject, []));
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [selectedShotListSceneId, setSelectedShotListSceneId] = useState('');
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  // The shot-list scene and shot being staged in the open set.
  const [shotContext, setShotContext] = useState<{ sceneId: string; shotId: string | null } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tool, setTool] = useState<Tool>('select');
  const [showGrid, setShowGrid] = useState(true);
  const [gridSnap, setGridSnap] = useState(true);
  const canvasPanels = useWorkspacePanels();
  const { leftOpen: canvasLibraryOpen, rightOpen: canvasInspectorOpen } = canvasPanels;
  const [leftPanel, setLeftPanel] = useState<'library' | 'layers'>('library');
  const [showToast, setShowToast] = useState<string | null>(null);
  const [uiScale, setUiScale] = useState(() => {
    const saved = localStorage.getItem('shotdesigner_uiscale');
    return saved ? parseFloat(saved) : 1;
  });
  const [leftWidth, setLeftWidth] = useState(() => {
    const saved = localStorage.getItem('shotdesigner_leftw');
    return saved ? parseInt(saved) : 280;
  });
  const [rightWidth, setRightWidth] = useState(() => {
    const saved = localStorage.getItem('shotdesigner_rightw');
    return saved ? parseInt(saved) : 260;
  });
  const stageRef = useRef<Konva.Stage>(null);
  const sceneCanvasRef = useRef<SceneCanvasHandle>(null);
  const clipboardRef = useRef<SceneElement[]>([]);

  // Unsaved-changes tracking: snapshot of the content-relevant state at the
  // last save/load, compared against the live state.
  const makeSnapshot = (s: Scene, els: SceneElement[]) =>
    JSON.stringify({
      name: s.name,
      backgroundColor: s.backgroundColor,
      gridStyle: s.gridStyle,
      gridColor: s.gridColor,
      elements: els,
      previs: s.previs,
    });
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() => makeSnapshot(scene, []));
  const isDirty = useMemo(
    () => makeSnapshot({ ...scene, previs }, elements) !== savedSnapshot,
    [scene, elements, previs, savedSnapshot]
  );
  const [savedShotListSnapshot, setSavedShotListSnapshot] = useState<string>(
    () => makeShotListSnapshot(shotList),
  );
  const isShotListDirty = useMemo(
    () => makeShotListSnapshot(shotList) !== savedShotListSnapshot,
    [shotList, savedShotListSnapshot],
  );

  const confirmDiscard = useCallback(() => {
    return !isDirty || window.confirm('You have unsaved changes. Discard them?');
  }, [isDirty]);

  const confirmShotListDiscard = useCallback(() => {
    return !isShotListDirty || window.confirm('You have unsaved shot-list changes. Discard them?');
  }, [isShotListDirty]);

  // Warn before closing the window with unsaved work
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty || isShotListDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty, isShotListDirty]);

  // Persist panel sizes
  useEffect(() => { localStorage.setItem('shotdesigner_uiscale', String(uiScale)); }, [uiScale]);
  useEffect(() => { localStorage.setItem('shotdesigner_leftw', String(leftWidth)); }, [leftWidth]);
  useEffect(() => { localStorage.setItem('shotdesigner_rightw', String(rightWidth)); }, [rightWidth]);

  // Dev aid: open the app with ?demo to seed one of each common element,
  // handy for eyeballing the symbol set on the canvas.
  useEffect(() => {
    if (!window.location.search.includes('demo')) return;
    const demoTypes = [
      'actor-male', 'actor-female', 'group-small', 'sitting-actor', 'lying-actor', 'director',
      'camera', 'camera-dolly', 'camera-drone', 'tripod', 'monitor', 'key-light',
      'softbox', 'led-panel', 'practical-light', 'boom-mic', 'speaker', 'c-stand',
      'table-rect', 'table-round', 'chair', 'armchair', 'sofa', 'bed-double',
      'car', 'truck', 'bicycle', 'wall', 'door-open', 'window',
      'stairs', 'column', 'tree', 'rock', 'water', 'fence',
      'stove', 'sink', 'bathtub', 'toilet', 'piano', 'fireplace',
      'mark-x', 'number-1', 'arrow', 'zone-area', 'path-marker', 'blocking-line',
      'hangar-door', 'roller-door', 'workbench', 'tool-cabinet', 'tool-cart', 'shelving-rack',
      'pallet', 'tire-stack', 'oil-drum', 'jerry-can', 'engine-hoist', 'car-lift',
      'forklift', 'junk-pile', 'scrap-metal', 'tarp-covered', 'air-compressor', 'scaffolding',
      'oil-stain', 'chain', 'cable-bundle', 'spare-engine', 'workshop-light', 'car-wreck',
    ];
    const seeded = demoTypes.flatMap((type, i) => {
      const template = elementTemplates.find((t) => t.type === type);
      if (!template) return [];
      return [createElementFromTemplate(template, 140 + (i % 6) * 180, 120 + Math.floor(i / 6) * 160, i)];
    });
    resetElements(seeded);
    if (seeded.length > 0) setSelectedIds([seeded[0].id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toast = useCallback((msg: string) => {
    setShowToast(msg);
    setTimeout(() => setShowToast(null), 2500);
  }, []);

  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const selectedElement = selectedId ? elements.find((e) => e.id === selectedId) || null : null;

  const handleAddElement = useCallback(
    (template: ElementTemplate) => {
      // Drop new elements at the center of the current view, stepping aside
      // if something already sits there so repeated adds don't stack.
      const center = sceneCanvasRef.current?.getViewportCenter() ?? { x: 500, y: 400 };
      let x = center.x;
      let y = center.y;
      while (elements.some((el) => Math.abs(el.x - x) < 4 && Math.abs(el.y - y) < 4)) {
        x += 24;
        y += 24;
      }
      const newEl = createElementFromTemplate(template, x, y, elements.length);
      setElements((prev) => [...prev, newEl]);
      setSelectedIds([newEl.id]);
    },
    [elements, setElements]
  );

  const handleAddElementToCanvas = useCallback(
    (element: SceneElement) => {
      setElements((prev) => [...prev, element]);
    },
    [setElements]
  );

  const handleChange = useCallback(
    (id: string, updates: Partial<SceneElement>) => {
      setElements((prev) =>
        prev.map((el) => (el.id === id ? { ...el, ...updates } : el))
      );
    },
    [setElements]
  );

  const handleDelete = useCallback(
    (id: string) => {
      setElements((prev) => prev.filter((el) => el.id !== id));
      setSelectedIds((prev) => prev.filter((s) => s !== id));
    },
    [setElements]
  );

  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    setElements((prev) => prev.filter((el) => !selectedIds.includes(el.id)));
    setSelectedIds([]);
  }, [selectedIds, setElements]);

  const handleDuplicate = useCallback(
    (id: string) => {
      const el = elements.find((e) => e.id === id);
      if (!el) return;
      const dup = duplicateElement(el);
      dup.zIndex = elements.length;
      setElements((prev) => [...prev, dup]);
      setSelectedIds([dup.id]);
    },
    [elements, setElements]
  );

  const handleBringForward = useCallback(
    (id: string) => {
      setElements((prev) => {
        const maxZ = Math.max(...prev.map((e) => e.zIndex));
        return prev.map((el) => el.id === id ? { ...el, zIndex: maxZ + 1 } : el);
      });
    },
    [setElements]
  );

  const handleSendBackward = useCallback(
    (id: string) => {
      setElements((prev) => {
        const minZ = Math.min(...prev.map((e) => e.zIndex));
        return prev.map((el) => el.id === id ? { ...el, zIndex: minZ - 1 } : el);
      });
    },
    [setElements]
  );

  const handleSave = useCallback(() => {
    try {
      const saveResult = saveSceneToLocalStorage({ ...scene, elements, previs });
      setScene(saveResult.scene);
      setSavedSnapshot(makeSnapshot(saveResult.scene, elements));
      toast(`Scene saved to ${saveResult.relativePath}`);
    } catch {
      toast('Could not save. Your work is still open. Use Export JSON to keep a copy; large models may exceed browser storage.');
    }
  }, [scene, elements, previs, toast]);

  const handleSaveAs = useCallback(async () => {
    const result = await saveSceneAs({ ...scene, elements, previs });
    if (result.status === 'canceled') return;
    if (result.status === 'error') {
      toast('Save As failed');
      return;
    }
    setScene(result.scene);
    setSavedSnapshot(makeSnapshot(result.scene, elements));
    toast(`Saved to ${result.relativePath}`);
  }, [scene, elements, previs, toast]);

  const handleLoad = useCallback(
    (s: Scene) => {
      if (!confirmDiscard()) return;
      setScene(s);
      resetElements(s.elements, s.previs);
      setWorkspace('canvas');
      setSelectedIds([]);
      setShowGrid(s.showGrid);
      setSavedSnapshot(makeSnapshot(s, s.elements));
      toast(`Loaded: ${s.name}`);
    },
    [confirmDiscard, resetElements, toast]
  );

  const handleExport = useCallback(() => {
    exportSceneToFile({ ...scene, elements, previs });
    toast('Exported!');
  }, [scene, elements, previs, toast]);

  const handleBrowse = useCallback(async () => {
    const result = await browseForScene();
    if (result.status === 'canceled') return;
    if (result.status === 'error') {
      toast('Could not open that file — not a valid scene');
      return;
    }
    handleLoad(result.scene);
  }, [handleLoad, toast]);

  const handleImport = useCallback(async () => {
    if (!confirmDiscard()) return;
    try {
      const imported = await importSceneFromFile();
      setWorkspace('canvas');
      setScene(imported);
      resetElements(imported.elements, imported.previs);
      setSelectedIds([]);
      toast(`Imported: ${imported.name} — save to keep it`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      toast('Import failed');
    }
  }, [confirmDiscard, resetElements, toast]);

  const handleExportImage = useCallback(() => {
    void (async () => {
      try {
        const dataUrl = await sceneCanvasRef.current?.exportPngDataUrl();
        if (!dataUrl) {
          toast('No canvas to export');
          return;
        }

        const link = document.createElement('a');
        link.download = `${scene.name.replace(/[^a-z0-9]/gi, '_')}.png`;
        link.href = dataUrl;
        link.click();
        toast('Image exported!');
      } catch {
        toast('Image export failed');
      }
    })();
  }, [scene.name, toast]);

  const handleNew = useCallback(() => {
    if (!confirmDiscard()) return;
    setWorkspace('canvas');
    const s = createScene();
    setScene(s);
    resetElements([]);
    setSelectedIds([]);
    setSavedSnapshot(makeSnapshot(s, []));
    toast('New scene created');
  }, [confirmDiscard, resetElements, toast]);

  const handleDuplicateScene = useCallback(() => {
    const duplicatedScene = duplicateScene({ ...scene, elements, previs });
    const saveResult = saveSceneToLocalStorage(duplicatedScene);
    setWorkspace('canvas');
    setScene(saveResult.scene);
    resetElements(saveResult.scene.elements, saveResult.scene.previs);
    setSelectedIds([]);
    setShowGrid(saveResult.scene.showGrid);
    setSavedSnapshot(makeSnapshot(saveResult.scene, saveResult.scene.elements));
    toast(`Duplicated to ${saveResult.relativePath}`);
  }, [elements, previs, resetElements, scene, toast]);

  const handleShotListSave = useCallback(() => {
    const result = saveShotListProject(shotList);
    replaceShotList(result.project);
    setSavedShotListSnapshot(makeShotListSnapshot(result.project));
    toast(`Shot list saved to ${result.relativePath}`);
  }, [shotList, toast, replaceShotList]);

  const handleShotListSaveAs = useCallback(async () => {
    const result = await saveShotListAs(shotList);
    if (result.status === 'canceled') return;
    if (result.status === 'error') {
      toast('Shot-list Save As failed');
      return;
    }
    replaceShotList(result.project);
    setSavedShotListSnapshot(makeShotListSnapshot(result.project));
    toast(`Shot list saved to ${result.relativePath}`);
  }, [shotList, toast, replaceShotList]);

  const handleShotListLoad = useCallback((project: ShotListProject) => {
    if (!confirmShotListDiscard()) return;
    const normalized = normalizeShotListProject(project);
    resetShotList(normalized);
    setSelectedShotListSceneId(normalized.scenes[0]?.id ?? '');
    setSelectedShotId(null);
    setSavedShotListSnapshot(makeShotListSnapshot(normalized));
    setWorkspace('shotList');
    toast(`Loaded shot list: ${normalized.name}`);
  }, [confirmShotListDiscard, toast, resetShotList]);

  const handleShotListBrowse = useCallback(async () => {
    const result = await browseForShotList();
    if (result.status === 'canceled') return;
    if (result.status === 'error') {
      toast('Could not open that shot-list file');
      return;
    }
    handleShotListLoad(result.project);
  }, [handleShotListLoad, toast]);

  const handleShotListNew = useCallback(() => {
    if (!confirmShotListDiscard()) return;
    const project = createShotListProject();
    resetShotList(project);
    setSelectedShotListSceneId(project.scenes[0]?.id ?? '');
    setSelectedShotId(null);
    setSavedShotListSnapshot(makeShotListSnapshot(project));
    toast('New shot list created');
  }, [confirmShotListDiscard, toast, resetShotList]);

  const handleShotListCsvImport = useCallback(async () => {
    if (!confirmShotListDiscard()) return;
    const result = await importShotListCsv();
    if (result.status === 'canceled') return;
    if (result.status === 'error') {
      toast('CSV import failed');
      return;
    }
    resetShotList(result.project);
    setSelectedShotListSceneId(result.project.scenes[0]?.id ?? '');
    setSelectedShotId(result.project.scenes[0]?.shots[0]?.id ?? null);
    setSavedShotListSnapshot('');
    toast(`Imported ${result.fileName} — save to keep it`);
  }, [confirmShotListDiscard, toast, resetShotList]);

  const handleShotListLinkCanvas = useCallback((
    shotListSceneId: string,
    shotId: string,
    linkedSceneId?: string,
  ) => {
    setShotList((project) => ({
      ...project,
      scenes: project.scenes.map((shotListScene) => shotListScene.id === shotListSceneId
        ? {
            ...shotListScene,
            shots: shotListScene.shots.map((shot) => {
              if (shot.id !== shotId) return shot;
              // A camera belongs to one set; moving the shot to another set drops the link.
              const next = { ...shot, linkedSceneId };
              if (!linkedSceneId) delete next.linkedSceneId;
              if (shotSetId(shotListScene, next) !== shotSetId(shotListScene, shot)) delete next.previsShotId;
              return next;
            }),
          }
        : shotListScene),
    }));
  }, [setShotList]);

  const handleLinkSceneSet = useCallback((shotListSceneId: string, setId?: string) => {
    setShotList((project) => ({
      ...project,
      scenes: project.scenes.map((item) => {
        if (item.id !== shotListSceneId) return item;
        const next = { ...item, linkedSceneId: setId };
        if (!setId) delete next.linkedSceneId;
        return {
          ...next,
          shots: item.shots.map((shot) => (shot.linkedSceneId || item.linkedSceneId === setId ? shot : { ...shot, previsShotId: undefined })),
        };
      }),
    }));
  }, [setShotList]);

  /** Opens a shot-list scene (or one shot) in its set, creating the set and the shot's camera as needed. */
  const handleOpenShot = useCallback((shotListSceneId: string, shotId: string | null, target: 'canvas' | 'previs') => {
    const listScene = shotList.scenes.find((item) => item.id === shotListSceneId);
    if (!listScene) return;
    const shot = shotId ? listScene.shots.find((item) => item.id === shotId) : undefined;
    const setId = shotSetId(listScene, shot);
    let target3d = setId === scene.id ? { ...scene, elements, previs } : setId ? getSavedScenes().find((item) => item.id === setId) : undefined;
    if (setId && !target3d) {
      toast('The set for this shot could not be found. Choose another set in the shot list.');
      return;
    }
    const switching = !target3d || target3d.id !== scene.id;
    if (switching && !confirmDiscard()) return;
    if (!target3d) {
      const created = saveSceneToLocalStorage(createScene(`Scene ${listScene.number}${listScene.title ? ` – ${listScene.title}` : ''}`)).scene;
      target3d = { ...created, previs: undefined };
      handleLinkSceneSet(listScene.id, created.id);
      toast(`Set created for scene ${listScene.number}. Draw the plan, then stage each shot in 3D.`);
    }
    let data = target3d.previs;
    let cameraId: string | null = null;
    if (target === 'previs') {
      data = reconcilePrevis(data ?? createPrevisScene(target3d, target3d.elements), target3d.elements);
      if (shot) {
        const ensured = ensureShotCamera(data, shot, activePrevisShotId);
        data = ensured.data;
        cameraId = ensured.cameraId;
        if (ensured.created)
          setShotList((project) => ({ ...project, scenes: project.scenes.map((item) => ({ ...item,
            shots: item.shots.map((s) => (s.id === shot.id ? { ...s, previsShotId: ensured.cameraId } : s)) })) }));
      }
    }
    if (switching) {
      setScene(target3d);
      resetElements(target3d.elements, data);
      setShowGrid(target3d.showGrid);
      setSavedSnapshot(makeSnapshot(target3d, target3d.elements));
    } else if (data !== previs) setContent({ elements, previs: data });
    if (cameraId) setActivePrevisShotId(cameraId);
    setSelectedIds([]);
    setShotContext({ sceneId: listScene.id, shotId: shot?.id ?? null });
    setWorkspace(target);
  }, [shotList.scenes, scene, elements, previs, activePrevisShotId, confirmDiscard, handleLinkSceneSet, resetElements, setContent, setShotList, toast]);

  // The scene being staged in the open set, and its shots.
  const contextScene = useMemo(() => sceneForSet(shotList, scene.id, shotContext?.sceneId), [shotList, scene.id, shotContext?.sceneId]);
  const contextShots = useMemo(() => (contextScene ? shotsInSet(contextScene, scene.id) : []), [contextScene, scene.id]);
  const contextShotId = workspace === 'previs'
    ? contextShots.find((shot) => shot.previsShotId && shot.previsShotId === activePrevisShotId)?.id ?? null
    : contextShots.find((shot) => shot.id === shotContext?.shotId)?.id ?? null;

  const handleWorkspaceChange = useCallback((next: WorkspaceMode) => {
    if (next === 'previs') {
      let nextPrevis = reconcilePrevis(previs ?? createPrevisScene(scene, elements), elements);
      // Arriving from the 2D plan with a shot in focus opens that shot's camera.
      const shot = contextShots.find((item) => item.id === shotContext?.shotId);
      if (shot) {
        const ensured = ensureShotCamera(nextPrevis, shot, activePrevisShotId);
        nextPrevis = ensured.data;
        if (ensured.created)
          setShotList((project) => ({ ...project, scenes: project.scenes.map((item) => ({ ...item,
            shots: item.shots.map((s) => (s.id === shot.id ? { ...s, previsShotId: ensured.cameraId } : s)) })) }));
        setActivePrevisShotId(ensured.cameraId);
      }
      if (nextPrevis !== previs) setContent({ elements, previs: nextPrevis });
    }
    setWorkspace(next);
  }, [previs, scene, elements, setContent, contextShots, shotContext?.shotId, activePrevisShotId, setShotList]);

  const handleLinkPrevisShot = useCallback((shotId: string, cameraId: string) => {
    setShotList(project => ({ ...project, scenes: project.scenes.map(s => ({ ...s,
      shots: s.shots.map(shot => {
        if (shot.id !== shotId) return shot;
        // Shots already staged in this set through their scene keep that link.
        const own = s.linkedSceneId === scene.id ? shot.linkedSceneId : scene.id;
        const next = { ...shot, previsShotId: cameraId, linkedSceneId: own };
        if (!own) delete next.linkedSceneId;
        return next;
      }),
    })) }));
  }, [scene.id, setShotList]);

  const selectContextShot = useCallback((shotId: string) => {
    const shot = contextShots.find((item) => item.id === shotId);
    if (!shot || !contextScene) return;
    setShotContext({ sceneId: contextScene.id, shotId });
    setSelectedShotListSceneId(contextScene.id);
    setSelectedShotId(shotId);
    if (workspace !== 'previs' || !previs) return;
    const ensured = ensureShotCamera(previs, shot, activePrevisShotId);
    if (ensured.created) {
      setContent({ elements, previs: ensured.data });
      setShotList((project) => ({ ...project, scenes: project.scenes.map((item) => ({ ...item,
        shots: item.shots.map((s) => (s.id === shotId ? { ...s, previsShotId: ensured.cameraId } : s)) })) }));
    }
    setActivePrevisShotId(ensured.cameraId);
  }, [contextShots, contextScene, workspace, previs, activePrevisShotId, elements, setContent, setShotList]);

  const addContextShot = useCallback(() => {
    if (!contextScene) return;
    const shot = createShot(nextShotNumber(contextScene));
    setShotList((project) => ({ ...project, scenes: project.scenes.map((item) => (item.id === contextScene.id ? { ...item, shots: [...item.shots, shot] } : item)) }));
    // The new shot needs a scene set to live in; a set-less scene adopts the open one.
    if (!contextScene.linkedSceneId) handleShotListLinkCanvas(contextScene.id, shot.id, scene.id);
    setShotContext({ sceneId: contextScene.id, shotId: shot.id });
    if (workspace === 'previs' && previs) {
      const ensured = ensureShotCamera(previs, shot, activePrevisShotId);
      setContent({ elements, previs: ensured.data });
      setShotList((project) => ({ ...project, scenes: project.scenes.map((item) => ({ ...item,
        shots: item.shots.map((s) => (s.id === shot.id ? { ...s, previsShotId: ensured.cameraId } : s)) })) }));
      setActivePrevisShotId(ensured.cameraId);
    }
  }, [contextScene, workspace, previs, activePrevisShotId, elements, scene.id, setContent, setShotList, handleShotListLinkCanvas]);

  const updateContextShot = useCallback((shotId: string, patch: Partial<Shot>) => {
    setShotList((project) => ({ ...project, scenes: project.scenes.map((item) => ({ ...item,
      shots: item.shots.map((s) => (s.id === shotId ? { ...s, ...patch } : s)) })) }));
  }, [setShotList]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        if (workspace === 'shotList') {
          if (e.shiftKey) void handleShotListSaveAs();
          else handleShotListSave();
        } else if (e.shiftKey) {
          void handleSaveAs();
        } else {
          handleSave();
        }
        return;
      }
      if (e.target instanceof HTMLElement && (e.target.matches('input, textarea, select') || e.target.isContentEditable)) return;
      if (e.key === '?' && !mod) { e.preventDefault(); setShortcutsOpen(true); return; }
      if (workspace === 'shotList' && mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redoShotList(); else undoShotList(); return; }
      if (workspace !== 'canvas') return;

      if (e.key === 'Delete' || e.key === 'Backspace') handleDeleteSelected();
      if (!mod && (e.key === 'v' || e.key === 'V')) setTool('select');
      if (e.key === 'h' || e.key === 'H') setTool('pan');
      if (e.key === 'g' || e.key === 'G') setShowGrid((p) => !p);
      if (e.key === 's' && !mod) setGridSnap((p) => !p);
      if ((e.key === 'f' || e.key === 'F') && !mod) sceneCanvasRef.current?.fitToContent();
      if (e.key === 'Escape') setSelectedIds([]);
      if (mod && e.key === 'a') {
        e.preventDefault();
        setSelectedIds(elements.map((el) => el.id));
      }
      if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if (mod && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo(); }
      if (mod && e.key === 'y') { e.preventDefault(); redo(); }
      if (mod && e.key === 'd') {
        e.preventDefault();
        if (selectedId) handleDuplicate(selectedId);
      }

      // Copy / paste selected elements
      if (mod && e.key === 'c' && selectedIds.length > 0) {
        clipboardRef.current = elements.filter((el) => selectedIds.includes(el.id));
      }
      if (mod && e.key === 'v' && clipboardRef.current.length > 0) {
        e.preventDefault();
        const maxZ = elements.length > 0 ? Math.max(...elements.map((el) => el.zIndex)) : 0;
        const pasted = clipboardRef.current.map((el, i) => ({
          ...duplicateElement(el),
          zIndex: maxZ + 1 + i,
          locked: false,
        }));
        setElements((prev) => [...prev, ...pasted]);
        setSelectedIds(pasted.map((el) => el.id));
        // Repeated pastes cascade instead of stacking
        clipboardRef.current = pasted;
      }

      // Arrow-key nudge: 1px, or one grid cell with Shift
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selectedIds.length > 0) {
        e.preventDefault();
        const step = e.shiftKey ? scene.gridSize : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        setElements((prev) =>
          prev.map((el) =>
            selectedIds.includes(el.id) && !el.locked ? { ...el, x: el.x + dx, y: el.y + dy } : el
          )
        );
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, selectedIds, elements, scene.gridSize, workspace, handleDeleteSelected, handleDuplicate, handleSave, handleSaveAs, handleShotListSave, handleShotListSaveAs, setElements, undo, redo, undoShotList, redoShotList]);

  // Resizable divider drag handler
  const startResize = useCallback(
    (side: 'left' | 'right') => (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = side === 'left' ? leftWidth : rightWidth;
      const onMove = (ev: MouseEvent) => {
        const delta = side === 'left' ? ev.clientX - startX : startX - ev.clientX;
        const newW = Math.max(200, Math.min(500, startW + delta));
        if (side === 'left') setLeftWidth(newW);
        else setRightWidth(newW);
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
    },
    [leftWidth, rightWidth]
  );

  return (
    <div className="app" style={{ fontSize: `${uiScale * 100}%` }}>
      <Toolbar
        onShowShortcuts={() => setShortcutsOpen(true)}
        workspace={workspace}
        onWorkspaceChange={handleWorkspaceChange}
        isDirty={isDirty}
        sceneName={scene.name}
        onSceneNameChange={(name) => setScene((s) => ({ ...s, name }))}
        tool={tool}
        onToolChange={setTool}
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid((p) => !p)}
        gridSnap={gridSnap}
        onToggleSnap={() => setGridSnap((p) => !p)}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onLoad={handleLoad}
        onBrowse={handleBrowse}
        onExport={handleExport}
        onImport={handleImport}
        onExportImage={handleExportImage}
        onNew={handleNew}
        onDuplicateScene={handleDuplicateScene}
        scenesStorageLabel={getScenesStorageLabel()}
        onUndo={workspace === 'shotList' ? undoShotList : undo}
        onRedo={workspace === 'shotList' ? redoShotList : redo}
        canUndo={workspace === 'shotList' ? canUndoShotList : canUndo}
        canRedo={workspace === 'shotList' ? canRedoShotList : canRedo}
        uiScale={uiScale}
        onUiScaleChange={setUiScale}
      />

      {shortcutsOpen && <ShortcutDialog workspace={workspace} onClose={() => setShortcutsOpen(false)} />}
      {workspace !== 'shotList' && contextScene && (
        <ShotContextBar
          scene={contextScene}
          shots={contextShots}
          activeShotId={contextShotId}
          workspace={workspace}
          onSelectShot={selectContextShot}
          onAddShot={addContextShot}
          onUpdateShot={updateContextShot}
          onOpenShotList={() => {
            setSelectedShotListSceneId(contextScene.id);
            if (contextShotId) setSelectedShotId(contextShotId);
            setWorkspace('shotList');
          }}
        />
      )}
      {workspace === 'canvas' ? (
        <div className={`main-content ${canvasLibraryOpen ? '' : 'canvas-library-closed'} ${canvasInspectorOpen ? '' : 'canvas-inspector-closed'}`}>
        <div className="canvas-panel-toggles"><button aria-pressed={canvasLibraryOpen} onClick={() => canvasPanels.toggleLeft()}>☷ Library</button><span>2D BLOCKING & LIGHTING</span><button aria-pressed={canvasInspectorOpen} onClick={() => canvasPanels.toggleRight()}>Inspector ☷</button></div>
        <div className="left-sidebar" style={{ width: leftWidth * uiScale }}>
          <div className="sidebar-tabs">
            <button
              className={`sidebar-tab ${leftPanel === 'library' ? 'active' : ''}`}
              onClick={() => setLeftPanel('library')}
            >
              Library
            </button>
            <button
              className={`sidebar-tab ${leftPanel === 'layers' ? 'active' : ''}`}
              onClick={() => setLeftPanel('layers')}
            >
              Layers
            </button>
          </div>
          {leftPanel === 'library' ? (
            <ElementLibrary onAddElement={handleAddElement} />
          ) : (
            <ElementList
              elements={elements}
              selectedId={selectedId}
              onSelect={(id) => setSelectedIds([id])}
              onToggleVisibility={(id) =>
                handleChange(id, { visible: !elements.find((e) => e.id === id)?.visible })
              }
              onToggleLock={(id) =>
                handleChange(id, { locked: !elements.find((e) => e.id === id)?.locked })
              }
            />
          )}
        </div>
        <div className="resize-handle" onMouseDown={startResize('left')} />

        <SceneCanvas
          ref={sceneCanvasRef}
          elements={elements}
          selectedIds={selectedIds}
          onSelect={setSelectedIds}
          onChange={handleChange}
          onAdd={handleAddElementToCanvas}
          gridSize={scene.gridSize}
          showGrid={showGrid}
          gridSnap={gridSnap}
          tool={tool}
          backgroundColor={scene.backgroundColor}
          gridStyle={scene.gridStyle || 'lines'}
          gridColor={scene.gridColor || '#ffffff'}
          stageRef={stageRef}
        />

        <div className="resize-handle" onMouseDown={startResize('right')} />
        <div className="right-sidebar" style={{ width: rightWidth * uiScale }}>
          <PropertiesPanel
            element={selectedElement}
            onChange={handleChange}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
            onBringForward={handleBringForward}
            onSendBackward={handleSendBackward}
            backgroundColor={scene.backgroundColor}
            onBackgroundColorChange={(color) => setScene((s) => ({ ...s, backgroundColor: color }))}
            gridStyle={scene.gridStyle || 'lines'}
            onGridStyleChange={(style) => setScene((s) => ({ ...s, gridStyle: style }))}
            gridColor={scene.gridColor || '#ffffff'}
            onGridColorChange={(color) => setScene((s) => ({ ...s, gridColor: color }))}
          />
        </div>
        </div>
      ) : workspace === 'previs' && previs ? (
        <Suspense fallback={<p className="pv-loading">Opening 3D Studio…</p>}>
        <PrevisWorkspace
          key={scene.id}
          scene={scene}
          elements={elements}
          data={previs}
          shotList={shotList}
          activeShotId={activePrevisShotId}
          onActiveShotChange={(id) => {
            setActivePrevisShotId(id);
            const shot = contextShots.find((item) => item.previsShotId === id);
            if (contextScene) setShotContext({ sceneId: contextScene.id, shotId: shot?.id ?? null });
          }}
          shotLabels={Object.fromEntries(contextShots.filter((shot) => shot.previsShotId).map((shot) => [shot.previsShotId!, shot.number]))}
          onChange={(nextPrevis, nextElements) => setContent({ elements: nextElements, previs: nextPrevis })}
          onLinkShot={handleLinkPrevisShot}
          onSave={handleSave}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          toast={toast}
        />
        </Suspense>
      ) : (
        <ShotListWorkspace
          project={shotList}
          isDirty={isShotListDirty}
          uiScale={uiScale}
          selectedSceneId={selectedShotListSceneId}
          selectedShotId={selectedShotId}
          savedScenes={[{ ...scene, elements, previs }, ...getSavedScenes().filter(s => s.id !== scene.id)]}
          storageLabel={getShotListsStorageLabel()}
          onProjectChange={setShotList}
          onSelectScene={setSelectedShotListSceneId}
          onSelectShot={setSelectedShotId}
          onNew={handleShotListNew}
          onSave={handleShotListSave}
          onSaveAs={() => { void handleShotListSaveAs(); }}
          onLoad={handleShotListLoad}
          onBrowse={() => { void handleShotListBrowse(); }}
          onImportCsv={() => { void handleShotListCsvImport(); }}
          onExportCsv={() => {
            exportShotListCsv(shotList);
            toast('Shot list exported as CSV');
          }}
          onExportJson={() => {
            exportShotListProject(shotList);
            toast('Shot list exported as JSON');
          }}
          onOpenShot={handleOpenShot}
          onLinkSceneSet={handleLinkSceneSet}
          onLinkCanvas={handleShotListLinkCanvas}
        />
      )}

      {showToast && <div className="toast" role="status">{showToast}</div>}
    </div>
  );
}

export default App;
