// Top-down (floor-plan style) symbol definitions for every element type.
// A single spec is rendered both on the Konva canvas (CanvasElement) and as
// SVG previews in the element library, so what you see in the library is
// exactly what lands on the canvas.
//
// Coordinate space: local, centered at (0,0). x spans [-w/2, w/2], y spans
// [-h/2, h/2]. Rotation 0 means cameras/lights face +x (cone direction) and
// characters face up (-y), matching existing saved scenes.

export interface SymbolPalette {
  /** Main element color */
  fill: string;
  /** Element color at low opacity, for area fills */
  fillSoft: string;
  /** Outline derived from the element color */
  stroke: string;
  /** High-contrast detail color (white on dark fills, near-black on light) */
  detail: string;
}

interface StyleOpts {
  fill?: string;
  stroke?: string;
  sw?: number;
  dash?: number[];
  opacity?: number;
}

export type SymbolPrimitive =
  | ({ k: 'rect'; x: number; y: number; w: number; h: number; rx?: number } & StyleOpts)
  | ({ k: 'ellipse'; cx: number; cy: number; rx: number; ry: number } & StyleOpts)
  | ({ k: 'line'; pts: number[]; closed?: boolean } & StyleOpts)
  | ({ k: 'path'; d: string } & StyleOpts)
  | ({ k: 'text'; x: number; y: number; text: string; size: number; fill: string; bold?: boolean });

type SpecFn = (w: number, h: number, p: SymbolPalette) => SymbolPrimitive[];

// ── Color helpers ─────────────────────────────────────────────

const parseHex = (value: string): { r: number; g: number; b: number } | null => {
  const raw = value.trim().replace('#', '');
  if (![3, 4, 6, 8].includes(raw.length)) return null;
  const hex = raw.length <= 4 ? raw.split('').map((c) => c + c).join('') : raw;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return null;
  return { r, g, b };
};

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

const mix = (c: { r: number; g: number; b: number }, target: number, amount: number) =>
  `rgb(${clamp255(c.r + (target - c.r) * amount)}, ${clamp255(c.g + (target - c.g) * amount)}, ${clamp255(c.b + (target - c.b) * amount)})`;

