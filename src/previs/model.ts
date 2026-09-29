import { v4 as uuid } from 'uuid';
import type { Scene, SceneElement } from '../types';
import { elementTemplates } from '../data/elementLibrary';
import { createElementFromTemplate } from '../utils/sceneUtils';
import { assetForDiagram, assetById, emitsLight } from './catalog';
import type {
  CameraKeyframe,
  ObjectKeyframe,
  PrevisAsset,
  PrevisObject,
  PrevisScene,
  PrevisShot,
  Vec3,
} from './types';

export const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));
const size2D = (e: SceneElement): [number, number] => [
  Math.max(0.01, e.width * Math.abs(e.scaleX)),
  Math.max(0.01, e.height * Math.abs(e.scaleY)),
];
// People and production equipment are symbols, not measured floor footprints.
const symbolic = (category: string) => ['characters', 'lighting', 'cameras', 'audio'].includes(category);

// Linear set pieces are drawn at their true length in the plan; everything else is an icon
// until the user resizes it.
const stretchable = new Set([
  'wall', 'wall-short', 'wall-corner', 'interior-wall', 'cave-wall', 'cave-wall-curved',
  'floor-area', 'rug', 'mat', 'platform', 'stairs', 'stairs-indoor', 'hangar-door',
  'roller-door', 'fence', 'curtain', 'curtain-window', 'backdrop', 'green-screen', 'water',
  'stream', 'cave-pool', 'grass', 'hallway', 'ramp', 'banister', 'cave-ledge', 'oil-stain',
]);
/** An icon still at its library size carries no measurement, so it gets real-world dimensions. */
function isUnmeasuredIcon(e: SceneElement) {
  const t = elementTemplates.find((t) => t.type === e.type);
  const [w, h] = size2D(e);
  return !!t && Math.abs(w - t.width) < 0.5 && Math.abs(h - t.height) < 0.5;
}
export function usesFootprint(e: SceneElement) {
  return !symbolic(e.category) && (stretchable.has(e.type) || !isUnmeasuredIcon(e));
}

function diagramDimensions(e: SceneElement, data: PrevisScene, a: PrevisAsset): Vec3 {
  if (!usesFootprint(e)) return [...a.dimensions];
  const footprint = size2D(e);
  return [footprint[0] / data.unitsPerMeter, a.dimensions[1], footprint[1] / data.unitsPerMeter];
}

export function lightDefaults(a: PrevisAsset, angle?: number): Pick<PrevisObject, 'lightIntensity' | 'lightAngle' | 'lightColor'> {
  const light = a.light!;
  return { lightIntensity: light.intensity, lightAngle: angle ?? light.angle ?? 60, lightColor: light.color };
}

export function createPrevisScene(
  scene: Scene,
  elements: SceneElement[],
): PrevisScene {
  const physical = elements.filter((e) => assetForDiagram(e.type, e.category, e.label));
  const xs = physical.map((e) => e.x),
    zs = physical.map((e) => e.y);
  const origin: [number, number] = physical.length
    ? [
        (Math.min(...xs) + Math.max(...xs)) / 2,
        (Math.min(...zs) + Math.max(...zs)) / 2,
      ]
    : [scene.stageWidth / 2, scene.stageHeight / 2];
  const data: PrevisScene = {
    schemaVersion: 1,
    sizing: 2,
    wallStyle: scene.wallStyle ?? 'built',
    unitsPerMeter: 100,
    origin,
    floorSize: [20, 20],
    floorColor: '#65716d',
    backgroundColor: '#303c3b',
    ambientIntensity: 1.2,
    daylightIntensity: 2,
    objects: [],
    shots: [],
  };
  data.objects = objectsFromDiagram(data, elements);
  const positions = data.objects.map((o) => o.position);
  data.floorSize = [
    Math.max(20, ...positions.map((p) => Math.abs(p[0]) * 2 + 8)),
    Math.max(20, ...positions.map((p) => Math.abs(p[2]) * 2 + 8)),
  ];
  const cameras = elements.filter(
    (e) => e.category === 'cameras' && e.type.startsWith('camera'),
  );
  data.shots = cameras.length
    ? cameras.map((e, i) => {
        const p: Vec3 = [
          (e.x - origin[0]) / data.unitsPerMeter,
          1.6,
          (e.y - origin[1]) / data.unitsPerMeter,
        ];
        // Camera symbols face right in the diagram; yaw follows the diagram's clockwise rotation.
        const angle = (e.rotation * Math.PI) / 180;
        const target: Vec3 = [
          p[0] + Math.cos(angle) * 4,
          1.3,
          p[2] + Math.sin(angle) * 4,
        ];
        return createPrevisShot(
          e.showLabel ? e.label : `Camera ${i + 1}`,
          p,
          target,
        );
      })
    : [createPrevisShot('Shot 01')];
  return data;
}

