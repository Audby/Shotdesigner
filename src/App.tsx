import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Scene, SceneElement, ElementTemplate, Tool } from './types';
import {
  createScene,
  createElementFromTemplate,
  saveSceneToLocalStorage,
  getScenesStorageLabel,
  duplicateScene,
  exportSceneToFile,
  importSceneFromFile,
  duplicateElement,
} from './utils/sceneUtils';
import { useHistory } from './hooks/useHistory';
import { elementTemplates } from './data/elementLibrary';
import SceneCanvas, { SceneCanvasHandle } from './components/SceneCanvas';
import ElementLibrary from './components/ElementLibrary';
import PropertiesPanel from './components/PropertiesPanel';
import Toolbar from './components/Toolbar';
import ElementList from './components/ElementList';
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

  const confirmDiscard = useCallback(() => {
    return !isDirty || window.confirm('You have unsaved changes. Discard them?');
  }, [isDirty]);

  // Warn before closing the window with unsaved work
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

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
    ];
    const seeded = demoTypes.flatMap((type, i) => {
      const template = elementTemplates.find((t) => t.type === type);
      if (!template) return [];
      return [createElementFromTemplate(template, 140 + (i % 6) * 180, 120 + Math.floor(i / 6) * 160, i)];
    });
    resetElements(seeded);
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const mod = e.ctrlKey || e.metaKey;

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
      if (mod && e.key === 's') { e.preventDefault(); handleSave(); }
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
  }, [selectedId, selectedIds, elements, scene.gridSize, handleDeleteSelected, handleDuplicate, handleSave, setElements, undo, redo]);

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
        onLoad={handleLoad}
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

      {showToast && <div className="toast">{showToast}</div>}
    </div>
  );
}

export default App;
