import React, { useState } from 'react';
import { categories, elementTemplates } from '../data/elementLibrary';
import { ElementTemplate } from '../types';

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

  const getCategoryColor = (cat: string): string => {
    const colors: Record<string, string> = {
      characters: '#4FC3F7',
      cameras: '#B0BEC5',
      lighting: '#FFF176',
      audio: '#BDBDBD',
      furniture: '#8D6E63',
      props: '#A1887F',
      vehicles: '#546E7A',
      set: '#795548',
      shapes: '#9E9E9E',
      text: '#E0E0E0',
      markers: '#F44336',
      nature: '#4CAF50',
      cave: '#6D4C41',
      house: '#BCAAA4',
    };
    return colors[cat] || '#9E9E9E';
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
          placeholder="Search elements..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button className="clear-search" onClick={() => setSearch('')}>&times;</button>
        )}
      </div>

      {!search && (
        <div className="category-tabs">
          {categories.map((cat) => (
            <button
              key={cat.id}
              className={`category-tab ${activeCategory === cat.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat.id)}
              title={cat.label}
              style={{
                borderColor: activeCategory === cat.id ? getCategoryColor(cat.id) : 'transparent',
                color: activeCategory === cat.id ? getCategoryColor(cat.id) : undefined
              }}
            >
              <span className="cat-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: cat.icon }} />
              </span>
              <span className="cat-label">{cat.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="element-grid">
        {filtered.map((template) => (
          <div
            key={template.type}
            className="element-item"
            draggable
            onDragStart={(e) => handleDragStart(e, template)}
            onClick={() => onAddElement(template)}
            title={`Drag or click to add ${template.label}`}
          >
            <div className="element-preview">
              <svg viewBox="0 0 24 24" width="28" height="28" strokeLinecap="round" strokeLinejoin="round">
                {template.category === 'shapes' ? (
                  <path d={template.iconPath} fill="none" stroke="#e0e0e0" strokeWidth="2" />
                ) : (
                  <path d={template.iconPath} fill="#e0e0e0" stroke="none" />
                )}
              </svg>
            </div>
            <span className="element-name">{template.label}</span>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="no-results">No elements found</div>
        )}
      </div>
    </div>
  );
};

export default ElementLibrary;
