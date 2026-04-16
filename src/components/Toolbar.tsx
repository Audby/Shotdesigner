import React, { useState, useEffect, useRef } from 'react';
import { Tool, Scene } from '../types';
import { getSavedScenes } from '../utils/sceneUtils';

interface Props {
  sceneName: string;
  onSceneNameChange: (name: string) => void;
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  gridSnap: boolean;
  onToggleSnap: () => void;
  onSave: () => void;
  onLoad: (scene: Scene) => void;
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

const Toolbar: React.FC<Props> = ({
  sceneName,
  onSceneNameChange,
  tool,
  onToolChange,
  showGrid,
  onToggleGrid,
  gridSnap,
  onToggleSnap,
  onSave,
  onLoad,
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
  const dropdownRef = useRef<HTMLDivElement>(null);
  const savedScenes = getSavedScenes();

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

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <div className="app-logo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="3" width="20" height="14" rx="2" stroke="#7c4dff" strokeWidth="2" />
            <path d="M8 21h8M12 17v4" stroke="#7c4dff" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="10" r="3" stroke="#b388ff" strokeWidth="1.5" />
          </svg>
          <span className="app-title">Shot Designer</span>
        </div>

        <div className="toolbar-divider" />

        <input
          type="text"
          className="scene-name-input"
          value={sceneName}
          onChange={(e) => onSceneNameChange(e.target.value)}
          title="Scene name"
        />
      </div>

      <div className="toolbar-center">
        <div className="tool-group">
          <button
            className={`tool-btn ${tool === 'select' ? 'active' : ''}`}
            onClick={() => onToolChange('select')}
            title="Select (V)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 2l10 10h-6l4 10-3 1-4-10-4 4z" />
            </svg>
          </button>
          <button
            className={`tool-btn ${tool === 'pan' ? 'active' : ''}`}
            onClick={() => onToolChange('pan')}
            title="Pan (Space+Drag)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 9h4V6h3l-5-5-5 5h3v3zm-1 1H6V7l-5 5 5 5v-3h3v-4zm14 2l-5-5v3h-3v4h3v3l5-5zm-9 3h-4v3H7l5 5 5-5h-3v-3z" />
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 4h4v4H4V4zm6 0h4v4h-4V4zm6 0h4v4h-4V4zM4 10h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4zM4 16h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4z" />
            </svg>
          </button>
          <button
            className={`tool-btn ${gridSnap ? 'active' : ''}`}
            onClick={onToggleSnap}
            title="Snap to Grid (S)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 14H6v-2h12v2zm0-4H6v-2h12v2zm0-4H6V6h12v2z" />
            </svg>
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="tool-group">
          <button className="tool-btn" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.5 8c-2.65 0-5.05 1-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z" />
            </svg>
          </button>
          <button className="tool-btn" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.4 10.6C16.55 9 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z" />
            </svg>
          </button>
        </div>
      </div>

      <div className="toolbar-right">
        <div className="tool-group">
          <button className="tool-btn" onClick={onNew} title="New Scene">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6zm5-6v-3h2v3h3v2h-3v3h-2v-3H8v-2h3z" />
            </svg>
          </button>
          <button className="tool-btn" onClick={onDuplicateScene} title="Duplicate Current Scene">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
            </svg>
          </button>
          <div className="dropdown-wrapper" ref={dropdownRef}>
            <button className="tool-btn" onClick={() => setShowSceneMenu(!showSceneMenu)} title={`Open Scene from ${scenesStorageLabel}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z" />
              </svg>
            </button>
            {showSceneMenu && (
              <div className="dropdown-menu">
                <div className="dropdown-note">Saved in {scenesStorageLabel}</div>
                {savedScenes.map((s) => (
                  <button
                    key={s.id}
                    className="dropdown-item"
                    onClick={() => { onLoad(s); setShowSceneMenu(false); }}
                  >
                    <span>{s.name}</span>
                    <span className="dropdown-date">
                      {new Date(s.updatedAt).toLocaleDateString()}
                    </span>
                  </button>
                ))}
                {savedScenes.length === 0 && (
                  <div className="dropdown-empty">No saved scenes in {scenesStorageLabel}</div>
                )}
              </div>
            )}
          </div>
          <button className="tool-btn save-btn" onClick={onSave} title={`Save to ${scenesStorageLabel} (Ctrl+S)`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z" />
            </svg>
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="tool-group">
          <button className="tool-btn" onClick={onImport} title="Import JSON">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z" />
            </svg>
          </button>
          <button className="tool-btn" onClick={onExport} title="Export JSON">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z" />
            </svg>
          </button>
          <button className="tool-btn" onClick={onExportImage} title="Export as PNG">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
            </svg>
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="ui-scale-control" title="UI Scale">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" opacity="0.5">
            <path d="M15 3l2.3 2.3-2.89 2.87 1.42 1.42L18.7 6.7 21 9V3h-6zM3 9l2.3-2.3 2.87 2.89 1.42-1.42L6.7 5.3 9 3H3v6zm6 12l-2.3-2.3 2.89-2.87-1.42-1.42L5.3 17.3 3 15v6h6zm12-6l-2.3 2.3-2.87-2.89-1.42 1.42 2.89 2.87L15 21h6v-6z" />
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
