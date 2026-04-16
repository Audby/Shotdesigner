import React from 'react';
import { SceneElement } from '../types';

interface Props {
  element: SceneElement | null;
  onChange: (id: string, updates: Partial<SceneElement>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onBringForward: (id: string) => void;
  onSendBackward: (id: string) => void;
  backgroundColor?: string;
  onBackgroundColorChange?: (color: string) => void;
  gridStyle?: 'lines' | 'dots' | 'none';
  onGridStyleChange?: (style: 'lines' | 'dots' | 'none') => void;
  gridColor?: string;
  onGridColorChange?: (color: string) => void;
}

const PropertiesPanel: React.FC<Props> = ({
  element,
  onChange,
  onDelete,
  onDuplicate,
  onBringForward,
  onSendBackward,
  backgroundColor,
  onBackgroundColorChange,
  gridStyle,
  onGridStyleChange,
  gridColor,
  onGridColorChange,
}) => {
  if (!element) {
    return (
      <div className="properties-panel empty-properties">
        <div className="empty-state">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
          <p>Select an element<br />to edit properties</p>
        </div>
        {backgroundColor && onBackgroundColorChange && (
          <div className="canvas-settings">
            <div className="panel-header">
              <h3>Canvas</h3>
            </div>
            <div className="prop-group">
              <label>Background Color</label>
              <div className="color-input-row">
                <input
                  type="color"
                  value={backgroundColor.slice(0, 7)}
                  onChange={(e) => onBackgroundColorChange(e.target.value)}
                />
                <input
                  type="text"
                  value={backgroundColor}
                  onChange={(e) => onBackgroundColorChange(e.target.value)}
                  className="color-text"
                />
              </div>
            </div>
            {onGridStyleChange && (
              <div className="prop-group">
                <label>Grid Style</label>
                <select
                  value={gridStyle || 'lines'}
                  onChange={(e) => onGridStyleChange(e.target.value as 'lines' | 'dots' | 'none')}
                >
                  <option value="lines">Lines</option>
                  <option value="dots">Dots</option>
                  <option value="none">None</option>
                </select>
              </div>
            )}
            {onGridColorChange && gridStyle !== 'none' && (
              <div className="prop-group">
                <label>Grid Color</label>
                <div className="color-input-row">
                  <input
                    type="color"
                    value={(gridColor || '#ffffff').slice(0, 7)}
                    onChange={(e) => onGridColorChange(e.target.value)}
                  />
                  <input
                    type="text"
                    value={gridColor || '#ffffff'}
                    onChange={(e) => onGridColorChange(e.target.value)}
                    className="color-text"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const rotationLabel = element.category === 'characters' ? 'Facing Direction' : 'Rotation';

  return (
    <div className="properties-panel">
      <div className="panel-header">
        <h3>Properties</h3>
        <span className="element-type-badge">{element.category}</span>
      </div>

      <div className="prop-group">
        <label>Label</label>
        <input
          type="text"
          value={element.label}
          onChange={(e) => onChange(element.id, { label: e.target.value })}
        />
      </div>

      <div className="prop-row">
        <div className="prop-group half">
          <label>X</label>
          <input
            type="number"
            value={Math.round(element.x)}
            onChange={(e) => onChange(element.id, { x: Number(e.target.value) })}
          />
        </div>
        <div className="prop-group half">
          <label>Y</label>
          <input
            type="number"
            value={Math.round(element.y)}
            onChange={(e) => onChange(element.id, { y: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="prop-row">
        <div className="prop-group half">
          <label>
            {element.category === 'shapes' && ['shape-line', 'shape-dashed-line', 'shape-arrow', 'shape-arrow-double'].includes(element.type) ? 'Length' : 'Width'}
          </label>
          <input
            type="number"
            min={5}
            value={Math.round(element.width)}
            onChange={(e) => onChange(element.id, { width: Math.max(5, Number(e.target.value)) })}
          />
        </div>
        <div className="prop-group half">
          <label>
            {['shape-line', 'shape-dashed-line'].includes(element.type) ? 'Thickness' :
             ['shape-arrow', 'shape-arrow-double'].includes(element.type) ? 'Head Size' : 'Height'}
          </label>
          <input
            type="number"
            min={element.category === 'shapes' && ['shape-line', 'shape-dashed-line', 'shape-arrow', 'shape-arrow-double'].includes(element.type) ? 1 : 5}
            value={Math.round(element.height)}
            onChange={(e) => {
              const minVal = element.category === 'shapes' && ['shape-line', 'shape-dashed-line', 'shape-arrow', 'shape-arrow-double'].includes(element.type) ? 1 : 5;
              onChange(element.id, { height: Math.max(minVal, Number(e.target.value)) });
            }}
          />
        </div>
      </div>

      {element.category === 'shapes' && ['shape-line', 'shape-dashed-line', 'shape-arrow', 'shape-arrow-double'].includes(element.type) && (
        <div className="prop-group">
          <label>Bend Offset ({Math.round(element.bendOffset || 0)}px)</label>
          <input
            type="range"
            min={-200}
            max={200}
            value={element.bendOffset || 0}
            onChange={(e) => onChange(element.id, { bendOffset: Number(e.target.value) })}
          />
        </div>
      )}

      <div className="prop-group">
        <label>{rotationLabel} ({Math.round(element.rotation)}°)</label>
        <input
          type="range"
          min={0}
          max={360}
          value={element.rotation}
          onChange={(e) => onChange(element.id, { rotation: Number(e.target.value) })}
        />
      </div>

      <div className="prop-group">
        <label>Opacity ({Math.round(element.opacity * 100)}%)</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={element.opacity}
          onChange={(e) => onChange(element.id, { opacity: Number(e.target.value) })}
        />
      </div>

      <div className="prop-group">
        <label>Color</label>
        <div className="color-input-row">
          <input
            type="color"
            value={element.color.slice(0, 7)}
            onChange={(e) => onChange(element.id, { color: e.target.value })}
          />
          <input
            type="text"
            value={element.color}
            onChange={(e) => onChange(element.id, { color: e.target.value })}
            className="color-text"
          />
        </div>
      </div>

      {element.showCone && (
        <>
          <div className="prop-group">
            <label>Cone Angle ({element.coneAngle}°)</label>
            <input
              type="range"
              min={5}
              max={180}
              value={element.coneAngle}
              onChange={(e) => onChange(element.id, { coneAngle: Number(e.target.value) })}
            />
          </div>
          <div className="prop-group">
            <label>Cone Length ({element.coneLength}px)</label>
            <input
              type="range"
              min={20}
              max={400}
              value={element.coneLength}
              onChange={(e) => onChange(element.id, { coneLength: Number(e.target.value) })}
            />
          </div>
        </>
      )}

      {['text-label', 'text-heading', 'text-note'].includes(element.type) && (
        <>
          <div className="prop-group">
            <label>Text Content</label>
            <textarea
              rows={3}
              value={element.textContent || ''}
              onChange={(e) => onChange(element.id, { textContent: e.target.value })}
              style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: '12px' }}
            />
          </div>
          <div className="prop-row">
            <div className="prop-group half">
              <label>Font Size</label>
              <input
                type="number"
                min={6}
                max={200}
                value={element.fontSize || 18}
                onChange={(e) => onChange(element.id, { fontSize: Math.max(6, Number(e.target.value)) })}
              />
            </div>
            <div className="prop-group half">
              <label>Font Family</label>
              <select
                value={element.fontFamily || 'Inter, system-ui, sans-serif'}
                onChange={(e) => onChange(element.id, { fontFamily: e.target.value })}
              >
                <option value="Inter, system-ui, sans-serif">Inter</option>
                <option value="Arial, sans-serif">Arial</option>
                <option value="Helvetica, sans-serif">Helvetica</option>
                <option value="Georgia, serif">Georgia</option>
                <option value="Times New Roman, serif">Times New Roman</option>
                <option value="Courier New, monospace">Courier New</option>
                <option value="Verdana, sans-serif">Verdana</option>
                <option value="Impact, sans-serif">Impact</option>
              </select>
            </div>
          </div>
          <div className="prop-row">
            <div className="prop-group half">
              <label>Style</label>
              <select
                value={element.fontStyle || 'normal'}
                onChange={(e) => onChange(element.id, { fontStyle: e.target.value })}
              >
                <option value="normal">Normal</option>
                <option value="bold">Bold</option>
                <option value="italic">Italic</option>
                <option value="bold italic">Bold Italic</option>
              </select>
            </div>
            <div className="prop-group half">
              <label>Align</label>
              <select
                value={element.textAlign || 'center'}
                onChange={(e) => onChange(element.id, { textAlign: e.target.value })}
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
          </div>
        </>
      )}

      <div className="prop-row checkboxes">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={element.showLabel}
            onChange={(e) => onChange(element.id, {
              showLabel: e.target.checked,
              labelOffsetX: element.labelOffsetX ?? 0,
              labelOffsetY: element.labelOffsetY ?? (Math.max(element.width, element.height) / 2 + 6),
            })}
          />
          Show Label
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={element.locked}
            onChange={(e) => onChange(element.id, { locked: e.target.checked })}
          />
          Locked
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={element.visible}
            onChange={(e) => onChange(element.id, { visible: e.target.checked })}
          />
          Visible
        </label>
      </div>

      <div className="prop-actions">
        <div className="action-row">
          <button className="action-btn" onClick={() => onChange(element.id, { scaleX: -(element.scaleX ?? 1) })} title="Flip Horizontal">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M8 5l-5 7 5 7M16 5l5 7-5 7"/></svg>
            Flip H
          </button>
          <button className="action-btn" onClick={() => onChange(element.id, { scaleY: -(element.scaleY ?? 1) })} title="Flip Vertical">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h20M5 8l7-5 7 5M5 16l7 5 7-5"/></svg>
            Flip V
          </button>
        </div>
        <div className="action-row">
          <button className="action-btn" onClick={() => onBringForward(element.id)} title="Bring Forward">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h8v2H8v6H6V6zm4 4h8v8h-8v-8zm2 2v4h4v-4h-4z" /></svg>
            Forward
          </button>
          <button className="action-btn" onClick={() => onSendBackward(element.id)} title="Send Backward">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 6h8v8h-2V8h-6V6zM6 10h8v8H6v-8zm2 2v4h4v-4H8z" /></svg>
            Backward
          </button>
        </div>
        <div className="action-row">
          <button className="action-btn duplicate" onClick={() => onDuplicate(element.id)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" /></svg>
            Duplicate
          </button>
          <button className="action-btn delete" onClick={() => onDelete(element.id)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

export default PropertiesPanel;
