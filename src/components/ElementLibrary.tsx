import React, { useState } from 'react';
import { categories, elementTemplates } from '../data/elementLibrary';
import { ElementTemplate } from '../types';
import { SymbolSvg } from './SymbolRender';

interface Props {
  onAddElement: (template: ElementTemplate) => void;
}

const ElementLibrary: React.FC<Props> = ({ onAddElement }) => {
  const [activeCategory, setActiveCategory] = useState<string>('characters');
  const [search, setSearch] = useState('');

  const filtered = elementTemplates.filter((t) => {
    if (search) {
      return t.label.toLowerCase().includes(search.toLowerCase()) ||
        t.type.toLowerCase().includes(search.toLowerCase());
    }
    return t.category === activeCategory;
  });

  const handleDragStart = (e: React.DragEvent, template: ElementTemplate) => {
    e.dataTransfer.setData('application/element-template', JSON.stringify(template));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="element-library">
      <div className="library-header">
        <h3>Elements</h3>
      </div>

      <div className="library-search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="text"
          placeholder="Find an element…" aria-label="Search elements"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button className="clear-search" onClick={() => setSearch('')}>&times;</button>
        )}
      </div>

      {!search && <label className="library-category-label">Category<select aria-label="Element category" value={activeCategory} onChange={e => setActiveCategory(e.target.value)}>{categories.map(cat => <option key={cat.id} value={cat.id}>{cat.label}</option>)}</select></label>}
      <div className="library-section-label">{search ? `${filtered.length} results` : categories.find(c => c.id === activeCategory)?.label}<span>Click or drag to place</span></div>

      <div className="element-grid">
        {filtered.map((template) => (
          <button
            key={template.type}
            className="element-item"
            draggable
            onDragStart={(e) => handleDragStart(e, template)}
            onClick={() => onAddElement(template)}
            title={`Drag or click to add ${template.label}`}
          >
            <div className="element-preview">
              <SymbolSvg
                type={template.type}
                category={template.category}
                color={template.defaultColor}
                width={template.width}
                height={template.height}
                size={42}
              />
            </div>
            <span className="element-name">{template.label}</span>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="no-results">No elements found</div>
        )}
      </div>
    </div>
  );
};

export default ElementLibrary;
