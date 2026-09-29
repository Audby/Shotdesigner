import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Tool, Scene, WorkspaceMode } from '../types';
import { getSavedScenes, deleteScene } from '../utils/sceneUtils';

interface Props {
  onShowShortcuts: () => void;
  workspace: WorkspaceMode;
  onWorkspaceChange: (workspace: WorkspaceMode) => void;
  isDirty: boolean;
  sceneName: string;
  onSceneNameChange: (name: string) => void;
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  gridSnap: boolean;
  onToggleSnap: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onLoad: (scene: Scene) => void;
  onBrowse: () => void;
  onExport: () => void;
  onImport: () => void;
  onExportImage: () => void;
  onNew: () => void;
  onDuplicateScene: () => void;
  scenesStorageLabel: string;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  uiScale: number;
  onUiScaleChange: (scale: number) => void;
}

const stroke = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const formatWhen = (iso: string): string => {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  const diff = Date.now() - time;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(time).toLocaleDateString();
};

const Toolbar: React.FC<Props> = ({
  workspace,
  onShowShortcuts,
  onWorkspaceChange,
  isDirty,
  sceneName,
  onSceneNameChange,
  tool,
  onToolChange,
  showGrid,
  onToggleGrid,
  gridSnap,
  onToggleSnap,
  onSave,
  onSaveAs,
  onLoad,
  onBrowse,
  onExport,
  onImport,
  onExportImage,
  onNew,
  onDuplicateScene,
  scenesStorageLabel,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  uiScale,
  onUiScaleChange,
}) => {
  const [showSceneMenu, setShowSceneMenu] = useState(false);
  const [savedScenes, setSavedScenes] = useState<Scene[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const refreshScenes = useCallback(() => {
    setSavedScenes(getSavedScenes());
  }, []);

  const toggleSceneMenu = () => {
    setShowSceneMenu((open) => {
      if (!open) refreshScenes();
      return !open;
    });
  };

  useEffect(() => {
    if (!showSceneMenu) return;
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowSceneMenu(false); };
    document.addEventListener('keydown', escape);
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowSceneMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => { document.removeEventListener('mousedown', handleClickOutside); document.removeEventListener('keydown', escape); };
  }, [showSceneMenu]);

  const handleDeleteScene = (e: React.MouseEvent, scene: Scene) => {
    e.stopPropagation();
    if (!window.confirm(`Delete scene "${scene.name}"? This cannot be undone.`)) return;
    if (deleteScene(scene)) {
      refreshScenes();
    }
  };

  return (
    <header className="toolbar">
      <div className="toolbar-top">
        <div className="app-logo">
          <svg width="28" height="28" viewBox="0 0 28 28" {...stroke}><path d="M3 10V4h6M19 4h6v6M25 18v6h-6M9 24H3v-6" /><path d="m11 9 8 5-8 5z" /></svg>
          <span className="app-title">shot<span>designer</span><small>THE FILMMAKER’S WORKSPACE</small></span>
        </div>
        {workspace !== 'shotList' && <div className="scene-name-wrapper"><span className="document-label">SCENE</span><input className="scene-name-input" value={sceneName} onChange={e => onSceneNameChange(e.target.value)} aria-label="Scene name" /><span className={`save-status ${isDirty ? 'unsaved' : ''}`}>{isDirty ? 'Unsaved changes' : 'Saved'}</span></div>}
        <div className="toolbar-right">
          {workspace !== 'shotList' && <>
            <div className="dropdown-wrapper" ref={dropdownRef}>
              <button className="header-button" aria-expanded={showSceneMenu} onClick={toggleSceneMenu}>File <span>⌄</span></button>
              {showSceneMenu && <div className="dropdown-menu file-menu">
                <span className="menu-eyebrow">SCENE FILE</span>
                <button onClick={() => { onNew(); setShowSceneMenu(false); }}>New scene <kbd>＋</kbd></button>
                <button onClick={() => { onDuplicateScene(); setShowSceneMenu(false); }}>Duplicate scene</button>
                <button onClick={() => { onBrowse(); setShowSceneMenu(false); }}>Open scene file…</button>
                <button onClick={() => { onSaveAs(); setShowSceneMenu(false); }}>Save as… <kbd>⇧⌘S</kbd></button>
                <div className="menu-rule" />
                <button onClick={() => { onImport(); setShowSceneMenu(false); }}>Import JSON…</button>
                <button onClick={() => { onExport(); setShowSceneMenu(false); }}>Export JSON</button>
                {workspace === 'canvas' && <button onClick={() => { onExportImage(); setShowSceneMenu(false); }}>Export diagram as PNG</button>}
                <div className="menu-rule" />
                <span className="menu-eyebrow">RECENT SCENES</span>
                <div className="recent-scenes">{savedScenes.map(s => <div className="recent-scene" key={s.id}><button onClick={() => { onLoad(s); setShowSceneMenu(false); }}><span>{s.name}</span><small>{formatWhen(s.updatedAt)}</small></button><button aria-label={`Delete ${s.name}`} onClick={e => handleDeleteScene(e, s)}>×</button></div>)}</div>
                {!savedScenes.length && <p className="dropdown-empty">Your saved scenes will appear here.</p>}
                <div className="menu-rule" />
                <label className="ui-scale-control">Panel scale<input aria-label="Panel scale" type="range" min="0.7" max="1.4" step="0.05" value={uiScale} onChange={e => onUiScaleChange(parseFloat(e.target.value))} /><span>{Math.round(uiScale * 100)}%</span></label>
                <p className="dropdown-note">Saved in {scenesStorageLabel}</p>
              </div>}
            </div>
            <button className="header-button save-scene-button" onClick={onSave} title="Save scene (⌘/Ctrl+S)">Save scene <span>↗</span></button>
          </>}
          <button className="header-button" onClick={onShowShortcuts} title="Keyboard shortcuts (?)">Shortcuts <kbd>?</kbd></button>
          {workspace === 'shotList' && <span className="header-context">PLAN THE DAY. FIND THE FRAME.</span>}
        </div>
      </div>
      <div className="toolbar-bottom">
        <nav className="workspace-switcher" aria-label="Workspace">
          {([['shotList', '01', 'Shot list'], ['canvas', '02', '2D plan'], ['previs', '03', '3D studio']] as const).map(([id, number, label]) => <button key={id} className={workspace === id ? 'active' : ''} aria-current={workspace === id ? 'page' : undefined} onClick={() => onWorkspaceChange(id)}><span>{number}</span>{label}</button>)}
        </nav>
        <div className="toolbar-center">
          {workspace === 'shotList' && <div className="tool-group"><button className="tool-btn" disabled={!canUndo} onClick={onUndo} title="Undo (⌘/Ctrl+Z)">↶</button><button className="tool-btn" disabled={!canRedo} onClick={onRedo} title="Redo (⌘/Ctrl+Shift+Z)">↷</button></div>}
          {workspace === 'canvas' ? <>
        <div className="tool-group">
          <button
            className={`tool-btn ${tool === 'select' ? 'active' : ''}`}
            onClick={() => onToolChange('select')}
            title="Select (V)"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
              <path d="M4 3l7.5 17 2.3-7.2L21 10.5 4 3z" />
            </svg>
          </button>
          <button
            className={`tool-btn ${tool === 'pan' ? 'active' : ''}`}
            onClick={() => onToolChange('pan')}
            title="Pan (H, or hold Space)"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
              <path d="M18 11V6.5a1.5 1.5 0 0 0-3 0V11m0-.5v-3a1.5 1.5 0 0 0-3 0V11m0-.5v-2a1.5 1.5 0 0 0-3 0V12m9-1v-2a1.5 1.5 0 0 1 3 0v5.5a6.5 6.5 0 0 1-6.5 6.5h-1c-2.5 0-4-1-5.5-3L5 14.5c-.7-1-.3-2.2.7-2.7 0 0 1.3-.6 2.3.9V6a1.5 1.5 0 0 1 3-.5" />
            </svg>
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="tool-group">
          <button
            className={`tool-btn ${showGrid ? 'active' : ''}`}
            onClick={onToggleGrid}
            title="Toggle Grid (G)"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
            </svg>
          </button>
          <button
            className={`tool-btn ${gridSnap ? 'active' : ''}`}
            onClick={onToggleSnap}
            title="Snap to Grid (S)"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
              <path d="M5 3v7a7 7 0 0 0 14 0V3" />
              <path d="M5 3h4v5H5zM15 3h4v5h-4z" />
            </svg>
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="tool-group">
          <button className="tool-btn" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
              <path d="M9 14L4 9l5-5" />
              <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
            </svg>
          </button>
          <button className="tool-btn" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
            <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
              <path d="M15 14l5-5-5-5" />
              <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
            </svg>
          </button>
        </div>

          </> : <span className="workspace-description">{workspace === 'previs' ? 'Build the space. Compose the shot.' : 'Your story, one shot at a time.'}</span>}
        </div>
      </div>
    </header>
  );
};

export default Toolbar;
