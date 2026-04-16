import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Stage, Layer, Line, Rect, Circle as KonvaCircle, Transformer } from 'react-konva';
import Konva from 'konva';
import { SceneElement, ElementTemplate, Tool } from '../types';
import { createElementFromTemplate, snapToGrid as snapUtil } from '../utils/sceneUtils';
import CanvasElement from './CanvasElement';

interface Props {
  elements: SceneElement[];
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onChange: (id: string, updates: Partial<SceneElement>) => void;
  onAdd: (element: SceneElement) => void;
  gridSize: number;
  showGrid: boolean;
  gridSnap: boolean;
  tool: Tool;
  backgroundColor: string;
  gridStyle: 'lines' | 'dots' | 'none';
  gridColor: string;
  stageRef: React.MutableRefObject<Konva.Stage | null>;
}

const SceneCanvas: React.FC<Props> = ({
  elements,
  selectedIds,
  onSelect,
  onChange,
  onAdd,
  gridSize,
  showGrid,
  gridSnap,
  tool,
  backgroundColor,
  gridStyle,
  gridColor,
  stageRef: externalStageRef,
}) => {
  const internalStageRef = useRef<Konva.Stage>(null);
  const stageRef = externalStageRef || internalStageRef;
  const transformerRef = useRef<Konva.Transformer>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [stageScale, setStageScale] = useState(1);
  const [isMiddleDragging, setIsMiddleDragging] = useState(false);
  const middleDragStart = useRef<{ x: number; y: number; stageX: number; stageY: number } | null>(null);

  // Marquee selection state
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const marqueeStart = useRef<{ x: number; y: number } | null>(null);
  const isMarqueeActive = useRef(false);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setStageSize({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Middle mouse panning
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        setIsMiddleDragging(true);
        middleDragStart.current = {
          x: e.clientX,
          y: e.clientY,
          stageX: stagePos.x,
          stageY: stagePos.y,
        };
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!middleDragStart.current) return;
      const dx = e.clientX - middleDragStart.current.x;
      const dy = e.clientY - middleDragStart.current.y;
      setStagePos({
        x: middleDragStart.current.stageX + dx,
        y: middleDragStart.current.stageY + dy,
      });
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 1) {
        setIsMiddleDragging(false);
        middleDragStart.current = null;
      }
    };

    const onAuxClick = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    container.addEventListener('auxclick', onAuxClick);

    return () => {
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('auxclick', onAuxClick);
    };
  }, [stagePos.x, stagePos.y]);

  const lineTypes = ['shape-line', 'shape-dashed-line', 'shape-arrow', 'shape-arrow-double'];

  const isLineMode = selectedIds.length === 1 && (() => {
    const el = elements.find(e => e.id === selectedIds[0]);
    return el ? lineTypes.includes(el.type) : false;
  })();

  const enabledAnchors = isLineMode
    ? ['middle-left', 'middle-right']
    : [
        'top-left', 'top-center', 'top-right',
        'middle-left', 'middle-right',
        'bottom-left', 'bottom-center', 'bottom-right',
      ];

  const transformerKey = isLineMode ? 'tr-line' : 'tr-default';

  // Attach transformer to selected nodes
  useEffect(() => {
    const tr = transformerRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;

    if (selectedIds.length > 0) {
      const nodes: Konva.Node[] = [];
      for (const id of selectedIds) {
        const node = stage.findOne(`#${id}`);
        if (node) nodes.push(node);
      }
      tr.nodes(nodes);
    } else {
      tr.nodes([]);
    }
    tr.getLayer()?.batchDraw();
  });

  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const scaleBy = 1.08;
    const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
    const clampedScale = Math.max(0.1, Math.min(5, newScale));

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    setStageScale(clampedScale);
    setStagePos({
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    });
  }, []);

  const getCanvasPointer = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return null;
    const pointer = stage.getPointerPosition();
    if (!pointer) return null;
    return {
      x: (pointer.x - stage.x()) / stage.scaleX(),
      y: (pointer.y - stage.y()) / stage.scaleY(),
    };
  }, []);

  // Marquee: mousedown on empty area starts selection rectangle
  const handleStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.evt.button !== 0) return;
      if (tool !== 'select') return;

      const clickedOnEmpty = e.target === stageRef.current ||
        (e.target as Konva.Node).getAttr?.('id') === 'background';

      if (clickedOnEmpty) {
        const pos = getCanvasPointer();
        if (!pos) return;
        marqueeStart.current = pos;
        isMarqueeActive.current = true;
        if (!e.evt.shiftKey) {
          onSelect([]);
        }
      }
    },
    [tool, onSelect, getCanvasPointer]
  );

  const handleStageMouseMove = useCallback(
    (_e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!isMarqueeActive.current || !marqueeStart.current) return;
      const pos = getCanvasPointer();
      if (!pos) return;
      const sx = marqueeStart.current.x;
      const sy = marqueeStart.current.y;
      setMarquee({
        x: Math.min(sx, pos.x),
        y: Math.min(sy, pos.y),
        width: Math.abs(pos.x - sx),
        height: Math.abs(pos.y - sy),
      });
    },
    [getCanvasPointer]
  );

  const handleStageMouseUp = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!isMarqueeActive.current) return;
      isMarqueeActive.current = false;

      if (marquee && (marquee.width > 5 || marquee.height > 5)) {
        const hitIds: string[] = [];
        for (const el of elements) {
          if (!el.visible) continue;
          if (
            el.x >= marquee.x &&
            el.x <= marquee.x + marquee.width &&
            el.y >= marquee.y &&
            el.y <= marquee.y + marquee.height
          ) {
            hitIds.push(el.id);
          }
        }
        if (e.evt.shiftKey) {
          const merged = new Set([...selectedIds, ...hitIds]);
          onSelect(Array.from(merged));
        } else {
          onSelect(hitIds);
        }
      }

      setMarquee(null);
      marqueeStart.current = null;
    },
    [marquee, elements, selectedIds, onSelect]
  );

  const handleElementSelect = useCallback(
    (id: string, evt?: MouseEvent) => {
      if (evt?.shiftKey) {
        if (selectedIds.includes(id)) {
          onSelect(selectedIds.filter((s) => s !== id));
        } else {
          onSelect([...selectedIds, id]);
        }
      } else {
        onSelect([id]);
      }
    },
    [selectedIds, onSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;

      const templateData = e.dataTransfer.getData('application/element-template');
      if (!templateData) return;

      const template: ElementTemplate = JSON.parse(templateData);
      const stageBox = stage.container().getBoundingClientRect();
      const scale = stage.scaleX();
      let x = (e.clientX - stageBox.left - stage.x()) / scale;
      let y = (e.clientY - stageBox.top - stage.y()) / scale;

      if (gridSnap) {
        x = snapUtil(x, gridSize);
        y = snapUtil(y, gridSize);
      }

      const newElement = createElementFromTemplate(template, x, y, elements.length);
      onAdd(newElement);
      onSelect([newElement.id]);
    },
    [onAdd, onSelect, gridSize, gridSnap, elements.length]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const snapToGridFn = useCallback(
    (val: number) => snapUtil(val, gridSize),
    [gridSize]
  );

  const renderGrid = () => {
    if (!showGrid || gridStyle === 'none') return null;
    const items: React.ReactElement[] = [];
    const viewWidth = stageSize.width / stageScale;
    const viewHeight = stageSize.height / stageScale;
    const startX = Math.floor((-stagePos.x / stageScale) / gridSize) * gridSize;
    const startY = Math.floor((-stagePos.y / stageScale) / gridSize) * gridSize;
    const endX = startX + viewWidth + gridSize * 2;
    const endY = startY + viewHeight + gridSize * 2;

    const hexToRgba = (hex: string, alpha: number) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${alpha})`;
    };

    if (gridStyle === 'dots') {
      for (let x = startX; x < endX; x += gridSize) {
        for (let y = startY; y < endY; y += gridSize) {
          const isMajor = x % (gridSize * 5) === 0 && y % (gridSize * 5) === 0;
          items.push(
            <KonvaCircle
              key={`gd-${x}-${y}`}
              x={x}
              y={y}
              radius={isMajor ? 1.5 : 0.8}
              fill={hexToRgba(gridColor, isMajor ? 0.25 : 0.1)}
              listening={false}
            />
          );
        }
      }
    } else {
      for (let x = startX; x < endX; x += gridSize) {
        const isMajor = x % (gridSize * 5) === 0;
        items.push(
          <Line
            key={`gv-${x}`}
            points={[x, startY, x, endY]}
            stroke={hexToRgba(gridColor, isMajor ? 0.08 : 0.03)}
            strokeWidth={isMajor ? 1 : 0.5}
            listening={false}
          />
        );
      }
      for (let y = startY; y < endY; y += gridSize) {
        const isMajor = y % (gridSize * 5) === 0;
        items.push(
          <Line
            key={`gh-${y}`}
            points={[startX, y, endX, y]}
            stroke={hexToRgba(gridColor, isMajor ? 0.08 : 0.03)}
            strokeWidth={isMajor ? 1 : 0.5}
            listening={false}
          />
        );
      }
    }
    return items;
  };

  const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex);
  const isPanning = tool === 'pan';

  return (
    <div
      ref={containerRef}
      className="canvas-container"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      style={{ cursor: isMiddleDragging ? 'grabbing' : isPanning ? 'grab' : 'default' }}
    >
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        scaleX={stageScale}
        scaleY={stageScale}
        x={stagePos.x}
        y={stagePos.y}
        pixelRatio={window.devicePixelRatio || 2}
        onWheel={handleWheel}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        draggable={isPanning}
        onDragEnd={(e) => {
          if (isPanning) {
            setStagePos({ x: e.target.x(), y: e.target.y() });
          }
        }}
      >
        <Layer>
          <Rect
            id="background"
            x={-5000}
            y={-5000}
            width={10000}
            height={10000}
            fill={backgroundColor}
            listening={true}
          />
          {renderGrid()}
        </Layer>
        <Layer>
          {sorted.map((el) => (
            <CanvasElement
              key={el.id}
              element={el}
              isSelected={selectedIds.includes(el.id)}
              onSelect={handleElementSelect}
              onChange={onChange}
              snapToGrid={snapToGridFn}
              gridSnap={gridSnap}
            />
          ))}
          <Transformer
            key={transformerKey}
            ref={transformerRef}
            rotateEnabled={true}
            enabledAnchors={enabledAnchors}
            borderStroke="#6366f1"
            borderStrokeWidth={1.5}
            anchorFill="#6366f1"
            anchorStroke="#ffffff"
            anchorSize={9}
            anchorCornerRadius={2}
            rotateAnchorOffset={22}
            rotateAnchorCursor="grab"
            rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
            keepRatio={false}
            boundBoxFunc={(oldBox, newBox) => {
              if (Math.abs(newBox.width) < 2) return oldBox;
              if (Math.abs(newBox.height) < 2 && Math.abs(oldBox.height) >= 2) return oldBox;
              return newBox;
            }}
            onTransformEnd={() => {
              const tr = transformerRef.current;
              if (!tr) return;
              for (const node of tr.nodes()) {
                const id = node.id();
                const el = elements.find(e => e.id === id);
                if (!el) continue;

                const isStraight = lineTypes.includes(el.type);

                if (isStraight) {
                  const sx = node.scaleX();
                  const newWidth = Math.max(2, el.width * Math.abs(sx));
                  node.scaleX(Math.sign(sx) || 1);
                  node.scaleY(1);
                  onChange(id, {
                    x: node.x(),
                    y: node.y(),
                    rotation: node.rotation(),
                    width: newWidth,
                    scaleX: Math.sign(sx) || 1,
                    scaleY: 1,
                  });
                } else {
                  onChange(id, {
                    x: node.x(),
                    y: node.y(),
                    rotation: node.rotation(),
                    scaleX: node.scaleX(),
                    scaleY: node.scaleY(),
                  });
                }
              }
            }}
          />
          {/* Marquee selection rectangle */}
          {marquee && (
            <Rect
              x={marquee.x}
              y={marquee.y}
              width={marquee.width}
              height={marquee.height}
              fill="rgba(99, 102, 241, 0.08)"
              stroke="#6366f1"
              strokeWidth={1 / stageScale}
              dash={[6 / stageScale, 4 / stageScale]}
              listening={false}
            />
          )}
        </Layer>
      </Stage>
      <div className="canvas-zoom-indicator">
        {Math.round(stageScale * 100)}%
      </div>
    </div>
  );
};

export default SceneCanvas;