function objectsFromDiagram(
  data: PrevisScene,
  elements: SceneElement[],
): PrevisObject[] {
  return elements.flatMap((e) => {
    const a = assetForDiagram(e.type, e.category, e.label);
    if (!a) return [];
    const footprint = size2D(e);
    const dims = diagramDimensions(e, data, a);
    return [
      {
        id: uuid(),
        sourceElementId: e.id,
        diagramSize: footprint,
        assetId: a.id,
        label: e.label,
        position: [
          (e.x - data.origin[0]) / data.unitsPerMeter,
          e.type === 'window' ? 1 : 0,
          (e.y - data.origin[1]) / data.unitsPerMeter,
        ],
        rotation: [0, -e.rotation, 0],
        dimensions: dims,
        color: a.color,
        visible: e.visible,
        locked: e.locked,
        pose: a.pose,
        ...(emitsLight(a) ? lightDefaults(a, e.coneAngle || undefined) : {}),
      },
    ];
  });
}

/** Adds new diagram elements and removes deleted links; camera setups and 3D-only objects survive. */
export function reconcilePrevis(
  data: PrevisScene,
  elements: SceneElement[],
): PrevisScene {
  if (data.sizing !== 2) data = upgradeIconSizes(data, elements);
  const ids = new Set(elements.map((e) => e.id));
  const existing = data.objects.filter(
    (o) => !o.sourceElementId || ids.has(o.sourceElementId),
  );
  const represented = new Set(existing.map((o) => o.sourceElementId));
  const additions = objectsFromDiagram(
    data,
    elements.filter((e) => !represented.has(e.id)),
  );
  return additions.length || existing.length !== data.objects.length
    ? { ...data, objects: [...existing, ...additions] }
    : data;
}

export function resolveObjects(
  data: PrevisScene,
  elements: SceneElement[],
): PrevisObject[] {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const plainWall = assetById.get('wall')!.color, rock = assetById.get('cave-wall')!.color;
  return data.objects.map((o) => data.wallStyle === 'cave' && o.assetId === 'wall'
    ? { ...o, assetId: 'cave-wall', color: o.color === plainWall ? rock : o.color } : o).flatMap((o) => {
    if (!o.sourceElementId) return [o];
    const e = byId.get(o.sourceElementId);
    if (!e) return [];
    const footprint = size2D(e),
      base = o.diagramSize ?? footprint;
    return [
      {
        ...o,
        position: [
          (e.x - data.origin[0]) / data.unitsPerMeter,
          o.position[1],
          (e.y - data.origin[1]) / data.unitsPerMeter,
        ] as Vec3,
        rotation: [o.rotation[0], -e.rotation, o.rotation[2]] as Vec3,
        dimensions: [
          (o.dimensions[0] * footprint[0]) / base[0],
          o.dimensions[1],
          (o.dimensions[2] * footprint[1]) / base[1],
        ] as Vec3,
        label: e.label,
        visible: e.visible,
        locked: e.locked,
      },
    ];
  });
}

