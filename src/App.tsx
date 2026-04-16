import { useCallback, useEffect, useRef, useState } from 'react';
import { Scene, SceneElement, ElementTemplate, Tool } from './types';
import {
  createScene,
  createElementFromTemplate,
  saveSceneToLocalStorage,
  exportSceneToFile,
  importSceneFromFile,
  duplicateElement,
} from './utils/sceneUtils';
import { useHistory } from './hooks/useHistory';
import SceneCanvas from './components/SceneCanvas';
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

  // Persist panel sizes
  useEffect(() => { localStorage.setItem('shotdesigner_uiscale', String(uiScale)); }, [uiScale]);
  useEffect(() => { localStorage.setItem('shotdesigner_leftw', String(leftWidth)); }, [leftWidth]);
  useEffect(() => { localStorage.setItem('shotdesigner_rightw', String(rightWidth)); }, [rightWidth]);

  const toast = useCallback((msg: string) => {
    setShowToast(msg);
    setTimeout(() => setShowToast(null), 2500);
  }, []);

  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const selectedElement = selectedId ? elements.find((e) => e.id === selectedId) || null : null;

  const handleAddElement = useCallback(
    (template: ElementTemplate) => {
      const x = 400 + Math.random() * 200;
      const y = 300 + Math.random() * 200;
      const newEl = createElementFromTemplate(template, x, y, elements.length);
      setElements((prev) => [...prev, newEl]);
      setSelectedIds([newEl.id]);
    },
    [elements.length, setElements]
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
    const s = { ...scene, elements, updatedAt: new Date().toISOString() };
    saveSceneToLocalStorage(s);
    setScene(s);
    toast('Scene saved!');
  }, [scene, elements, toast]);

  const handleLoad = useCallback(
    (s: Scene) => {
      setScene(s);
      resetElements(s.elements);
      setSelectedIds([]);
      setShowGrid(s.showGrid);
      toast(`Loaded: ${s.name}`);
    },
    [resetElements, toast]
  );

  const handleExport = useCallback(() => {
    exportSceneToFile({ ...scene, elements });
    toast('Exported!');
  }, [scene, elements, toast]);

  const handleImport = useCallback(async () => {
    try {
      const imported = await importSceneFromFile();
      setScene(imported);
      resetElements(imported.elements);
      setSelectedIds([]);
      toast(`Imported: ${imported.name}`);
    } catch {
      toast('Import failed');
    }
  }, [resetElements, toast]);

  const handleExportImage = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) { toast('No canvas to export'); return; }

    const tr = stage.findOne('Transformer') as Konva.Transformer | undefined;
    if (tr) tr.nodes([]);
    stage.batchDraw();

    const padding = 60;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    if (elements.length > 0) {
      for (const el of elements) {
        const halfW = (el.width * Math.abs(el.scaleX || 1)) / 2 + (el.coneLength || 0);
        const halfH = (el.height * Math.abs(el.scaleY || 1)) / 2 + (el.coneLength || 0);
        minX = Math.min(minX, el.x - halfW);
        minY = Math.min(minY, el.y - halfH);
        maxX = Math.max(maxX, el.x + halfW);
        maxY = Math.max(maxY, el.y + halfH);
      }
      minX -= padding; minY -= padding; maxX += padding; maxY += padding;
    } else {
      minX = 0; minY = 0; maxX = 800; maxY = 600;
    }

    const dataUrl = stage.toDataURL({
      x: minX, y: minY,
      width: maxX - minX, height: maxY - minY,
      pixelRatio: Math.max(2, window.devicePixelRatio || 2),
      mimeType: 'image/png',
    });

    const link = document.createElement('a');
    link.download = `${scene.name.replace(/[^a-z0-9]/gi, '_')}.png`;
    link.href = dataUrl;
    link.click();

    if (selectedIds.length > 0 && tr) {
      const nodes: Konva.Node[] = [];
      for (const id of selectedIds) {
        const node = stage.findOne(`#${id}`);
        if (node) nodes.push(node);
      }
      tr.nodes(nodes);
      stage.batchDraw();
    }
    toast('Image exported!');
  }, [scene.name, toast, elements, selectedIds]);

  const handleNew = useCallback(() => {
    const s = createScene();
    setScene(s);
    resetElements([]);
    setSelectedIds([]);
    toast('New scene created');
  }, [resetElements, toast]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Delete' || e.key === 'Backspace') handleDeleteSelected();
      if (e.key === 'v' || e.key === 'V') setTool('select');
      if (e.key === 'h' || e.key === 'H') setTool('pan');
      if (e.key === 'g' || e.key === 'G') setShowGrid((p) => !p);
      if (e.key === 's' && !e.ctrlKey && !e.metaKey) setGridSnap((p) => !p);
      if (e.key === 'Escape') setSelectedIds([]);
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        setSelectedIds(elements.map((el) => el.id));
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSave(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        if (selectedId) handleDuplicate(selectedId);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, selectedIds, elements, handleDeleteSelected, handleDuplicate, handleSave, undo, redo]);

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
