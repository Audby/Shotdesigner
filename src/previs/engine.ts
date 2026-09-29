import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildObject, disposeObject } from './geometry';
import { cameraAt, verticalFov, clamp, objectPoseAt } from './model';
import { assetById } from './catalog';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { StageEnvironment } from './environment';
import { DepthOfFieldPass } from './dofPass';
import { CameraRig, makeLabelSprite } from './cameraRig';
import { moveCamera, dollyCamera, walkCamera, orientCamera, type CameraGesture, type CameraPose } from './cameraControls';
import type { CameraKeyframe, PrevisObject, PrevisScene, PrevisShot, Vec3 } from './types';

export type TransformMode = 'translate' | 'rotate' | 'scale';
/** Selection id for the active shot's camera body. */
export const CAMERA_SELECTION = '@camera';
const vec = (v: Vec3) => new T.Vector3(...v);
const deg = T.MathUtils.radToDeg;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Validate embedded assets before asking the loader to fetch any dependencies. */
export function validateGlb(buffer: ArrayBuffer) {
  if (buffer.byteLength < 20) throw new Error('Choose a valid binary glTF (.glb) file.');
  const header = new DataView(buffer);
  if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== buffer.byteLength) {
    throw new Error('Choose a valid glTF 2.0 binary (.glb) file.');
  }
  const length = header.getUint32(12, true);
  if (header.getUint32(16, true) !== 0x4e4f534a || length > buffer.byteLength - 20)
    throw new Error('The GLB file has an invalid JSON chunk.');
  const document = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length)));
  for (const item of [...(document.buffers ?? []), ...(document.images ?? [])]) {
    if (item.uri && !item.uri.startsWith('data:')) throw new Error('Use a self-contained GLB with embedded textures and geometry.');
  }
  const unsupported = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu'].find((name) =>
    document.extensionsRequired?.includes(name),
  );
  if (unsupported)
    throw new Error('Export an uncompressed GLB with embedded PNG or JPEG textures. Compressed models are not supported yet.');
}

export async function parseGlb(data: string | ArrayBuffer): Promise<T.Group> {
  const buffer =
    typeof data === 'string' ? Uint8Array.from(atob(data.slice(data.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer : data;
  validateGlb(buffer);
  const manager = new T.LoadingManager();
  manager.setURLModifier((url) => {
    if (!url.startsWith('data:') && !url.startsWith('blob:')) throw new Error('Use a self-contained GLB with embedded textures.');
    return url;
  });
  const loader = new GLTFLoader(manager);
  const gltf = await loader.parseAsync(buffer, '');
  if (!gltf.scene.children.length) throw new Error('This model contains no visible objects.');
  return gltf.scene;
}

/** Ambient occlusion that ignores see-through helpers (frustums, glass, grid, labels). */
class StageAOPass extends GTAOPass {
  _overrideVisibility() {
    // @ts-expect-error: private three.js hook that hides lines and points before the depth pass.
    super._overrideVisibility();
    // @ts-expect-error: the visibility cache is restored by the base class after rendering.
    const cache: T.Object3D[] = this._visibilityCache;
    this.scene.traverse((o) => {
      const m = (o as T.Mesh).material as T.Material | undefined;
      if (o.visible && (o.userData.noAO || (m && !Array.isArray(m) && m.transparent) || o instanceof T.Sprite)) {
        o.visible = false;
        cache.push(o);
      }
    });
  }
}

export interface EngineCallbacks {
  onSelect: (id: string | null) => void;
  onSelectShot: (shotId: string) => void;
  onTransform: (id: string, patch: Partial<PrevisObject>) => void;
  onError: (message: string) => void;
  onCameraChange: (shotId: string, time: number, pose: CameraPose) => void;
  onDropAsset: (assetId: string, position: Vec3) => void;
}

export interface EngineState {
  data: PrevisScene;
  objects: PrevisObject[];
  shots: PrevisShot[];
  shot: PrevisShot;
  time: number;
  selected: string | null;
  mode: TransformMode;
  snap: boolean;
  lookThrough: boolean;
  helpers: boolean;
  cameraGesture: CameraGesture;
  cameraEditable: boolean;
  ambientOcclusion: boolean;
  /** Name tags above actors in the set and camera views (never in exports). */
  nameTags: boolean;
  /** Objects where the set places them, before any shot's blocking. */
  baseObjects: PrevisObject[];
}

export interface VideoExportOptions {
  shots: PrevisShot[];
  width: number;
  fps: number;
  format: 'mp4' | 'webm';
  burnIn: boolean;
  label: string;
}

const timecode = (seconds: number, fps: number) => {
  const frames = Math.round(seconds * fps);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(frames / (fps * 3600)))}:${pad(Math.floor(frames / (fps * 60)) % 60)}:${pad(Math.floor(frames / fps) % 60)}:${pad(frames % fps)}`;
};

/** Slate-style overlay for review copies: project and shot at the bottom left, timecode at the right. */
function drawBurnIn(ctx: CanvasRenderingContext2D, width: number, height: number, label: string, shot: PrevisShot, shotTime: number, filmTime: number, fps: number) {
  const size = Math.round(height * 0.03), pad = Math.round(size * 0.7);
  ctx.save();
  ctx.font = `600 ${size}px system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = 'middle';
  const left = `${label} · ${shot.name}`;
  const right = `${timecode(filmTime, fps)}   shot ${timecode(shotTime, fps).slice(3)}`;
  const band = size * 1.9;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, height - band, width, band);
  ctx.fillStyle = '#f2ede2';
  ctx.fillText(left, pad, height - band / 2, width * 0.55);
  ctx.textAlign = 'right';
  ctx.font = `500 ${size}px ui-monospace, Menlo, monospace`;
  ctx.fillText(right, width - pad, height - band / 2);
  ctx.restore();
}

interface Entry { root: T.Group; signature: string; data: PrevisObject; light?: T.Light }

RectAreaLightUniformsLib.init();

export const ASSET_DRAG_TYPE = 'application/x-shotdesigner-asset';

