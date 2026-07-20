import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Scene, SceneElement, ElementTemplate, Tool, ShotListProject, WorkspaceMode } from './types';
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
import { elementTemplates } from './data/elementLibrary';
import SceneCanvas, { SceneCanvasHandle } from './components/SceneCanvas';
import ElementLibrary from './components/ElementLibrary';
import PropertiesPanel from './components/PropertiesPanel';
import Toolbar from './components/Toolbar';
import ElementList from './components/ElementList';
import ShotListWorkspace from './components/ShotListWorkspace';
import {
  browseForShotList,
  createShotListProject,
  exportShotListProject,
  getShotListsStorageLabel,
  makeShotListSnapshot,
  normalizeShotListProject,
  saveShotListAs,
  saveShotListProject,
} from './utils/shotListUtils';
import { exportShotListCsv, importShotListCsv } from './utils/shotListCsv';
import Konva from 'konva';

function App() {
  const {
    state: elements,
    set: setElements,
    undo,
    redo,
    canUndo,
    canRedo,
    reset: resetElements,
  } = useHistory<SceneElement[]>([]);

  const [scene, setScene] = useState<Scene>(createScene);
  const [workspace, setWorkspace] = useState<WorkspaceMode>('canvas');
  const [shotList, setShotList] = useState<ShotListProject>(createShotListProject);
  const [selectedShotListSceneId, setSelectedShotListSceneId] = useState('');
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tool, setTool] = useState<Tool>('select');
  const [showGrid, setShowGrid] = useState(true);
  const [gridSnap, setGridSnap] = useState(true);
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
    });
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() => makeSnapshot(scene, []));
  const isDirty = useMemo(
    () => makeSnapshot(scene, elements) !== savedSnapshot,
    [scene, elements, savedSnapshot]
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
    const saveResult = saveSceneToLocalStorage({ ...scene, elements });
    setScene(saveResult.scene);
    setSavedSnapshot(makeSnapshot(saveResult.scene, elements));
    toast(`Scene saved to ${saveResult.relativePath}`);
  }, [scene, elements, toast]);

  const handleSaveAs = useCallback(async () => {
    const result = await saveSceneAs({ ...scene, elements });
    if (result.status === 'canceled') return;
    if (result.status === 'error') {
      toast('Save As failed');
      return;
    }
    setScene(result.scene);
    setSavedSnapshot(makeSnapshot(result.scene, elements));
    toast(`Saved to ${result.relativePath}`);
  }, [scene, elements, toast]);

  const handleLoad = useCallback(
    (s: Scene) => {
      if (!confirmDiscard()) return;
      setScene(s);
      resetElements(s.elements);
      setSelectedIds([]);
      setShowGrid(s.showGrid);
      setSavedSnapshot(makeSnapshot(s, s.elements));
      toast(`Loaded: ${s.name}`);
    },
    [confirmDiscard, resetElements, toast]
  );

  const handleExport = useCallback(() => {
    exportSceneToFile({ ...scene, elements });
    toast('Exported!');
  }, [scene, elements, toast]);

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
      setScene(imported);
      resetElements(imported.elements);
      setSelectedIds([]);
      toast(`Imported: ${imported.name} — save to keep it`);
    } catch {
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
    const s = createScene();
    setScene(s);
    resetElements([]);
    setSelectedIds([]);
    setSavedSnapshot(makeSnapshot(s, []));
    toast('New scene created');
  }, [confirmDiscard, resetElements, toast]);

  const handleDuplicateScene = useCallback(() => {
    const duplicatedScene = duplicateScene({ ...scene, elements });
    const saveResult = saveSceneToLocalStorage(duplicatedScene);
    setScene(saveResult.scene);
    resetElements(saveResult.scene.elements);
    setSelectedIds([]);
    setShowGrid(saveResult.scene.showGrid);
    setSavedSnapshot(makeSnapshot(saveResult.scene, saveResult.scene.elements));
    toast(`Duplicated to ${saveResult.relativePath}`);
  }, [elements, resetElements, scene, toast]);

  const handleShotListSave = useCallback(() => {
    const result = saveShotListProject(shotList);
    setShotList(result.project);
    setSavedShotListSnapshot(makeShotListSnapshot(result.project));
    toast(`Shot list saved to ${result.relativePath}`);
  }, [shotList, toast]);

  const handleShotListSaveAs = useCallback(async () => {
    const result = await saveShotListAs(shotList);
    if (result.status === 'canceled') return;
    if (result.status === 'error') {
      toast('Shot-list Save As failed');
      return;
    }
    setShotList(result.project);
    setSavedShotListSnapshot(makeShotListSnapshot(result.project));
    toast(`Shot list saved to ${result.relativePath}`);
  }, [shotList, toast]);

  const handleShotListLoad = useCallback((project: ShotListProject) => {
    if (!confirmShotListDiscard()) return;
    const normalized = normalizeShotListProject(project);
    setShotList(normalized);
    setSelectedShotListSceneId(normalized.scenes[0]?.id ?? '');
    setSelectedShotId(null);
    setSavedShotListSnapshot(makeShotListSnapshot(normalized));
    setWorkspace('shotList');
    toast(`Loaded shot list: ${normalized.name}`);
  }, [confirmShotListDiscard, toast]);

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
    setShotList(project);
    setSelectedShotListSceneId(project.scenes[0]?.id ?? '');
    setSelectedShotId(null);
    setSavedShotListSnapshot(makeShotListSnapshot(project));
    toast('New shot list created');
  }, [confirmShotListDiscard, toast]);

  const handleShotListCsvImport = useCallback(async () => {
    if (!confirmShotListDiscard()) return;
    const result = await importShotListCsv();
    if (result.status === 'canceled') return;
    if (result.status === 'error') {
      toast('CSV import failed');
      return;
    }
    setShotList(result.project);
    setSelectedShotListSceneId(result.project.scenes[0]?.id ?? '');
    setSelectedShotId(result.project.scenes[0]?.shots[0]?.id ?? null);
    setSavedShotListSnapshot('');
    toast(`Imported ${result.fileName} — save to keep it`);
  }, [confirmShotListDiscard, toast]);

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
            shots: shotListScene.shots.map((shot) => shot.id === shotId
              ? { ...shot, linkedSceneId }
              : shot),
          }
        : shotListScene),
    }));
  }, []);

  const handleCreateCanvasForShot = useCallback((shotListSceneId: string, shotId: string) => {
    if (!confirmDiscard()) return;
    const shotListScene = shotList.scenes.find((item) => item.id === shotListSceneId);
    const shot = shotListScene?.shots.find((item) => item.id === shotId);
    if (!shot || !shotListScene) return;

    const label = shot.description.trim()
      ? `${shot.number} – ${shot.description.trim().slice(0, 48)}`
      : `${shot.number} – ${shotListScene.title}`;
    const createdScene = createScene(label);
    const saveResult = saveSceneToLocalStorage(createdScene);
    setScene(saveResult.scene);
    resetElements(saveResult.scene.elements);
    setSelectedIds([]);
    setShowGrid(saveResult.scene.showGrid);
    setSavedSnapshot(makeSnapshot(saveResult.scene, saveResult.scene.elements));
    handleShotListLinkCanvas(shotListSceneId, shotId, saveResult.scene.id);
    setWorkspace('canvas');
    toast(`Canvas created for shot ${shot.number}`);
  }, [confirmDiscard, handleShotListLinkCanvas, resetElements, shotList.scenes, toast]);

  const handleOpenCanvasForShot = useCallback((shotListSceneId: string, shotId: string) => {
    if (!confirmDiscard()) return;
    const shot = shotList.scenes
      .find((item) => item.id === shotListSceneId)
      ?.shots.find((item) => item.id === shotId);
    if (!shot?.linkedSceneId) return;
    const linkedScene = getSavedScenes().find((savedScene) => savedScene.id === shot.linkedSceneId);
    if (!linkedScene) {
      toast('The linked canvas could not be found');
      return;
    }
    setScene(linkedScene);
    resetElements(linkedScene.elements);
    setSelectedIds([]);
    setShowGrid(linkedScene.showGrid);
    setSavedSnapshot(makeSnapshot(linkedScene, linkedScene.elements));
    setWorkspace('canvas');
    toast(`Opened canvas: ${linkedScene.name}`);
  }, [confirmDiscard, resetElements, shotList.scenes, toast]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (workspace === 'shotList') return;

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
  }, [selectedId, selectedIds, elements, scene.gridSize, workspace, handleDeleteSelected, handleDuplicate, handleSave, handleSaveAs, handleShotListSave, handleShotListSaveAs, setElements, undo, redo]);

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
        workspace={workspace}
        onWorkspaceChange={setWorkspace}
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
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        uiScale={uiScale}
        onUiScaleChange={setUiScale}
      />

      {workspace === 'canvas' ? (
        <div className="main-content">
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
      ) : (
        <ShotListWorkspace
          project={shotList}
          isDirty={isShotListDirty}
          uiScale={uiScale}
          selectedSceneId={selectedShotListSceneId}
          selectedShotId={selectedShotId}
          savedScenes={getSavedScenes()}
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
          onCreateCanvas={handleCreateCanvasForShot}
          onOpenCanvas={handleOpenCanvasForShot}
          onLinkCanvas={handleShotListLinkCanvas}
        />
      )}

      {showToast && <div className="toast">{showToast}</div>}
    </div>
  );
}

export default App;