/** Earlier conversions read library icons as measurements, shrinking cars to toys. */
function upgradeIconSizes(data: PrevisScene, elements: SceneElement[]): PrevisScene {
  const byId = new Map(elements.map((e) => [e.id, e]));
  return { ...data, sizing: 2, objects: data.objects.map((o) => {
    const e = o.sourceElementId ? byId.get(o.sourceElementId) : undefined;
    const a = e && assetForDiagram(e.type, e.category, e.label);
    if (!e || !a || o.modelData || usesFootprint(e) || symbolic(e.category)) return o;
    return { ...o, dimensions: [a.dimensions[0], o.dimensions[1], a.dimensions[2]], diagramSize: size2D(e) };
  }) };
}

/** Reapply measured footprints to old conversions without losing cameras or object styling. */
export function matchDiagramFootprints(data: PrevisScene, elements: SceneElement[]): PrevisScene {
  const byId = new Map(elements.map(e => [e.id, e]));
  return { ...data, objects: data.objects.map(o => {
    const e = o.sourceElementId && byId.get(o.sourceElementId);
    const a = e && assetForDiagram(e.type, e.category, e.label);
    if (!e || !a) return o;
    const dimensions = diagramDimensions(e, data, a);
    dimensions[1] = o.dimensions[1];
    return { ...o, dimensions, diagramSize: size2D(e) };
  }) };
}

/** Commits a 3D edit and its plan-view projection as one undoable document change. */
export function updateObject(
  data: PrevisScene,
  elements: SceneElement[],
  id: string,
  patch: Partial<PrevisObject>,
) {
  const resolved = resolveObjects(data, elements).find((o) => o.id === id);
  if (!resolved) return { previs: data, elements };
  const original = data.objects.find(o => o.id === id)!;
  const next = { ...resolved, ...patch, assetId: patch.assetId ?? original.assetId };
  const nextElements = elements.map((e) => {
    if (e.id !== resolved.sourceElementId) return e;
    const sx = next.dimensions[0] / resolved.dimensions[0],
      sz = next.dimensions[2] / resolved.dimensions[2];
    const updated = {
      ...e,
      x: data.origin[0] + next.position[0] * data.unitsPerMeter,
      y: data.origin[1] + next.position[2] * data.unitsPerMeter,
      rotation: -next.rotation[1],
      width: e.width * sx,
      height: e.height * sz,
      label: next.label,
      visible: next.visible,
      locked: next.locked,
    };
    next.diagramSize = size2D(updated);
    return updated;
  });
  return {
    previs: {
      ...data,
      objects: data.objects.map((o) => (o.id === id ? next : o)),
    },
    elements: nextElements,
  };
}

export function addAsset(
  data: PrevisScene,
  elements: SceneElement[],
  asset: PrevisAsset,
  position: Vec3,
) {
  const template =
    elementTemplates.find((t) => t.type === asset.diagramType) ??
    elementTemplates.find((t) => t.type === 'box-crate')!;
  const e = createElementFromTemplate(
    template,
    data.origin[0] + position[0] * data.unitsPerMeter,
    data.origin[1] + position[2] * data.unitsPerMeter,
    Math.max(0, ...elements.map((e) => e.zIndex)) + 1,
  );
  e.label = asset.name;
  e.color = asset.color;
  if (!symbolic(e.category)) {
    e.width = asset.dimensions[0] * data.unitsPerMeter;
    e.height = asset.dimensions[2] * data.unitsPerMeter;
  }
  const o: PrevisObject = {
    id: uuid(),
    sourceElementId: e.id,
    diagramSize: size2D(e),
    assetId: asset.id,
    label: asset.name,
    // Hanging and wall-mounted fixtures arrive at working height when dropped on the floor.
    position: position[1] === 0 && asset.elevation ? [position[0], asset.elevation, position[2]] : position,
    rotation: [0, 0, 0],
    dimensions: [...asset.dimensions],
    color: asset.color,
    visible: true,
    locked: false,
    pose: asset.pose,
    ...(emitsLight(asset) ? lightDefaults(asset) : {}),
  };
  return {
    previs: { ...data, objects: [...data.objects, o] },
    elements: [...elements, e],
    objectId: o.id,
  };
}

