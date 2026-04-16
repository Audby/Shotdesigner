import React from 'react';
import { SceneElement } from '../types';

interface Props {
  elements: SceneElement[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
}

const ElementList: React.FC<Props> = ({
  elements,
  selectedId,
  onSelect,
  onToggleVisibility,
  onToggleLock,
}) => {
  const sorted = [...elements].sort((a, b) => b.zIndex - a.zIndex);

  return (
    <div className="element-list">
      <div className="panel-header">
        <h3>Layers</h3>
        <span className="layer-count">{elements.length}</span>
      </div>
      <div className="layer-items">
        {sorted.map((el) => (
          <div
            key={el.id}
            className={`layer-item ${selectedId === el.id ? 'selected' : ''} ${!el.visible ? 'hidden-layer' : ''}`}
            onClick={() => onSelect(el.id)}
          >
            <div className="layer-color" style={{ backgroundColor: el.color }} />
            <span className="layer-name">{el.label}</span>
            <div className="layer-actions">
              <button
                className="layer-btn"
                onClick={(e) => { e.stopPropagation(); onToggleVisibility(el.id); }}
                title={el.visible ? 'Hide' : 'Show'}
              >
                {el.visible ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" />
                  </svg>
                )}
              </button>
              <button
                className="layer-btn"
                onClick={(e) => { e.stopPropagation(); onToggleLock(el.id); }}
                title={el.locked ? 'Unlock' : 'Lock'}
              >
                {el.locked ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM9 8V6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9z" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h2c0-1.66 1.34-3 3-3s3 1.34 3 3v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        ))}
        {elements.length === 0 && (
          <div className="empty-layers">
            <p>No elements yet</p>
            <p className="hint">Drag from the library or click to add</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ElementList;