export class PrevisEngine {
  readonly world = new T.Scene();
  readonly editorCamera = new T.PerspectiveCamera(40, 1, 0.05, 2000);
  readonly shotCamera = new T.PerspectiveCamera(35, 16 / 9, 0.05, 2000);
  readonly orbit: OrbitControls;
  readonly transform: TransformControls;
  readonly renderer: T.WebGLRenderer;
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private aoPass: StageAOPass;
  private outlinePass: OutlinePass;
  private hoverPass: OutlinePass;
  private dofPass: DepthOfFieldPass;
  private preview: T.WebGLRenderer;
  private overlay = new T.Scene();
  private env: StageEnvironment;
  private helpers = new T.Group();
  private objects = new Map<string, Entry>();
  private rigs = new Map<string, CameraRig>();
  private cones = new Map<string, T.Mesh>();
  private cameraProxy = new T.Object3D();
  // The move reads through walls, so it is drawn over the set.
  private pathLine = new T.Line(new T.BufferGeometry(), new T.LineDashedMaterial({ color: '#e9b878', dashSize: 0.18, gapSize: 0.1, depthTest: false, transparent: true, opacity: 0.85 }));
  private pathKeys = new T.Group();
  private blockingPaths = new T.Group();
  private tags = new T.Group();
  private nameTags = new Map<string, T.Sprite>();
  private dropMarker: T.Mesh;
  // Faces down only, so interiors get a lid while the overview still sees inside.
  private ceiling = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshStandardMaterial({ color: '#d9d6cf', roughness: 0.95 }));
  private resizeObserver: ResizeObserver;
  private animation = 0;
  private disposed = false;
  private dirty = true;
  // Shadow maps and the camera monitor only redraw when the set or shot actually changes.
  private shadowsDirty = true;
  private previewDirty = true;
  private previewShadowsDirty = true;
  private lastPreview = 0;
  private lastInteraction = 0;
  private roughFrame = false;
  private envKey = '';
  private state?: EngineState;
  private lookThrough = false;
  private cameraDrag?: { x: number; y: number; pose: CameraPose; mode: CameraGesture | 'roll' };
  private objectDrag?: { id: string; plane: T.Plane; offset: T.Vector3; started: boolean; x: number; y: number; pointerId: number };
  private draftPose?: CameraPose;
  private navigationKeys = new Set<string>();
  private navigationFast = false;
  private nudgeKeys = new Set<string>();
  private nudgeFast = false;
  private nudgeTimer?: ReturnType<typeof setTimeout>;
  private nudging?: string;
  private lastFrame = 0;
  private wheelTimer?: ReturnType<typeof setTimeout>;
  private hovered: string | null = null;
  private hoverPending?: { x: number; y: number };
  private pointerDown = new T.Vector2();
  private width = 1;
  private height = 1;
  private dragging = false;
  private dragFinishedAt = 0;
  private pendingModels = 0;
  private flight?: { from: [T.Vector3, T.Vector3, number]; to: [T.Vector3, T.Vector3, number]; start: number; duration: number; done?: () => void };
  private savedSetView?: [T.Vector3, T.Vector3, number];
  private enteringShot = false;
  private boundsKey = '';
  private ceilingKey = '';
  private exportRenderer?: T.WebGLRenderer;
  private exportComposer?: { composer: EffectComposer; ao: StageAOPass; render: RenderPass; dof: DepthOfFieldPass };
  private recorder?: MediaRecorder;
  private recordingTimer?: ReturnType<typeof setTimeout>;
  private cancelRecording?: () => void;
  private exportRun?: { canceled: boolean };
  private baseObjects = new Map<string, PrevisObject>();

  constructor(
    private host: HTMLElement,
    private previewHost: HTMLElement,
    private callbacks: EngineCallbacks,
  ) {
    this.renderer = this.makeRenderer();
    this.preview = this.makeRenderer();
    host.appendChild(this.renderer.domElement);
    previewHost.appendChild(this.preview.domElement);
    this.env = new StageEnvironment(this.renderer, this.world);
    this.editorCamera.position.set(9, 7, 11);
    this.orbit = new OrbitControls(this.editorCamera, this.renderer.domElement);
    this.orbit.target.set(0, 1, 0);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.1;
    this.orbit.rotateSpeed = 0.6;
    this.orbit.zoomSpeed = 0.9;
    this.orbit.panSpeed = 0.9;
    this.orbit.screenSpacePanning = true;
    this.orbit.zoomToCursor = true;
    this.orbit.maxPolarAngle = Math.PI / 2 - 0.01;
    this.orbit.maxDistance = 600;
    this.orbit.minDistance = 0.2;
    this.orbit.mouseButtons = { LEFT: T.MOUSE.ROTATE, MIDDLE: T.MOUSE.PAN, RIGHT: T.MOUSE.PAN };
    this.orbit.addEventListener('change', () => this.interact());
    this.orbit.addEventListener('start', () => { this.flight = undefined; });
    this.transform = new TransformControls(this.editorCamera, this.renderer.domElement);
    this.transform.setSize(0.85);
    this.overlay.add(this.transform.getHelper());
    this.transform.addEventListener('dragging-changed', (e) => {
      this.dragging = Boolean(e.value);
      this.orbit.enabled = !this.dragging && !this.lookThrough;
    });
    this.transform.addEventListener('change', () => {
      this.interact();
      if (this.dragging) this.invalidate(true);
    });
    this.transform.addEventListener('mouseUp', () => {
      this.dragFinishedAt = performance.now();
      const root = this.transform.object;
      const selected = this.state?.selected;
      if (!root || !selected) return;
      if (selected === CAMERA_SELECTION) {
        const s = this.state!;
        const pose = cameraAt(s.shot, s.time);
        this.callbacks.onCameraChange(s.shot.id, s.time, { ...pose, position: root.position.toArray() as Vec3 });
        return;
      }
      const r = root.rotation;
      this.callbacks.onTransform(selected, {
        position: root.position.toArray() as Vec3,
        rotation: [deg(r.x), deg(r.y), deg(r.z)],
        dimensions: root.scale.toArray().map((n) => Math.max(0.01, n)) as Vec3,
      });
    });
    this.world.add(this.cameraProxy);
    this.ceiling.rotation.x = Math.PI / 2;
    this.ceiling.receiveShadow = true;
    this.ceiling.visible = false;
    this.world.add(this.ceiling);
    this.dropMarker = new T.Mesh(
      new T.RingGeometry(0.28, 0.36, 40),
      new T.MeshBasicMaterial({ color: '#e8b86a', transparent: true, opacity: 0.9, depthTest: false, side: T.DoubleSide }),
    );
    this.dropMarker.rotation.x = -Math.PI / 2;
    this.dropMarker.visible = false;
    this.dropMarker.renderOrder = 10;
    this.pathLine.frustumCulled = false;
    this.pathLine.renderOrder = 8;
    this.helpers.add(this.env.grid, this.pathLine, this.pathKeys, this.blockingPaths, this.dropMarker);
    this.world.add(this.helpers);
    // Name tags draw after all effects, so depth of field never blurs them and exports never see them.
    this.overlay.add(this.tags);

    this.renderPass = new RenderPass(this.world, this.editorCamera);
    this.aoPass = new StageAOPass(this.world, this.editorCamera, 1, 1);
    this.aoPass.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.6, thickness: 2, scale: 1.5, samples: 16 });
    this.aoPass.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 9, rings: 3, samples: 24 });
    this.aoPass.blendIntensity = 1;
    this.outlinePass = this.makeOutline('#f0c27a', 3.2);
    this.hoverPass = this.makeOutline('#ffffff', 1.4);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.aoPass);
    this.composer.addPass(this.hoverPass);
    this.composer.addPass(this.outlinePass);
    this.dofPass = new DepthOfFieldPass(this.world, this.shotCamera);
    this.composer.addPass(this.dofPass);
    this.composer.addPass(new OutputPass());

    const canvas = this.renderer.domElement;
    host.addEventListener('pointerdown', this.handleDown, { capture: true });
    host.addEventListener('pointermove', this.handleMove);
    host.addEventListener('pointerup', this.handleUp);
    host.addEventListener('pointercancel', this.handleCancel);
    host.addEventListener('pointerleave', this.handleLeave);
    host.addEventListener('dblclick', this.handleDoubleClick);
    host.addEventListener('wheel', this.handleCameraWheel, { passive: false });
    host.addEventListener('dragover', this.handleDragOver);
    host.addEventListener('dragleave', this.handleDragLeave);
    host.addEventListener('drop', this.handleDrop);
    host.addEventListener('contextmenu', this.preventContextMenu);
    canvas.addEventListener('webglcontextlost', this.handleContextLost);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resizeObserver.observe(previewHost);
    this.resize();
    window.addEventListener('keydown', this.navigationDown);
    window.addEventListener('keyup', this.navigationUp);
    window.addEventListener('blur', this.stopNavigation);
    const animate = () => {
      if (this.disposed) return;
      this.animation = requestAnimationFrame(animate);
      const now = performance.now();
      const delta = Math.min(0.05, (now - (this.lastFrame || now)) / 1000);
      this.lastFrame = now;
      if (this.navigationKeys.size) this.navigate(delta);
      if (this.nudgeKeys.size) this.nudge(delta);
      if (this.flight) this.fly(now);
      if (this.hoverPending) this.updateHover();
      this.orbit.update();
      if (this.roughFrame && now - this.lastInteraction > 220) this.dirty = true;
      if (this.dirty) {
        this.dirty = false;
        this.render();
      }
    };
    animate();
  }

  private makeRenderer() {
    const r = new T.WebGLRenderer({ antialias: true, alpha: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = T.PCFSoftShadowMap;
    r.shadowMap.autoUpdate = false;
    r.toneMapping = T.AgXToneMapping;
    r.toneMappingExposure = 1;
    r.outputColorSpace = T.SRGBColorSpace;
    return r;
  }
  /** Marks the set as changed: the monitor redraws, and shadows too when geometry moved. */
  private invalidate(shadows = false) {
    this.dirty = true;
    this.previewDirty = true;
    if (shadows) this.shadowsDirty = this.previewShadowsDirty = true;
  }
  /** Continuous input renders a lighter frame; full quality returns once it settles. */
  private interact() {
    this.lastInteraction = performance.now();
    this.dirty = true;
  }
  private makeOutline(color: string, strength: number) {
    const pass = new OutlinePass(new T.Vector2(1, 1), this.world, this.editorCamera);
    pass.visibleEdgeColor.set(color);
    pass.hiddenEdgeColor.set(color).multiplyScalar(0.35);
    pass.edgeStrength = strength;
    pass.edgeThickness = 1;
    pass.edgeGlow = 0;
    return pass;
  }
  private preventContextMenu = (e: Event) => e.preventDefault();
  private handleContextLost = (e: Event) => {
    e.preventDefault();
    this.callbacks.onError('The 3D graphics context was lost. Save your scene, then reopen the 3D workspace.');
  };

  // ── Picking ──────────────────────────────────────────────────────────────
  private ndc(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new T.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, (-(clientY - rect.top) / rect.height) * 2 + 1);
  }
  private ray(clientX: number, clientY: number) {
    const ray = new T.Raycaster();
    ray.setFromCamera(this.ndc(clientX, clientY), this.lookThrough ? this.shotCamera : this.editorCamera);
    return ray;
  }
  private objectAt(ray: T.Raycaster) {
    const roots = [...this.objects.values()].filter((o) => o.root.visible).map((o) => o.root);
    const rigBodies = this.state?.helpers ? [...this.rigs.values()].map((r) => r.body) : [];
    const hit = ray.intersectObjects([...roots, ...rigBodies], true).find((h) => h.object instanceof T.Mesh && !((h.object as T.Mesh).material as T.Material).transparent);
    if (!hit) return null;
    if (hit.object.userData.shotId) return { shotId: hit.object.userData.shotId as string, hit };
    let node: T.Object3D | null = hit.object;
    while (node && !node.userData.objectId) node = node.parent;
    return node ? { objectId: node.userData.objectId as string, hit } : null;
  }
  /** The surface a new asset should rest on: a table top, a platform, or the floor. */
  private placementAt(clientX: number, clientY: number): Vec3 {
    const ray = this.ray(clientX, clientY);
    const roots = [...this.objects.values()].filter((o) => o.root.visible).map((o) => o.root);
    const hit = ray.intersectObjects(roots, true).find((h) => {
      if (!(h.object instanceof T.Mesh) || !h.face) return false;
      const normal = h.face.normal.clone().transformDirection(h.object.matrixWorld);
      return normal.y > 0.7;
    });
    if (hit) return [hit.point.x, Math.max(0, hit.point.y), hit.point.z];
    const p = ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), 0), new T.Vector3());
    return p ? [p.x, 0, p.z] : this.placement();
  }
  private snapValue(n: number) {
    return this.state?.snap ? Math.round(n * 10) / 10 : n;
  }

  // ── Pointer input ────────────────────────────────────────────────────────
  private handleDown = (e: PointerEvent) => {
    this.stopNavigation();
    this.flight = undefined;
    this.pointerDown.set(e.clientX, e.clientY);
    const s = this.state;
    if (!s) return;
    if (this.lookThrough) {
      if (!s.cameraEditable) return;
      this.finishCameraGesture();
      this.cameraDrag = {
        x: e.clientX, y: e.clientY,
        pose: cameraAt(s.shot, s.time),
        mode: e.altKey ? 'roll' : e.button === 2 || e.button === 1 || e.shiftKey ? 'truck' : s.cameraGesture,
      };
      this.host.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    // Drag the selected object across its resting plane; the gizmo keeps priority.
    if (e.button !== 0 || this.transform.axis || !s.selected || s.selected === CAMERA_SELECTION) return;
    const entry = this.objects.get(s.selected);
    // Walls and floors are easy to grab by accident while orbiting; they move with the gizmo only.
    if (!entry || entry.data.locked || assetById.get(entry.data.assetId)?.category === 'Architecture') return;
    const picked = this.objectAt(this.ray(e.clientX, e.clientY));
    if (picked?.objectId !== s.selected) return;
    const plane = new T.Plane(new T.Vector3(0, 1, 0), -entry.root.position.y);
    const at = this.ray(e.clientX, e.clientY).ray.intersectPlane(plane, new T.Vector3());
    if (!at) return;
    this.objectDrag = { id: s.selected, plane, offset: entry.root.position.clone().sub(at), started: false, x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    this.orbit.enabled = false;
  };
  private handleMove = (e: PointerEvent) => {
    if (this.cameraDrag) {
      const drag = this.cameraDrag;
      const gateWidth = this.width, gateHeight = this.height;
      if (drag.mode === 'roll') {
        const roll = (drag.pose.roll ?? 0) + ((e.clientX - drag.x) / gateWidth) * 90;
        this.applyCameraPose({ ...drag.pose, roll: Math.round(clamp(roll, -90, 90) * 2) / 2 });
      } else
        this.applyCameraPose(moveCamera(drag.pose, drag.mode, (e.clientX - drag.x) / gateWidth, (e.clientY - drag.y) / gateHeight, this.shotCamera.fov, this.shotCamera.aspect));
      return;
    }
    const drag = this.objectDrag;
    if (drag) {
      if (!drag.started && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
      if (!drag.started) {
        drag.started = true;
        this.host.setPointerCapture(drag.pointerId);
        this.host.style.cursor = 'grabbing';
      }
      const at = this.ray(e.clientX, e.clientY).ray.intersectPlane(drag.plane, new T.Vector3());
      const entry = this.objects.get(drag.id);
      if (at && entry) {
        at.add(drag.offset);
        entry.root.position.set(this.snapValue(at.x), entry.root.position.y, this.snapValue(at.z));
        this.interact();
        this.invalidate(true);
      }
      return;
    }
    if (e.buttons === 0 && !this.lookThrough) this.hoverPending = { x: e.clientX, y: e.clientY };
  };
  private updateHover() {
    const p = this.hoverPending!;
    this.hoverPending = undefined;
    if (this.dragging || this.transform.axis) return this.setHover(null);
    const picked = this.objectAt(this.ray(p.x, p.y));
    const id = picked?.objectId ?? (picked?.shotId ? `@shot:${picked.shotId}` : null);
    this.setHover(id);
  }
  private setHover(id: string | null) {
    if (this.hovered === id) return;
    this.hovered = id;
    const s = this.state;
    const selected = id && s && (id === s.selected || (s.selected === CAMERA_SELECTION && id === `@shot:${s.shot.id}`));
    this.hoverPass.selectedObjects = !id || selected ? [] : id.startsWith('@shot:') ? [this.rigs.get(id.slice(6))?.body].filter((n): n is T.Group => !!n) : [this.objects.get(id)?.root].filter((n): n is T.Group => !!n);
    const entry = id ? this.objects.get(id) : undefined;
    const draggable = entry && !entry.data.locked && assetById.get(entry.data.assetId)?.category !== 'Architecture';
    this.host.style.cursor = id ? (s?.selected === id && draggable ? 'move' : 'pointer') : '';
    this.dirty = true;
  }
  private handleLeave = () => { this.hoverPending = undefined; this.setHover(null); };
  private handleCancel = () => {
    this.finishCameraGesture();
    this.cancelObjectDrag();
  };
  private cancelObjectDrag() {
    if (!this.objectDrag) return;
    const entry = this.objects.get(this.objectDrag.id);
    if (entry) entry.root.position.fromArray(entry.data.position);
    this.objectDrag = undefined;
    this.orbit.enabled = !this.lookThrough;
    this.host.style.cursor = '';
    this.invalidate(true);
  }
  private handleUp = (e: PointerEvent) => {
    if (this.host.hasPointerCapture(e.pointerId)) this.host.releasePointerCapture(e.pointerId);
    if (this.cameraDrag) {
      this.finishCameraGesture();
      return;
    }
    const drag = this.objectDrag;
    if (drag) {
      this.objectDrag = undefined;
      this.orbit.enabled = !this.lookThrough;
      this.host.style.cursor = '';
      if (drag.started) {
        const entry = this.objects.get(drag.id);
        if (entry) {
          this.dragFinishedAt = performance.now();
          this.callbacks.onTransform(drag.id, { position: entry.root.position.toArray() as Vec3 });
        }
        return;
      }
    }
    if (this.lookThrough || this.dragging || e.button !== 0 || performance.now() - this.dragFinishedAt < 100 ||
      this.pointerDown.distanceTo(new T.Vector2(e.clientX, e.clientY)) > 5 || this.transform.axis) return;
    const picked = this.objectAt(this.ray(e.clientX, e.clientY));
    if (picked?.shotId) {
      if (picked.shotId !== this.state?.shot.id) this.callbacks.onSelectShot(picked.shotId);
      this.callbacks.onSelect(CAMERA_SELECTION);
    } else this.callbacks.onSelect(picked?.objectId ?? null);
  };
  private handleDoubleClick = (e: MouseEvent) => {
    if (this.lookThrough) return;
    const picked = this.objectAt(this.ray(e.clientX, e.clientY));
    const point = picked?.hit.point ?? this.ray(e.clientX, e.clientY).ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), 0), new T.Vector3());
    if (!point) return;
    const offset = this.editorCamera.position.clone().sub(this.orbit.target);
    offset.setLength(clamp(offset.length() * 0.6, 2.5, 40));
    this.flyTo(point.clone().add(offset), point, this.editorCamera.fov);
  };
  private dragPayload(e: DragEvent) {
    return e.dataTransfer && [...e.dataTransfer.types].includes(ASSET_DRAG_TYPE);
  }
  private handleDragOver = (e: DragEvent) => {
    if (!this.dragPayload(e)) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
    const p = this.placementAt(e.clientX, e.clientY);
    this.dropMarker.position.set(p[0], p[1] + 0.01, p[2]);
    this.dropMarker.visible = true;
    this.dirty = true;
  };
  private handleDragLeave = () => {
    this.dropMarker.visible = false;
    this.dirty = true;
  };
  private handleDrop = (e: DragEvent) => {
    this.dropMarker.visible = false;
    this.dirty = true;
    const id = e.dataTransfer?.getData(ASSET_DRAG_TYPE);
    if (!id) return;
    e.preventDefault();
    const p = this.placementAt(e.clientX, e.clientY);
    this.callbacks.onDropAsset(id, [this.snapValue(p[0]), p[1], this.snapValue(p[2])]);
  };

  // ── Keyboard walk ────────────────────────────────────────────────────────
  private typing() {
    const el = document.activeElement;
    return document.querySelector('dialog[open], [role="dialog"]') ||
      (el instanceof HTMLElement && (el.matches('input:not([type=range]), textarea, select') || el.isContentEditable));
  }
  /** The selected, movable object and the camera whose view defines "forward". */
  private nudgeTarget() {
    const id = this.state?.selected;
    const entry = id && id !== CAMERA_SELECTION ? this.objects.get(id) : undefined;
    return entry && !entry.data.locked && entry.data.visible && this.state?.cameraEditable ? { id: id!, entry } : undefined;
  }
  private viewBasis() {
    const forward = new T.Vector3();
    (this.lookThrough ? this.shotCamera : this.editorCamera).getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    forward.normalize();
    return { forward, right: new T.Vector3().crossVectors(forward, new T.Vector3(0, 1, 0)) };
  }
  private handleObjectKeys(e: KeyboardEvent) {
    const target = this.nudgeTarget();
    if (!target || e.metaKey || e.ctrlKey || this.typing()) return false;
    const code = e.code;
    if (e.altKey && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyJ', 'KeyK', 'KeyL'].includes(code)) {
      e.preventDefault();
      this.nudgeFast = e.shiftKey;
      if (!this.nudgeKeys.size) this.beginNudge(target.id);
      this.nudgeKeys.add(code);
      return true;
    }
    // Arrows step along the grid axis nearest to "forward" in the view; [ and ] turn.
    const arrows: Record<string, [number, number]> = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (!(code in arrows) && code !== 'BracketLeft' && code !== 'BracketRight') return false;
    e.preventDefault();
    this.beginNudge(target.id);
    const root = target.entry.root;
    const step = e.shiftKey ? 1 : 0.1;
    if (code === 'BracketLeft' || code === 'BracketRight') root.rotation.y += T.MathUtils.degToRad(code === 'BracketLeft' ? 15 : -15);
    else if (e.altKey && (code === 'ArrowUp' || code === 'ArrowDown')) root.position.y = Math.max(0, root.position.y + arrows[code][1] * step);
    else {
      const { forward } = this.viewBasis();
      const axisF = Math.abs(forward.x) > Math.abs(forward.z) ? new T.Vector3(Math.sign(forward.x), 0, 0) : new T.Vector3(0, 0, Math.sign(forward.z));
      const axisR = new T.Vector3().crossVectors(axisF, new T.Vector3(0, 1, 0));
      const [r, f] = arrows[code];
      root.position.addScaledVector(axisR, r * step).addScaledVector(axisF, f * step);
    }
    this.invalidate(true);
    this.interact();
    clearTimeout(this.nudgeTimer);
    this.nudgeTimer = setTimeout(() => this.commitNudge(), 450);
    return true;
  }
  private beginNudge(id: string) {
    if (this.nudging && this.nudging !== id) this.commitNudge();
    this.nudging = id;
    this.transform.enabled = false;
  }
  private nudge(seconds: number) {
    const target = this.nudgeTarget();
    if (!target || target.id !== this.nudging || this.typing()) return this.stopNudge();
    const keys = this.nudgeKeys, root = target.entry.root;
    const { forward, right } = this.viewBasis();
    const speed = seconds * (this.nudgeFast ? 4 : 1.2);
    root.position
      .addScaledVector(forward, (Number(keys.has('KeyW')) - Number(keys.has('KeyS'))) * speed)
      .addScaledVector(right, (Number(keys.has('KeyD')) - Number(keys.has('KeyA'))) * speed);
    root.position.y = Math.max(0, root.position.y + (Number(keys.has('KeyE')) - Number(keys.has('KeyQ'))) * speed);
    const turn = T.MathUtils.degToRad(90) * seconds * (this.nudgeFast ? -1 : 1);
    if (keys.has('KeyJ')) root.rotation.y += turn;
    if (keys.has('KeyK')) root.rotation.x += turn;
    if (keys.has('KeyL')) root.rotation.z += turn;
    this.invalidate(true);
    this.interact();
  }
  private stopNudge = () => {
    const held = this.nudgeKeys.size > 0;
    this.nudgeKeys.clear();
    if (held || (this.nudging && !this.nudgeTimer)) this.commitNudge();
  };
  /** One held key, or a burst of arrow presses, becomes a single undo step. */
  private commitNudge() {
    clearTimeout(this.nudgeTimer);
    this.nudgeTimer = undefined;
    const id = this.nudging;
    this.nudging = undefined;
    this.transform.enabled = !this.lookThrough;
    const entry = id ? this.objects.get(id) : undefined;
    if (!id || !entry || this.disposed) return;
    const snap = this.state?.snap;
    const p = entry.root.position, r = entry.root.rotation;
    const round = (n: number, step: number) => (snap ? Math.round(n / step) * step : n);
    this.callbacks.onTransform(id, {
      position: [round(p.x, 0.05), round(p.y, 0.05), round(p.z, 0.05)],
      rotation: [round(deg(r.x), 5), round(deg(r.y), 5), round(deg(r.z), 5)],
    });
  }

  private navigationDown = (e: KeyboardEvent) => {
    if (!e.defaultPrevented && this.handleObjectKeys(e)) return;
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || !this.state?.cameraEditable || this.typing()) return;
    const key = e.key.toLowerCase();
    if (!['w', 'a', 's', 'd', 'q', 'e'].includes(key)) return;
    e.preventDefault();
    this.navigationFast = e.shiftKey;
    if (!this.navigationKeys.size) this.finishCameraGesture();
    this.navigationKeys.add(key);
    if (!e.repeat) this.navigate(1 / 60);
  };
  private navigationUp = (e: KeyboardEvent) => {
    this.nudgeFast = e.shiftKey;
    if (this.nudgeKeys.size && (this.nudgeKeys.delete(e.code) || e.key === 'Alt') && (!this.nudgeKeys.size || e.key === 'Alt')) {
      this.nudgeKeys.clear();
      this.commitNudge();
    }
    this.navigationFast = e.shiftKey;
    const key = e.key.toLowerCase();
    this.navigationKeys.delete(key);
    if (!this.navigationKeys.size && ['w', 'a', 's', 'd', 'q', 'e'].includes(key)) this.finishCameraGesture();
  };
  private stopNavigation = () => {
    this.stopNudge();
    this.navigationKeys.clear();
    this.finishCameraGesture();
  };
  private navigate(seconds: number) {
    const s = this.state;
    if (!s?.cameraEditable || this.typing()) {
      this.stopNavigation();
      return;
    }
    const keys = this.navigationKeys;
    const pose = this.lookThrough
      ? this.draftPose ?? cameraAt(s.shot, s.time)
      : { position: this.editorCamera.position.toArray() as Vec3, target: this.orbit.target.toArray() as Vec3 };
    const moved = walkCamera(pose, Number(keys.has('d')) - Number(keys.has('a')), Number(keys.has('w')) - Number(keys.has('s')),
      Number(keys.has('e')) - Number(keys.has('q')), seconds * (this.navigationFast ? 8 : 2));
    if (this.lookThrough) this.applyCameraPose(moved);
    else {
      this.editorCamera.position.fromArray(moved.position);
      this.orbit.target.fromArray(moved.target);
      this.interact();
    }
  }

  // ── Shot camera gestures ─────────────────────────────────────────────────
  /** Focus follows the aim point unless the shot pins a focus distance. */
  private updateFocus(pose: CameraPose & { lens?: number }, pass = this.dofPass, shot = this.state?.shot) {
    const s = this.state;
    if (!s || !shot) return;
    const dof = shot.dof;
    Object.assign(pass.settings, {
      focalLength: pose.lens ?? cameraAt(shot, s.time).lens,
      fStop: dof?.fStop ?? 2.8,
      focusDistance: dof?.focusDistance ?? vec(pose.position).distanceTo(vec(pose.target)),
      sensorWidth: shot.sensorWidth,
    });
  }
  private applyCameraPose(pose: CameraPose) {
    this.draftPose = pose;
    this.updateFocus(pose);
    orientCamera(this.shotCamera, pose);
    this.syncRigs();
    this.interact();
    this.previewDirty = true;
  }
  private handleCameraWheel = (e: WheelEvent) => {
    const s = this.state;
    if (!this.lookThrough || !s?.cameraEditable) return;
    e.preventDefault();
    const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.height : 1);
    this.applyCameraPose(dollyCamera(this.draftPose ?? cameraAt(s.shot, s.time), clamp(delta, -100, 100) * 0.002));
    clearTimeout(this.wheelTimer);
    this.wheelTimer = setTimeout(this.finishCameraGesture, 180);
  };
  private finishCameraGesture = () => {
    clearTimeout(this.wheelTimer);
    this.cameraDrag = undefined;
    const pose = this.draftPose;
    this.draftPose = undefined;
    if (pose && this.state && !this.disposed) this.callbacks.onCameraChange(this.state.shot.id, this.state.time, pose);
  };

  // ── Camera flights ───────────────────────────────────────────────────────
  private flyTo(position: T.Vector3, target: T.Vector3, fov = this.editorCamera.fov, duration = 520, done?: () => void) {
    this.flight = {
      from: [this.editorCamera.position.clone(), this.orbit.target.clone(), this.editorCamera.fov],
      to: [position.clone(), target.clone(), fov],
      start: performance.now(), duration, done,
    };
    this.dirty = true;
  }
  private fly(now: number) {
    const f = this.flight!;
    const t = Math.min(1, (now - f.start) / f.duration), k = ease(t);
    this.editorCamera.position.lerpVectors(f.from[0], f.to[0], k);
    this.orbit.target.lerpVectors(f.from[1], f.to[1], k);
    this.editorCamera.fov = T.MathUtils.lerp(f.from[2], f.to[2], k);
    this.editorCamera.updateProjectionMatrix();
    this.interact();
    if (t >= 1) {
      this.flight = undefined;
      f.done?.();
    }
  }

  private resize() {
    const W = Math.max(1, this.host.clientWidth), H = Math.max(1, this.host.clientHeight);
    let w = W, h = H;
    if (this.lookThrough && this.state) {
      const ratio = this.state.shot.aspectRatio;
      w = Math.max(1, Math.round(Math.min(W, H * ratio)));
      h = Math.max(1, Math.round(w / ratio));
    }
    const canvas = this.renderer.domElement;
    canvas.style.left = `${(W - w) / 2}px`;
    canvas.style.top = `${(H - h) / 2}px`;
    if (w !== this.width || h !== this.height || canvas.width !== Math.round(w * this.renderer.getPixelRatio())) {
      this.width = w;
      this.height = h;
      this.renderer.setSize(w, h);
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
    this.editorCamera.aspect = w / h;
    this.editorCamera.updateProjectionMatrix();
    this.preview.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.preview.setSize(Math.max(1, this.previewHost.clientWidth), Math.max(1, this.previewHost.clientHeight));
    this.invalidate(true);
  }

  update(state: EngineState) {
    const prev = this.state;
    const { data, objects, shot, time, selected, mode, snap, lookThrough, cameraEditable } = state;
    if (prev && (prev.lookThrough !== lookThrough || prev.shot.id !== shot.id || prev.time !== time || !cameraEditable)) this.stopNavigation();
    this.state = state;
    // Environment, shadow framing and the ceiling depend on the document, not the playhead.
    const documentChanged = prev?.data !== data;
    const envKey = JSON.stringify([data.backgroundColor, data.floorColor, data.floorSize, data.ambientIntensity, data.daylightIntensity, data.sunAzimuth, data.sunElevation]);
    if (envKey !== this.envKey) {
      this.envKey = envKey;
      this.env.apply(data);
      this.invalidate(true);
    }
    const reframe = this.lookThrough && prev?.shot.aspectRatio !== shot.aspectRatio;
    this.setLookThrough(lookThrough);
    if (reframe) this.resize();
    this.orbit.enabled = !this.lookThrough && !this.dragging;
    this.transform.enabled = !this.lookThrough;
    this.transform.setMode(selected === CAMERA_SELECTION ? 'translate' : mode);
    this.transform.setTranslationSnap(snap ? 0.1 : null);
    this.transform.setRotationSnap(snap ? Math.PI / 12 : null);
    this.transform.setScaleSnap(snap ? 0.05 : null);
    if (prev?.baseObjects !== state.baseObjects) this.baseObjects = new Map(state.baseObjects.map((o) => [o.id, o]));
    if (prev?.objects !== objects && this.syncObjects(objects)) this.invalidate(true);
    if (prev?.shots !== state.shots) {
      this.syncShotRigs(state);
      this.syncRigs();
    }
    const entry = selected && selected !== CAMERA_SELECTION ? this.objects.get(selected) : undefined;
    if (entry && entry.data.visible && !entry.data.locked && !lookThrough) this.transform.attach(entry.root);
    else if (selected === CAMERA_SELECTION && !lookThrough && state.helpers) {
      this.cameraProxy.position.copy(this.shotCamera.position);
      this.transform.attach(this.cameraProxy);
    } else this.transform.detach();
    this.outlinePass.selectedObjects = entry && entry.data.visible && !lookThrough
      ? [entry.root]
      : selected === CAMERA_SELECTION && !lookThrough ? [this.rigs.get(shot.id)!.body].filter(Boolean) : [];
    if (this.hovered && (this.hovered === selected || !this.objects.has(this.hovered) && !this.hovered.startsWith('@shot:'))) this.setHover(null);
    const key = documentChanged ? [...this.objects.values()].filter((o) => o.data.visible).map((o) => `${o.data.position}|${o.data.dimensions}`).join(';') : this.boundsKey;
    if (key !== this.boundsKey) {
      this.boundsKey = key;
      const bounds = new T.Box3();
      for (const o of this.objects.values()) if (o.data.visible && o.data.assetId !== 'camera') bounds.expandByObject(o.root);
      this.env.fitShadows(bounds);
      this.env.apply(data);
      this.invalidate(true);
    }
    const ceilingKey = `${this.boundsKey}${data.ceiling}${data.ceilingColor}`;
    if (ceilingKey !== this.ceilingKey) {
      this.ceilingKey = ceilingKey;
      this.fitCeiling(data);
    }
    if (prev?.shot !== shot || prev?.time !== time || prev?.lookThrough !== lookThrough) this.setTime(time);
    if (prev?.shot !== shot) this.updatePath(shot);
    this.dirty = true;
  }

  private fitCeiling(data: PrevisScene) {
    const walls = new T.Box3();
    for (const o of this.objects.values())
      if (o.data.visible && ['wall', 'cave-wall'].includes(o.data.assetId)) walls.expandByObject(o.root);
    this.ceiling.visible = !!data.ceiling && !walls.isEmpty();
    if (!this.ceiling.visible) return;
    const c = walls.getCenter(new T.Vector3()), size = walls.getSize(new T.Vector3());
    this.ceiling.position.set(c.x, walls.max.y, c.z);
    this.ceiling.scale.set(size.x, size.z, 1);
    (this.ceiling.material as T.MeshStandardMaterial).color.set(data.ceilingColor ?? '#d9d6cf');
  }

  private setLookThrough(next: boolean) {
    const s = this.state!;
    if (next === this.lookThrough && !this.enteringShot) return;
    if (next && !this.lookThrough && !this.enteringShot) {
      // Glide into the lens before switching to the framed view.
      this.savedSetView = [this.editorCamera.position.clone(), this.orbit.target.clone(), this.editorCamera.fov];
      const pose = cameraAt(s.shot, s.time);
      this.enteringShot = true;
      this.flyTo(vec(pose.position), vec(pose.target), verticalFov(pose.lens, s.shot.sensorWidth, s.shot.aspectRatio) * Math.max(1, s.shot.aspectRatio / (this.width / this.height)), 420, () => {
        this.enteringShot = false;
        if (this.state?.lookThrough) {
          this.lookThrough = true;
          this.resize();
        }
      });
      return;
    }
    if (!next && this.enteringShot) {
      this.enteringShot = false;
      this.flight = undefined;
    }
    if (!next && this.lookThrough) {
      this.lookThrough = false;
      this.resize();
      const pose = cameraAt(s.shot, s.time);
      this.editorCamera.position.fromArray(pose.position);
      this.orbit.target.fromArray(pose.target);
      const back = this.savedSetView;
      this.savedSetView = undefined;
      if (back) this.flyTo(back[0], back[1], back[2], 480);
      else this.editorCamera.fov = 40;
      this.editorCamera.updateProjectionMatrix();
    }
  }

  /** Actors carry their name above their head, sized for the screen rather than the set. */
  private syncTag(o: PrevisObject) {
    const person = assetById.get(o.assetId)?.shape === 'person';
    let tag = this.nameTags.get(o.id);
    if (!person || !o.label.trim()) return this.removeTag(o.id);
    if (tag?.userData.text !== o.label) {
      this.removeTag(o.id);
      tag = makeLabelSprite(o.label, false);
      (tag.material as T.SpriteMaterial).toneMapped = false;
      tag.center.set(0.5, 0);
      tag.scale.set(0.16, 0.04, 1);
      tag.userData.objectId = o.id;
      this.nameTags.set(o.id, tag);
      this.tags.add(tag);
    }
    tag.visible = o.visible;
  }
  private removeTag(id: string) {
    const tag = this.nameTags.get(id);
    if (!tag) return;
    this.tags.remove(tag);
    (tag.material as T.SpriteMaterial).map?.dispose();
    tag.material.dispose();
    this.nameTags.delete(id);
  }
  /** Tags follow the actor wherever it is drawn: dragged, nudged or walking between marks. */
  private placeTags() {
    for (const [id, tag] of this.nameTags) {
      const root = this.objects.get(id)?.root;
      if (!root) continue;
      // Models are normalized to a ground pivot and unit height, so the head sits at scale.y.
      tag.position.set(root.position.x, root.position.y + root.scale.y + 0.02, root.position.z);
    }
  }

  /** Returns whether anything visible changed, so shadows and the monitor redraw only when needed. */
  private syncObjects(objects: PrevisObject[]) {
    let changed = false;
    const live = new Set(objects.map((o) => o.id));
    for (const [id, entry] of this.objects)
      if (!live.has(id)) {
        if (this.transform.object === entry.root) this.transform.detach();
        this.world.remove(entry.root);
        disposeObject(entry.root);
        this.objects.delete(id);
        this.removeCone(id);
        this.removeTag(id);
        changed = true;
      }
    let shadowLights = 0;
    for (const o of objects) {
      let entry = this.objects.get(o.id);
      if (entry?.data === o) {
        if (entry.light instanceof T.SpotLight && entry.light.castShadow) shadowLights++;
        continue;
      }
      changed = true;
      // Position and size edits do not rebuild the model or reload its textures.
      const signature = JSON.stringify([o.assetId, o.color, o.pose, o.lightIntensity, o.lightAngle, o.lightColor, Boolean(o.modelData),
        // Rock relief is built in metres, so it regrows when a cave wall changes size.
        // Soft sources are sized in metres, so they are rebuilt when resized.
        o.assetId === 'cave-wall' || ['area', 'tube'].includes(assetById.get(o.assetId)?.light?.kind ?? '')
          ? o.dimensions.map((n) => Math.round(n * 20) / 20) : 0]);
      if (!entry || entry.signature !== signature) {
        if (entry) {
          if (this.transform.object === entry.root) this.transform.detach();
          this.world.remove(entry.root);
          disposeObject(entry.root);
        }
        entry = { root: this.buildRoot(o), signature, data: o };
        entry.light = entry.root.userData.light;
        this.objects.set(o.id, entry);
        this.world.add(entry.root);
      }
      entry.data = o;
      entry.root.visible = o.visible;
      this.syncTag(o);
      if (entry.light instanceof T.SpotLight) {
        const casts = o.visible && shadowLights < 4;
        if (casts) shadowLights++;
        entry.light.castShadow = casts;
      }
      const moving = (this.dragging && this.transform.object === entry.root) || this.objectDrag?.id === o.id || this.nudging === o.id;
      if (!moving) {
        entry.root.position.fromArray(o.position);
        entry.root.rotation.set(...(o.rotation.map((n) => (n * Math.PI) / 180) as Vec3));
        entry.root.scale.fromArray(o.dimensions);
        // Rock needs body: schematic wall lines render at least half a metre thick.
        if (o.assetId === 'cave-wall') entry.root.scale.z = Math.max(entry.root.scale.z, 0.5);
      }
      this.updateCone(o.id, entry);
    }
    return changed;
  }

  private buildRoot(o: PrevisObject) {
    const root = new T.Group();
    root.userData.objectId = o.id;
    if (o.modelData) {
      this.pendingModels++;
      void parseGlb(o.modelData)
        .then((model) => {
          if (this.disposed || this.objects.get(o.id)?.root !== root) {
            disposeObject(model);
            return;
          }
          const b = new T.Box3().setFromObject(model), s = b.getSize(new T.Vector3()), c = b.getCenter(new T.Vector3());
          const normalized = new T.Group();
          model.position.sub(new T.Vector3(c.x, b.min.y, c.z));
          normalized.add(model);
          normalized.scale.set(1 / Math.max(s.x, 0.001), 1 / Math.max(s.y, 0.001), 1 / Math.max(s.z, 0.001));
          model.traverse((n) => {
            if (n instanceof T.Mesh) {
              n.castShadow = true;
              n.receiveShadow = true;
            }
          });
          root.add(normalized);
          this.boundsKey = '';
          this.invalidate(true);
        })
        .catch((error) => {
          if (!this.disposed) this.callbacks.onError(`Model could not load: ${error instanceof Error ? error.message : 'unsupported GLB'}`);
        })
        .finally(() => { this.pendingModels--; });
    } else root.add(buildObject(o));
    const spec = assetById.get(o.assetId)?.light;
    if (o.lightIntensity !== undefined && spec) {
      // The fixture's own stand should not block the light it carries.
      root.traverse((n) => { if (n instanceof T.Mesh) n.castShadow = false; });
      const color = o.lightColor ?? spec.color;
      const [ax, ay, az] = spec.at;
      // Lights live in the root, which is scaled to the model's size; area and tube emitters
      // take their dimensions in metres, because three.js ignores scale for rectangle lights.
      const [w, h, d] = o.dimensions;
      if (spec.kind === 'point') {
        const light = new T.PointLight(color, o.lightIntensity, 25, 2);
        light.position.set(ax, ay, az);
        root.add(light);
        root.userData.light = light;
      } else if (spec.kind === 'spot') {
        const light = new T.SpotLight(color, o.lightIntensity, 40, clamp(((o.lightAngle ?? 60) * Math.PI) / 360, 0.05, 1.5), 0.45, 2);
        light.position.set(ax, ay, az);
        light.target.position.set(spec.aim === 'down' ? ax : ax + 4 / w, spec.aim === 'down' ? ay - 4 / h : ay - 0.35 / h, az);
        light.shadow.mapSize.set(1024, 1024);
        light.shadow.bias = -0.0004;
        light.shadow.normalBias = 0.02;
        root.add(light, light.target);
        root.userData.light = light;
      } else if (spec.kind === 'area') {
        const [sw, sh] = spec.size ?? [0.5, 0.5];
        const light = new T.RectAreaLight(color, o.lightIntensity, sw, sh);
        light.position.set(ax, ay, az);
        // A rectangle light shines down its -Z axis.
        if (spec.aim === 'down') light.rotation.x = -Math.PI / 2;
        else if (az > 0.3) light.rotation.y = Math.PI;
        else light.rotation.y = -Math.PI / 2;
        root.add(light);
        root.userData.light = light;
      } else {
        // A rod glows all round: three rectangles at 120° approximate a cylinder.
        const tube = new T.Group();
        tube.position.set(ax, ay, az);
        for (let i = 0; i < 3; i++) {
          const face = new T.RectAreaLight(color, o.lightIntensity, Math.max(w, d), h * 0.96);
          face.rotation.y = (i * Math.PI * 2) / 3;
          face.position.set(Math.sin(face.rotation.y) * 0.01, 0, Math.cos(face.rotation.y) * 0.01);
          face.rotateY(Math.PI);
          tube.add(face);
        }
        root.add(tube);
        root.userData.light = tube.children[0];
      }
    }
    return root;
  }

  /** A faint beam shows where each fixture points while building; hidden in the shot. */
  private updateCone(id: string, entry: Entry) {
    const light = entry.light;
    if (!(light instanceof T.SpotLight) || !entry.data.visible) return this.removeCone(id);
    let cone = this.cones.get(id);
    if (!cone) {
      const g = new T.ConeGeometry(1, 1, 32, 1, true);
      g.translate(0, -0.5, 0);
      g.rotateX(-Math.PI / 2);
      cone = new T.Mesh(g, new T.MeshBasicMaterial({ color: light.color, transparent: true, opacity: 0.035, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending }));
      cone.userData.noAO = true;
      this.cones.set(id, cone);
      this.helpers.add(cone);
    }
    entry.root.updateMatrixWorld(true);
    const from = light.getWorldPosition(new T.Vector3()), to = light.target.getWorldPosition(new T.Vector3());
    const length = 2.2;
    cone.position.copy(from);
    cone.lookAt(to);
    const r = Math.tan(light.angle) * length;
    cone.scale.set(r, r, length);
    (cone.material as T.MeshBasicMaterial).color.copy(light.color);
  }
  private removeCone(id: string) {
    const cone = this.cones.get(id);
    if (!cone) return;
    this.helpers.remove(cone);
    cone.geometry.dispose();
    (cone.material as T.Material).dispose();
    this.cones.delete(id);
  }

  private syncShotRigs(state: EngineState) {
    const live = new Set(state.shots.map((s) => s.id));
    for (const [id, rig] of this.rigs)
      if (!live.has(id)) {
        this.helpers.remove(rig.root);
        rig.dispose();
        this.rigs.delete(id);
      }
    for (const shot of state.shots) {
      let rig = this.rigs.get(shot.id);
      if (!rig) {
        rig = new CameraRig(shot.id);
        this.rigs.set(shot.id, rig);
        this.helpers.add(rig.root);
      }
      rig.setLabel(shot.name);
    }
  }
  private syncRigs() {
    const s = this.state;
    if (!s) return;
    const temp = new T.PerspectiveCamera();
    for (const shot of s.shots) {
      const rig = this.rigs.get(shot.id);
      if (!rig) continue;
      const active = shot.id === s.shot.id;
      if (active) {
        rig.update(this.shotCamera, this.shotCamera.position.distanceTo(vec(this.draftPose?.target ?? cameraAt(shot, s.time).target)), true);
        continue;
      }
      const f = cameraAt(shot, 0);
      orientCamera(temp, f);
      temp.fov = verticalFov(f.lens, shot.sensorWidth, shot.aspectRatio);
      temp.aspect = shot.aspectRatio;
      rig.update(temp, temp.position.distanceTo(vec(f.target)), false);
    }
  }

  /** Each moving object leaves a dashed trail across the floor with a marker per key. */
  private updateBlockingPaths(shot: PrevisShot) {
    this.blockingPaths.children.forEach((c) => {
      (c as T.Mesh).geometry.dispose();
      ((c as T.Mesh).material as T.Material).dispose();
    });
    this.blockingPaths.clear();
    for (const keys of Object.values(shot.blocking ?? {})) {
      if (keys.length < 2) continue;
      const end = keys[keys.length - 1].time, start = keys[0].time;
      const points = Array.from({ length: 49 }, (_, i) => vec(objectPoseAt(keys, start + ((end - start) * i) / 48, shot.ease).position).setY(0.03));
      const line = new T.Line(new T.BufferGeometry().setFromPoints(points), new T.LineDashedMaterial({ color: '#7fd3c3', dashSize: 0.12, gapSize: 0.08, depthTest: false, transparent: true }));
      line.computeLineDistances();
      line.renderOrder = 8;
      this.blockingPaths.add(line);
      for (const k of keys) {
        const dot = new T.Mesh(new T.RingGeometry(0.12, 0.17, 24), new T.MeshBasicMaterial({ color: '#7fd3c3', depthTest: false, transparent: true, side: T.DoubleSide }));
        dot.rotation.x = -Math.PI / 2;
        dot.position.set(k.position[0], 0.03, k.position[2]);
        dot.renderOrder = 8;
        this.blockingPaths.add(dot);
      }
    }
  }

  private updatePath(shot: PrevisShot) {
    this.updateBlockingPaths(shot);
    const key = JSON.stringify([shot.keyframes, shot.path, shot.ease, shot.duration]);
    if (this.pathLine.userData.key === key) return;
    this.pathLine.userData.key = key;
    this.pathLine.geometry.dispose();
    const points = Array.from({ length: 97 }, (_, i) => vec(cameraAt(shot, (i / 96) * shot.duration).position));
    this.pathLine.geometry = new T.BufferGeometry().setFromPoints(points);
    this.pathLine.computeLineDistances();
    this.pathLine.visible = shot.keyframes.length > 1;
    this.pathKeys.children.forEach((c) => (c as T.Mesh).geometry.dispose());
    this.pathKeys.clear();
    const material = new T.MeshBasicMaterial({ color: '#e9b878', depthTest: false, transparent: true });
    if (shot.keyframes.length > 1)
      for (const f of shot.keyframes) {
        const dot = new T.Mesh(new T.OctahedronGeometry(0.06), material);
        dot.position.fromArray(f.position);
        dot.renderOrder = 8;
        this.pathKeys.add(dot);
      }
  }

  setTime(time: number) {
    const s = this.state;
    if (!s) return;
    const f = cameraAt(s.shot, time);
    orientCamera(this.shotCamera, f);
    this.updateFocus(f);
    // Moving objects follow the playhead here too, so clip export stays in step with the camera.
    for (const [id, keys] of Object.entries(s.shot.blocking ?? {})) {
      const entry = this.objects.get(id);
      if (!entry || !keys.length || this.nudging === id || this.objectDrag?.id === id || (this.dragging && this.transform.object === entry.root)) continue;
      const pose = objectPoseAt(keys, time, s.shot.ease);
      entry.root.position.fromArray(pose.position);
      entry.root.rotation.set(...(pose.rotation.map((n) => (n * Math.PI) / 180) as Vec3));
      this.shadowsDirty = this.previewShadowsDirty = true;
    }
    if (this.exportComposer) this.updateFocus(f, this.exportComposer.dof);
    this.shotCamera.aspect = s.shot.aspectRatio;
    this.shotCamera.fov = verticalFov(f.lens, s.shot.sensorWidth, s.shot.aspectRatio);
    this.shotCamera.updateProjectionMatrix();
    this.syncRigs();
    if (this.transform.object === this.cameraProxy && !this.dragging) this.cameraProxy.position.copy(this.shotCamera.position);
    this.dirty = true;
    this.previewDirty = true;
  }

  /** Renders the shot exactly as framed: no helpers and no diagram camera stand-ins. */
  private cleanRender(render: () => void) {
    const visible = this.helpers.visible;
    this.helpers.visible = false;
    const cameras = [...this.objects.values()].filter((e) => e.data.assetId === 'camera');
    cameras.forEach((e) => { e.root.visible = false; });
    try {
      render();
    } finally {
      this.helpers.visible = visible;
      cameras.forEach((e) => { e.root.visible = e.data.visible; });
    }
  }

  private render() {
    const s = this.state;
    const now = performance.now();
    const helpers = s?.helpers ?? true;
    this.env.grid.visible = helpers;
    this.pathLine.visible = this.pathKeys.visible = helpers && (s?.shot.keyframes.length ?? 0) > 1;
    this.blockingPaths.visible = helpers;
    this.rigs.forEach((r) => { r.root.visible = helpers; });
    this.cones.forEach((c) => { c.visible = helpers; });
    const camera = this.lookThrough ? this.shotCamera : this.editorCamera;
    const moving = now - this.lastInteraction < 220;
    const wantsAO = !!s?.ambientOcclusion;
    this.roughFrame = wantsAO && moving;
    this.aoPass.enabled = wantsAO && !moving;
    this.renderPass.camera = this.aoPass.camera = this.outlinePass.renderCamera = this.hoverPass.renderCamera = camera;
    this.outlinePass.enabled = !this.lookThrough && this.outlinePass.selectedObjects.length > 0;
    this.hoverPass.enabled = !this.lookThrough && this.hoverPass.selectedObjects.length > 0;
    this.dofPass.enabled = this.lookThrough && !!s?.shot.dof?.enabled;
    if (this.shadowsDirty) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowsDirty = false;
    }
    if (this.lookThrough) this.cleanRender(() => this.composer.render());
    else this.composer.render();
    this.tags.visible = s?.nameTags ?? true;
    if (this.tags.visible) this.placeTags();
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.render(this.overlay, camera);
    this.renderer.autoClear = true;
    // The monitor ignores orbiting; while the set is being edited it refreshes at about 15 fps.
    if (!this.lookThrough && this.previewDirty && this.previewHost.clientWidth > 0 && now - this.lastPreview > (moving ? 66 : 0)) {
      this.preview.shadowMap.needsUpdate = this.previewShadowsDirty;
      this.previewShadowsDirty = false;
      this.previewDirty = false;
      this.lastPreview = now;
      this.cleanRender(() => this.preview.render(this.world, this.shotCamera));
    } else if (this.previewDirty) this.dirty = true;
  }

  captureEditor(): Pick<CameraKeyframe, 'position' | 'target' | 'lens'> {
    const s = this.state;
    return {
      position: this.editorCamera.position.toArray() as Vec3,
      target: this.orbit.target.toArray() as Vec3,
      lens: (s?.shot.sensorWidth ?? 36) / (2 * (s?.shot.aspectRatio ?? 16 / 9) * Math.tan(T.MathUtils.degToRad(this.editorCamera.fov) / 2)),
    };
  }
  viewShot() {
    const s = this.state;
    if (!s) return;
    const f = cameraAt(s.shot, s.time);
    this.flyTo(vec(f.position), vec(f.target), this.shotCamera.fov);
  }
  placement(): Vec3 {
    return [this.orbit.target.x, 0, this.orbit.target.z];
  }
  fit(id?: string) {
    const entry = id ? this.objects.get(id) : undefined;
    const bounds = new T.Box3();
    if (entry) bounds.setFromObject(entry.root);
    else for (const item of this.objects.values()) if (item.root.visible) bounds.expandByObject(item.root);
    if (bounds.isEmpty()) {
      bounds.min.set(-3, 0, -3);
      bounds.max.set(3, 2, 3);
    }
    const c = bounds.getCenter(new T.Vector3()), size = bounds.getSize(new T.Vector3());
    const radius = Math.max(0.6, size.length() / 2);
    const distance = (radius / Math.sin(T.MathUtils.degToRad(40) / 2)) * 0.72;
    const dir = this.editorCamera.position.clone().sub(this.orbit.target);
    if (dir.lengthSq() < 0.01 || dir.y / dir.length() > 0.98) dir.set(0.65, 0.6, 0.8);
    dir.y = Math.max(dir.y, dir.length() * 0.35);
    this.flyTo(c.clone().add(dir.normalize().multiplyScalar(distance)), c, 40);
  }
  topView() {
    const p = this.orbit.target.clone();
    const bounds = new T.Box3();
    for (const item of this.objects.values()) if (item.root.visible) bounds.expandByObject(item.root);
    const size = bounds.isEmpty() ? 10 : Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z);
    if (!bounds.isEmpty()) bounds.getCenter(p).setY(0);
    this.flyTo(new T.Vector3(p.x, size * 1.25 + 4, p.z + 0.01), p, 40);
  }

  private exportSurface(width: number, height?: number) {
    const s = this.state;
    if (!s) throw new Error('Select a shot first.');
    if (this.pendingModels) throw new Error('Wait for imported models to finish loading.');
    if (!this.exportRenderer) {
      this.exportRenderer = this.makeRenderer();
      this.exportRenderer.setPixelRatio(1);
      const composer = new EffectComposer(this.exportRenderer);
      const render = new RenderPass(this.world, this.shotCamera);
      const ao = new StageAOPass(this.world, this.shotCamera, 1, 1);
      ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.6, thickness: 2, scale: 1.5, samples: 16 });
      ao.blendIntensity = 1;
      const dof = new DepthOfFieldPass(this.world, this.shotCamera);
      composer.addPass(render);
      composer.addPass(ao);
      composer.addPass(dof);
      composer.addPass(new OutputPass());
      this.exportComposer = { composer, ao, render, dof };
    }
    height ??= Math.round(width / s.shot.aspectRatio);
    this.exportRenderer.setSize(width, height, false);
    this.exportComposer!.composer.setSize(width, height);
    this.exportComposer!.ao.enabled = s.ambientOcclusion;
    this.exportComposer!.dof.enabled = !!s.shot.dof?.enabled;
    this.updateFocus(cameraAt(s.shot, s.time), this.exportComposer!.dof);
    return this.exportRenderer;
  }
  private exportRender() {
    this.exportRenderer!.shadowMap.needsUpdate = true;
    this.cleanRender(() => this.exportComposer!.composer.render());
  }
  still(width = 1920): string {
    const r = this.exportSurface(width);
    this.exportRender();
    return r.domElement.toDataURL('image/png');
  }
  /**
   * Frame-accurate export: every frame is rendered and encoded in turn, so nothing drops and long
   * or 4K moves render as fast as the machine allows. Several shots play back to back as one film.
   */
  async renderVideo(options: VideoExportOptions, onProgress: (done: number, total: number, shot: PrevisShot) => void): Promise<Blob> {
    const s = this.state;
    if (!s || !options.shots.length) throw new Error('Select a shot first.');
    if (this.exportRun) throw new Error('An export is already running.');
    if (typeof VideoEncoder === 'undefined') throw new Error('Frame-accurate export needs the desktop app or Chrome.');
    const { Output, Mp4OutputFormat, WebMOutputFormat, BufferTarget, CanvasSource, QUALITY_HIGH, canEncodeVideo } = await import('mediabunny');
    const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
    const aspect = options.shots[0].aspectRatio;
    const width = even(options.width), height = even(options.width / aspect);
    const codec = options.format === 'mp4' ? 'avc' : 'vp9';
    if (!(await canEncodeVideo(codec, { width, height, bitrate: QUALITY_HIGH })))
      throw new Error(`This computer cannot encode ${options.format.toUpperCase()} at ${width}×${height}. Try a smaller size or the other format.`);
    const renderer = this.exportSurface(width, height);
    // Frames are copied to a 2D canvas, which also carries the optional burn-in.
    const frame = document.createElement('canvas');
    frame.width = width;
    frame.height = height;
    const ctx = frame.getContext('2d')!;
    const output = new Output({
      format: options.format === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
      target: new BufferTarget(),
    });
    const source = new CanvasSource(frame, { codec, bitrate: QUALITY_HIGH, keyFrameInterval: 1 });
    output.addVideoTrack(source, { frameRate: options.fps });
    const run = { canceled: false };
    this.exportRun = run;
    const counts = options.shots.map((shot) => Math.max(1, Math.round(shot.duration * options.fps)));
    const total = counts.reduce((a, b) => a + b, 0);
    let done = 0;
    try {
      await output.start();
      for (const [index, shot] of options.shots.entries()) {
        for (let i = 0; i < counts[index]; i++) {
          if (run.canceled) throw new Error('Video export canceled.');
          const time = Math.min(shot.duration, i / options.fps);
          this.poseForExport(shot, time, aspect);
          this.exportRender();
          ctx.drawImage(renderer.domElement, 0, 0);
          if (options.burnIn) drawBurnIn(ctx, width, height, options.label, shot, time, done / options.fps, options.fps);
          await source.add(done / options.fps, 1 / options.fps);
          done++;
          onProgress(done, total, shot);
          // Let the progress bar and the cancel button breathe.
          if (done % 6 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
      await output.finalize();
    } catch (error) {
      await output.cancel().catch(() => undefined);
      throw error;
    } finally {
      this.exportRun = undefined;
      this.restoreAfterExport();
    }
    const buffer = (output.target as InstanceType<typeof BufferTarget>).buffer;
    if (!buffer) throw new Error('The video could not be written.');
    return new Blob([buffer], { type: options.format === 'mp4' ? 'video/mp4' : 'video/webm' });
  }

  /** Stage one moment of any shot: its camera, lens, focus and blocking, framed to the export aspect. */
  private poseForExport(shot: PrevisShot, time: number, aspect: number) {
    const f = cameraAt(shot, time);
    orientCamera(this.shotCamera, f);
    this.shotCamera.aspect = aspect;
    this.shotCamera.fov = verticalFov(f.lens, shot.sensorWidth, aspect);
    this.shotCamera.updateProjectionMatrix();
    this.exportComposer!.dof.enabled = !!shot.dof?.enabled;
    this.updateFocus(f, this.exportComposer!.dof, shot);
    for (const [id, entry] of this.objects) {
      const keys = shot.blocking?.[id];
      const base = this.baseObjects.get(id) ?? entry.data;
      const pose = keys?.length ? objectPoseAt(keys, time, shot.ease) : base;
      entry.root.position.fromArray(pose.position);
      entry.root.rotation.set(...(pose.rotation.map((n) => (n * Math.PI) / 180) as Vec3));
    }
  }

  private restoreAfterExport() {
    for (const entry of this.objects.values()) {
      entry.root.position.fromArray(entry.data.position);
      entry.root.rotation.set(...(entry.data.rotation.map((n) => (n * Math.PI) / 180) as Vec3));
    }
    if (this.state) this.setTime(this.state.time);
    this.invalidate(true);
  }

  async video(onProgress: (time: number) => void): Promise<Blob> {
    if (this.recorder) throw new Error('An export is already running.');
    if (typeof MediaRecorder === 'undefined') throw new Error('Video export is unavailable in this browser. Open the Electron app or Chrome.');
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) throw new Error('WebM recording is unavailable in this browser.');
    const r = this.exportSurface(1280), duration = this.state!.shot.duration, initialTime = this.state!.time;
    this.setTime(0);
    this.exportRender();
    const stream = r.domElement.captureStream(24), chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8000000 });
    this.recorder = recorder;
    return new Promise((resolve, reject) => {
      let done = false;
      const cleanup = () => {
        done = true;
        clearTimeout(this.recordingTimer);
        stream.getTracks().forEach((t) => t.stop());
        this.recorder = undefined;
        this.cancelRecording = undefined;
        this.setTime(initialTime);
      };
      this.cancelRecording = () => {
        if (done) return;
        if (recorder.state !== 'inactive') recorder.stop();
        cleanup();
        reject(new Error('Video export canceled.'));
      };
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.onerror = () => {
        cleanup();
        reject(new Error('Video recording failed.'));
      };
      recorder.onstop = () => {
        if (done) return;
        cleanup();
        resolve(new Blob(chunks, { type: 'video/webm' }));
      };
      const start = performance.now();
      const tick = () => {
        if (done) return;
        const t = Math.min(duration, (performance.now() - start) / 1000);
        this.setTime(t);
        this.exportRender();
        onProgress(t);
        if (t >= duration) {
          recorder.stop();
          return;
        }
        this.recordingTimer = setTimeout(tick, 1000 / 24);
      };
      recorder.start();
      tick();
    });
  }
  stopExport() {
    if (this.exportRun) this.exportRun.canceled = true;
    this.cancelRecording?.();
  }

  dispose() {
    if (this.disposed) return;
    this.stopExport();
    clearTimeout(this.wheelTimer);
    clearTimeout(this.nudgeTimer);
    this.disposed = true;
    cancelAnimationFrame(this.animation);
    this.resizeObserver.disconnect();
    const host = this.host;
    host.removeEventListener('pointerdown', this.handleDown, { capture: true });
    host.removeEventListener('pointermove', this.handleMove);
    host.removeEventListener('pointerup', this.handleUp);
    host.removeEventListener('pointercancel', this.handleCancel);
    host.removeEventListener('pointerleave', this.handleLeave);
    host.removeEventListener('dblclick', this.handleDoubleClick);
    host.removeEventListener('wheel', this.handleCameraWheel);
    host.removeEventListener('dragover', this.handleDragOver);
    host.removeEventListener('dragleave', this.handleDragLeave);
    host.removeEventListener('drop', this.handleDrop);
    host.removeEventListener('contextmenu', this.preventContextMenu);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    window.removeEventListener('keydown', this.navigationDown);
    window.removeEventListener('keyup', this.navigationUp);
    window.removeEventListener('blur', this.stopNavigation);
    this.navigationKeys.clear();
    this.transform.dispose();
    this.orbit.dispose();
    this.rigs.forEach((r) => r.dispose());
    this.env.dispose();
    this.composer.dispose();
    this.aoPass.dispose();
    this.outlinePass.dispose();
    this.hoverPass.dispose();
    this.dofPass.dispose();
    this.exportComposer?.dof.dispose();
    this.exportComposer?.composer.dispose();
    this.exportComposer?.ao.dispose();
    disposeObject(this.world);
    for (const r of [this.renderer, this.preview, this.exportRenderer])
      if (r) {
        r.dispose();
        r.forceContextLoss();
        r.domElement.remove();
      }
    this.objects.clear();
  }
}