export function createPrevisShot(
  name: string,
  position: Vec3 = [3.4, 1.6, 5],
  target: Vec3 = [0, 1.1, 0],
): PrevisShot {
  return {
    id: uuid(),
    name,
    sensorWidth: 36,
    aspectRatio: 16 / 9,
    duration: 4,
    path: 'linear',
    ease: true,
    keyframes: [
      {
        id: uuid(),
        time: 0,
        position: [...position],
        target: [...target],
        lens: 35,
      },
    ],
  };
}

export function verticalFov(
  lens: number,
  sensorWidth: number,
  aspect: number,
): number {
  return (
    (2 * Math.atan(sensorWidth / aspect / (2 * Math.max(1, lens))) * 180) /
    Math.PI
  );
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: Vec3, b: Vec3, t: number): Vec3 =>
  a.map((n, i) => lerp(n, b[i], t)) as Vec3;
const cubic = (p0: number, p1: number, p2: number, p3: number, t: number) =>
  0.5 *
  (2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);

export function cameraAt(shot: PrevisShot, time: number): CameraKeyframe {
  const frames = [...shot.keyframes].sort((a, b) => a.time - b.time);
  if (!frames.length) return createPrevisShot('').keyframes[0];
  if (time <= frames[0].time) return frames[0];
  if (time >= frames[frames.length - 1].time) return frames[frames.length - 1];
  const i = frames.findIndex(
    (f, index) =>
      index < frames.length - 1 &&
      time >= f.time &&
      time < frames[index + 1].time,
  );
  const a = frames[i],
    b = frames[i + 1];
  let t = (time - a.time) / Math.max(0.001, b.time - a.time);
  if (shot.ease) t = t * t * (3 - 2 * t);
  const p0 = frames[Math.max(0, i - 1)],
    p3 = frames[Math.min(frames.length - 1, i + 2)];
  const position: Vec3 =
    shot.path === 'smooth' && frames.length > 2
      ? (a.position.map((n, j) =>
          cubic(p0.position[j], n, b.position[j], p3.position[j], t),
        ) as Vec3)
      : mix(a.position, b.position, t);
  return {
    id: a.id,
    time,
    position,
    target: mix(a.target, b.target, t),
    lens: lerp(a.lens, b.lens, t),
    roll: lerp(a.roll ?? 0, b.roll ?? 0, t),
  };
}

export function setKeyframe(
  shot: PrevisShot,
  frame: CameraKeyframe,
): PrevisShot {
  const time = clamp(frame.time, 0, shot.duration);
  const existing = shot.keyframes.find((f) => Math.abs(f.time - time) < 0.025);
  return {
    ...shot,
    keyframes: [
      ...shot.keyframes.filter((f) => f.id !== existing?.id),
      { ...frame, id: existing?.id ?? frame.id, time },
    ].sort((a, b) => a.time - b.time),
  };
}

export function resizeDuration(shot: PrevisShot, duration: number): PrevisShot {
  const nextDuration = clamp(Number.isFinite(duration) ? duration : shot.duration, 0.5, 3600);
  return {
    ...shot,
    duration: nextDuration,
    keyframes: shot.keyframes.map((f) => ({
      ...f,
      time: (f.time * nextDuration) / shot.duration,
    })),
    ...(shot.blocking ? {
      blocking: Object.fromEntries(Object.entries(shot.blocking).map(([id, keys]) =>
        [id, keys.map((k) => ({ ...k, time: (k.time * nextDuration) / shot.duration }))])),
    } : {}),
  };
}

