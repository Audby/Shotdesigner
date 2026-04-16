import React, { useRef, useEffect, useCallback } from 'react';
import { Group, Path, Rect, Text, Wedge, Circle, Line } from 'react-konva';
import Konva from 'konva';
import { SceneElement } from '../types';

interface Props {
  element: SceneElement;
  isSelected: boolean;
  onSelect: (id: string, evt?: MouseEvent) => void;
  onChange: (id: string, updates: Partial<SceneElement>) => void;
  snapToGrid: (val: number) => number;
  gridSnap: boolean;
}

interface ParsedColor {
  r: number;
  g: number;
  b: number;
}

const LABEL_FONT_FAMILY = 'Inter, system-ui, sans-serif';
const LABEL_FONT_WEIGHT = '500';

let textMeasureContext: CanvasRenderingContext2D | null = null;

const getTextMeasureContext = (): CanvasRenderingContext2D | null => {
  if (typeof document === 'undefined') return null;
  if (textMeasureContext) return textMeasureContext;

  const canvas = document.createElement('canvas');
  textMeasureContext = canvas.getContext('2d');
  return textMeasureContext;
};

const measureLabelText = (text: string, fontSize: number) => {
  const normalizedText = text.trim() || ' ';
  const fallbackWidth = Math.max(fontSize * 1.5, normalizedText.length * fontSize * 0.62);
  const fallbackHeight = fontSize * 1.2;
  const context = getTextMeasureContext();

  if (!context) {
    return {
      width: fallbackWidth,
      height: fallbackHeight,
    };
  }

  context.font = `${LABEL_FONT_WEIGHT} ${fontSize}px ${LABEL_FONT_FAMILY}`;
  const metrics = context.measureText(normalizedText);
  const measuredHeight = metrics.actualBoundingBoxAscent || metrics.actualBoundingBoxDescent
    ? metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent
    : fallbackHeight;

  return {
    width: Math.max(fallbackWidth, metrics.width),
    height: Math.max(fallbackHeight, measuredHeight),
  };
};

const parseHexColor = (value: string): ParsedColor | null => {
  const normalized = value.trim().replace('#', '');
  if (![3, 4, 6, 8].includes(normalized.length)) return null;

  const expanded = normalized.length <= 4
    ? normalized.split('').map((char) => char + char).join('')
    : normalized;

  const rgbHex = expanded.slice(0, 6);
  const r = Number.parseInt(rgbHex.slice(0, 2), 16);
  const g = Number.parseInt(rgbHex.slice(2, 4), 16);
  const b = Number.parseInt(rgbHex.slice(4, 6), 16);

  if ([r, g, b].some(Number.isNaN)) return null;

  return { r, g, b };
};

const getIconOutlineColor = (value: string): string => {
  const parsed = parseHexColor(value);
  if (!parsed) return 'rgba(18, 18, 18, 0.72)';

  const luminance = (0.2126 * parsed.r + 0.7152 * parsed.g + 0.0722 * parsed.b) / 255;
  return luminance < 0.45 ? 'rgba(255, 255, 255, 0.78)' : 'rgba(18, 18, 18, 0.72)';
};