export function makePalette(color: string): SymbolPalette {
  const rgb = parseHex(color) ?? { r: 150, g: 150, b: 150 };
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return {
    fill: color,
    fillSoft: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.28)`,
    stroke: luminance < 0.22 ? mix(rgb, 255, 0.45) : mix(rgb, 0, 0.4),
    detail: luminance < 0.55 ? 'rgba(255,255,255,0.92)' : 'rgba(18,20,26,0.85)',
  };
}

// ── Geometry helpers ─────────────────────────────────────────

const deg = (d: number) => (d * Math.PI) / 180;

const arcPath = (cx: number, cy: number, r: number, a0: number, a1: number): string => {
  const x0 = cx + r * Math.cos(deg(a0));
  const y0 = cy + r * Math.sin(deg(a0));
  const x1 = cx + r * Math.cos(deg(a1));
  const y1 = cy + r * Math.sin(deg(a1));
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${large} ${sweep} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};

/** Base line weight for a symbol of this size */
const lw = (w: number, h: number) => Math.max(1.4, Math.min(3, Math.min(w, h) * 0.06));

// ── Shared building blocks ───────────────────────────────────

/** Character: filled disc with a facing notch pointing up (-y). */
const actor = (w: number, h: number, p: SymbolPalette, extra: SymbolPrimitive[] = [], dashed = false): SymbolPrimitive[] => {
  const r = Math.min(w, h) / 2;
  const t = lw(w, h);
  return [
    { k: 'ellipse', cx: 0, cy: 0, rx: r, ry: r, fill: p.fill, stroke: p.stroke, sw: t, dash: dashed ? [t * 2.2, t * 1.8] : undefined },
    { k: 'line', pts: [0, -r * 1.02, r * 0.32, -r * 0.55, -r * 0.32, -r * 0.55], closed: true, fill: p.detail, sw: 0 },
    ...extra,
  ];
};

/** Hatched structural wall band. */
const wallBand = (w: number, h: number, p: SymbolPalette): SymbolPrimitive[] => {
  const t = lw(w, h);
  const prims: SymbolPrimitive[] = [
    { k: 'rect', x: -w / 2, y: -h / 2, w, h, fill: p.fill, opacity: 0.9, stroke: p.stroke, sw: t },
  ];
  const step = Math.max(10, h * 1.1);
  for (let x = -w / 2 + step * 0.4; x < w / 2 - 1; x += step) {
    prims.push({ k: 'line', pts: [x, h / 2, Math.min(x + h, w / 2), -h / 2], stroke: p.detail, sw: 1, opacity: 0.3 });
  }
  return prims;
};

/** Rect with an inset border line (tables, counters, platforms). */
const insetRect = (w: number, h: number, p: SymbolPalette, inset?: number, rx = 2): SymbolPrimitive[] => {
  const t = lw(w, h);
  const i = inset ?? Math.max(3, Math.min(w, h) * 0.12);
  return [
    { k: 'rect', x: -w / 2, y: -h / 2, w, h, rx, fill: p.fill, stroke: p.stroke, sw: t },
    { k: 'rect', x: -w / 2 + i, y: -h / 2 + i, w: w - i * 2, h: h - i * 2, rx: Math.max(1, rx - 1), stroke: p.detail, sw: Math.max(1, t * 0.55), opacity: 0.55 },
  ];
};

/** Thin panel (bounce, flag, screens, backdrops). */
const panel = (w: number, h: number, p: SymbolPalette, detailLine = true): SymbolPrimitive[] => {
  const t = lw(w, h);
  const prims: SymbolPrimitive[] = [
    { k: 'rect', x: -w / 2, y: -h / 2, w, h, rx: Math.min(3, h / 3), fill: p.fill, stroke: p.stroke, sw: t },
  ];
  if (detailLine && h > 6) {
    prims.push({ k: 'line', pts: [-w / 2 + 4, 0, w / 2 - 4, 0], stroke: p.detail, sw: 1, opacity: 0.4 });
  }
  return prims;
};

/** Light fixture: housing circle + lens facing +x, barn-door ticks. */
const lightFixture = (w: number, h: number, p: SymbolPalette, opts: { doors?: boolean; soft?: boolean } = {}): SymbolPrimitive[] => {
  const r = Math.min(w, h) / 2 * 0.82;
  const t = lw(w, h);
  const prims: SymbolPrimitive[] = [
    { k: 'ellipse', cx: -r * 0.12, cy: 0, rx: r, ry: r, fill: p.fill, stroke: p.stroke, sw: t, dash: opts.soft ? [t * 2, t * 1.6] : undefined },
    // Lens face
    { k: 'line', pts: [r * 0.55, -r * 0.62, r * 0.55, r * 0.62], stroke: p.detail, sw: t, opacity: 0.9 },
  ];
  if (opts.doors) {
    prims.push(
      { k: 'line', pts: [r * 0.55, -r * 0.62, r * 1.15, -r * 0.95], stroke: p.stroke, sw: t },
      { k: 'line', pts: [r * 0.55, r * 0.62, r * 1.15, r * 0.95], stroke: p.stroke, sw: t },
    );
  }
  return prims;
};

/** Omnidirectional light: disc with radiating rays. */
const glowLight = (w: number, h: number, p: SymbolPalette): SymbolPrimitive[] => {
  const r = Math.min(w, h) / 2;
  const core = r * 0.45;
  const prims: SymbolPrimitive[] = [
    { k: 'ellipse', cx: 0, cy: 0, rx: core, ry: core, fill: p.fill, stroke: p.stroke, sw: lw(w, h) },
  ];
  for (let a = 0; a < 360; a += 45) {
    prims.push({
      k: 'line',
      pts: [Math.cos(deg(a)) * core * 1.35, Math.sin(deg(a)) * core * 1.35, Math.cos(deg(a)) * r, Math.sin(deg(a)) * r],
      stroke: p.fill, sw: Math.max(1.2, lw(w, h) * 0.8), opacity: 0.85,
    });
  }
  return prims;
};

/** Camera body + lens pointing +x. */
const cameraBody = (w: number, h: number, p: SymbolPalette): SymbolPrimitive[] => {
  const t = lw(w, h);
  const bodyW = w * 0.58;
  const bodyH = h * 0.72;
  const bodyX = -w / 2 + w * 0.06;
  return [
    { k: 'rect', x: bodyX, y: -bodyH / 2, w: bodyW, h: bodyH, rx: Math.min(4, bodyH * 0.18), fill: p.fill, stroke: p.stroke, sw: t },
    // Lens trapezoid
    { k: 'line', pts: [bodyX + bodyW, -bodyH * 0.26, w / 2 - w * 0.02, -bodyH * 0.42, w / 2 - w * 0.02, bodyH * 0.42, bodyX + bodyW, bodyH * 0.26], closed: true, fill: p.fill, stroke: p.stroke, sw: t },
    // Viewfinder dot at rear
    { k: 'ellipse', cx: bodyX + bodyW * 0.22, cy: 0, rx: bodyH * 0.14, ry: bodyH * 0.14, fill: p.detail, opacity: 0.75 },
  ];
};

const irregular = (w: number, h: number, p: SymbolPalette, points: number[][], facet = true): SymbolPrimitive[] => {
  const t = lw(w, h);
  const pts = points.flatMap(([px, py]) => [px * w / 2, py * h / 2]);
  const prims: SymbolPrimitive[] = [
    { k: 'line', pts, closed: true, fill: p.fill, stroke: p.stroke, sw: t },
  ];
  if (facet) {
    prims.push({ k: 'line', pts: [points[0][0] * w / 2, points[0][1] * h / 2, w * 0.08, h * 0.05], stroke: p.detail, sw: 1, opacity: 0.35 });
  }
  return prims;
};

const wavy = (w: number, y: number, amp: number, cycles: number): string => {
  const seg = w / cycles;
  let d = `M ${-w / 2} ${y}`;
  for (let i = 0; i < cycles; i++) {
    d += ` q ${seg / 4} ${i % 2 === 0 ? -amp : amp} ${seg / 2} 0 q ${seg / 4} ${i % 2 === 0 ? amp : -amp} ${seg / 2} 0`;
  }
  return d;
};

// ── Spec registry ────────────────────────────────────────────

const specs: Record<string, SpecFn> = {
  // Characters ------------------------------------------------
  'actor-male': (w, h, p) => actor(w, h, p),
  'actor-female': (w, h, p) => actor(w, h, p),
  'actor-child': (w, h, p) => actor(w, h, p),
  'extra': (w, h, p) => actor(w, h, p, [], true),
  'stunt': (w, h, p) => {
    const r = Math.min(w, h) / 2;
    return actor(w, h, p, [
      { k: 'line', pts: [-r * 0.4, -r * 0.1, r * 0.4, r * 0.55], stroke: p.detail, sw: lw(w, h), opacity: 0.85 },
      { k: 'line', pts: [r * 0.4, -r * 0.1, -r * 0.4, r * 0.55], stroke: p.detail, sw: lw(w, h), opacity: 0.85 },
    ]);
  },
  'director': (w, h, p) => {
    const r = Math.min(w, h) / 2;
    return actor(w, h, p, [
      { k: 'ellipse', cx: 0, cy: r * 0.15, rx: r * 0.42, ry: r * 0.42, stroke: p.detail, sw: lw(w, h) * 0.9, opacity: 0.85 },
    ]);
  },
  'sitting-actor': (w, h, p) => {
    const r = Math.min(w, h) / 2 * 0.8;
    return [
      { k: 'path', d: arcPath(0, 0, r * 1.24, 25, 155), stroke: p.stroke, sw: lw(w, h) * 1.6 },
      ...actor(w * 0.8, h * 0.8, p),
    ];
  },
  'lying-actor': (w, h, p) => {
    const t = lw(w, h);
    const headR = h * 0.42;
    return [
      { k: 'rect', x: -w / 2, y: -h * 0.32, w: w * 0.82, h: h * 0.64, rx: h * 0.32, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'ellipse', cx: w / 2 - headR, cy: 0, rx: headR, ry: headR, fill: p.fill, stroke: p.stroke, sw: t },
    ];
  },
  'group-small': (w, h, p) => {
    const r = Math.min(w, h) * 0.26;
    const t = lw(w, h);
    const dot = (cx: number, cy: number): SymbolPrimitive[] => [
      { k: 'ellipse', cx, cy, rx: r, ry: r, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'line', pts: [cx, cy - r, cx + r * 0.3, cy - r * 0.5, cx - r * 0.3, cy - r * 0.5], closed: true, fill: p.detail, sw: 0 },
    ];
    return [...dot(-w * 0.22, h * 0.14), ...dot(w * 0.22, h * 0.14), ...dot(0, -h * 0.18)];
  },
  'group-large': (w, h, p) => {
    const r = Math.min(w, h) * 0.19;
    const t = lw(w, h);
    const prims: SymbolPrimitive[] = [];
    const cols = [-w * 0.28, 0, w * 0.28];
    const rows = [-h * 0.18, h * 0.2];
    for (const cy of rows) {
      for (const cx of cols) {
        prims.push({ k: 'ellipse', cx, cy, rx: r, ry: r, fill: p.fill, stroke: p.stroke, sw: t });
      }
    }
    return prims;
  },

  // Cameras ---------------------------------------------------
  'camera': (w, h, p) => cameraBody(w, h, p),
  'camera-dolly': (w, h, p) => {
    const t = lw(w, h);
    const wheels: SymbolPrimitive[] = [
      [-w * 0.34, -h * 0.46], [-w * 0.34, h * 0.46], [w * 0.1, -h * 0.46], [w * 0.1, h * 0.46],
    ].map(([cx, cy]) => ({ k: 'ellipse', cx, cy, rx: w * 0.06, ry: h * 0.06, fill: p.stroke, opacity: 0.9 } as SymbolPrimitive));
    return [
      { k: 'rect', x: -w * 0.44, y: -h * 0.4, w: w * 0.64, h: h * 0.8, rx: 3, stroke: p.stroke, sw: t, dash: [t * 2, t * 1.6], opacity: 0.8 },
      ...wheels,
      ...cameraBody(w * 0.92, h * 0.78, p),
    ];
  },
  'camera-crane': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h * 0.14, w: w * 0.18, h: h * 0.28, fill: p.stroke, opacity: 0.85 },
      { k: 'line', pts: [-w / 2 + w * 0.16, 0, w * 0.12, 0], stroke: p.stroke, sw: t * 1.6 },
      ...cameraBody(w * 0.72, h * 0.6, p).map((prim) => offsetWhole(prim, w * 0.18, 0)),
    ];
  },
  'camera-steadicam': (w, h, p) => {
    const r = Math.min(w, h) / 2;
    return [
      { k: 'ellipse', cx: 0, cy: 0, rx: r * 0.98, ry: r * 0.98, stroke: p.stroke, sw: lw(w, h), dash: [4, 3], opacity: 0.75 },
      ...cameraBody(w * 0.78, h * 0.62, p),
    ];
  },
  'camera-drone': (w, h, p) => {
    const t = lw(w, h);
    const r = Math.min(w, h) * 0.2;
    const arms: SymbolPrimitive[] = [];
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      arms.push(
        { k: 'line', pts: [0, 0, sx * w * 0.32, sy * h * 0.32], stroke: p.stroke, sw: t },
        { k: 'ellipse', cx: sx * w * 0.32, cy: sy * h * 0.32, rx: r, ry: r, stroke: p.stroke, sw: t, opacity: 0.9 },
      );
    }
    return [
      ...arms,
      { k: 'rect', x: -w * 0.14, y: -h * 0.11, w: w * 0.28, h: h * 0.22, rx: 3, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'line', pts: [w * 0.14, 0, w * 0.24, 0], stroke: p.detail, sw: t },
    ];
  },
  'camera-handheld': (w, h, p) => cameraBody(w, h, p),
  'monitor': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h / 2, w, h, rx: 2, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'rect', x: -w / 2 + w * 0.1, y: -h / 2 + h * 0.14, w: w * 0.8, h: h * 0.6, fill: p.detail, opacity: 0.35 },
      { k: 'line', pts: [-w * 0.16, h * 0.34, w * 0.16, h * 0.34], stroke: p.detail, sw: t, opacity: 0.6 },
    ];
  },
  'tripod': (w, h, p) => {
    const r = Math.min(w, h) / 2;
    const t = lw(w, h);
    const legs: SymbolPrimitive[] = [90, 210, 330].map((a) => ({
      k: 'line', pts: [0, 0, Math.cos(deg(a)) * r, Math.sin(deg(a)) * r], stroke: p.stroke, sw: t * 1.2,
    } as SymbolPrimitive));
    return [...legs, { k: 'ellipse', cx: 0, cy: 0, rx: r * 0.28, ry: r * 0.28, fill: p.fill, stroke: p.stroke, sw: t }];
  },

  // Lighting --------------------------------------------------
  'key-light': (w, h, p) => lightFixture(w, h, p, { doors: true }),
  'fill-light': (w, h, p) => lightFixture(w, h, p, { soft: true }),
  'back-light': (w, h, p) => lightFixture(w, h, p),
  'fresnel': (w, h, p) => {
    const r = Math.min(w, h) / 2 * 0.82;
    return [
      ...lightFixture(w, h, p, { doors: true }),
      { k: 'path', d: arcPath(-r * 0.12, 0, r * 0.55, -55, 55), stroke: p.detail, sw: 1.2, opacity: 0.6 },
    ];
  },
  'spotlight': (w, h, p) => {
    const r = Math.min(w, h) / 2 * 0.7;
    const t = lw(w, h);
    return [
      { k: 'ellipse', cx: -r * 0.25, cy: 0, rx: r, ry: r, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'rect', x: r * 0.55, y: -r * 0.38, w: r * 0.75, h: r * 0.76, fill: p.fill, stroke: p.stroke, sw: t },
    ];
  },
  'softbox': (w, h, p) => {
    const t = lw(w, h);
    const s = Math.min(w, h) * 0.82;
    return [
      { k: 'rect', x: -s / 2, y: -s / 2, w: s, h: s, rx: 2, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'line', pts: [-s / 2, -s / 2, s / 2, s / 2], stroke: p.stroke, sw: 1, opacity: 0.5 },
      { k: 'line', pts: [s / 2, -s / 2, -s / 2, s / 2], stroke: p.stroke, sw: 1, opacity: 0.5 },
      { k: 'line', pts: [s / 2, -s / 2, s / 2, s / 2], stroke: p.detail, sw: t * 1.4 },
    ];
  },
  'led-panel': (w, h, p) => {
    const t = lw(w, h);
    const prims: SymbolPrimitive[] = [
      { k: 'rect', x: -w / 2, y: -h / 2, w: w * 0.86, h, rx: 2, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'line', pts: [w * 0.42, -h / 2, w * 0.42, h / 2], stroke: p.detail, sw: t * 1.4 },
    ];
    for (let ix = 0; ix < 3; ix++) {
      for (let iy = 0; iy < 2; iy++) {
        prims.push({ k: 'ellipse', cx: -w * 0.32 + ix * w * 0.24, cy: -h * 0.18 + iy * h * 0.36, rx: 1.6, ry: 1.6, fill: p.detail, opacity: 0.55 });
      }
    }
    return prims;
  },
  'practical-light': (w, h, p) => glowLight(w, h, p),
  'ring-light': (w, h, p) => {
    const r = Math.min(w, h) / 2 * 0.8;
    return [
      { k: 'ellipse', cx: 0, cy: 0, rx: r, ry: r, stroke: p.fill, sw: r * 0.4 },
      { k: 'ellipse', cx: 0, cy: 0, rx: r, ry: r, stroke: p.stroke, sw: 1, opacity: 0.6 },
      { k: 'ellipse', cx: 0, cy: 0, rx: r * 0.6, ry: r * 0.6, stroke: p.stroke, sw: 1, opacity: 0.6 },
    ];
  },
  'bounce-board': (w, h, p) => panel(w, h, p),
  'flag-cutter': (w, h, p) => panel(w, h, p, false),
  'diffusion': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h / 2, w, h, fill: p.fillSoft, stroke: p.stroke, sw: t },
      { k: 'line', pts: [-w / 2 + 3, 0, w / 2 - 3, 0], stroke: p.stroke, sw: 1, dash: [4, 4], opacity: 0.7 },
    ];
  },
  'gel': (w, h, p) => [
    { k: 'rect', x: -w / 2, y: -h / 2, w, h, rx: 2, fill: p.fillSoft, stroke: p.fill, sw: lw(w, h) },
  ],
  'c-stand': (w, h, p) => {
    const r = Math.min(w, h) / 2;
    const t = lw(w, h);
    const legs: SymbolPrimitive[] = [30, 150, 270].map((a) => ({
      k: 'line', pts: [0, 0, Math.cos(deg(a)) * r * 0.9, Math.sin(deg(a)) * r * 0.9], stroke: p.stroke, sw: t,
    } as SymbolPrimitive));
    return [
      ...legs,
      { k: 'line', pts: [0, 0, r, 0], stroke: p.fill, sw: t * 1.3 },
      { k: 'ellipse', cx: 0, cy: 0, rx: r * 0.2, ry: r * 0.2, fill: p.fill, stroke: p.stroke, sw: 1 },
    ];
  },

  // Audio -----------------------------------------------------
  'boom-mic': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'line', pts: [-w / 2, h * 0.28, w * 0.12, -h * 0.05], stroke: p.stroke, sw: t * 1.2 },
      { k: 'ellipse', cx: w * 0.28, cy: -h * 0.08, rx: w * 0.2, ry: h * 0.14, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'ellipse', cx: w * 0.28, cy: -h * 0.08, rx: w * 0.26, ry: h * 0.2, stroke: p.stroke, sw: 1, dash: [3, 3], opacity: 0.6 },
    ];
  },
  'lav-mic': (w, h, p) => {
    const r = Math.min(w, h) * 0.3;
    return [
      { k: 'ellipse', cx: 0, cy: -r * 0.4, rx: r, ry: r, fill: p.fill, stroke: p.stroke, sw: lw(w, h) },
      { k: 'line', pts: [0, r * 0.6, 0, r * 1.4, r * 0.8, r * 1.8], stroke: p.stroke, sw: 1.4 },
    ];
  },
  'shotgun-mic': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h * 0.32, w, h: h * 0.64, rx: h * 0.32, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'line', pts: [-w * 0.2, -h * 0.32, -w * 0.2, h * 0.32], stroke: p.detail, sw: 1, opacity: 0.5 },
      { k: 'line', pts: [0, -h * 0.32, 0, h * 0.32], stroke: p.detail, sw: 1, opacity: 0.5 },
      { k: 'line', pts: [w * 0.2, -h * 0.32, w * 0.2, h * 0.32], stroke: p.detail, sw: 1, opacity: 0.5 },
    ];
  },
  'speaker': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h / 2, w: w * 0.72, h, rx: 3, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'ellipse', cx: -w * 0.14, cy: 0, rx: Math.min(w, h) * 0.22, ry: Math.min(w, h) * 0.22, stroke: p.detail, sw: t, opacity: 0.75 },
      { k: 'path', d: arcPath(w * 0.26, 0, w * 0.14, -45, 45), stroke: p.stroke, sw: 1.4, opacity: 0.8 },
      { k: 'path', d: arcPath(w * 0.26, 0, w * 0.26, -40, 40), stroke: p.stroke, sw: 1.4, opacity: 0.55 },
    ];
  },
  'recorder': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h / 2, w, h, rx: 3, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'ellipse', cx: -w * 0.2, cy: -h * 0.08, rx: h * 0.2, ry: h * 0.2, stroke: p.detail, sw: 1.4, opacity: 0.7 },
      { k: 'ellipse', cx: w * 0.2, cy: -h * 0.08, rx: h * 0.2, ry: h * 0.2, stroke: p.detail, sw: 1.4, opacity: 0.7 },
      { k: 'line', pts: [-w * 0.3, h * 0.28, w * 0.3, h * 0.28], stroke: p.detail, sw: 1.2, opacity: 0.5 },
    ];
  },
  'headphones': (w, h, p) => {
    const r = Math.min(w, h) / 2 * 0.8;
    const t = lw(w, h);
    return [
      { k: 'path', d: arcPath(0, r * 0.25, r, 180, 360), stroke: p.stroke, sw: t * 1.4 },
      { k: 'ellipse', cx: -r, cy: r * 0.35, rx: r * 0.3, ry: r * 0.42, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'ellipse', cx: r, cy: r * 0.35, rx: r * 0.3, ry: r * 0.42, fill: p.fill, stroke: p.stroke, sw: t },
    ];
  },

  // Furniture -------------------------------------------------
  'table-rect': (w, h, p) => insetRect(w, h, p),
  'dining-table': (w, h, p) => insetRect(w, h, p),
  'kitchen-table': (w, h, p) => insetRect(w, h, p),
  'table-round': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'ellipse', cx: 0, cy: 0, rx: w / 2, ry: h / 2, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'ellipse', cx: 0, cy: 0, rx: w / 2 * 0.72, ry: h / 2 * 0.72, stroke: p.detail, sw: 1, opacity: 0.5 },
    ];
  },
  'chair': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w * 0.38, y: -h * 0.3, w: w * 0.76, h: h * 0.72, rx: 3, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'rect', x: -w * 0.44, y: -h * 0.48, w: w * 0.88, h: h * 0.18, rx: 2, fill: p.stroke },
    ];
  },
  'armchair': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w * 0.34, y: -h * 0.28, w: w * 0.68, h: h * 0.68, rx: 4, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'rect', x: -w * 0.46, y: -h * 0.46, w: w * 0.92, h: h * 0.2, rx: 3, fill: p.stroke },
      { k: 'rect', x: -w * 0.48, y: -h * 0.3, w: w * 0.14, h: h * 0.7, rx: 3, fill: p.stroke },
      { k: 'rect', x: w * 0.34, y: -h * 0.3, w: w * 0.14, h: h * 0.7, rx: 3, fill: p.stroke },
    ];
  },
  'sofa': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w * 0.4, y: -h * 0.22, w: w * 0.8, h: h * 0.62, rx: 4, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'rect', x: -w * 0.46, y: -h * 0.48, w: w * 0.92, h: h * 0.24, rx: 4, fill: p.stroke },
      { k: 'rect', x: -w * 0.5, y: -h * 0.3, w: w * 0.1, h: h * 0.72, rx: 3, fill: p.stroke },
      { k: 'rect', x: w * 0.4, y: -h * 0.3, w: w * 0.1, h: h * 0.72, rx: 3, fill: p.stroke },
      { k: 'line', pts: [-w * 0.13, -h * 0.2, -w * 0.13, h * 0.38], stroke: p.detail, sw: 1, opacity: 0.45 },
      { k: 'line', pts: [w * 0.13, -h * 0.2, w * 0.13, h * 0.38], stroke: p.detail, sw: 1, opacity: 0.45 },
    ];
  },
  'bed-single': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h / 2, w, h, rx: 3, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'rect', x: -w * 0.36, y: -h * 0.44, w: w * 0.72, h: h * 0.16, rx: 3, fill: p.detail, opacity: 0.6 },
      { k: 'line', pts: [-w / 2, -h * 0.16, w / 2, -h * 0.16], stroke: p.stroke, sw: 1.2, opacity: 0.8 },
    ];
  },
  'bed-double': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h / 2, w, h, rx: 3, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'rect', x: -w * 0.42, y: -h * 0.44, w: w * 0.36, h: h * 0.16, rx: 3, fill: p.detail, opacity: 0.6 },
      { k: 'rect', x: w * 0.06, y: -h * 0.44, w: w * 0.36, h: h * 0.16, rx: 3, fill: p.detail, opacity: 0.6 },
      { k: 'line', pts: [-w / 2, -h * 0.16, w / 2, -h * 0.16], stroke: p.stroke, sw: 1.2, opacity: 0.8 },
      { k: 'line', pts: [0, -h * 0.16, 0, h / 2], stroke: p.stroke, sw: 1, opacity: 0.4 },
    ];
  },
  'desk': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h / 2, w, h, rx: 2, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'line', pts: [-w * 0.18, h * 0.5, -w * 0.18, -h * 0.1, w * 0.18, -h * 0.1, w * 0.18, h * 0.5], stroke: p.detail, sw: 1, opacity: 0.45 },
    ];
  },
  'bookshelf': (w, h, p) => {
    const t = lw(w, h);
    const prims: SymbolPrimitive[] = [
      { k: 'rect', x: -w / 2, y: -h / 2, w, h, fill: p.fill, stroke: p.stroke, sw: t },
    ];
    for (let i = 1; i < 5; i++) {
      prims.push({ k: 'line', pts: [-w / 2 + (w / 5) * i, -h / 2, -w / 2 + (w / 5) * i, h / 2], stroke: p.detail, sw: 1, opacity: 0.5 });
    }
    return prims;
  },
  'cabinet': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h / 2, w, h, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'line', pts: [0, -h / 2, 0, h / 2], stroke: p.detail, sw: 1, opacity: 0.55 },
      { k: 'ellipse', cx: -w * 0.08, cy: 0, rx: 1.4, ry: 1.4, fill: p.detail, opacity: 0.7 },
      { k: 'ellipse', cx: w * 0.08, cy: 0, rx: 1.4, ry: 1.4, fill: p.detail, opacity: 0.7 },
    ];
  },
  'stool': (w, h, p) => {
    const r = Math.min(w, h) / 2;
    return [
      { k: 'ellipse', cx: 0, cy: 0, rx: r, ry: r, fill: p.fill, stroke: p.stroke, sw: lw(w, h) },
      { k: 'ellipse', cx: 0, cy: 0, rx: r * 0.55, ry: r * 0.55, stroke: p.detail, sw: 1, opacity: 0.45 },
    ];
  },
  'rug': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h / 2, w, h, rx: 4, fill: p.fillSoft, stroke: p.stroke, sw: t },
      { k: 'rect', x: -w / 2 + 6, y: -h / 2 + 6, w: w - 12, h: h - 12, rx: 3, stroke: p.stroke, sw: 1, dash: [5, 4], opacity: 0.6 },
    ];
  },
  'wardrobe': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h / 2, w, h, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'line', pts: [0, -h / 2, 0, h / 2], stroke: p.detail, sw: 1, opacity: 0.55 },
      { k: 'line', pts: [-w / 2 + 4, 0, w / 2 - 4, 0], stroke: p.detail, sw: 1, dash: [4, 3], opacity: 0.4 },
    ];
  },

  // Props -----------------------------------------------------
  'box-crate': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h / 2, w, h, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'line', pts: [-w / 2, -h / 2, w / 2, h / 2], stroke: p.stroke, sw: 1, opacity: 0.6 },
      { k: 'line', pts: [w / 2, -h / 2, -w / 2, h / 2], stroke: p.stroke, sw: 1, opacity: 0.6 },
    ];
  },
  'barrel': (w, h, p) => {
    const r = Math.min(w, h) / 2;
    return [
      { k: 'ellipse', cx: 0, cy: 0, rx: r, ry: r, fill: p.fill, stroke: p.stroke, sw: lw(w, h) },
      { k: 'ellipse', cx: 0, cy: 0, rx: r * 0.66, ry: r * 0.66, stroke: p.detail, sw: 1, opacity: 0.5 },
      { k: 'ellipse', cx: 0, cy: 0, rx: r * 0.12, ry: r * 0.12, fill: p.detail, opacity: 0.6 },
    ];
  },
  'ladder': (w, h, p) => {
    const t = lw(w, h);
    const prims: SymbolPrimitive[] = [
      { k: 'line', pts: [-w * 0.32, -h / 2, -w * 0.32, h / 2], stroke: p.stroke, sw: t * 1.2 },
      { k: 'line', pts: [w * 0.32, -h / 2, w * 0.32, h / 2], stroke: p.stroke, sw: t * 1.2 },
    ];
    const rungs = Math.max(3, Math.round(h / 12));
    for (let i = 0; i <= rungs; i++) {
      const y = -h / 2 + (h / rungs) * i;
      prims.push({ k: 'line', pts: [-w * 0.32, y, w * 0.32, y], stroke: p.fill, sw: t });
    }
    return prims;
  },
  'mirror': (w, h, p) => [
    ...panel(w, h, p, false),
    { k: 'line', pts: [-w * 0.3, -h * 0.2, -w * 0.15, -h * 0.2], stroke: p.detail, sw: 1, opacity: 0.8 },
  ],
  'screen-tv': (w, h, p) => [
    ...panel(w, h, p, false),
    { k: 'line', pts: [0, h / 2, 0, h / 2 + Math.max(3, h * 0.5)], stroke: p.stroke, sw: 2 },
  ],
  'painting': (w, h, p) => panel(w, h, p, false),
  'picture-frame': (w, h, p) => panel(w, h, p, false),
  'telephone': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h / 2, w, h, rx: 3, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'ellipse', cx: 0, cy: 0, rx: w * 0.3, ry: h * 0.18, stroke: p.detail, sw: 1.2, opacity: 0.7 },
    ];
  },
  'laptop': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h * 0.08, w, h: h * 0.58, rx: 2, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'rect', x: -w * 0.44, y: -h / 2, w: w * 0.88, h: h * 0.4, rx: 2, fill: p.fillSoft, stroke: p.stroke, sw: 1 },
    ];
  },
  'book': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h / 2, w, h, rx: 1, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'line', pts: [-w / 2 + w * 0.18, -h / 2, -w / 2 + w * 0.18, h / 2], stroke: p.detail, sw: 1, opacity: 0.6 },
    ];
  },
  'candle': (w, h, p) => glowLight(w, h, p),
  'food-plate': (w, h, p) => {
    const r = Math.min(w, h) / 2;
    return [
      { k: 'ellipse', cx: 0, cy: 0, rx: r, ry: r, fill: p.fill, stroke: p.stroke, sw: lw(w, h) },
      { k: 'ellipse', cx: 0, cy: 0, rx: r * 0.6, ry: r * 0.6, stroke: p.stroke, sw: 1, opacity: 0.6 },
    ];
  },
  'bottle': (w, h, p) => {
    const r = Math.min(w, h) / 2;
    return [
      { k: 'ellipse', cx: 0, cy: 0, rx: r, ry: r, fill: p.fill, stroke: p.stroke, sw: lw(w, h) },
      { k: 'ellipse', cx: 0, cy: 0, rx: r * 0.3, ry: r * 0.3, fill: p.detail, opacity: 0.5 },
    ];
  },
  'cup': (w, h, p) => {
    const r = Math.min(w, h) / 2;
    return [
      { k: 'ellipse', cx: 0, cy: 0, rx: r, ry: r, stroke: p.stroke, sw: lw(w, h), fill: p.fillSoft },
      { k: 'path', d: arcPath(r * 1.1, 0, r * 0.45, -70, 70), stroke: p.stroke, sw: 1.4 },
    ];
  },
  'weapon-prop': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h * 0.16, w: w * 0.9, h: h * 0.3, rx: 2, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'rect', x: -w * 0.26, y: h * 0.1, w: w * 0.2, h: h * 0.36, rx: 2, fill: p.fill, stroke: p.stroke, sw: t },
    ];
  },
  'suitcase': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h * 0.34, w, h: h * 0.8, rx: 4, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'path', d: arcPath(0, -h * 0.32, w * 0.18, 180, 360), stroke: p.stroke, sw: t },
      { k: 'line', pts: [-w / 2, 0, w / 2, 0], stroke: p.detail, sw: 1, opacity: 0.45 },
    ];
  },
  'clock': (w, h, p) => {
    const r = Math.min(w, h) / 2;
    return [
      { k: 'ellipse', cx: 0, cy: 0, rx: r, ry: r, fill: p.fill, stroke: p.stroke, sw: lw(w, h) },
      { k: 'line', pts: [0, 0, 0, -r * 0.55], stroke: p.detail, sw: 1.6 },
      { k: 'line', pts: [0, 0, r * 0.4, r * 0.15], stroke: p.detail, sw: 1.6 },
    ];
  },

  // Vehicles (length along y, nose up) ------------------------
  'car': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w * 0.42, y: -h / 2, w: w * 0.84, h, rx: Math.min(w, h) * 0.18, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'path', d: `M ${-w * 0.32} ${-h * 0.22} Q 0 ${-h * 0.32} ${w * 0.32} ${-h * 0.22}`, stroke: p.detail, sw: 1.4, opacity: 0.7 },
      { k: 'path', d: `M ${-w * 0.32} ${h * 0.3} Q 0 ${h * 0.4} ${w * 0.32} ${h * 0.3}`, stroke: p.detail, sw: 1.4, opacity: 0.6 },
      { k: 'line', pts: [-w * 0.48, -h * 0.14, -w * 0.42, -h * 0.14], stroke: p.stroke, sw: 2 },
      { k: 'line', pts: [w * 0.42, -h * 0.14, w * 0.48, -h * 0.14], stroke: p.stroke, sw: 2 },
    ];
  },
  'van': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w * 0.44, y: -h / 2, w: w * 0.88, h, rx: Math.min(w, h) * 0.12, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'path', d: `M ${-w * 0.34} ${-h * 0.28} Q 0 ${-h * 0.36} ${w * 0.34} ${-h * 0.28}`, stroke: p.detail, sw: 1.4, opacity: 0.7 },
      { k: 'line', pts: [-w * 0.44, -h * 0.18, w * 0.44, -h * 0.18], stroke: p.detail, sw: 1, opacity: 0.4 },
    ];
  },
  'truck': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w * 0.4, y: -h / 2, w: w * 0.8, h: h * 0.26, rx: 3, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'rect', x: -w * 0.46, y: -h * 0.18, w: w * 0.92, h: h * 0.66, rx: 2, fill: p.fillSoft, stroke: p.stroke, sw: t },
      { k: 'path', d: `M ${-w * 0.3} ${-h * 0.4} Q 0 ${-h * 0.46} ${w * 0.3} ${-h * 0.4}`, stroke: p.detail, sw: 1.2, opacity: 0.7 },
    ];
  },
  'motorcycle': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'ellipse', cx: 0, cy: -h * 0.36, rx: w * 0.18, ry: h * 0.13, fill: p.stroke },
      { k: 'ellipse', cx: 0, cy: h * 0.36, rx: w * 0.18, ry: h * 0.13, fill: p.stroke },
      { k: 'ellipse', cx: 0, cy: 0, rx: w * 0.26, ry: h * 0.26, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'line', pts: [-w * 0.45, -h * 0.28, w * 0.45, -h * 0.28], stroke: p.stroke, sw: t },
    ];
  },
  'bicycle': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'ellipse', cx: 0, cy: -h * 0.32, rx: w * 0.16, ry: h * 0.17, stroke: p.stroke, sw: t },
      { k: 'ellipse', cx: 0, cy: h * 0.32, rx: w * 0.16, ry: h * 0.17, stroke: p.stroke, sw: t },
      { k: 'line', pts: [0, -h * 0.3, 0, h * 0.3], stroke: p.fill, sw: t * 1.2 },
      { k: 'line', pts: [-w * 0.4, -h * 0.26, w * 0.4, -h * 0.26], stroke: p.stroke, sw: t },
    ];
  },
  'horse': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'ellipse', cx: 0, cy: h * 0.08, rx: w * 0.3, ry: h * 0.34, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'ellipse', cx: 0, cy: -h * 0.34, rx: w * 0.14, ry: h * 0.14, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'line', pts: [0, -h * 0.22, 0, -h * 0.08], stroke: p.stroke, sw: t * 1.4 },
      { k: 'line', pts: [0, h * 0.4, 0, h * 0.5], stroke: p.stroke, sw: t, opacity: 0.8 },
    ];
  },

  // Garage / Hangar / Workshop --------------------------------
  'hangar-door': (w, h, p) => {
    const t = lw(w, h);
    const stub = w * 0.1;
    const leaf = w * 0.32;
    return [
      // Wall stubs at each side of the opening
      { k: 'rect', x: -w / 2, y: -h / 2, w: stub, h, fill: p.stroke },
      { k: 'rect', x: w / 2 - stub, y: -h / 2, w: stub, h, fill: p.stroke },
      // Opening
      { k: 'line', pts: [-w / 2 + stub, 0, w / 2 - stub, 0], stroke: p.stroke, sw: 1.2, dash: [6, 5], opacity: 0.75 },
      // Sliding panels, parked just inside each stub
      { k: 'rect', x: -w / 2 + stub * 0.4, y: -h * 1.15, w: leaf, h: h * 0.6, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'rect', x: w / 2 - stub * 0.4 - leaf, y: -h * 1.15, w: leaf, h: h * 0.6, fill: p.fill, stroke: p.stroke, sw: t },
      // Slide direction arrows
      { k: 'line', pts: [-w * 0.05, -h * 0.85, -w * 0.14, -h * 0.85], stroke: p.detail, sw: 1.2, opacity: 0.8 },
      { k: 'line', pts: [-w * 0.11, -h * 1.15, -w * 0.14, -h * 0.85, -w * 0.11, -h * 0.55], stroke: p.detail, sw: 1.2, opacity: 0.8 },
      { k: 'line', pts: [w * 0.05, -h * 0.85, w * 0.14, -h * 0.85], stroke: p.detail, sw: 1.2, opacity: 0.8 },
      { k: 'line', pts: [w * 0.11, -h * 1.15, w * 0.14, -h * 0.85, w * 0.11, -h * 0.55], stroke: p.detail, sw: 1.2, opacity: 0.8 },
    ];
  },
  'roller-door': (w, h, p) => {
    const t = lw(w, h);
    const stub = w * 0.08;
    return [
      { k: 'rect', x: -w / 2, y: -h / 2, w: stub, h, fill: p.stroke },
      { k: 'rect', x: w / 2 - stub, y: -h / 2, w: stub, h, fill: p.stroke },
      { k: 'line', pts: [-w / 2 + stub, 0, w / 2 - stub, 0], stroke: p.fill, sw: t, dash: [3, 3] },
      // Roll drums at each end
      { k: 'ellipse', cx: -w / 2 + stub * 1.8, cy: 0, rx: h * 0.55, ry: h * 0.55, stroke: p.stroke, sw: 1.2 },
      { k: 'ellipse', cx: w / 2 - stub * 1.8, cy: 0, rx: h * 0.55, ry: h * 0.55, stroke: p.stroke, sw: 1.2 },
    ];
  },
  'workbench': (w, h, p) => {
    const t = lw(w, h);
    return [
      ...insetRect(w, h, p, 3),
      { k: 'ellipse', cx: -w * 0.3, cy: 0, rx: h * 0.14, ry: h * 0.14, stroke: p.detail, sw: 1.2, opacity: 0.6 },
      { k: 'line', pts: [w * 0.1, -h * 0.14, w * 0.34, -h * 0.14], stroke: p.detail, sw: t, opacity: 0.55 },
      { k: 'line', pts: [w * 0.05, h * 0.16, w * 0.28, h * 0.16], stroke: p.detail, sw: 1.2, opacity: 0.45 },
    ];
  },
  'tool-cabinet': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h / 2, w, h, rx: 2, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'line', pts: [-w / 2 + 2, -h * 0.15, w / 2 - 2, -h * 0.15], stroke: p.detail, sw: 1, opacity: 0.6 },
      { k: 'line', pts: [-w / 2 + 2, h * 0.18, w / 2 - 2, h * 0.18], stroke: p.detail, sw: 1, opacity: 0.6 },
      { k: 'ellipse', cx: 0, cy: -h * 0.33, rx: 1.3, ry: 1.3, fill: p.detail, opacity: 0.8 },
    ];
  },
  'tool-cart': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w * 0.42, y: -h / 2, w: w * 0.84, h, rx: 2, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'line', pts: [w * 0.42, -h * 0.3, w * 0.5, 0, w * 0.42, h * 0.3], stroke: p.stroke, sw: t },
      { k: 'ellipse', cx: -w * 0.3, cy: -h * 0.34, rx: 1.4, ry: 1.4, fill: p.stroke },
      { k: 'ellipse', cx: -w * 0.3, cy: h * 0.34, rx: 1.4, ry: 1.4, fill: p.stroke },
      { k: 'ellipse', cx: w * 0.26, cy: -h * 0.34, rx: 1.4, ry: 1.4, fill: p.stroke },
      { k: 'ellipse', cx: w * 0.26, cy: h * 0.34, rx: 1.4, ry: 1.4, fill: p.stroke },
    ];
  },
  'shelving-rack': (w, h, p) => {
    const t = lw(w, h);
    const prims: SymbolPrimitive[] = [
      { k: 'rect', x: -w / 2, y: -h / 2, w, h, fill: p.fillSoft, stroke: p.stroke, sw: t },
    ];
    for (let i = 1; i < 4; i++) {
      prims.push({ k: 'line', pts: [-w / 2 + (w / 4) * i, -h / 2, -w / 2 + (w / 4) * i, h / 2], stroke: p.stroke, sw: 1.2, opacity: 0.8 });
    }
    prims.push({ k: 'line', pts: [-w / 2 + 3, 0, w / 2 - 3, 0], stroke: p.fill, sw: 1, dash: [4, 3], opacity: 0.6 });
    return prims;
  },
  'pallet': (w, h, p) => {
    const t = lw(w, h);
    const prims: SymbolPrimitive[] = [
      { k: 'rect', x: -w / 2, y: -h / 2, w, h, fill: p.fillSoft, stroke: p.stroke, sw: t },
    ];
    for (let i = 0; i < 3; i++) {
      prims.push({ k: 'rect', x: -w / 2 + 2, y: -h * 0.36 + i * h * 0.32, w: w - 4, h: h * 0.16, fill: p.fill, opacity: 0.7 });
    }
    return prims;
  },
  'tire-stack': (w, h, p) => {
    const r = Math.min(w, h) / 2;
    return [
      { k: 'ellipse', cx: r * 0.14, cy: r * 0.14, rx: r * 0.85, ry: r * 0.85, stroke: p.stroke, sw: 1.4, opacity: 0.5 },
      { k: 'ellipse', cx: 0, cy: 0, rx: r * 0.9, ry: r * 0.9, fill: p.fill, stroke: p.stroke, sw: lw(w, h) },
      { k: 'ellipse', cx: 0, cy: 0, rx: r * 0.42, ry: r * 0.42, stroke: p.detail, sw: 1.4, opacity: 0.8 },
    ];
  },
  'oil-drum': (w, h, p) => {
    const r = Math.min(w, h) / 2;
    return [
      { k: 'ellipse', cx: 0, cy: 0, rx: r, ry: r, fill: p.fill, stroke: p.stroke, sw: lw(w, h) },
      { k: 'ellipse', cx: 0, cy: 0, rx: r * 0.7, ry: r * 0.7, stroke: p.detail, sw: 1.1, opacity: 0.55 },
      { k: 'ellipse', cx: r * 0.34, cy: -r * 0.34, rx: r * 0.13, ry: r * 0.13, fill: p.detail, opacity: 0.7 },
    ];
  },
  'jerry-can': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h / 2, w, h, rx: 2, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'line', pts: [-w * 0.3, -h * 0.24, w * 0.3, h * 0.3], stroke: p.detail, sw: 1.1, opacity: 0.6 },
      { k: 'line', pts: [w * 0.3, -h * 0.24, -w * 0.3, h * 0.3], stroke: p.detail, sw: 1.1, opacity: 0.6 },
      { k: 'ellipse', cx: 0, cy: -h * 0.34, rx: w * 0.14, ry: w * 0.14, fill: p.detail, opacity: 0.7 },
    ];
  },
  'engine-hoist': (w, h, p) => {
    const t = lw(w, h);
    return [
      // Splayed legs
      { k: 'line', pts: [-w * 0.34, h / 2, -w * 0.18, -h * 0.1], stroke: p.stroke, sw: t * 1.2 },
      { k: 'line', pts: [w * 0.34, h / 2, w * 0.18, -h * 0.1], stroke: p.stroke, sw: t * 1.2 },
      { k: 'line', pts: [-w * 0.34, h / 2, w * 0.34, h / 2], stroke: p.stroke, sw: t },
      // Boom arm + hook
      { k: 'line', pts: [0, h * 0.1, 0, -h * 0.42], stroke: p.fill, sw: t * 1.6 },
      { k: 'ellipse', cx: 0, cy: -h * 0.42, rx: w * 0.09, ry: w * 0.09, stroke: p.fill, sw: t },
    ];
  },
  'car-lift': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h * 0.12, w: w * 0.14, h: h * 0.24, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'rect', x: w / 2 - w * 0.14, y: -h * 0.12, w: w * 0.14, h: h * 0.24, fill: p.fill, stroke: p.stroke, sw: t },
      // Swing arms
      { k: 'line', pts: [-w * 0.36, 0, -w * 0.1, -h * 0.3], stroke: p.fill, sw: t * 1.3 },
      { k: 'line', pts: [-w * 0.36, 0, -w * 0.1, h * 0.3], stroke: p.fill, sw: t * 1.3 },
      { k: 'line', pts: [w * 0.36, 0, w * 0.1, -h * 0.3], stroke: p.fill, sw: t * 1.3 },
      { k: 'line', pts: [w * 0.36, 0, w * 0.1, h * 0.3], stroke: p.fill, sw: t * 1.3 },
      // Vehicle footprint
      { k: 'rect', x: -w * 0.3, y: -h / 2, w: w * 0.6, h, rx: Math.min(w, h) * 0.14, stroke: p.stroke, sw: 1.1, dash: [5, 4], opacity: 0.55 },
    ];
  },
  'forklift': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w * 0.42, y: -h * 0.18, w: w * 0.84, h: h * 0.6, rx: 3, fill: p.fill, stroke: p.stroke, sw: t },
      // Mast + forks pointing forward (-y)
      { k: 'line', pts: [-w * 0.34, -h * 0.2, w * 0.34, -h * 0.2], stroke: p.stroke, sw: t * 1.3 },
      { k: 'line', pts: [-w * 0.2, -h * 0.2, -w * 0.2, -h / 2], stroke: p.stroke, sw: t },
      { k: 'line', pts: [w * 0.2, -h * 0.2, w * 0.2, -h / 2], stroke: p.stroke, sw: t },
      // Overhead guard
      { k: 'rect', x: -w * 0.3, y: -h * 0.08, w: w * 0.6, h: h * 0.32, stroke: p.detail, sw: 1.1, opacity: 0.6 },
      { k: 'rect', x: -w * 0.46, y: h * 0.28, w: w * 0.92, h: h * 0.16, rx: 2, fill: p.stroke, opacity: 0.9 },
    ];
  },
  'junk-pile': (w, h, p) => [
    { k: 'line', pts: [-w * 0.48, h * 0.3, -w * 0.3, -h * 0.2, -w * 0.05, h * 0.05, w * 0.15, -h * 0.42, w * 0.38, -h * 0.05, w * 0.48, h * 0.32, 0, h * 0.46], closed: true, fill: p.fillSoft, stroke: p.stroke, sw: lw(w, h) },
    { k: 'rect', x: -w * 0.3, y: h * 0.02, w: w * 0.18, h: h * 0.2, stroke: p.stroke, sw: 1.1, opacity: 0.7 },
    { k: 'ellipse', cx: w * 0.18, cy: h * 0.14, rx: w * 0.09, ry: w * 0.09, stroke: p.stroke, sw: 1.1, opacity: 0.7 },
    { k: 'line', pts: [-w * 0.02, -h * 0.16, w * 0.22, -h * 0.28], stroke: p.stroke, sw: 1.4, opacity: 0.7 },
  ],
  'scrap-metal': (w, h, p) => [
    { k: 'line', pts: [-w * 0.44, h * 0.3, -w * 0.1, -h * 0.34, w * 0.08, h * 0.1], stroke: p.fill, sw: lw(w, h) },
    { k: 'line', pts: [-w * 0.2, h * 0.36, w * 0.3, -h * 0.3], stroke: p.fill, sw: lw(w, h) },
    { k: 'line', pts: [0, h * 0.4, w * 0.44, h * 0.06, w * 0.3, h * 0.4], closed: true, fill: p.fillSoft, stroke: p.stroke, sw: 1.2 },
    { k: 'ellipse', cx: -w * 0.32, cy: -h * 0.1, rx: w * 0.07, ry: w * 0.07, stroke: p.stroke, sw: 1.2, opacity: 0.8 },
  ],
  'tarp-covered': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'path', d: `M ${-w * 0.46} ${h * 0.4} C ${-w * 0.5} ${-h * 0.1} ${-w * 0.3} ${-h * 0.44} ${-w * 0.02} ${-h * 0.4} C ${w * 0.3} ${-h * 0.46} ${w * 0.5} ${-h * 0.06} ${w * 0.46} ${h * 0.4} Z`, fill: p.fillSoft, stroke: p.stroke, sw: t },
      { k: 'path', d: `M ${-w * 0.3} ${h * 0.4} C ${-w * 0.26} ${0} ${-w * 0.18} ${-h * 0.2} ${-w * 0.08} ${-h * 0.4}`, stroke: p.fill, sw: 1.2, opacity: 0.75 },
      { k: 'path', d: `M ${w * 0.16} ${h * 0.4} C ${w * 0.18} ${h * 0.05} ${w * 0.24} ${-h * 0.16} ${w * 0.34} ${-h * 0.3}`, stroke: p.fill, sw: 1.2, opacity: 0.75 },
    ];
  },
  'air-compressor': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w * 0.36, y: -h * 0.44, w: w * 0.72, h: h * 0.72, rx: w * 0.32, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'rect', x: -w * 0.26, y: h * 0.3, w: w * 0.52, h: h * 0.18, rx: 2, fill: p.stroke },
      { k: 'ellipse', cx: 0, cy: -h * 0.16, rx: w * 0.12, ry: w * 0.12, stroke: p.detail, sw: 1.2, opacity: 0.7 },
    ];
  },
  'scaffolding': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h / 2, w, h, stroke: p.stroke, sw: t },
      { k: 'line', pts: [0, -h / 2, 0, h / 2], stroke: p.stroke, sw: 1.2, opacity: 0.8 },
      { k: 'line', pts: [-w / 2, -h / 2, 0, h / 2], stroke: p.fill, sw: 1.2, opacity: 0.85 },
      { k: 'line', pts: [0, -h / 2, w / 2, h / 2], stroke: p.fill, sw: 1.2, opacity: 0.85 },
    ];
  },
  'oil-stain': (w, h, p) => [
    { k: 'path', d: `M ${-w * 0.42} ${0} C ${-w * 0.46} ${-h * 0.36} ${-w * 0.1} ${-h * 0.5} ${w * 0.12} ${-h * 0.36} C ${w * 0.44} ${-h * 0.24} ${w * 0.5} ${h * 0.1} ${w * 0.3} ${h * 0.32} C ${w * 0.06} ${h * 0.52} ${-w * 0.3} ${h * 0.42} ${-w * 0.42} ${0} Z`, fill: p.fillSoft },
    { k: 'ellipse', cx: -w * 0.06, cy: -h * 0.02, rx: w * 0.2, ry: h * 0.18, fill: p.fill, opacity: 0.35 },
    { k: 'ellipse', cx: w * 0.36, cy: h * 0.34, rx: w * 0.05, ry: w * 0.05, fill: p.fillSoft },
  ],
  'chain': (w, h, p) => {
    const t = Math.max(2, lw(w, h));
    return [
      { k: 'line', pts: [-w / 2 + 3, 0, w / 2 - 3, 0], stroke: p.fill, sw: t, dash: [t * 1.6, t * 1.1] },
      { k: 'ellipse', cx: -w / 2 + 2, cy: 0, rx: h * 0.4, ry: h * 0.4, stroke: p.fill, sw: 1.4 },
      { k: 'ellipse', cx: w / 2 - 2, cy: 0, rx: h * 0.4, ry: h * 0.4, stroke: p.fill, sw: 1.4 },
    ];
  },
  'cable-bundle': (w, h, p) => [
    { k: 'path', d: wavy(w * 0.9, -h * 0.12, h * 0.22, Math.max(3, Math.round(w / 14))), stroke: p.fill, sw: 1.6 },
    { k: 'path', d: wavy(w * 0.9, h * 0.14, h * 0.22, Math.max(3, Math.round(w / 16))), stroke: p.stroke, sw: 1.6 },
    { k: 'ellipse', cx: -w * 0.42, cy: 0, rx: h * 0.42, ry: h * 0.42, stroke: p.fill, sw: 1.4 },
  ],
  'spare-engine': (w, h, p) => {
    const t = lw(w, h);
    const prims: SymbolPrimitive[] = [
      { k: 'rect', x: -w / 2, y: -h / 2, w, h, rx: 3, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'ellipse', cx: 0, cy: 0, rx: Math.min(w, h) * 0.26, ry: Math.min(w, h) * 0.26, stroke: p.detail, sw: 1.4, opacity: 0.75 },
    ];
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      prims.push({ k: 'ellipse', cx: sx * w * 0.3, cy: sy * h * 0.3, rx: 1.3, ry: 1.3, fill: p.detail, opacity: 0.7 });
    }
    return prims;
  },
  'workshop-light': (w, h, p) => glowLight(w, h, p),
  'car-wreck': (w, h, p) => [
    ...specs['car'](w, h, p),
    { k: 'line', pts: [-w * 0.2, -h * 0.05, w * 0.1, h * 0.06, -w * 0.06, h * 0.16], stroke: p.detail, sw: 1.3, opacity: 0.6 },
    { k: 'line', pts: [w * 0.12, -h * 0.32, w * 0.3, -h * 0.24], stroke: p.detail, sw: 1.3, opacity: 0.6 },
  ],

  // Set pieces ------------------------------------------------
  'wall': wallBand,
  'wall-short': wallBand,
  'interior-wall': wallBand,
  'cave-ledge': wallBand,
  'banister': (w, h, p) => {
    const t = lw(w, h);
    const prims: SymbolPrimitive[] = [
      { k: 'line', pts: [-w / 2, 0, w / 2, 0], stroke: p.fill, sw: Math.max(t, h * 0.4) },
    ];
    const step = Math.max(8, w / 8);
    for (let x = -w / 2 + step / 2; x < w / 2; x += step) {
      prims.push({ k: 'ellipse', cx: x, cy: 0, rx: 1.5, ry: 1.5, fill: p.stroke });
    }
    return prims;
  },
  'wall-corner': (w, h, p) => {
    const t = lw(w, h);
    const thick = Math.min(w, h) * 0.5;
    return [
      {
        k: 'line',
        pts: [
          -w / 2, -h / 2,
          w / 2, -h / 2,
          w / 2, -h / 2 + thick,
          -w / 2 + thick, -h / 2 + thick,
          -w / 2 + thick, h / 2,
          -w / 2, h / 2,
        ],
        closed: true, fill: p.fillSoft, stroke: p.stroke, sw: t,
      },
    ];
  },
  'door-closed': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h / 2, w: w * 0.08, h, fill: p.stroke },
      { k: 'rect', x: w / 2 - w * 0.08, y: -h / 2, w: w * 0.08, h, fill: p.stroke },
      { k: 'rect', x: -w / 2 + w * 0.08, y: -h * 0.3, w: w * 0.84, h: h * 0.6, fill: p.fill, stroke: p.stroke, sw: t },
    ];
  },
  'door-open': (w, h, p) => {
    const t = lw(w, h);
    const leaf = w * 0.84;
    return [
      { k: 'rect', x: -w / 2, y: -h / 2, w: w * 0.08, h, fill: p.stroke },
      { k: 'rect', x: w / 2 - w * 0.08, y: -h / 2, w: w * 0.08, h, fill: p.stroke },
      // Door leaf swung open + swing arc (classic plan symbol)
      { k: 'line', pts: [-w / 2 + w * 0.08, 0, -w / 2 + w * 0.08, -leaf], stroke: p.fill, sw: t * 1.6 },
      { k: 'path', d: arcPath(-w / 2 + w * 0.08, 0, leaf, -90, 0), stroke: p.stroke, sw: 1, dash: [4, 4], opacity: 0.8 },
    ];
  },
  'doorframe': (w, h, p) => specs['door-open'](w, h, p),
  'window': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h / 2, w, h, fill: p.fillSoft, stroke: p.stroke, sw: t },
      { k: 'line', pts: [-w / 2 + 2, 0, w / 2 - 2, 0], stroke: p.fill, sw: t },
    ];
  },
  'stairs': (w, h, p) => stairsSpec(w, h, p),
  'stairs-indoor': (w, h, p) => stairsSpec(w, h, p),
  'platform': (w, h, p) => insetRect(w, h, p, 5),
  'column': (w, h, p) => {
    const s = Math.min(w, h);
    return [
      { k: 'rect', x: -s / 2, y: -s / 2, w: s, h: s, fill: p.fill, stroke: p.stroke, sw: lw(w, h) },
      { k: 'line', pts: [-s / 2, -s / 2, s / 2, s / 2], stroke: p.detail, sw: 1, opacity: 0.5 },
      { k: 'line', pts: [s / 2, -s / 2, -s / 2, s / 2], stroke: p.detail, sw: 1, opacity: 0.5 },
    ];
  },
  'curtain': (w, h, p) => [
    { k: 'path', d: wavy(w, 0, Math.max(3, h * 0.6), Math.max(4, Math.round(w / 14))), stroke: p.fill, sw: lw(w, h) * 1.4 },
  ],
  'curtain-window': (w, h, p) => [
    { k: 'line', pts: [-w / 2, -h * 0.3, w / 2, -h * 0.3], stroke: p.stroke, sw: 1.4 },
    { k: 'path', d: wavy(w, h * 0.1, Math.max(3, h * 0.5), Math.max(4, Math.round(w / 12))), stroke: p.fill, sw: lw(w, h) * 1.3 },
  ],
  'backdrop': (w, h, p) => panel(w, h, p, false),
  'green-screen': (w, h, p) => panel(w, h, p, false),
  'floor-area': (w, h, p) => areaSpec(w, h, p),
  'hallway': (w, h, p) => areaSpec(w, h, p),
  'zone-area': (w, h, p) => areaSpec(w, h, p),
  'ramp': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h / 2, w, h, fill: p.fillSoft, stroke: p.stroke, sw: t },
      { k: 'line', pts: [-w / 2, -h / 2, w / 2, 0], stroke: p.stroke, sw: 1, opacity: 0.6 },
      { k: 'line', pts: [-w / 2, h / 2, w / 2, 0], stroke: p.stroke, sw: 1, opacity: 0.6 },
      { k: 'line', pts: [-w * 0.3, 0, w * 0.3, 0], stroke: p.fill, sw: t },
      { k: 'line', pts: [w * 0.3, 0, w * 0.16, -h * 0.16], stroke: p.fill, sw: t },
      { k: 'line', pts: [w * 0.3, 0, w * 0.16, h * 0.16], stroke: p.fill, sw: t },
    ];
  },
  'archway': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h / 2, w: w * 0.12, h, fill: p.stroke },
      { k: 'rect', x: w / 2 - w * 0.12, y: -h / 2, w: w * 0.12, h, fill: p.stroke },
      { k: 'line', pts: [-w / 2 + w * 0.12, 0, w / 2 - w * 0.12, 0], stroke: p.fill, sw: t, dash: [5, 4], opacity: 0.9 },
    ];
  },

  // Markers ---------------------------------------------------
  'mark-x': (w, h, p) => {
    const s = Math.min(w, h) / 2;
    return [
      { k: 'line', pts: [-s, -s, s, s], stroke: p.fill, sw: Math.max(3, s * 0.3) },
      { k: 'line', pts: [s, -s, -s, s], stroke: p.fill, sw: Math.max(3, s * 0.3) },
    ];
  },
  'mark-t': (w, h, p) => {
    const s = Math.min(w, h) / 2;
    return [
      { k: 'line', pts: [-s, -s, s, -s], stroke: p.fill, sw: Math.max(3, s * 0.3) },
      { k: 'line', pts: [0, -s, 0, s], stroke: p.fill, sw: Math.max(3, s * 0.3) },
    ];
  },
  'mark-circle': (w, h, p) => {
    const s = Math.min(w, h) / 2;
    return [{ k: 'ellipse', cx: 0, cy: 0, rx: s * 0.85, ry: s * 0.85, stroke: p.fill, sw: Math.max(3, s * 0.25) }];
  },
  'arrow': (w, h, p) => {
    const head = Math.max(6, Math.min(w, h) * 0.5);
    return [
      { k: 'line', pts: [-w / 2, 0, w / 2 - 2, 0], stroke: p.fill, sw: Math.max(3, h * 0.24) },
      { k: 'line', pts: [w / 2 - head, -head * 0.7, w / 2, 0, w / 2 - head, head * 0.7], stroke: p.fill, sw: Math.max(3, h * 0.24) },
    ];
  },
  'path-marker': (w, h, p) => {
    const r = Math.min(w, h) / 2;
    return [
      { k: 'ellipse', cx: 0, cy: 0, rx: r * 0.85, ry: r * 0.85, stroke: p.fill, sw: Math.max(2, r * 0.18), dash: [3, 3] },
      { k: 'ellipse', cx: 0, cy: 0, rx: r * 0.35, ry: r * 0.35, fill: p.fill },
    ];
  },
  'blocking-line': (w, h, p) => {
    const head = Math.max(6, h);
    return [
      { k: 'line', pts: [-w / 2, 0, w / 2 - 2, 0], stroke: p.fill, sw: Math.max(2.5, h * 0.5), dash: [8, 6] },
      { k: 'line', pts: [w / 2 - head, -head * 0.7, w / 2, 0, w / 2 - head, head * 0.7], stroke: p.fill, sw: Math.max(2.5, h * 0.5) },
    ];
  },

  // Nature ----------------------------------------------------
  'tree': (w, h, p) => {
    const r = Math.min(w, h) / 2;
    const prims: SymbolPrimitive[] = [
      { k: 'ellipse', cx: 0, cy: 0, rx: r, ry: r, fill: p.fillSoft, stroke: p.stroke, sw: lw(w, h) },
      { k: 'ellipse', cx: 0, cy: 0, rx: r * 0.12, ry: r * 0.12, fill: p.stroke },
    ];
    for (let a = 15; a < 360; a += 45) {
      prims.push({ k: 'line', pts: [Math.cos(deg(a)) * r * 0.45, Math.sin(deg(a)) * r * 0.45, Math.cos(deg(a)) * r * 0.92, Math.sin(deg(a)) * r * 0.92], stroke: p.fill, sw: 1.4, opacity: 0.8 });
    }
    return prims;
  },
  'tree-palm': (w, h, p) => {
    const r = Math.min(w, h) / 2;
    const prims: SymbolPrimitive[] = [{ k: 'ellipse', cx: 0, cy: 0, rx: r * 0.14, ry: r * 0.14, fill: p.stroke }];
    for (let a = 0; a < 360; a += 60) {
      const mx = Math.cos(deg(a + 18)) * r * 0.55;
      const my = Math.sin(deg(a + 18)) * r * 0.55;
      prims.push({ k: 'path', d: `M 0 0 Q ${mx} ${my} ${Math.cos(deg(a)) * r} ${Math.sin(deg(a)) * r}`, stroke: p.fill, sw: lw(w, h) * 1.1 });
    }
    return prims;
  },
  'bush': (w, h, p) => [
    { k: 'ellipse', cx: -w * 0.18, cy: h * 0.06, rx: w * 0.3, ry: h * 0.38, fill: p.fillSoft, stroke: p.stroke, sw: 1.2 },
    { k: 'ellipse', cx: w * 0.16, cy: -h * 0.04, rx: w * 0.32, ry: h * 0.4, fill: p.fillSoft, stroke: p.stroke, sw: 1.2 },
    { k: 'ellipse', cx: 0, cy: h * 0.08, rx: w * 0.24, ry: h * 0.3, fill: p.fillSoft, stroke: p.stroke, sw: 1.2 },
  ],
  'rock': (w, h, p) => irregular(w, h, p, [[-0.9, 0.5], [-0.65, -0.5], [-0.1, -0.9], [0.6, -0.6], [0.95, 0.2], [0.55, 0.9], [-0.4, 0.85]]),
  'boulder': (w, h, p) => irregular(w, h, p, [[-0.9, 0.3], [-0.7, -0.6], [0, -0.95], [0.7, -0.55], [0.92, 0.35], [0.35, 0.9], [-0.45, 0.8]]),
  'boulder-small': (w, h, p) => irregular(w, h, p, [[-0.85, 0.2], [-0.5, -0.8], [0.4, -0.85], [0.9, 0], [0.5, 0.85], [-0.4, 0.75]]),
  'rock-pile': (w, h, p) => [
    ...irregular(w * 0.55, h * 0.7, p, [[-0.8, 0.6], [-0.5, -0.7], [0.4, -0.9], [0.9, 0.1], [0.4, 0.9]], false).map((pr) => offsetWhole(pr, -w * 0.2, h * 0.1)),
    ...irregular(w * 0.5, h * 0.6, p, [[-0.9, 0.3], [-0.2, -0.9], [0.8, -0.4], [0.85, 0.6], [-0.3, 0.85]], false).map((pr) => offsetWhole(pr, w * 0.2, -h * 0.05)),
    ...irregular(w * 0.34, h * 0.4, p, [[-0.8, 0.5], [0, -0.9], [0.85, 0.2], [0.3, 0.9]], false).map((pr) => offsetWhole(pr, 0, h * 0.24)),
  ],
  'water': (w, h, p) => blobSpec(w, h, p),
  'cave-pool': (w, h, p) => blobSpec(w, h, p),
  'grass': (w, h, p) => {
    const prims: SymbolPrimitive[] = [
      { k: 'ellipse', cx: 0, cy: 0, rx: w / 2, ry: h / 2, fill: p.fillSoft, stroke: p.stroke, sw: 1, dash: [4, 4], opacity: 0.9 },
    ];
    for (const [tx, ty] of [[-0.5, 0.1], [-0.15, -0.25], [0.25, 0.15], [0.55, -0.1], [0.05, 0.35]]) {
      prims.push(
        { k: 'line', pts: [tx * w / 2 - 2, ty * h / 2 + 3, tx * w / 2, ty * h / 2 - 3], stroke: p.fill, sw: 1.3 },
        { k: 'line', pts: [tx * w / 2 + 2, ty * h / 2 + 3, tx * w / 2, ty * h / 2 - 3], stroke: p.fill, sw: 1.3 },
      );
    }
    return prims;
  },
  'flower-bed': (w, h, p) => {
    const prims: SymbolPrimitive[] = [
      { k: 'rect', x: -w / 2, y: -h / 2, w, h, rx: h * 0.3, fill: p.fillSoft, stroke: p.stroke, sw: 1.2 },
    ];
    for (const [tx, ty] of [[-0.6, 0], [-0.2, -0.3], [0.2, 0.25], [0.6, -0.05]]) {
      prims.push({ k: 'ellipse', cx: tx * w / 2, cy: ty * h / 2, rx: 2, ry: 2, fill: p.fill });
    }
    return prims;
  },
  'fence': (w, h, p) => {
    const prims: SymbolPrimitive[] = [
      { k: 'line', pts: [-w / 2, 0, w / 2, 0], stroke: p.fill, sw: lw(w, h) },
    ];
    const step = Math.max(10, w / 8);
    for (let x = -w / 2; x <= w / 2 + 1; x += step) {
      prims.push({ k: 'line', pts: [x, -h / 2, x, h / 2], stroke: p.stroke, sw: 2 });
    }
    return prims;
  },
  'log': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h * 0.36, w, h: h * 0.72, rx: h * 0.3, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'ellipse', cx: w / 2 - h * 0.36, cy: 0, rx: h * 0.26, ry: h * 0.26, stroke: p.detail, sw: 1, opacity: 0.6 },
      { k: 'line', pts: [-w * 0.4, 0, w * 0.2, 0], stroke: p.detail, sw: 1, opacity: 0.35 },
    ];
  },
  'hill': (w, h, p) => [
    { k: 'ellipse', cx: 0, cy: 0, rx: w / 2, ry: h / 2, fill: p.fillSoft, stroke: p.stroke, sw: 1.4 },
    { k: 'ellipse', cx: 0, cy: 0, rx: w * 0.32, ry: h * 0.32, stroke: p.stroke, sw: 1.2, opacity: 0.7 },
    { k: 'ellipse', cx: 0, cy: 0, rx: w * 0.16, ry: h * 0.16, stroke: p.stroke, sw: 1, opacity: 0.5 },
  ],
  'stream': (w, h, p) => [
    { k: 'path', d: wavy(w, -h * 0.24, h * 0.2, Math.max(3, Math.round(w / 24))), stroke: p.fill, sw: lw(w, h) },
    { k: 'path', d: wavy(w, h * 0.24, h * 0.2, Math.max(3, Math.round(w / 24))), stroke: p.fill, sw: lw(w, h) },
  ],

  // Cave ------------------------------------------------------
  'cave-wall': (w, h, p) => caveBand(w, h, p),
  'cave-wall-curved': (w, h, p) => caveBand(w, h, p),
  'cave-entrance': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h / 2, w: w * 0.3, h, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'rect', x: w * 0.2, y: -h / 2, w: w * 0.3, h, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'rect', x: -w * 0.2, y: -h * 0.3, w: w * 0.4, h: h * 0.6, fill: 'rgba(0,0,0,0.55)' },
    ];
  },
  'stalactite': (w, h, p) => spikes(w, h, p),
  'stalagmite': (w, h, p) => spikes(w, h, p),
  'torch-wall': (w, h, p) => glowLight(w, h, p),
  'torch-standing': (w, h, p) => glowLight(w, h, p),
  'crystal': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'line', pts: [-w * 0.25, -h * 0.45, 0, -h * 0.05, -w * 0.25, h * 0.35, -w * 0.5, -h * 0.05], closed: true, fill: p.fillSoft, stroke: p.fill, sw: t },
      { k: 'line', pts: [w * 0.22, -h * 0.35, w * 0.48, 0.0, w * 0.22, h * 0.42, -w * 0.04, 0.0], closed: true, fill: p.fillSoft, stroke: p.fill, sw: t },
    ];
  },
  'cave-pillar': (w, h, p) => {
    const r = Math.min(w, h) / 2;
    return [
      { k: 'ellipse', cx: 0, cy: 0, rx: r, ry: r, fill: p.fill, stroke: p.stroke, sw: lw(w, h) },
      { k: 'ellipse', cx: 0, cy: 0, rx: r * 0.55, ry: r * 0.55, stroke: p.detail, sw: 1, opacity: 0.4 },
    ];
  },
  'cave-floor-uneven': (w, h, p) => [
    { k: 'line', pts: [-w / 2, h * 0.2, -w * 0.3, -h * 0.25, -w * 0.05, h * 0.1, w * 0.2, -h * 0.3, w * 0.5, h * 0.15], stroke: p.stroke, sw: 1.4, opacity: 0.9 },
    { k: 'ellipse', cx: 0, cy: 0, rx: w / 2, ry: h / 2, fill: p.fillSoft, stroke: p.stroke, sw: 1, dash: [5, 5], opacity: 0.7 },
  ],
  'cave-crack': (w, h, p) => [
    { k: 'line', pts: [0, -h / 2, -w * 0.3, -h * 0.25, w * 0.2, 0, -w * 0.2, h * 0.25, w * 0.1, h / 2], stroke: p.fill, sw: Math.max(2, lw(w, h)) },
  ],
  'moss-patch': (w, h, p) => [
    { k: 'ellipse', cx: 0, cy: 0, rx: w / 2, ry: h / 2, fill: p.fillSoft, stroke: p.stroke, sw: 1.2, dash: [3, 3] },
    { k: 'ellipse', cx: -w * 0.15, cy: 0, rx: 1.5, ry: 1.5, fill: p.fill },
    { k: 'ellipse', cx: w * 0.12, cy: -h * 0.12, rx: 1.5, ry: 1.5, fill: p.fill },
    { k: 'ellipse', cx: w * 0.05, cy: h * 0.16, rx: 1.5, ry: 1.5, fill: p.fill },
  ],
  'bat': (w, h, p) => [
    { k: 'path', d: `M 0 0 Q ${-w * 0.25} ${-h * 0.5} ${-w * 0.5} ${-h * 0.1} Q ${-w * 0.3} ${h * 0.05} ${-w * 0.12} ${h * 0.08}`, stroke: p.fill, sw: 1.6 },
    { k: 'path', d: `M 0 0 Q ${w * 0.25} ${-h * 0.5} ${w * 0.5} ${-h * 0.1} Q ${w * 0.3} ${h * 0.05} ${w * 0.12} ${h * 0.08}`, stroke: p.fill, sw: 1.6 },
    { k: 'ellipse', cx: 0, cy: 0, rx: w * 0.08, ry: h * 0.18, fill: p.fill },
  ],
  'cobweb': (w, h, p) => {
    const r = Math.min(w, h) / 2;
    const prims: SymbolPrimitive[] = [];
    for (let a = 0; a < 360; a += 45) {
      prims.push({ k: 'line', pts: [0, 0, Math.cos(deg(a)) * r, Math.sin(deg(a)) * r], stroke: p.fill, sw: 1, opacity: 0.8 });
    }
    prims.push(
      { k: 'ellipse', cx: 0, cy: 0, rx: r * 0.4, ry: r * 0.4, stroke: p.fill, sw: 1, opacity: 0.7 },
      { k: 'ellipse', cx: 0, cy: 0, rx: r * 0.75, ry: r * 0.75, stroke: p.fill, sw: 1, opacity: 0.5 },
    );
    return prims;
  },
  'rope': (w, h, p) => [
    { k: 'path', d: `M 0 ${-h / 2} q ${w * 0.6} ${h * 0.16} 0 ${h * 0.33} q ${-w * 0.6} ${h * 0.17} 0 ${h * 0.33} q ${w * 0.6} ${h * 0.17} 0 ${h * 0.34}`, stroke: p.fill, sw: Math.max(2, lw(w, h)) },
  ],

  // House interior --------------------------------------------
  'fireplace': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h / 2, w, h, fill: p.fillSoft, stroke: p.stroke, sw: t },
      { k: 'path', d: arcPath(0, h / 2, Math.min(w * 0.32, h * 0.9), 180, 360), stroke: p.fill, sw: t * 1.2 },
      { k: 'ellipse', cx: 0, cy: h * 0.14, rx: 2, ry: 2, fill: p.fill },
    ];
  },
  'kitchen-counter': (w, h, p) => insetRect(w, h, p, 4),
  'kitchen-island': (w, h, p) => insetRect(w, h, p, 5, 4),
  'sink': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h / 2, w, h, rx: 2, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'rect', x: -w * 0.34, y: -h * 0.28, w: w * 0.68, h: h * 0.56, rx: 4, stroke: p.detail, sw: 1.4, opacity: 0.8 },
      { k: 'ellipse', cx: 0, cy: 0, rx: 1.8, ry: 1.8, fill: p.detail, opacity: 0.8 },
      { k: 'line', pts: [0, -h * 0.28, 0, -h * 0.45], stroke: p.detail, sw: 1.6, opacity: 0.8 },
    ];
  },
  'stove': (w, h, p) => {
    const t = lw(w, h);
    const prims: SymbolPrimitive[] = [
      { k: 'rect', x: -w / 2, y: -h / 2, w, h, rx: 2, fill: p.fill, stroke: p.stroke, sw: t },
    ];
    for (const [tx, ty] of [[-0.45, -0.4], [0.45, -0.4], [-0.45, 0.4], [0.45, 0.4]]) {
      prims.push({ k: 'ellipse', cx: tx * w / 2, cy: ty * h / 2, rx: Math.min(w, h) * 0.16, ry: Math.min(w, h) * 0.16, stroke: p.detail, sw: 1.4, opacity: 0.8 });
    }
    return prims;
  },
  'fridge': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h / 2, w, h, rx: 2, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'line', pts: [-w * 0.1, -h / 2, -w * 0.1, h / 2], stroke: p.stroke, sw: 1, opacity: 0.6 },
      { k: 'line', pts: [-w * 0.28, -h * 0.25, -w * 0.28, h * 0.25], stroke: p.detail, sw: 1.6, opacity: 0.6 },
    ];
  },
  'bathtub': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h / 2, w, h, rx: Math.min(w, h) * 0.16, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'rect', x: -w * 0.4, y: -h * 0.32, w: w * 0.8, h: h * 0.64, rx: Math.min(w, h) * 0.22, stroke: p.detail, sw: 1.4, opacity: 0.75 },
      { k: 'ellipse', cx: -w * 0.3, cy: 0, rx: 2, ry: 2, fill: p.detail, opacity: 0.8 },
    ];
  },
  'toilet': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w * 0.4, y: -h / 2, w: w * 0.8, h: h * 0.28, rx: 2, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'ellipse', cx: 0, cy: h * 0.14, rx: w * 0.34, ry: h * 0.32, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'ellipse', cx: 0, cy: h * 0.14, rx: w * 0.2, ry: h * 0.2, stroke: p.detail, sw: 1.2, opacity: 0.6 },
    ];
  },
  'shower': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h / 2, w, h, fill: p.fillSoft, stroke: p.stroke, sw: t },
      { k: 'line', pts: [-w / 2, -h / 2, w / 2, h / 2], stroke: p.stroke, sw: 1, opacity: 0.5 },
      { k: 'ellipse', cx: w * 0.28, cy: -h * 0.28, rx: 2.4, ry: 2.4, fill: p.fill },
    ];
  },
  'washer': (w, h, p) => {
    const t = lw(w, h);
    const r = Math.min(w, h) * 0.3;
    return [
      { k: 'rect', x: -w / 2, y: -h / 2, w, h, rx: 2, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'ellipse', cx: 0, cy: h * 0.05, rx: r, ry: r, stroke: p.detail, sw: 1.6, opacity: 0.8 },
      { k: 'ellipse', cx: 0, cy: h * 0.05, rx: r * 0.5, ry: r * 0.5, stroke: p.detail, sw: 1, opacity: 0.5 },
    ];
  },
  'ceiling-light': (w, h, p) => {
    const r = Math.min(w, h) / 2 * 0.6;
    const ext = Math.min(w, h) / 2;
    return [
      { k: 'ellipse', cx: 0, cy: 0, rx: r, ry: r, fill: p.fillSoft, stroke: p.fill, sw: lw(w, h) },
      { k: 'line', pts: [-ext, 0, ext, 0], stroke: p.fill, sw: 1.4 },
      { k: 'line', pts: [0, -ext, 0, ext], stroke: p.fill, sw: 1.4 },
    ];
  },
  'floor-lamp': (w, h, p) => glowLight(w, h, p),
  'table-lamp': (w, h, p) => glowLight(w, h, p),
  'radiator': (w, h, p) => {
    const t = lw(w, h);
    const prims: SymbolPrimitive[] = [
      { k: 'rect', x: -w / 2, y: -h / 2, w, h, rx: 2, fill: p.fillSoft, stroke: p.stroke, sw: t },
    ];
    const fins = Math.max(4, Math.round(w / 8));
    for (let i = 1; i < fins; i++) {
      prims.push({ k: 'line', pts: [-w / 2 + (w / fins) * i, -h / 2 + 1.5, -w / 2 + (w / fins) * i, h / 2 - 1.5], stroke: p.stroke, sw: 1, opacity: 0.7 });
    }
    return prims;
  },
  'potted-plant': (w, h, p) => {
    const r = Math.min(w, h) / 2;
    const prims: SymbolPrimitive[] = [
      { k: 'ellipse', cx: 0, cy: 0, rx: r * 0.5, ry: r * 0.5, stroke: p.stroke, sw: lw(w, h) },
    ];
    for (let a = 0; a < 360; a += 60) {
      prims.push({ k: 'ellipse', cx: Math.cos(deg(a)) * r * 0.62, cy: Math.sin(deg(a)) * r * 0.62, rx: r * 0.3, ry: r * 0.18, fill: p.fill, opacity: 0.85 });
    }
    return prims;
  },
  'coat-rack': (w, h, p) => {
    const r = Math.min(w, h) / 2;
    const prims: SymbolPrimitive[] = [{ k: 'ellipse', cx: 0, cy: 0, rx: r * 0.16, ry: r * 0.16, fill: p.fill }];
    for (let a = 30; a < 360; a += 72) {
      prims.push(
        { k: 'line', pts: [0, 0, Math.cos(deg(a)) * r * 0.8, Math.sin(deg(a)) * r * 0.8], stroke: p.stroke, sw: 1.4 },
        { k: 'ellipse', cx: Math.cos(deg(a)) * r * 0.8, cy: Math.sin(deg(a)) * r * 0.8, rx: r * 0.12, ry: r * 0.12, fill: p.stroke },
      );
    }
    return prims;
  },
  'shoe-rack': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h / 2, w, h, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'line', pts: [-w / 6, -h / 2, -w / 6, h / 2], stroke: p.detail, sw: 1, opacity: 0.5 },
      { k: 'line', pts: [w / 6, -h / 2, w / 6, h / 2], stroke: p.detail, sw: 1, opacity: 0.5 },
    ];
  },
  'tv-stand': (w, h, p) => insetRect(w, h, p, 4),
  'closet': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h / 2, w, h, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'line', pts: [-w / 2 + 3, 0, w / 2 - 3, 0], stroke: p.detail, sw: 1.2, dash: [5, 3], opacity: 0.6 },
      { k: 'line', pts: [0, -h / 2, 0, h / 2], stroke: p.detail, sw: 1, opacity: 0.4 },
    ];
  },
  'mat': (w, h, p) => [
    { k: 'rect', x: -w / 2, y: -h / 2, w, h, rx: 4, fill: p.fillSoft, stroke: p.stroke, sw: lw(w, h) },
  ],
  'piano': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'path', d: `M ${-w / 2} ${-h / 2} L ${w / 2} ${-h / 2} L ${w / 2} ${h * 0.1} Q ${w * 0.2} ${h * 0.5} ${-w * 0.1} ${h * 0.45} L ${-w / 2} ${h * 0.4} Z`, fill: p.fill, stroke: p.stroke, sw: t },
      { k: 'rect', x: -w / 2 + 2, y: -h / 2 + 2, w: w - 4, h: h * 0.18, fill: p.detail, opacity: 0.85 },
    ];
  },

  // Shapes & text (used for library previews; canvas keeps its
  // interactive renderers for these) -------------------------
  'shape-line': (w, h, p) => [{ k: 'line', pts: [-w / 2, 0, w / 2, 0], stroke: p.fill, sw: Math.max(2, h) }],
  'shape-dashed-line': (w, h, p) => [{ k: 'line', pts: [-w / 2, 0, w / 2, 0], stroke: p.fill, sw: Math.max(2, h), dash: [8, 6] }],
  'shape-arrow': (w, h, p) => specs['arrow'](w, h, p),
  'shape-arrow-double': (w, h, p) => {
    const head = Math.max(6, Math.min(w, h) * 0.5);
    return [
      { k: 'line', pts: [-w / 2 + 2, 0, w / 2 - 2, 0], stroke: p.fill, sw: Math.max(3, h * 0.24) },
      { k: 'line', pts: [w / 2 - head, -head * 0.7, w / 2, 0, w / 2 - head, head * 0.7], stroke: p.fill, sw: Math.max(3, h * 0.24) },
      { k: 'line', pts: [-w / 2 + head, -head * 0.7, -w / 2, 0, -w / 2 + head, head * 0.7], stroke: p.fill, sw: Math.max(3, h * 0.24) },
    ];
  },
  'shape-rect': (w, h, p) => [{ k: 'rect', x: -w / 2, y: -h / 2, w, h, rx: 3, stroke: p.fill, sw: 3 }],
  'shape-circle': (w, h, p) => [{ k: 'ellipse', cx: 0, cy: 0, rx: w / 2, ry: h / 2, stroke: p.fill, sw: 3 }],
  'shape-triangle': (w, h, p) => [{ k: 'line', pts: [0, -h / 2, w / 2, h / 2, -w / 2, h / 2], closed: true, stroke: p.fill, sw: 3 }],
  'text-label': (w, h, p) => [{ k: 'text', x: 0, y: 0, text: 'Aa', size: Math.min(w, h) * 0.6, fill: p.fill }],
  'text-heading': (w, h, p) => [{ k: 'text', x: 0, y: 0, text: 'Aa', size: Math.min(w, h) * 0.7, fill: p.fill, bold: true }],
  'text-note': (w, h, p) => {
    const t = lw(w, h);
    return [
      { k: 'rect', x: -w / 2, y: -h / 2, w, h, rx: 4, fill: p.fillSoft, stroke: p.stroke, sw: t },
      { k: 'line', pts: [-w * 0.32, -h * 0.16, w * 0.32, -h * 0.16], stroke: p.fill, sw: 2, opacity: 0.8 },
      { k: 'line', pts: [-w * 0.32, h * 0.1, w * 0.12, h * 0.1], stroke: p.fill, sw: 2, opacity: 0.8 },
    ];
  },
};

// Numbered markers share a single builder.
for (const n of ['1', '2', '3']) {
  specs[`number-${n}`] = (w, h, p) => {
    const r = Math.min(w, h) / 2;
    return [
      { k: 'ellipse', cx: 0, cy: 0, rx: r, ry: r, fill: p.fill, stroke: p.stroke, sw: lw(w, h) },
      { k: 'text', x: 0, y: 0, text: n, size: r * 1.2, fill: p.detail, bold: true },
    ];
  };
}

// ── Shared sub-spec helpers used above ───────────────────────

function offsetWhole(prim: SymbolPrimitive, dx: number, dy: number): SymbolPrimitive {
  switch (prim.k) {
    case 'rect': return { ...prim, x: prim.x + dx, y: prim.y + dy };
    case 'ellipse': return { ...prim, cx: prim.cx + dx, cy: prim.cy + dy };
    case 'line': return { ...prim, pts: prim.pts.map((v, i) => (i % 2 === 0 ? v + dx : v + dy)) };
    case 'text': return { ...prim, x: prim.x + dx, y: prim.y + dy };
    default: return prim;
  }
}

function stairsSpec(w: number, h: number, p: SymbolPalette): SymbolPrimitive[] {
  const t = lw(w, h);
  const prims: SymbolPrimitive[] = [
    { k: 'rect', x: -w / 2, y: -h / 2, w, h, fill: p.fillSoft, stroke: p.stroke, sw: t },
  ];
  const treads = Math.max(4, Math.round(h / 14));
  for (let i = 1; i < treads; i++) {
    prims.push({ k: 'line', pts: [-w / 2, -h / 2 + (h / treads) * i, w / 2, -h / 2 + (h / treads) * i], stroke: p.stroke, sw: 1, opacity: 0.75 });
  }
  prims.push(
    { k: 'line', pts: [0, h * 0.36, 0, -h * 0.34], stroke: p.fill, sw: t * 1.2 },
    { k: 'line', pts: [-w * 0.12, -h * 0.2, 0, -h * 0.36, w * 0.12, -h * 0.2], stroke: p.fill, sw: t * 1.2 },
  );
  return prims;
}

function areaSpec(w: number, h: number, p: SymbolPalette): SymbolPrimitive[] {
  return [
    { k: 'rect', x: -w / 2, y: -h / 2, w, h, rx: 3, fill: p.fillSoft, opacity: 0.45, stroke: p.stroke, sw: 1.4, dash: [7, 5] },
  ];
}

function blobSpec(w: number, h: number, p: SymbolPalette): SymbolPrimitive[] {
  return [
    { k: 'path', d: `M ${-w * 0.48} ${0} C ${-w * 0.5} ${-h * 0.42} ${-w * 0.18} ${-h * 0.52} ${w * 0.08} ${-h * 0.44} C ${w * 0.42} ${-h * 0.34} ${w * 0.52} ${-h * 0.02} ${w * 0.42} ${h * 0.26} C ${w * 0.3} ${h * 0.52} ${-w * 0.14} ${h * 0.54} ${-w * 0.32} ${h * 0.38} C ${-w * 0.48} ${h * 0.24} ${-w * 0.46} ${h * 0.12} ${-w * 0.48} 0 Z`, fill: p.fillSoft, stroke: p.stroke, sw: 1.4 },
    { k: 'path', d: wavy(w * 0.5, -h * 0.08, h * 0.06, 2), stroke: p.fill, sw: 1.4, opacity: 0.8 },
    { k: 'path', d: wavy(w * 0.4, h * 0.16, h * 0.06, 2), stroke: p.fill, sw: 1.4, opacity: 0.6 },
  ];
}

function caveBand(w: number, h: number, p: SymbolPalette): SymbolPrimitive[] {
  const t = lw(w, h);
  const pts: number[] = [-w / 2, h / 2];
  const bumps = Math.max(4, Math.round(w / 20));
  for (let i = 0; i <= bumps; i++) {
    const x = -w / 2 + (w / bumps) * i;
    pts.push(x, i % 2 === 0 ? -h / 2 : -h * 0.15);
  }
  pts.push(w / 2, h / 2);
  const prims: SymbolPrimitive[] = [
    { k: 'line', pts, closed: true, fill: p.fillSoft, stroke: p.stroke, sw: t },
  ];
  return prims;
}

function spikes(w: number, h: number, p: SymbolPalette): SymbolPrimitive[] {
  const prims: SymbolPrimitive[] = [];
  const n = Math.max(3, Math.round(w / 10));
  for (let i = 0; i < n; i++) {
    const x0 = -w / 2 + (w / n) * i;
    const x1 = x0 + w / n;
    const peakY = i % 2 === 0 ? -h / 2 : -h * 0.15;
    prims.push({ k: 'line', pts: [x0, h / 2, (x0 + x1) / 2, peakY, x1, h / 2], closed: true, fill: p.fill, stroke: p.stroke, sw: 1 });
  }
  return prims;
}

// Category-level fallbacks for types without a dedicated spec
// (also covers elements from older saved scenes).
const categoryFallbacks: Record<string, SpecFn> = {
  characters: (w, h, p) => actor(w, h, p),
  cameras: (w, h, p) => cameraBody(w, h, p),
  lighting: (w, h, p) => lightFixture(w, h, p),
  audio: (w, h, p) => {
    const r = Math.min(w, h) / 2;
    return [{ k: 'ellipse', cx: 0, cy: 0, rx: r, ry: r, fill: p.fill, stroke: p.stroke, sw: lw(w, h) }];
  },
  furniture: (w, h, p) => insetRect(w, h, p),
  props: (w, h, p) => insetRect(w, h, p),
  workshop: (w, h, p) => insetRect(w, h, p),
  vehicles: (w, h, p) => specs['car'](w, h, p),
  set: (w, h, p) => wallBand(w, h, p),
  house: (w, h, p) => insetRect(w, h, p),
  nature: (w, h, p) => blobSpec(w, h, p),
  cave: (w, h, p) => irregular(w, h, p, [[-0.9, 0.3], [-0.7, -0.6], [0, -0.95], [0.7, -0.55], [0.92, 0.35], [0.35, 0.9], [-0.45, 0.8]]),
  markers: (w, h, p) => {
    const r = Math.min(w, h) / 2;
    return [{ k: 'ellipse', cx: 0, cy: 0, rx: r * 0.8, ry: r * 0.8, stroke: p.fill, sw: Math.max(2.5, r * 0.2) }];
  },
};

/**
 * Resolve the top-down symbol for an element type. Returns null when the type
 * has no symbol and no category fallback — the caller should fall back to the
 * legacy icon-path rendering so old saved scenes keep working.
 */
export function getSymbolPrimitives(
  type: string,
  category: string,
  w: number,
  h: number,
  palette: SymbolPalette
): SymbolPrimitive[] | null {
  const spec = specs[type] ?? categoryFallbacks[category];
  if (!spec) return null;
  return spec(w, h, palette);
}