export function safeFileName(name: string): string {
  return name.replace(/[^a-z0-9_-]/gi, '_') || 'shot';
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function assetShape(id: string) {
  return assetById.get(id)?.shape ?? 'box';
}

/** Shortest turn between two angles in degrees, so 170° → -170° passes through 180°. */
const lerpAngle = (a: number, b: number, t: number) => a + ((((b - a) % 360) + 540) % 360 - 180) * t;

export function objectPoseAt(keys: ObjectKeyframe[], time: number, ease = true): Pick<ObjectKeyframe, 'position' | 'rotation'> {
  const frames = [...keys].sort((a, b) => a.time - b.time);
  const pose = (k: ObjectKeyframe) => ({ position: k.position, rotation: k.rotation });
  if (time <= frames[0].time) return pose(frames[0]);
  const last = frames[frames.length - 1];
  if (time >= last.time) return pose(last);
  const i = frames.findIndex((f, index) => time >= f.time && time < frames[index + 1].time);
  const a = frames[i], b = frames[i + 1];
  let t = (time - a.time) / Math.max(0.001, b.time - a.time);
  if (ease) t = t * t * (3 - 2 * t);
  return {
    position: mix(a.position, b.position, t),
    rotation: a.rotation.map((n, j) => lerpAngle(n, b.rotation[j], t)) as Vec3,
  };
}

/** Objects as they stand at this moment of the shot; unanimated objects keep their identity. */
export function applyBlocking(objects: PrevisObject[], shot: PrevisShot, time: number): PrevisObject[] {
  const blocking = shot.blocking;
  if (!blocking) return objects;
  return objects.map((o) => {
    const keys = blocking[o.id];
    return keys?.length ? { ...o, ...objectPoseAt(keys, time, shot.ease) } : o;
  });
}

export function isAnimated(shot: PrevisShot, id: string) {
  return (shot.blocking?.[id]?.length ?? 0) > 0;
}

/** Sets (or replaces, within one frame) an object's key at a time in the shot. */
export function setObjectKey(shot: PrevisShot, id: string, frame: Omit<ObjectKeyframe, 'id'> & { id?: string }): PrevisShot {
  const time = clamp(frame.time, 0, shot.duration);
  const keys = shot.blocking?.[id] ?? [];
  const existing = keys.find((k) => Math.abs(k.time - time) < 0.025);
  const next = [...keys.filter((k) => k !== existing), { id: existing?.id ?? frame.id ?? uuid(), time, position: [...frame.position] as Vec3, rotation: [...frame.rotation] as Vec3 }]
    .sort((a, b) => a.time - b.time);
  return { ...shot, blocking: { ...shot.blocking, [id]: next } };
}

export function clearObjectKeys(shot: PrevisShot, id: string, keyId?: string): PrevisShot {
  if (!shot.blocking?.[id]) return shot;
  const blocking = { ...shot.blocking };
  const remaining = keyId ? blocking[id].filter((k) => k.id !== keyId) : [];
  if (remaining.length) blocking[id] = remaining;
  else delete blocking[id];
  return { ...shot, blocking };
}

/**
 * Routes a move of an object at a moment in a shot. Unanimated objects edit the shared set; once an
 * object is moving (or auto-key is on past the first frame) the move becomes a key at the playhead.
 * The key at 0 s also updates the set, so the 2D plan shows each object's starting mark.
 */
export function transformAtTime(
  data: PrevisScene,
  elements: SceneElement[],
  shotId: string,
  time: number,
  id: string,
  patch: Partial<PrevisObject>,
  autoKey: boolean,
) {
  const shot = data.shots.find((s) => s.id === shotId);
  const base = resolveObjects(data, elements).find((o) => o.id === id);
  const moves = patch.position || patch.rotation;
  if (!shot || !base || !moves || !(isAnimated(shot, id) || (autoKey && time > 0.02)))
    return updateObject(data, elements, id, patch);
  const current = isAnimated(shot, id) ? objectPoseAt(shot.blocking![id], time, shot.ease) : base;
  let next = isAnimated(shot, id) ? shot : setObjectKey(shot, id, { time: 0, position: base.position, rotation: base.rotation });
  next = setObjectKey(next, id, { time, position: patch.position ?? current.position, rotation: patch.rotation ?? current.rotation });
  const rest: Partial<PrevisObject> = { ...patch };
  delete rest.position;
  delete rest.rotation;
  if (time <= 0.02) Object.assign(rest, { position: patch.position ?? current.position, rotation: patch.rotation ?? current.rotation });
  const withShot = { ...data, shots: data.shots.map((s) => (s.id === shotId ? next : s)) };
  return Object.keys(rest).length ? updateObject(withShot, elements, id, rest) : { previs: withShot, elements };
}
