import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Tool, Scene } from '../types';
import { getSavedScenes, deleteScene } from '../utils/sceneUtils';

interface Props {
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
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowSceneMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSceneMenu]);

  const handleDeleteScene = (e: React.MouseEvent, scene: Scene) => {
    e.stopPropagation();
    if (!window.confirm(`Delete scene "${scene.name}"? This cannot be undone.`)) return;
    if (deleteScene(scene)) {
      refreshScenes();
    }
  };

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <div className="app-logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="2.5" y="8" width="19" height="12.5" rx="2.5" fill="var(--accent)" opacity="0.16" stroke="var(--accent)" strokeWidth="1.8" />
            <path d="M3 8l2.8-4.6a2 2 0 0 1 1.7-1L20 2.5a1.5 1.5 0 0 1 1.4 2.1L20 8" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M8.2 7.6l2.4-4.4M13.4 7.4l2.4-4.4" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="12" cy="14.5" r="2.6" stroke="var(--accent-light)" strokeWidth="1.6" />
          </svg>
          <span className="app-title">Shot Designer</span>
        </div>

        <div className="toolbar-divider" />

        <div className="scene-name-wrapper">
          <input
            type="text"
            className="scene-name-input"
            value={sceneName}
            onChange={(e) => onSceneNameChange(e.target.value)}
            title="Scene name"
          />
          {isDirty && <span className="dirty-dot" title="Unsaved changes" />}
        </div>
      </div>

      <div className="toolbar-center">
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
      </div>

      <div className="toolbar-right">
        <div className="tool-group">
          <button className="tool-btn" onClick={onNew} title="New Scene">
            <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
              <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
              <path d="M14 3v6h6M12 12v6M9 15h6" />
            </svg>
          </button>
          <button className="tool-btn" onClick={onDuplicateScene} title="Duplicate Current Scene">
            <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
              <rect x="9" y="9" width="12" height="12" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
          <div className="dropdown-wrapper" ref={dropdownRef}>
            <button
              className={`tool-btn ${showSceneMenu ? 'active' : ''}`}
              onClick={toggleSceneMenu}
              title={`Open Scene from ${scenesStorageLabel}`}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
                <path d="M4 20h14a2 2 0 0 0 2-1.5l1.7-7A2 2 0 0 0 19.8 9H8.6a2 2 0 0 0-2 1.5L4 20zm0 0V5a2 2 0 0 1 2-2h4l2 3h6a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
            {showSceneMenu && (
              <div className="dropdown-menu">
                <div className="dropdown-note">Saved in {scenesStorageLabel}</div>
                {savedScenes.map((s) => (
                  <div
                    key={s.id}
                    className="dropdown-item"
                    onClick={() => { onLoad(s); setShowSceneMenu(false); }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') { onLoad(s); setShowSceneMenu(false); } }}
                  >
                    <span className="dropdown-scene-name">{s.name}</span>
                    <span className="dropdown-meta">
                      <span className="dropdown-date">{formatWhen(s.updatedAt)}</span>
                      <button
                        className="dropdown-delete"
                        onClick={(e) => handleDeleteScene(e, s)}
                        title={`Delete "${s.name}"`}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" {...stroke}>
                          <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />
                        </svg>
                      </button>
                    </span>
                  </div>
                ))}
                {savedScenes.length === 0 && (
                  <div className="dropdown-empty">No saved scenes yet</div>
                )}
                <div className="dropdown-footer">
                  <button
                    className="dropdown-browse"
                    onClick={() => { setShowSceneMenu(false); onBrowse(); }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" {...stroke}>
                      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.2 3.9A2 2 0 0 0 7.5 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2z" />
                      <circle cx="11.5" cy="12.5" r="2.5" />
                      <path d="M13.3 14.3L15.5 16.5" />
                    </svg>
                    Browse for a scene file…
                  </button>
                </div>
              </div>
            )}
          </div>
          <button
            className={`tool-btn save-btn ${isDirty ? 'needs-save' : ''}`}
            onClick={onSave}
            title={`Save to ${scenesStorageLabel} (Ctrl+S)`}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <path d="M17 21v-8H7v8M7 3v5h8" />
            </svg>
            {isDirty && <span className="save-dot" />}
          </button>
          <button
            className="tool-btn"
            onClick={onSaveAs}
            title="Save As… choose a file and folder (Ctrl+Shift+S)"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v6" />
              <path d="M7 3v5h8M7 21v-6h5" />
              <path d="M18 15v6M15 18h6" />
            </svg>
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="tool-group">
          <button className="tool-btn" onClick={onImport} title="Import scene file (JSON)">
            <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 8l5-5 5 5M12 3v12" />
            </svg>
          </button>
          <button className="tool-btn" onClick={onExport} title="Export scene file (JSON)">
            <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
          </button>
          <button className="tool-btn" onClick={onExportImage} title="Export as PNG image">
            <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="M21 15l-4.5-4.5L6 21" />
            </svg>
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="ui-scale-control" title="UI Scale">
          <svg width="14" height="14" viewBox="0 0 24 24" {...stroke} opacity="0.55">
            <path d="M21 3l-6 6M21 3h-5M21 3v5M3 21l6-6M3 21h5M3 21v-5" />
          </svg>
          <input
            type="range"
            min="0.7"
            max="1.4"
            step="0.05"
            value={uiScale}
            onChange={(e) => onUiScaleChange(parseFloat(e.target.value))}
            className="ui-scale-slider"
          />
          <span className="ui-scale-label">{Math.round(uiScale * 100)}%</span>
        </div>
      </div>
    </div>
  );
};

export default Toolbar;