const CanvasElement: React.FC<Props> = ({
  element,
  isSelected,
  onSelect,
  onChange,
  snapToGrid,
  gridSnap,
}) => {
  const groupRef = useRef<Konva.Group>(null);

  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.zIndex(element.zIndex);
    }
  }, [element.zIndex]);

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      // Prevent drag end from firing if we are dragging the bend anchor
      if (e.target !== groupRef.current) return;

      let x = e.target.x();
      let y = e.target.y();
      if (gridSnap) {
        x = snapToGrid(x);
        y = snapToGrid(y);
      }
      onChange(element.id, { x, y });
    },
    [element.id, onChange, gridSnap, snapToGrid]
  );

  if (!element.visible) return null;

  const isChar = element.category === 'characters';
  const isLight = element.category === 'lighting';
  const isCam = element.category === 'cameras';
  const isSet = element.category === 'set';
  const isMarker = element.category === 'markers';
  
  const selectionColor = '#6366f1';
  const iconOutlineColor = getIconOutlineColor(element.color);

  const renderShape = () => {
    const w = element.width;
    const h = element.height;
    const iconScaleX = w / 24;
    const iconScaleY = h / 24;

    const renderIconObject = () => {
      if (!element.iconPath) {
        return (
          <Rect
            x={-w / 2}
            y={-h / 2}
            width={w}
            height={h}
            fill={element.color}
            opacity={0.92}
            cornerRadius={6}
            stroke={isSelected ? selectionColor : 'rgba(255,255,255,0.15)'}
            strokeWidth={isSelected ? 3 : 1}
            shadowColor="rgba(0,0,0,0.4)"
            shadowBlur={isSelected ? 0 : 4}
            shadowOffset={{ x: 0, y: 2 }}
            shadowOpacity={isSelected ? 0 : 0.5}
          />
        );
      }

      const selectionPadding = Math.max(6, Math.min(w, h) * 0.18);
      const selectionCornerRadius = Math.max(6, Math.min(w, h) * 0.24);

      return (
        <Group>
          <Rect
            x={-w / 2}
            y={-h / 2}
            width={w}
            height={h}
            fill="rgba(0,0,0,0.001)"
          />
          <Path
            x={-w / 2}
            y={-h / 2}
            data={element.iconPath}
            fill={element.color}
            stroke={iconOutlineColor}
            strokeWidth={1.2}
            scaleX={iconScaleX}
            scaleY={iconScaleY}
            opacity={0.96}
            shadowColor="rgba(0,0,0,0.45)"
            shadowBlur={Math.max(2, Math.min(w, h) * 0.08)}
            shadowOffset={{ x: 0, y: 2 }}
            shadowOpacity={0.45}
            lineJoin="round"
            lineCap="round"
          />
          {isSelected && (
            <Rect
              x={-w / 2 - selectionPadding / 2}
              y={-h / 2 - selectionPadding / 2}
              width={w + selectionPadding}
              height={h + selectionPadding}
              stroke={selectionColor}
              strokeWidth={2}
              cornerRadius={selectionCornerRadius}
              dash={[6, 4]}
              fillEnabled={false}
              listening={false}
            />
          )}
        </Group>
      );
    };

    if (isChar) {
      const radius = Math.min(w, h) / 2;
      const facingLineWidth = Math.max(1.5, radius * 0.12);
      const pointerWidth = Math.max(8, radius * 0.65);
      const pointerHeight = Math.max(6, radius * 0.42);
      return (
        <>
          <Circle
            x={0}
            y={0}
            radius={radius}
            fill={element.color}
            opacity={0.9}
            stroke={isSelected ? selectionColor : 'rgba(255,255,255,0.2)'}
            strokeWidth={isSelected ? 3 : 1}
            shadowColor="rgba(0,0,0,0.5)"
            shadowBlur={4}
            shadowOffset={{ x: 0, y: 2 }}
            shadowOpacity={isSelected ? 0 : 0.5}
          />
          <Line
            points={[0, -radius * 0.28, 0, -radius + 2]}
            stroke="#ffffff"
            strokeWidth={facingLineWidth}
            lineCap="round"
            opacity={0.95}
            listening={false}
          />
          <Line
            points={[
              0, -radius - 2,
              pointerWidth / 2, -radius + pointerHeight,
              -pointerWidth / 2, -radius + pointerHeight,
            ]}
            closed
            fill="#ffffff"
            stroke="rgba(18,18,18,0.25)"
            strokeWidth={1}
            opacity={0.98}
            listening={false}
          />
          {element.iconPath && (
            <Path
              x={-radius * 0.65}
              y={-radius * 0.65}
              data={element.iconPath}
              fill="#fff"
              opacity={0.9}
              scaleX={(radius * 1.3) / 24}
              scaleY={(radius * 1.3) / 24}
            />
          )}
        </>
      );
    }

    if (isLight || (isCam && element.showCone)) {
      return (
        <>
          {element.showCone && (
            <Wedge
              x={0}
              y={0}
              radius={element.coneLength}
              angle={element.coneAngle}
              rotation={-element.coneAngle / 2}
              fill={element.color}
              opacity={0.15}
              listening={false}
            />
          )}
          {isLight && !element.iconPath ? (
            <Circle
              x={0}
              y={0}
              radius={Math.min(w, h) / 2}
              fill={element.color}
              opacity={0.9}
              stroke={isSelected ? selectionColor : 'rgba(255,255,255,0.3)'}
              strokeWidth={isSelected ? 3 : 1}
            />
          ) : (
            renderIconObject()
          )}
        </>
      );
    }

    if (isSet || element.type === 'rug' || element.type === 'floor-marking' || element.type === 'area-zone') {
      return (
        <Group>
          <Rect
            x={-w / 2}
            y={-h / 2}
            width={w}
            height={h}
            fill={element.color}
            opacity={element.opacity}
            stroke={isSelected ? selectionColor : 'rgba(255,255,255,0.2)'}
            strokeWidth={isSelected ? 3 : 1}
            cornerRadius={4}
          />
          {element.iconPath && w >= 20 && h >= 20 && (
            <Path
              x={-Math.min(w, h) * 0.35}
              y={-Math.min(w, h) * 0.35}
              data={element.iconPath}
              fill="#fff"
              opacity={0.5}
              scaleX={(Math.min(w, h) * 0.7) / 24}
              scaleY={(Math.min(w, h) * 0.7) / 24}
            />
          )}
        </Group>
      );
    }

    if (isMarker && element.type === 'mark-x') {
      const s = Math.min(w, h) / 2;
      return (
        <Group>
          <Line points={[-s, -s, s, s]} stroke={element.color} strokeWidth={4} lineCap="round" />
          <Line points={[s, -s, -s, s]} stroke={element.color} strokeWidth={4} lineCap="round" />
          {isSelected && (
            <Rect
              x={-s - 4} y={-s - 4} width={s * 2 + 8} height={s * 2 + 8}
              stroke={selectionColor} strokeWidth={2} cornerRadius={2} dash={[4, 4]}
            />
          )}
        </Group>
      );
    }

    if (isMarker && element.type === 'arrow') {
      return (
        <Group>
          <Line
            points={[-w / 2, 0, w / 2, 0, w / 2 - 10, -10, w / 2, 0, w / 2 - 10, 10]}
            stroke={element.color}
            strokeWidth={4}
            lineJoin="round"
            lineCap="round"
          />
          {isSelected && (
            <Rect
              x={-w / 2 - 4} y={-14} width={w + 8} height={28}
              stroke={selectionColor} strokeWidth={2} cornerRadius={2} dash={[4, 4]}
            />
          )}
        </Group>
      );
    }

    const isTextElement = ['text-label', 'text-heading', 'text-note'].includes(element.type);
    if (isTextElement) {
      const fontStyleStr = element.fontStyle || 'normal';
      const isBold = fontStyleStr.includes('bold');
      const isItalic = fontStyleStr.includes('italic');
      let konvaFontStyle = 'normal';
      if (isBold && isItalic) konvaFontStyle = 'bold italic';
      else if (isBold) konvaFontStyle = 'bold';
      else if (isItalic) konvaFontStyle = 'italic';

      const isNote = element.type === 'text-note';

      return (
        <Group>
          <Rect
            x={-w / 2}
            y={-h / 2}
            width={w}
            height={h}
            fill={isNote ? 'rgba(0,0,0,0.35)' : 'transparent'}
            stroke={isSelected ? selectionColor : (isNote ? 'rgba(255,255,255,0.1)' : 'transparent')}
            strokeWidth={isSelected ? 1.5 : (isNote ? 1 : 0)}
            cornerRadius={isNote ? 6 : 2}
            dash={isSelected && !isNote ? [4, 4] : undefined}
          />
          <Text
            x={-w / 2 + (isNote ? 8 : 0)}
            y={-h / 2 + (isNote ? 8 : 0)}
            width={w - (isNote ? 16 : 0)}
            height={h - (isNote ? 16 : 0)}
            text={element.textContent || 'Text'}
            fontSize={element.fontSize || 18}
            fontFamily={element.fontFamily || 'Inter, system-ui, sans-serif'}
            fontStyle={konvaFontStyle}
            fill={element.color}
            align={element.textAlign || 'center'}
            verticalAlign={isNote ? 'top' : 'middle'}
            listening={true}
          />
        </Group>
      );
    }

    const isShape = element.category === 'shapes';

    if (isShape) {
      const shadowProps = isSelected ? {
        shadowColor: selectionColor,
        shadowBlur: 10,
        shadowOpacity: 1
      } : {};

      const isLine = ['shape-line', 'shape-dashed-line', 'shape-arrow', 'shape-arrow-double'].includes(element.type);
      const isArrow = element.type === 'shape-arrow' || element.type === 'shape-arrow-double';
      
      if (isLine) {
        const bend = element.bendOffset || 0;
        const pathData = bend ? `M ${-w / 2} 0 Q 0 ${bend} ${w / 2} 0` : `M ${-w / 2} 0 L ${w / 2} 0`;
        const strokeW = isArrow ? 4 : Math.max(2, h);
        
        let arrowData = '';
        if (element.type === 'shape-arrow' || element.type === 'shape-arrow-double') {
           const headLen = Math.max(8, h / 2);
           const endAngle = bend ? Math.atan2(-bend, w/2) : 0;
           const a1 = endAngle + Math.PI * 0.8;
           const a2 = endAngle - Math.PI * 0.8;
           arrowData += ` M ${w/2 + Math.cos(a1)*headLen} ${Math.sin(a1)*headLen} L ${w/2} 0 L ${w/2 + Math.cos(a2)*headLen} ${Math.sin(a2)*headLen}`;
        }
        if (element.type === 'shape-arrow-double') {
           const headLen = Math.max(8, h / 2);
           const startAngle = bend ? Math.atan2(-bend, -w/2) : Math.PI;
           const a1 = startAngle + Math.PI * 0.8;
           const a2 = startAngle - Math.PI * 0.8;
           arrowData += ` M ${-w/2 + Math.cos(a1)*headLen} ${Math.sin(a1)*headLen} L ${-w/2} 0 L ${-w/2 + Math.cos(a2)*headLen} ${Math.sin(a2)*headLen}`;
        }

        let dashProps = {};
        if (element.type === 'shape-dashed-line') {
          const absW = Math.max(1, Math.abs(w));
          const arcLen = bend ? Math.sqrt(absW*absW + (16/3)*bend*bend) : absW;
          const targetDashLength = 12;
          const numDashes = Math.max(1, Math.round((arcLen / targetDashLength + 1) / 2));
          const dashLen = arcLen / (2 * numDashes - 1);
          dashProps = { dash: [dashLen, dashLen] };
        }

        return (
          <Group>
            <Path 
              data={pathData + arrowData} 
              stroke={element.color} 
              strokeWidth={strokeW} 
              hitStrokeWidth={15} 
              lineCap="round" 
              lineJoin="round"
              strokeScaleEnabled={false} 
              {...dashProps} 
              {...shadowProps} 
            />
            {isSelected && (
              <Circle
                x={0}
                y={bend}
                radius={6}
                fill="#ffffff"
                stroke="#6366f1"
                strokeWidth={2}
                draggable
                dragBoundFunc={function(this: Konva.Node, pos) {
                  const parent = groupRef.current;
                  if (!parent) return pos;
                  const transform = parent.getAbsoluteTransform().copy().invert();
                  const localPos = transform.point(pos);
                  localPos.x = 0; // Lock to center X
                  return parent.getAbsoluteTransform().point(localPos);
                }}
                onDragMove={(e) => {
                  e.cancelBubble = true;
                  onChange(element.id, { bendOffset: e.target.y() });
                }}
                onDragEnd={(e) => {
                  e.cancelBubble = true;
                  onChange(element.id, { bendOffset: e.target.y() });
                }}
                onMouseEnter={(e) => {
                  const stage = e.target.getStage();
                  if (stage) stage.container().style.cursor = 'ns-resize';
                }}
                onMouseLeave={(e) => {
                  const stage = e.target.getStage();
                  if (stage) stage.container().style.cursor = 'default';
                }}
              />
            )}
          </Group>
        );
      }

      if (element.type === 'shape-rect') {
        return <Rect x={-w / 2} y={-h / 2} width={w} height={h} stroke={element.color} strokeWidth={4} cornerRadius={4} strokeScaleEnabled={false} {...shadowProps} />;
      }
      if (element.type === 'shape-circle') {
        return <Circle x={0} y={0} radius={Math.min(w, h) / 2} stroke={element.color} strokeWidth={4} strokeScaleEnabled={false} {...shadowProps} />;
      }
      if (element.type === 'shape-triangle') {
        return <Line points={[0, -h / 2, w / 2, h / 2, -w / 2, h / 2]} stroke={element.color} strokeWidth={4} closed lineJoin="round" strokeScaleEnabled={false} {...shadowProps} />;
      }
    }

    return renderIconObject();
  };

  const elementScaleX = element.scaleX || 1;
  const elementScaleY = element.scaleY || 1;
  const safeScaleX = Math.abs(elementScaleX) < 0.0001 ? 1 : elementScaleX;
  const safeScaleY = Math.abs(elementScaleY) < 0.0001 ? 1 : elementScaleY;
  const labelAutoWidth = element.labelAutoWidth ?? true;
  const labelFontSize = Math.max(8, element.labelFontSize ?? 18);
  const labelTextColor = element.labelTextColor ?? '#ffffff';
  const labelBackgroundColor = element.labelBackgroundColor ?? '#121212';
  const labelBackgroundOpacity = Math.min(1, Math.max(0, element.labelBackgroundOpacity ?? 0));
  const labelPaddingX = Math.max(4, element.labelPaddingX ?? 12);
  const labelPaddingY = Math.max(2, element.labelPaddingY ?? 6);
  const labelShadowColor = element.labelShadowColor ?? '#000000';
  const labelShadowBlur = Math.max(0, element.labelShadowBlur ?? Math.round(labelFontSize * 0.5));
  const labelShadowOpacity = Math.min(1, Math.max(0, element.labelShadowOpacity ?? 0.35));
  const labelShadowOffsetX = element.labelShadowOffsetX ?? 0;
  const labelShadowOffsetY = element.labelShadowOffsetY ?? Math.max(1, Math.round(labelFontSize * 0.18));
  const { width: measuredLabelTextWidth, height: measuredLabelTextHeight } = measureLabelText(element.label, labelFontSize);
  const labelWidth = labelAutoWidth
    ? Math.max(60, Math.ceil(measuredLabelTextWidth + labelPaddingX * 2))
    : Math.max(60, element.labelWidth ?? 120);
  const labelHeight = Math.max(20, Math.ceil(measuredLabelTextHeight + labelPaddingY * 2));
  const labelCornerRadius = Math.max(0, element.labelCornerRadius ?? Math.round(labelHeight / 2));
  const labelOffX = element.labelOffsetX ?? 0;
  const labelOffY = element.labelOffsetY ?? (Math.max(element.width, element.height) / 2 + labelHeight / 2 + 6);

  return (
    <Group
      ref={groupRef}
      id={element.id}
      x={element.x}
      y={element.y}
      rotation={element.rotation}
      scaleX={elementScaleX}
      scaleY={elementScaleY}
      draggable={!element.locked}
      onClick={(e) => onSelect(element.id, e.evt)}
      onTap={() => onSelect(element.id)}
      onDragEnd={handleDragEnd}
      opacity={element.opacity}
    >
      {renderShape()}
      {element.showLabel && (
        <Group
          x={labelOffX}
          y={labelOffY}
          draggable={!element.locked}
          onDragStart={(e) => {
            e.cancelBubble = true;
          }}
          onDragMove={(e) => {
            e.cancelBubble = true;
          }}
          onDragEnd={(e) => {
            e.cancelBubble = true;
            onChange(element.id, {
              labelOffsetX: e.target.x(),
              labelOffsetY: e.target.y(),
            });
          }}
        >
          <Group scaleX={1 / safeScaleX} scaleY={1 / safeScaleY}>
            <Rect
              x={-labelWidth / 2}
              y={-labelHeight / 2}
              width={labelWidth}
              height={labelHeight}
              fill={labelBackgroundColor}
              opacity={labelBackgroundOpacity}
              cornerRadius={labelCornerRadius}
              shadowColor={labelShadowColor}
              shadowBlur={labelShadowBlur}
              shadowOffset={{ x: labelShadowOffsetX, y: labelShadowOffsetY }}
              shadowOpacity={labelShadowOpacity}
            />
            <Text
              text={element.label}
              x={-labelWidth / 2 + labelPaddingX}
              y={-labelHeight / 2}
              width={Math.max(20, labelWidth - labelPaddingX * 2)}
              height={labelHeight}
              align="center"
              verticalAlign="middle"
              fontSize={labelFontSize}
              fontStyle="500"
              fontFamily="Inter, system-ui, sans-serif"
              fill={labelTextColor}
              listening={false}
            />
          </Group>
        </Group>
      )}
      {element.showLabel && isSelected && (
        <>
          {/* Connector line from element center to label */}
          <Line
            points={[0, 0, labelOffX, labelOffY]}
            stroke="rgba(99, 102, 241, 0.6)"
            strokeWidth={1.5}
            dash={[4, 4]}
            listening={false}
          />
        </>
      )}
    </Group>
  );
};

export default React.memo(CanvasElement);
