import React from 'react';
import { Rect, Ellipse, Line, Path, Text } from 'react-konva';
import { SymbolPrimitive, getSymbolPrimitives, makePalette } from '../data/symbols';

/** Render symbol primitives as react-konva nodes (canvas). */
export const KonvaSymbol: React.FC<{ prims: SymbolPrimitive[] }> = ({ prims }) => (
  <>
    {prims.map((prim, i) => {
      switch (prim.k) {
        case 'rect':
          return (
            <Rect
              key={i}
              x={prim.x}
              y={prim.y}
              width={prim.w}
              height={prim.h}
              cornerRadius={prim.rx ?? 0}
              fill={prim.fill}
              stroke={prim.stroke}
              strokeWidth={prim.stroke ? prim.sw ?? 1 : 0}
              dash={prim.dash}
              opacity={prim.opacity ?? 1}
              listening={false}
            />
          );
        case 'ellipse':
          return (
            <Ellipse
              key={i}
              x={prim.cx}
              y={prim.cy}
              radiusX={prim.rx}
              radiusY={prim.ry}
              fill={prim.fill}
              stroke={prim.stroke}
              strokeWidth={prim.stroke ? prim.sw ?? 1 : 0}
              dash={prim.dash}
              opacity={prim.opacity ?? 1}
              listening={false}
            />
          );
        case 'line':
          return (
            <Line
              key={i}
              points={prim.pts}
              closed={prim.closed}
              fill={prim.fill}
              stroke={prim.stroke}
              strokeWidth={prim.stroke ? prim.sw ?? 1 : 0}
              dash={prim.dash}
              lineCap="round"
              lineJoin="round"
              opacity={prim.opacity ?? 1}
              listening={false}
            />
          );
        case 'path':
          return (
            <Path
              key={i}
              data={prim.d}
              fill={prim.fill}
              fillEnabled={!!prim.fill}
              stroke={prim.stroke}
              strokeWidth={prim.stroke ? prim.sw ?? 1 : 0}
              dash={prim.dash}
              lineCap="round"
              lineJoin="round"
              opacity={prim.opacity ?? 1}
              listening={false}
            />
          );
        case 'text':
          return (
            <Text
              key={i}
              x={prim.x - prim.size * 1.5}
              y={prim.y - prim.size * 0.75}
              width={prim.size * 3}
              height={prim.size * 1.5}
              align="center"
              verticalAlign="middle"
              text={prim.text}
              fontSize={prim.size}
              fontStyle={prim.bold ? 'bold' : 'normal'}
              fontFamily="Inter, system-ui, sans-serif"
              fill={prim.fill}
              listening={false}
            />
          );
        default:
          return null;
      }
    })}
  </>
);

/** Render symbol primitives as SVG nodes (library previews). */
const svgPrims = (prims: SymbolPrimitive[]): React.ReactNode =>
  prims.map((prim, i) => {
    const common = { opacity: prim.k !== 'text' ? prim.opacity ?? 1 : 1 };
    switch (prim.k) {
      case 'rect':
        return (
          <rect
            key={i}
            x={prim.x}
            y={prim.y}
            width={prim.w}
            height={prim.h}
            rx={prim.rx ?? 0}
            fill={prim.fill ?? 'none'}
            stroke={prim.stroke ?? 'none'}
            strokeWidth={prim.sw ?? 1}
            strokeDasharray={prim.dash?.join(' ')}
            {...common}
          />
        );
      case 'ellipse':
        return (
          <ellipse
            key={i}
            cx={prim.cx}
            cy={prim.cy}
            rx={prim.rx}
            ry={prim.ry}
            fill={prim.fill ?? 'none'}
            stroke={prim.stroke ?? 'none'}
            strokeWidth={prim.sw ?? 1}
            strokeDasharray={prim.dash?.join(' ')}
            {...common}
          />
        );
      case 'line': {
        const points = [] as string[];
        for (let j = 0; j < prim.pts.length; j += 2) points.push(`${prim.pts[j]},${prim.pts[j + 1]}`);
        const Tag = prim.closed ? 'polygon' : 'polyline';
        return (
          <Tag
            key={i}
            points={points.join(' ')}
            fill={prim.fill ?? 'none'}
            stroke={prim.stroke ?? 'none'}
            strokeWidth={prim.sw ?? 1}
            strokeDasharray={prim.dash?.join(' ')}
            strokeLinecap="round"
            strokeLinejoin="round"
            {...common}
          />
        );
      }
      case 'path':
        return (
          <path
            key={i}
            d={prim.d}
            fill={prim.fill ?? 'none'}
            stroke={prim.stroke ?? 'none'}
            strokeWidth={prim.sw ?? 1}
            strokeDasharray={prim.dash?.join(' ')}
            strokeLinecap="round"
            strokeLinejoin="round"
            {...common}
          />
        );
      case 'text':
        return (
          <text
            key={i}
            x={prim.x}
            y={prim.y}
            fontSize={prim.size}
            fontWeight={prim.bold ? 700 : 500}
            fontFamily="Inter, system-ui, sans-serif"
            fill={prim.fill}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {prim.text}
          </text>
        );
      default:
        return null;
    }
  });

interface SymbolSvgProps {
  type: string;
  category: string;
  color: string;
  width: number;
  height: number;
  /** Rendered pixel size of the preview box */
  size?: number;
}

/** Library preview: the exact symbol that will land on the canvas. */
export const SymbolSvg: React.FC<SymbolSvgProps> = ({ type, category, color, width, height, size = 44 }) => {
  const palette = makePalette(color);
  const prims = getSymbolPrimitives(type, category, width, height, palette);
  if (!prims) return null;
  const pad = Math.max(width, height) * 0.14 + 2;
  const span = Math.max(width, height) + pad * 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`${-span / 2} ${-span / 2} ${span} ${span}`}
      style={{ display: 'block' }}
    >
      {svgPrims(prims)}
    </svg>
  );
};
