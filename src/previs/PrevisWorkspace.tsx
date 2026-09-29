import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { v4 as uuid } from 'uuid';
import * as T from 'three';
import type { Scene, SceneElement, ShotListProject } from '../types';
import type { CameraKeyframe, PrevisAsset, PrevisObject, PrevisScene, PrevisShot, Vec3 } from './types';
import { assetById, assetCategories, emitsLight, kelvinToHex, previsAssets } from './catalog';
import {
  addAsset,
  applyBlocking,
  cameraAt,
  clearObjectKeys,
  setObjectKey,
  transformAtTime,
  clamp,
  createPrevisShot,
  downloadBlob,
  lightDefaults,
  resizeDuration,
  matchDiagramFootprints,
  resolveObjects,
  safeFileName,
  setKeyframe,
  updateObject,
} from './model';
import { ASSET_DRAG_TYPE, CAMERA_SELECTION, PrevisEngine, parseGlb, type TransformMode } from './engine';
import { disposeObject } from './geometry';
import { createThumbnails } from './thumbnails';
import { describePose, frameSubject, type CameraGesture } from './cameraControls';
import { useWorkspacePanels } from '../hooks/useWorkspacePanels';
import './previs.css';

interface Props {
  scene: Scene;
  elements: SceneElement[];
  data: PrevisScene;
  shotList: ShotListProject;
  activeShotId: string | null;
  onActiveShotChange: (id: string) => void;
  onChange: (data: PrevisScene, elements: SceneElement[]) => void;
  onLinkShot: (shotId: string, cameraId: string) => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  toast: (message: string) => void;
  /** Shot-list numbers for cameras that stage a listed shot. */
  shotLabels?: Record<string, string>;
}

type Guide = 'thirds' | 'safe' | 'center';
type MonitorSize = 'small' | 'large' | 'hidden';
interface ExportSettings {
  scope: 'shot' | 'all';
  format: 'mp4' | 'webm';
  width: number;
  fps: number;
  burnIn: boolean;
}
const DEFAULT_EXPORT: ExportSettings = { scope: 'shot', format: 'mp4', width: 1920, fps: 24, burnIn: false };
const LENSES = [14, 18, 24, 35, 50, 85, 135];
const F_STOPS = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16];
/** Near and far limits of acceptable sharpness, with a circle of confusion scaled to the sensor. */
function focusRange(lens: number, fStop: number, focus: number, sensorWidth: number) {
  const f = lens / 1000, coc = (0.03 / 36) * (sensorWidth / 1000);
  const hyperfocal = (f * f) / (fStop * coc) + f;
  return {
    near: (focus * (hyperfocal - f)) / (hyperfocal + focus - 2 * f),
    far: focus >= hyperfocal ? Infinity : (focus * (hyperfocal - f)) / (hyperfocal - focus),
  };
}
const HEIGHTS: [string, number][] = [['Ground', 0.25], ['Low', 0.8], ['Chest', 1.3], ['Eye', 1.6], ['High', 2.5], ['Overhead', 5]];
const FORMATS: [number, string][] = [[16 / 9, '16:9'], [2.39, '2.39:1 Scope'], [1.85, '1.85:1 Flat'], [2, '2:1'], [4 / 3, '4:3'], [1, '1:1'], [9 / 16, '9:16 Vertical']];
const TIMES_OF_DAY: { label: string; patch: Partial<PrevisScene> }[] = [
  { label: 'Morning', patch: { sunAzimuth: 110, sunElevation: 18, daylightIntensity: 2.2, ambientIntensity: 1, backgroundColor: '#8fa3ad' } },
  { label: 'Noon', patch: { sunAzimuth: 180, sunElevation: 65, daylightIntensity: 3, ambientIntensity: 1.3, backgroundColor: '#8ea9bb' } },
  { label: 'Golden hour', patch: { sunAzimuth: 255, sunElevation: 7, daylightIntensity: 2.4, ambientIntensity: 0.7, backgroundColor: '#b28d74' } },
  { label: 'Overcast', patch: { sunAzimuth: 200, sunElevation: 55, daylightIntensity: 0.5, ambientIntensity: 1.8, backgroundColor: '#8c9294' } },
  { label: 'Studio', patch: { sunAzimuth: 225, sunElevation: 50, daylightIntensity: 0.35, ambientIntensity: 0.6, backgroundColor: '#26292e' } },
  { label: 'Night', patch: { sunAzimuth: 300, sunElevation: 35, daylightIntensity: 0.12, ambientIntensity: 0.18, backgroundColor: '#111824' } },
];

const capturePointer = (el: HTMLElement, id: number) => {
  try {
    el.setPointerCapture(id);
  } catch {
    /* The pointer already ended; the drag still completes on pointerup. */
  }
};
const readPref = <V extends string>(key: string, fallback: V): V => {
  try {
    return (localStorage.getItem(`pv-${key}`) as V) || fallback;
  } catch {
    return fallback;
  }
};
const writePref = (key: string, value: string) => {
  try {
    localStorage.setItem(`pv-${key}`, value);
  } catch {
    /* Preferences are a convenience only. */
  }
};

function NumberField({ label, value, onChange, min, max, step = 0.1, unit = '', displayLabel }: {
  label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; unit?: string; displayLabel?: string;
}) {
  // Keep partially typed values local; commit once on blur or Enter to preserve useful undo steps.
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft.trim() !== '') {
      const n = Number(draft);
      if (Number.isFinite(n)) onChange(clamp(n, min ?? -10000, max ?? 10000));
    }
    setDraft(null);
  };
  return (
    <label className="pv-number">
      <span>{displayLabel ?? label}</span>
      <div>
        <input
          type="number"
          aria-label={label}
          value={draft ?? Number(value.toFixed(3))}
          min={min}
          max={max}
          step={step}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setDraft(null);
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        />
        {unit && <small>{unit}</small>}
      </div>
    </label>
  );
}

/** A slider that previews while dragging and commits one undo step on release. */
function Slider({ label, value, min, max, step = 1, unit = '', onCommit, format }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string; onCommit: (n: number) => void; format?: (n: number) => string;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  const commit = () => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };
  return (
    <label className="pv-slider">
      <span>{label}<output>{format ? format(shown) : `${Math.round(shown * 10) / 10}${unit}`}</output></span>
      <input type="range" aria-label={label} min={min} max={max} step={step} value={shown}
        onChange={(e) => setDraft(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
    </label>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="pv-field">
      {label}
      <input
        aria-label={label}
        value={draft ?? value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null && draft !== value) onChange(draft);
          setDraft(null);
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      />
    </label>
  );
}

function VectorFields({ label, value, onChange, dimensions = false }: { label: string; value: Vec3; onChange: (v: Vec3) => void; dimensions?: boolean }) {
  return (
    <div className="pv-vector">
      <span className="pv-label">{label}</span>
      <div>
        {value.map((n, i) => (
          <NumberField
            key={i}
            label={`${label} ${dimensions ? ['W', 'H', 'D'][i] : ['X', 'Y', 'Z'][i]}`}
            displayLabel={dimensions ? ['Width', 'Height', 'Depth'][i] : ['X', 'Height', 'Z'][i]}
            value={n}
            min={dimensions ? 0.01 : -1000}
            max={1000}
            unit="m"
            onChange={(v) => onChange(value.map((old, j) => (i === j ? v : old)) as Vec3)}
          />
        ))}
      </div>
    </div>
  );
}

function Section({ title, children, defaultOpen = true, aside }: { title: string; children: ReactNode; defaultOpen?: boolean; aside?: ReactNode }) {
  return (
    <details className="pv-section" open={defaultOpen}>
      <summary><span>{title}</span>{aside}</summary>
      <div className="pv-section-body">{children}</div>
    </details>
  );
}

function FrameGuides({ guides, aspect }: { guides: Set<Guide>; aspect: number }) {
  return (
    <>
      {guides.has('thirds') && <div className="pv-thirds"><i /><i /><i /><i /></div>}
      {guides.has('safe') && <><div className="pv-safe pv-safe-action" style={{ aspectRatio: aspect }} /><div className="pv-safe pv-safe-title" style={{ aspectRatio: aspect }} /></>}
      {guides.has('center') && <span className="pv-frame-center">+</span>}
    </>
  );
}

export default function PrevisWorkspace({
  scene, elements, data, shotList, activeShotId, onActiveShotChange, onChange, onLinkShot, onSave, onUndo, onRedo, canUndo, canRedo, toast, shotLabels = {},
}: Props) {
  const host = useRef<HTMLDivElement>(null),
    previewHost = useRef<HTMLDivElement>(null),
    engine = useRef<PrevisEngine | null>(null),
    track = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<'library' | 'set'>('library');
  const [inspector, setInspector] = useState<'object' | 'camera' | 'scene'>('camera');
  const [search, setSearch] = useState(''),
    [category, setCategory] = useState('All');
  const [mode, setMode] = useState<TransformMode>('translate'),
    [snap, setSnap] = useState(true);
  const panels = useWorkspacePanels();
  const { leftOpen: libraryOpen, rightOpen: inspectorOpen } = panels;
  const [cameraGesture, setCameraGesture] = useState<CameraGesture>('look');
  const [lookThrough, setLookThrough] = useState(false),
    [helpers, setHelpers] = useState(true),
    [guides, setGuides] = useState<Set<Guide>>(() => new Set(readPref('guides', 'thirds').split(',').filter(Boolean) as Guide[])),
    [ambientOcclusion, setAmbientOcclusion] = useState(() => readPref('ao', 'on') === 'on'),
    [nameTags, setNameTags] = useState(() => readPref('tags', 'on') === 'on'),
    [viewMenu, setViewMenu] = useState(false),
    [monitor, setMonitor] = useState<MonitorSize>(() => readPref('monitor', 'small'));
  const [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false),
    [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportSettings, setExportSettings] = useState<ExportSettings>(() => {
    try {
      return { ...DEFAULT_EXPORT, ...JSON.parse(localStorage.getItem('pv-export') ?? '{}') };
    } catch {
      return DEFAULT_EXPORT;
    }
  });
  const [exportProgress, setExportProgress] = useState<{ done: number; total: number; shot: string } | null>(null);
  const [keyDrag, setKeyDrag] = useState<{ id: string; time: number } | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [hintHidden, setHintHidden] = useState(() => readPref<string>('hint', '') === 'hidden');
  const importRef = useRef<HTMLInputElement>(null);
  const [autoKey, setAutoKey] = useState(() => readPref('autokey', 'on') === 'on');
  const [objectKeyDrag, setObjectKeyDrag] = useState<{ id: string; time: number } | null>(null);
  const baseObjects = useMemo(() => resolveObjects(data, elements), [data, elements]);
  const shot = data.shots.find((s) => s.id === activeShotId) ?? data.shots[0];
  const playhead = Math.min(time, shot.duration);
  // Objects where they stand at the playhead of this shot.
  const objects = useMemo(() => applyBlocking(baseObjects, shot, playhead), [baseObjects, shot, playhead]);
  const live = useRef({ data, elements, onChange, toast, objects, shotId: shot.id, time: playhead, autoKey });
  const cameraSelected = selectedId === CAMERA_SELECTION;
  const selected = cameraSelected ? undefined : objects.find((o) => o.id === selectedId);
  const selectedKeys = selected ? shot.blocking?.[selected.id] ?? [] : [];
  const frame = cameraAt(shot, playhead);
  const pose = describePose(frame);
  const onKeyframe = shot.keyframes.find((f) => Math.abs(f.time - playhead) < 0.03);
  const linkedShots = shotList.scenes.flatMap((s) => s.shots).filter((s) => s.previsShotId === shot.id);

  useEffect(() => {
    live.current = { data, elements, onChange, toast, objects, shotId: shot.id, time: playhead, autoKey };
  }, [data, elements, onChange, toast, objects, shot.id, playhead, autoKey]);
  useEffect(() => writePref('autokey', autoKey ? 'on' : 'off'), [autoKey]);
  useEffect(() => writePref('export', JSON.stringify(exportSettings)), [exportSettings]);
  useEffect(() => writePref('guides', [...guides].join(',')), [guides]);
  useEffect(() => writePref('ao', ambientOcclusion ? 'on' : 'off'), [ambientOcclusion]);
  useEffect(() => writePref('tags', nameTags ? 'on' : 'off'), [nameTags]);
  useEffect(() => writePref('monitor', monitor), [monitor]);

  const placeAsset = (assetId: string, position: Vec3) => {
    const a = assetById.get(assetId);
    if (!a) return;
    const c = live.current;
    let p: Vec3 = [...position];
    while (c.objects.some((o) => Math.abs(o.position[0] - p[0]) < 0.1 && Math.abs(o.position[2] - p[2]) < 0.1 && Math.abs(o.position[1] - p[1]) < 0.1))
      p = [p[0] + 0.6, p[1], p[2] + 0.6];
    const next = addAsset(c.data, c.elements, a, p);
    c.onChange(next.previs, next.elements);
    setSelectedId(next.objectId);
    setLookThrough(false);
    setInspector('object');
  };
  const placeRef = useRef(placeAsset);
  useEffect(() => { placeRef.current = placeAsset; });
  const pickAsset = useCallback((id: string) => placeRef.current(id, engine.current?.placement() ?? [0, 0, 0]), []);

  useEffect(() => {
    if (!host.current || !previewHost.current) return;
    let instance: PrevisEngine;
    try {
      instance = new PrevisEngine(host.current, previewHost.current, {
        onSelect: (id) => {
          setSelectedId(id);
          if (id === CAMERA_SELECTION) setInspector('camera');
          else if (id) setInspector('object');
        },
        onSelectShot: (id) => {
          setPlaying(false);
          onActiveShotChange(id);
        },
        onTransform: (id, patch) => {
          const c = live.current;
          const next = transformAtTime(c.data, c.elements, c.shotId, c.time, id, patch, c.autoKey);
          c.onChange(next.previs, next.elements);
        },
        onError: (message) => setError(message),
        onCameraChange: (shotId, at, pose) => {
          const c = live.current;
          c.onChange({
            ...c.data,
            shots: c.data.shots.map((s) => (s.id === shotId ? setKeyframe(s, { ...cameraAt(s, at), ...pose, id: uuid(), time: at }) : s)),
          }, c.elements);
        },
        onDropAsset: (assetId, position) => placeRef.current(assetId, position),
      });
      engine.current = instance;
      const idle = window.setTimeout(() => {
        try {
          setThumbnails(createThumbnails());
        } catch {
          /* Library names remain available on low-memory devices. */
        }
      }, 120);
      return () => {
        clearTimeout(idle);
        instance.dispose();
        engine.current = null;
      };
    } catch (e) {
      // Defer the initialization error so StrictMode can clean up the failed mount.
      queueMicrotask(() => setError(`3D could not start. ${e instanceof Error ? e.message : 'WebGL is unavailable.'}`));
    }
    // The engine is created once; callbacks read the latest document through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    engine.current?.update({
      data, objects, baseObjects, shots: data.shots, shot, time: playhead, selected: selectedId, mode, snap, lookThrough, helpers,
      cameraGesture, cameraEditable: !playing && !exporting, ambientOcclusion, nameTags,
    });
  }, [data, objects, baseObjects, shot, playhead, selectedId, mode, snap, lookThrough, helpers, cameraGesture, playing, exporting, ambientOcclusion, nameTags]);
  useEffect(() => {
    engine.current?.fit();
  }, []);

  useEffect(() => {
    if (!playing) return;
    const start = performance.now(), initial = playhead;
    let raf = 0;
    const tick = () => {
      const next = initial + (performance.now() - start) / 1000;
      if (next >= shot.duration) {
        setTime(shot.duration);
        setPlaying(false);
        return;
      }
      setTime(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // The starting time is sampled once; changing shots pauses playback in its event handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, shot.id, shot.duration]);

  const commit = (next: PrevisScene, nextElements = elements) => onChange(next, nextElements);
  const patchShot = (patch: Partial<PrevisShot>) =>
    commit({ ...data, shots: data.shots.map((s) => (s.id === shot.id ? { ...s, ...patch } : s)) });
  const patchObject = (patch: Partial<PrevisObject>) => {
    if (!selected || selected.locked) return;
    const next = transformAtTime(data, elements, shot.id, playhead, selected.id, patch, autoKey);
    commit(next.previs, next.elements);
  };
  const patchObjectKeys = (update: (s: PrevisShot) => PrevisShot) => commit({ ...data, shots: data.shots.map((s) => (s.id === shot.id ? update(s) : s)) });
  const patchFrame = (patch: Partial<CameraKeyframe>) => {
    patchShot(setKeyframe(shot, { ...frame, ...patch, id: uuid(), time: playhead }));
  };
  const chooseShot = (id: string) => {
    setPlaying(false);
    setTime(0);
    setReferenceOpen(false);
    onActiveShotChange(id);
    setInspector('camera');
  };
  const addShot = () => {
    const view = engine.current?.captureEditor();
    const s = createPrevisShot(`Shot ${String(data.shots.length + 1).padStart(2, '0')}`, view?.position, view?.target);
    if (view) s.keyframes[0].lens = clamp(Math.round(view.lens), 8, 300);
    commit({ ...data, shots: [...data.shots, s] });
    chooseShot(s.id);
  };
  const deleteSelected = () => {
    if (!selected || selected.locked) return;
    commit({
      ...data,
      objects: data.objects.filter((o) => o.id !== selected.id),
      shots: data.shots.map((s) => clearObjectKeys(s, selected.id)),
    }, elements.filter((e) => e.id !== selected.sourceElementId));
    setSelectedId(null);
  };
  const deleteKeyframe = (id: string) => {
    if (shot.keyframes.length <= 1) return;
    patchShot({ keyframes: shot.keyframes.filter((k) => k.id !== id) });
  };
  const duplicateSelected = () => {
    if (!selected) return;
    const o = {
      ...selected,
      id: uuid(),
      position: [selected.position[0] + 0.5, selected.position[1], selected.position[2] + 0.5] as Vec3,
      label: `${selected.label} copy`,
    };
    const source = elements.find((e) => e.id === selected.sourceElementId);
    const nextElements = source
      ? [...elements, { ...source, id: uuid(), label: o.label, x: source.x + data.unitsPerMeter * 0.5, y: source.y + data.unitsPerMeter * 0.5, zIndex: Math.max(...elements.map((e) => e.zIndex)) + 1 }]
      : elements;
    o.sourceElementId = source ? nextElements[nextElements.length - 1].id : undefined;
    if (source) o.diagramSize = [source.width * Math.abs(source.scaleX), source.height * Math.abs(source.scaleY)];
    commit({ ...data, objects: [...data.objects, o] }, nextElements);
    setSelectedId(o.id);
  };
  const enterCamera = (on: boolean) => {
    setLookThrough(on);
    setPlaying(false);
    setViewMenu(false);
    if (on) setInspector('camera');
  };
  const togglePlay = () => {
    if (time >= shot.duration) setTime(0);
    setPlaying((p) => !p);
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || document.querySelector('dialog[open]') || e.target instanceof HTMLInputElement && e.target.type !== 'range' ||
        e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable) || exporting || referenceOpen || exportOpen) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) onRedo();
        else onUndo();
        return;
      }
      if (mod && k === 'd') {
        e.preventDefault();
        duplicateSelected();
        return;
      }
      if (mod) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (selected) deleteSelected();
        else if (lookThrough && onKeyframe) deleteKeyframe(onKeyframe.id);
      }
      if (e.key === 'Escape') {
        setViewMenu(false);
        if (lookThrough) enterCamera(false);
        else setSelectedId(null);
        setPlaying(false);
      }
      if (e.key === '1') setMode('translate');
      if (e.key === '2') setMode('rotate');
      if (e.key === '3') setMode('scale');
      if (k === 'f') {
        setLookThrough(false);
        engine.current?.fit(selected?.id);
      }
      if (k === 't') {
        setLookThrough(false);
        engine.current?.topView();
      }
      if (k === 'c') enterCamera(!lookThrough);
      if (k === 'k') {
        patchFrame({});
        toast('Keyframe set at the playhead.');
      }
      if (k === 'g') setHelpers((v) => !v);
      if (e.code === 'Backslash') {
        e.preventDefault();
        panels.toggleBoth();
      }
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      }
      if (e.key === ',' || e.key === '.') {
        const frames = [...shot.keyframes].sort((a, b) => a.time - b.time);
        const next = e.key === '.' ? frames.find((f) => f.time > playhead + 0.01) : [...frames].reverse().find((f) => f.time < playhead - 0.01);
        if (next) {
          setPlaying(false);
          setTime(next.time);
        }
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const capture = () => {
    if (!engine.current || exporting) return;
    try {
      const png = engine.current.still();
      const thumbnail = engine.current.still(480);
      patchShot({ reference: { dataUrl: thumbnail, time, createdAt: new Date().toISOString() } });
      const link = document.createElement('a');
      link.href = png;
      link.download = `${safeFileName(scene.name)}_${safeFileName(shot.name)}.png`;
      link.click();
      toast('PNG exported. Reference thumbnail saved with this shot.');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not export this frame.');
    }
  };
  const exportVideo = async (options: ExportSettings) => {
    if (!engine.current) return;
    setExportOpen(false);
    setPlaying(false);
    setExporting(true);
    const initial = time;
    const shots = options.scope === 'all' ? data.shots : [shot];
    const name = options.scope === 'all' ? `${safeFileName(scene.name)}_all-shots` : `${safeFileName(scene.name)}_${safeFileName(shot.name)}`;
    try {
      if (typeof VideoEncoder === 'undefined') {
        // Browsers without WebCodecs fall back to real-time WebM recording of the active shot.
        const blob = await engine.current.video((t) => setTime(t));
        downloadBlob(blob, `${name}.webm`);
        toast('Clip exported as WebM (real-time recording).');
        return;
      }
      const blob = await engine.current.renderVideo(
        { shots, width: options.width, fps: options.fps, format: options.format, burnIn: options.burnIn, label: scene.name },
        (done, total, current) => setExportProgress({ done, total, shot: current.name }),
      );
      downloadBlob(blob, `${name}.${options.format}`);
      toast(`${shots.length > 1 ? `${shots.length} shots` : 'Shot'} exported as ${options.format.toUpperCase()}.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Video export failed.');
    } finally {
      setExporting(false);
      setExportProgress(null);
      setTime(initial);
    }
  };
  const importModel = async (file?: File) => {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      toast('Choose a self-contained GLB smaller than 25 MB.');
      return;
    }
    setImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const model = await parseGlb(buffer);
      const b = new T.Box3().setFromObject(model);
      const s = b.getSize(new T.Vector3());
      disposeObject(model);
      if (s.length() < 0.0001) throw new Error('This model has no usable geometry.');
      const modelData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Could not read the model.'));
        reader.readAsDataURL(new Blob([buffer], { type: 'model/gltf-binary' }));
      });
      // Read the latest document after parsing, so edits made during import are preserved.
      const c = live.current;
      const result = addAsset(c.data, c.elements, {
        id: 'imported',
        name: file.name.replace(/\.glb$/i, ''),
        category: 'Imported',
        shape: 'box',
        dimensions: [Math.max(s.x, 0.01), Math.max(s.y, 0.01), Math.max(s.z, 0.01)],
        color: '#9a9d9f',
        diagramType: 'box-crate',
      }, engine.current?.placement() ?? [0, 0, 0]);
      result.previs.objects[result.previs.objects.length - 1].modelData = modelData;
      c.onChange(result.previs, result.elements);
      setSelectedId(result.objectId);
      setInspector('object');
      toast('Model imported and embedded in the scene.');
    } catch (e) {
      toast(`Import failed: ${e instanceof Error ? e.message : 'unsupported model'}`);
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = '';
    }
  };

  // Keyframes retime by dragging along the track; one undo step per drag.
  const startKeyDrag = (e: React.PointerEvent, f: { id: string; time: number }, lane: 'camera' | 'object' = 'camera') => {
    e.preventDefault();
    e.stopPropagation();
    setPlaying(false);
    setTime(f.time);
    const rect = track.current!.getBoundingClientRect();
    const target = e.currentTarget as HTMLElement;
    capturePointer(target, e.pointerId);
    let current = f.time;
    const laneKeys: { id: string; time: number }[] = lane === 'camera' ? shot.keyframes : selectedKeys;
    const others = laneKeys.filter((k) => k.id !== f.id).map((k) => k.time);
    const setDrag = lane === 'camera' ? setKeyDrag : setObjectKeyDrag;
    const objectId = selected?.id;
    const move = (ev: PointerEvent) => {
      let t = clamp(((ev.clientX - rect.left) / rect.width) * shot.duration, 0, shot.duration);
      if (!ev.altKey) t = Math.round(t * 24) / 24; // snap to frames at 24 fps
      if (others.some((o) => Math.abs(o - t) < 0.04)) return;
      current = t;
      setDrag({ id: f.id, time: t });
      setTime(t);
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      setDrag(null);
      if (Math.abs(current - f.time) <= 0.001) return;
      if (lane === 'camera') patchShot({ keyframes: shot.keyframes.map((k) => (k.id === f.id ? { ...k, time: current } : k)).sort((a, b) => a.time - b.time) });
      else if (objectId)
        patchShot({ blocking: { ...shot.blocking, [objectId]: selectedKeys.map((k) => (k.id === f.id ? { ...k, time: current } : k)).sort((a, b) => a.time - b.time) } });
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };
  const scrub = (e: React.PointerEvent) => {
    const rect = track.current!.getBoundingClientRect();
    const set = (x: number) => setTime(clamp(Math.round(((x - rect.left) / rect.width) * shot.duration * 24) / 24, 0, shot.duration));
    setPlaying(false);
    set(e.clientX);
    const target = e.currentTarget as HTMLElement;
    capturePointer(target, e.pointerId);
    const move = (ev: PointerEvent) => set(ev.clientX);
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };
  const tickStep = shot.duration <= 6 ? 0.5 : shot.duration <= 20 ? 1 : shot.duration <= 90 ? 5 : shot.duration <= 600 ? 30 : 120;
  const ticks = Array.from({ length: Math.floor(shot.duration / tickStep) + 1 }, (_, i) => i * tickStep);

  const filteredAssets = useMemo(() => previsAssets.filter(
    (a) => (category === 'All' || a.category === category) && `${a.name} ${a.tags ?? ''} ${a.category}`.toLowerCase().includes(search.toLowerCase()),
  ), [category, search]);
  const warnings = objects.filter((o) => o.assetId === 'placeholder').length;
  const toggleGuide = (g: Guide) => setGuides((prev) => {
    const next = new Set(prev);
    if (next.has(g)) next.delete(g);
    else next.add(g);
    return next;
  });
  const gateStyle = { aspectRatio: shot.aspectRatio, width: `min(100cqw, ${shot.aspectRatio * 100}cqh)` };
  const hfov = (2 * Math.atan(shot.sensorWidth / (2 * frame.lens)) * 180) / Math.PI;

  return (
    <div className={`pv-workspace ${libraryOpen ? '' : 'pv-library-closed'} ${inspectorOpen ? '' : 'pv-inspector-closed'} ${lookThrough ? 'pv-composing' : ''}`}>
      <fieldset className="pv-workbench" disabled={exporting}>
        <aside className="pv-library" aria-label="Set library">
          <div className="pv-tabs">
            <button className={panel === 'library' ? 'active' : ''} onClick={() => setPanel('library')}>Library</button>
            <button className={panel === 'set' ? 'active' : ''} onClick={() => setPanel('set')}>In scene <small>{objects.length}</small></button>
            <button className="pv-close" aria-label="Close asset library" onClick={() => panels.closeLeft()}>×</button>
          </div>
          {panel === 'library' ? (
            <>
              <div className="pv-library-tools">
                <input aria-label="Search 3D assets" placeholder="Search people, props, sets…" value={search} onChange={(e) => setSearch(e.target.value)} />
                <div className="pv-chips" role="group" aria-label="Asset category">
                  {['All', ...assetCategories].map((c) => (
                    <button key={c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>{c}</button>
                  ))}
                </div>
              </div>
              <AssetGrid assets={filteredAssets} thumbnails={thumbnails} onPick={pickAsset} />
              <div className="pv-library-footer">
                <button onClick={() => importRef.current?.click()} disabled={importing}>{importing ? 'Importing…' : '＋ Import GLB model'}</button>
                <p>Drag assets into the set to place them on floors or table tops.</p>
                <input hidden type="file" accept=".glb" ref={importRef} onChange={(e) => void importModel(e.target.files?.[0])} />
              </div>
            </>
          ) : (
            <div className="pv-object-list">
              {objects.map((o) => (
                <div key={o.id} className={`pv-object-row ${selectedId === o.id ? 'active' : ''} ${o.visible ? '' : 'pv-hidden'}`}>
                  <button className="pv-object-select" onClick={() => { setSelectedId(o.id); setInspector('object'); }} onDoubleClick={() => engine.current?.fit(o.id)}>
                    {thumbnails[o.assetId] ? <img src={thumbnails[o.assetId]} alt="" /> : <i />}
                    <span>{o.label}<small>{assetById.get(o.assetId)?.name ?? 'Stand-in'}{o.sourceElementId ? '' : ' · 3D only'}</small></span>
                  </button>
                  <button title={o.visible ? 'Hide' : 'Show'} aria-label={`${o.visible ? 'Hide' : 'Show'} ${o.label}`}
                    onClick={() => { const n = updateObject(data, elements, o.id, { visible: !o.visible }); commit(n.previs, n.elements); }}>
                    {o.visible ? <Eye /> : <EyeOff />}
                  </button>
                  <button title={o.locked ? 'Unlock' : 'Lock'} aria-label={`${o.locked ? 'Unlock' : 'Lock'} ${o.label}`} className={o.locked ? 'active' : ''}
                    onClick={() => { const n = updateObject(data, elements, o.id, { locked: !o.locked }); commit(n.previs, n.elements); }}>
                    <Lock open={!o.locked} />
                  </button>
                </div>
              ))}
              {!objects.length && <p className="pv-empty">Add an asset to start building your set.</p>}
            </div>
          )}
        </aside>

        <main className="pv-center">
          <div className="pv-bar">
            <button className="pv-icon-button" aria-label="Toggle asset library" aria-pressed={libraryOpen} onClick={() => panels.toggleLeft()} title="Library (\)"><PanelIcon side="left" /></button>
            <div className="pv-segment pv-mode-switch" role="group" aria-label="Workspace mode">
              <button className={!lookThrough ? 'active' : ''} onClick={() => enterCamera(false)} title="Build the set (C)">Set</button>
              <button className={lookThrough ? 'active' : ''} onClick={() => enterCamera(true)} title="Look through the shot camera (C)">Camera</button>
            </div>
            <span className="pv-divider" />
            {lookThrough ? (
              <div className="pv-segment" role="group" aria-label="Camera gesture">
                {(['look', 'truck', 'orbit'] as const).map((g, i) => (
                  <button key={g} className={cameraGesture === g ? 'active' : ''} onClick={() => setCameraGesture(g)}
                    title={['Drag to pan and tilt from a fixed position', 'Drag to slide sideways and up/down (also Shift-drag)', 'Drag to circle around the aim point'][i]}>
                    {['Pan · tilt', 'Truck · pedestal', 'Orbit'][i]}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <div className="pv-segment" role="group" aria-label="Transform tool">
                  {(['translate', 'rotate', 'scale'] as const).map((m, i) => (
                    <button key={m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)} title={`${['Move', 'Rotate', 'Resize'][i]} (${i + 1})`}>
                      {['Move', 'Rotate', 'Resize'][i]}
                    </button>
                  ))}
                </div>
                <button className={`pv-toggle ${snap ? 'active' : ''}`} aria-pressed={snap} onClick={() => setSnap((s) => !s)} title="Snap to 10 cm and 15°">Snap</button>
              </>
            )}
            <div className="pv-bar-end">
              {!lookThrough && <>
                <button onClick={() => engine.current?.fit(selected?.id)} title="Frame the set or selection (F)">Fit</button>
                <button onClick={() => engine.current?.topView()} title="Plan view from above (T)">Top</button>
              </>}
              <div className="pv-menu-anchor">
                <button className={viewMenu ? 'active' : ''} aria-expanded={viewMenu} onClick={() => setViewMenu((v) => !v)}>View ▾</button>
                {viewMenu && (
                  <div className="pv-menu" role="menu" onMouseLeave={() => setViewMenu(false)}>
                    <span className="pv-eyebrow">SET VIEW</span>
                    <label><input type="checkbox" checked={helpers} onChange={(e) => setHelpers(e.target.checked)} /> Grid, cameras &amp; light beams <kbd>G</kbd></label>
                    <label><input type="checkbox" checked={ambientOcclusion} onChange={(e) => setAmbientOcclusion(e.target.checked)} /> Contact shadows (AO)</label>
                    <label><input type="checkbox" checked={nameTags} onChange={(e) => setNameTags(e.target.checked)} /> Actor names</label>
                    <span className="pv-eyebrow">FRAME GUIDES</span>
                    <label><input type="checkbox" checked={guides.has('thirds')} onChange={() => toggleGuide('thirds')} /> Rule of thirds</label>
                    <label><input type="checkbox" checked={guides.has('safe')} onChange={() => toggleGuide('safe')} /> Action &amp; title safe</label>
                    <label><input type="checkbox" checked={guides.has('center')} onChange={() => toggleGuide('center')} /> Centre mark</label>
                  </div>
                )}
              </div>
              <span className="pv-divider" />
              <button className="pv-icon-button" onClick={onUndo} disabled={!canUndo} title="Undo (⌘Z)" aria-label="Undo">↶</button>
              <button className="pv-icon-button" onClick={onRedo} disabled={!canRedo} title="Redo (⌘⇧Z)" aria-label="Redo">↷</button>
              <button className="pv-icon-button" aria-label="Toggle inspector" aria-pressed={inspectorOpen} onClick={() => panels.toggleRight()} title="Inspector (\)"><PanelIcon side="right" /></button>
            </div>
          </div>
          <div className={`pv-viewport ${lookThrough ? 'pv-camera-view' : ''}`}>
            <div className="pv-render-host" ref={host} aria-label="3D scene viewport" onPointerDown={() => { if (!hintHidden) { setHintHidden(true); writePref('hint', 'hidden'); } }} />
            <div className="pv-view-label">
              <span className={`pv-live-dot ${lookThrough ? 'rec' : ''}`} />
              {lookThrough ? shot.name : 'Set view'}
              {!lookThrough && selected && <small>{selected.label}{selected.locked ? ' · locked' : ''}</small>}
            </div>
            {lookThrough && (
              <>
                <div className="pv-frame-guides" style={gateStyle}><FrameGuides guides={guides} aspect={shot.aspectRatio} /></div>
                <div className="pv-hud" aria-label="Camera readout">
                  <span><b>{Math.round(frame.lens)}</b>mm</span>
                  <span><b>{pose.height.toFixed(2)}</b>m high</span>
                  <span><b>{pose.tilt >= 0 ? '+' : ''}{pose.tilt.toFixed(0)}°</b>tilt</span>
                  {Math.abs(frame.roll ?? 0) > 0.05 && <span><b>{(frame.roll ?? 0).toFixed(1)}°</b>dutch</span>}
                  <span><b>{pose.distance.toFixed(1)}</b>m to aim</span>
                  <span><b>{hfov.toFixed(0)}°</b>h-fov</span>
                  <span className={onKeyframe ? 'pv-on-key' : ''}>{onKeyframe ? '◆ on keyframe' : '◇ edits add a keyframe'}</span>
                </div>
                <div className="pv-lens-bar" role="group" aria-label="Focal length">
                  {LENSES.map((n) => (
                    <button key={n} className={Math.abs(frame.lens - n) < 0.5 ? 'active' : ''} onClick={() => patchFrame({ lens: n })}>{n}</button>
                  ))}
                  <span className="pv-divider" />
                  <button className={shot.dof?.enabled ? 'active' : ''} aria-pressed={!!shot.dof?.enabled} title="Depth of field on/off"
                    onClick={() => patchShot({ dof: { fStop: 2.8, ...shot.dof, enabled: !shot.dof?.enabled } })}>{shot.dof?.enabled ? `DOF f/${shot.dof.fStop}` : 'DOF off'}</button>
                </div>
              </>
            )}
            {!objects.length && !lookThrough && (
              <div className="pv-start-hint">
                <span className="pv-eyebrow">FROM BLOCKING TO FRAME</span>
                <strong>Make room for your story.</strong>
                <span>Drag a person from the library into the set, then build the space around them. Your blocking stays connected to the 2D plan.</span>
                <button onClick={() => { panels.openLeft(); setPanel('library'); setCategory('People'); }}>Add your first subject ↗</button>
              </div>
            )}
            {error && (
              <div className="pv-error" role="alert">
                <strong>3D workspace</strong>
                <p>{error}</p>
                <button onClick={() => setError(null)}>Dismiss</button>
                <button onClick={onSave}>Save scene</button>
              </div>
            )}
            <div className={`pv-camera-monitor pv-monitor-${monitor}`} style={{ visibility: lookThrough ? 'hidden' : 'visible' }}>
              <div className="pv-monitor-label">
                <span>{shot.name}</span>
                <span>{Math.round(frame.lens)} mm</span>
                <button title={monitor === 'large' ? 'Smaller monitor' : 'Larger monitor'} aria-label="Resize camera monitor" onClick={() => setMonitor(monitor === 'large' ? 'small' : 'large')}>{monitor === 'large' ? '−' : '+'}</button>
                <button title={monitor === 'hidden' ? 'Show monitor' : 'Hide monitor'} aria-label="Toggle camera monitor" onClick={() => setMonitor(monitor === 'hidden' ? 'small' : 'hidden')}>{monitor === 'hidden' ? '▢' : '×'}</button>
              </div>
              <div className="pv-preview-host" ref={previewHost} style={{ aspectRatio: shot.aspectRatio }} onClick={() => enterCamera(true)} title="Look through this camera (C)">
                <FrameGuides guides={guides} aspect={shot.aspectRatio} />
              </div>
            </div>
            {!hintHidden && (
              <div className="pv-navigation-hint">
                {lookThrough
                  ? 'Drag to pan and tilt · Shift-drag to truck · Alt-drag for a Dutch angle · Scroll to dolly · WASD to walk'
                  : 'Drag to orbit · Right-drag to pan · Scroll to zoom · Double-click to focus · Drag selected objects to move them'}
                <button aria-label="Hide hint" onClick={() => { setHintHidden(true); writePref('hint', 'hidden'); }}>×</button>
              </div>
            )}
          </div>
          <div className="pv-timeline">
            <div className="pv-shot-strip" role="tablist" aria-label="Shot cameras">
              {data.shots.map((s, i) => (
                <button key={s.id} role="tab" aria-selected={s.id === shot.id} className={`pv-shot-chip ${s.id === shot.id ? 'active' : ''}`} onClick={() => chooseShot(s.id)} onDoubleClick={() => { chooseShot(s.id); enterCamera(true); }} title={`${s.name} · ${s.duration.toFixed(1)} s · double-click to look through`}>
                  {s.reference ? <img src={s.reference.dataUrl} alt="" /> : <span className="pv-shot-number">{shotLabels[s.id] ?? i + 1}</span>}
                  {s.reference && shotLabels[s.id] && <em className="pv-shot-badge">{shotLabels[s.id]}</em>}
                  <span>{s.name}<small>{s.keyframes.length > 1 ? `${s.duration.toFixed(1)} s move` : 'Static'} · {Math.round(s.keyframes[0]?.lens ?? 35)} mm</small></span>
                </button>
              ))}
              <button className="pv-shot-add" onClick={addShot} title="New camera from the current set view">＋ Camera</button>
              <div className="pv-export-actions">
                <button onClick={capture} title="Download a 1920 px frame and keep a reference thumbnail">Capture still</button>
                <button className="pv-primary" onClick={() => setExportOpen(true)} title="Export this shot or every shot as MP4 or WebM">Export video…</button>
              </div>
            </div>
            <div className="pv-transport">
              <button className="pv-play" onClick={togglePlay} aria-label={playing ? 'Pause shot' : 'Play shot'} title="Play / pause (Space)">{playing ? 'Ⅱ' : '▶'}</button>
              <output title="Playhead / duration">{playhead.toFixed(2)}<small> / </small></output>
              <div className="pv-duration">
                <NumberField label="Move duration" displayLabel="" value={shot.duration} min={0.5} max={3600} step={0.5} unit="s"
                  onChange={(n) => { setPlaying(false); const resized = resizeDuration(shot, n); patchShot(resized); setTime(Math.min(time / shot.duration, 1) * resized.duration); }} />
              </div>
              <div className="pv-track" ref={track} onPointerDown={scrub}>
                <div className="pv-ruler">{ticks.map((t) => <span key={t} style={{ left: `${(t / shot.duration) * 100}%` }}>{t % (tickStep * 2) === 0 ? `${t}s` : ''}</span>)}</div>
                <div className="pv-track-bar">
                  {shot.keyframes.length > 1 && <div className="pv-track-span" style={{ left: `${(Math.min(...shot.keyframes.map((f) => f.time)) / shot.duration) * 100}%`, right: `${100 - (Math.max(...shot.keyframes.map((f) => f.time)) / shot.duration) * 100}%` }} />}
                  {shot.keyframes.map((f, i) => {
                    const t = keyDrag?.id === f.id ? keyDrag.time : f.time;
                    return (
                      <button key={f.id} className={`pv-key ${Math.abs(playhead - t) < 0.03 ? 'active' : ''}`} style={{ left: `${(t / shot.duration) * 100}%` }}
                        title={`Keyframe ${i + 1} · ${t.toFixed(2)} s · ${Math.round(f.lens)} mm — drag to retime, double-click to delete`}
                        aria-label={`Keyframe ${i + 1} at ${t.toFixed(2)} seconds`}
                        onPointerDown={(e) => startKeyDrag(e, f)} onDoubleClick={() => deleteKeyframe(f.id)} />
                    );
                  })}
                </div>
                <div className="pv-playhead" style={{ left: `${(playhead / shot.duration) * 100}%` }} />
                {selected && selectedKeys.length > 0 && (
                  <div className="pv-track-bar pv-object-lane" title={`${selected.label}: movement in this shot`}>
                    <span className="pv-lane-label">{selected.label}</span>
                    {selectedKeys.map((k, i) => {
                      const t = objectKeyDrag?.id === k.id ? objectKeyDrag.time : k.time;
                      return (
                        <button key={k.id} className={`pv-key pv-object-key ${Math.abs(playhead - t) < 0.03 ? 'active' : ''}`} style={{ left: `${(t / shot.duration) * 100}%` }}
                          title={`${selected.label} · mark ${i + 1} at ${t.toFixed(2)} s — drag to retime, double-click to delete`}
                          aria-label={`${selected.label} mark ${i + 1} at ${t.toFixed(2)} seconds`}
                          onPointerDown={(e) => startKeyDrag(e, k, 'object')} onDoubleClick={() => patchObjectKeys((s) => clearObjectKeys(s, selected.id, k.id))} />
                      );
                    })}
                  </div>
                )}
              </div>
              <button className={`pv-autokey ${autoKey ? 'active' : ''}`} aria-pressed={autoKey} onClick={() => setAutoKey((v) => !v)}
                title="Auto-key: when on, moving an object after 0 s records its position at the playhead in this shot. At 0 s you edit the set.">
                <span /> Auto-key
              </button>
              <button className="pv-key-button" onClick={() => { setPlaying(false); patchFrame({}); toast(onKeyframe ? 'Keyframe updated.' : 'Keyframe added at the playhead.'); }} title="Set a camera keyframe at the playhead (K)">◆ {onKeyframe ? 'Update camera key' : 'Camera key'}</button>
              <button className="pv-icon-button" disabled={!onKeyframe || shot.keyframes.length <= 1} onClick={() => onKeyframe && deleteKeyframe(onKeyframe.id)} title="Delete this keyframe" aria-label="Delete keyframe at playhead">⌫</button>
            </div>
          </div>
        </main>

        <aside className="pv-inspector" aria-label="Inspector">
          <div className="pv-tabs">
            {(['object', 'camera', 'scene'] as const).map((tab) => (
              <button key={tab} className={inspector === tab ? 'active' : ''} onClick={() => setInspector(tab)}>{tab === 'object' ? 'Object' : tab === 'camera' ? 'Camera' : 'Set & light'}</button>
            ))}
            <button className="pv-close" aria-label="Close inspector" onClick={() => panels.closeRight()}>×</button>
          </div>
          <div className="pv-inspector-scroll">
            {inspector === 'object' && (selected ? (
              <>
                <div className="pv-inspector-intro">
                  <span className="pv-eyebrow">{assetById.get(selected.assetId)?.category ?? 'Imported / stand-in'}</span>
                  <strong>{selected.label}</strong>
                  <small>{selected.sourceElementId ? 'Linked to the 2D plan' : '3D-only object'}{selected.locked ? ' · Locked' : ''}</small>
                </div>
                <fieldset disabled={selected.locked} className="pv-properties">
                  <TextField key={selected.id} label="Name" value={selected.label} onChange={(label) => patchObject({ label })} />
                  <VectorFields label="Position" value={selected.position} onChange={(position) => patchObject({ position })} />
                  <VectorFields label="Size" value={selected.dimensions} dimensions onChange={(dimensions) => patchObject({ dimensions })} />
                  <div className="pv-vector">
                    <span className="pv-label">Rotation</span>
                    <div>
                      {selected.rotation.map((n, i) => (
                        <NumberField key={`${selected.id}-${i}`} label={['Pitch', 'Yaw', 'Roll'][i]} value={n} unit="°" step={5}
                          onChange={(v) => patchObject({ rotation: selected.rotation.map((old, j) => (i === j ? v : old)) as Vec3 })} />
                      ))}
                    </div>
                  </div>
                  <div className="pv-inline-actions">
                    <button onClick={() => patchObject({ position: [selected.position[0], 0, selected.position[2]] })} disabled={selected.position[1] === 0}>Drop to floor</button>
                    <button onClick={() => patchObject({ rotation: [selected.rotation[0], selected.rotation[1] + 90, selected.rotation[2]] })}>Turn 90°</button>
                  </div>
                  <Section title={`Movement in ${shot.name}`} aside={<small>{selectedKeys.length ? `${selectedKeys.length} marks` : 'Still'}</small>}>
                    {selectedKeys.length > 0 ? (
                      <div className="pv-frame-list">
                        {selectedKeys.map((k, i) => (
                          <div key={k.id}>
                            <button className={Math.abs(playhead - k.time) < 0.03 ? 'active' : ''} onClick={() => { setPlaying(false); setTime(k.time); }}>
                              <b>● Mark {i + 1}</b>
                              <span>{k.time.toFixed(2)} s · {k.position[0].toFixed(1)}, {k.position[2].toFixed(1)} m</span>
                            </button>
                            <button aria-label={`Delete mark ${i + 1}`} onClick={() => patchObjectKeys((s) => clearObjectKeys(s, selected.id, k.id))}>×</button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="pv-help">{autoKey
                        ? 'Place it at 0 s, move the playhead, then move it again: each move sets a mark and it travels between them during the shot.'
                        : 'Turn on Auto-key beside the timeline, or set a mark here, to make it move during this shot.'}</p>
                    )}
                    <div className="pv-inline-actions">
                      <button onClick={() => patchObjectKeys((s) => {
                        const seeded = selectedKeys.length || playhead < 0.02 ? s : setObjectKey(s, selected.id, { time: 0, ...(baseObjects.find((o) => o.id === selected.id) ?? selected) });
                        return setObjectKey(seeded, selected.id, { time: playhead, position: selected.position, rotation: selected.rotation });
                      })}>● Mark here</button>
                      <button disabled={!selectedKeys.length} onClick={() => patchObjectKeys((s) => clearObjectKeys(s, selected.id))}>Stop moving</button>
                    </div>
                  </Section>
                  {!selected.modelData && (
                    <label className="pv-color">Surface colour<input type="color" value={selected.color} onChange={(e) => patchObject({ color: e.target.value })} /></label>
                  )}
                  {assetById.get(selected.assetId)?.shape === 'person' && (
                    <div className="pv-field">
                      Pose
                      <div className="pv-pills">
                        {(['standing', 'walking', 'sitting', 'lying'] as const).map((p) => (
                          <button key={p} className={(selected.pose ?? 'standing') === p ? 'active' : ''} onClick={() => patchObject({
                            pose: p,
                            dimensions: p === 'lying' ? [0.55, 0.35, 1.78] : p === 'sitting' ? [0.55, 1.3, 0.75] : p === 'walking' ? [0.6, 1.78, 0.65] : [0.55, 1.78, 0.4],
                          })}>{p[0].toUpperCase() + p.slice(1)}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {selected.lightIntensity !== undefined && (() => {
                    const spec = assetById.get(selected.assetId)?.light;
                    const full = spec?.intensity ?? 35;
                    return (
                      <Section title="Light">
                        <Slider key={`${selected.id}-dim-${selected.lightIntensity}`} label="Dimmer" value={Math.round((selected.lightIntensity / full) * 100)} min={0} max={300} step={5} unit="%" onCommit={(pct) => patchObject({ lightIntensity: (full * pct) / 100 })} />
                        {spec?.kind === 'spot' && (
                          <Slider key={`${selected.id}-beam-${selected.lightAngle}`} label="Beam angle" value={selected.lightAngle ?? 60} min={5} max={160} unit="°" onCommit={(lightAngle) => patchObject({ lightAngle })} />
                        )}
                        <Slider key={`${selected.id}-k-${selected.lightKelvin}`} label="Colour temperature" value={selected.lightKelvin ?? 4500} min={1800} max={10000} step={100}
                          format={(k) => (selected.lightKelvin === undefined ? 'Gel / custom' : `${Math.round(k)} K`)}
                          onCommit={(k) => patchObject({ lightKelvin: k, lightColor: kelvinToHex(k) })} />
                        <div className="pv-pills">
                          {[[1900, 'Candle'], [2700, 'Household'], [3200, 'Tungsten'], [4300, 'Mixed'], [5600, 'Daylight'], [6500, 'Overcast']].map(([k, name]) => (
                            <button key={k} title={`${k} K`} className={selected.lightKelvin === k ? 'active' : ''} onClick={() => patchObject({ lightKelvin: Number(k), lightColor: kelvinToHex(Number(k)) })}>{name}</button>
                          ))}
                        </div>
                        <span className="pv-label">Gels</span>
                        <div className="pv-swatches">
                          {[['Full CTO', '#ffa860'], ['Full CTB', '#b7cdff'], ['Moonlight', '#8fa9ff'], ['Fire', '#ff7a2f'], ['Neon pink', '#ff4fa3'], ['Cyan', '#46e0ff'], ['Green', '#66ff7a'], ['Red', '#ff3b30']].map(([name, c]) => (
                            <button key={c} title={name} aria-label={`${name} gel`} style={{ background: c }} className={selected.lightColor === c ? 'active' : ''} onClick={() => patchObject({ lightColor: c, lightKelvin: undefined })} />
                          ))}
                          <input type="color" aria-label="Light colour" value={selected.lightColor ?? '#ffe5b3'} onChange={(e) => patchObject({ lightColor: e.target.value, lightKelvin: undefined })} />
                        </div>
                        <p className="pv-help">{spec?.kind === 'area' || spec?.kind === 'tube' ? 'Soft source: wraps light and does not cast hard shadows.' : spec?.kind === 'spot' ? 'Hard source: up to four spot fixtures cast shadows.' : 'Omni source that spills in every direction.'} A preview, not calibrated photometry.</p>
                      </Section>
                    );
                  })()}
                  {!selected.modelData && (
                    <label className="pv-field">
                      3D model
                      <select value={selected.assetId} onChange={(e) => {
                        const a = assetById.get(e.target.value);
                        if (a) patchObject({ assetId: a.id, pose: a.pose, ...(emitsLight(a) ? lightDefaults(a) : { lightIntensity: undefined }) });
                      }}>
                        <option value="placeholder" disabled>Box stand-in</option>
                        {assetCategories.map((c) => (
                          <optgroup key={c} label={c}>
                            {previsAssets.filter((a) => a.category === c).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </optgroup>
                        ))}
                      </select>
                    </label>
                  )}
                </fieldset>
                <div className="pv-object-actions">
                  <button onClick={duplicateSelected} title="⌘D">Duplicate</button>
                  <button onClick={() => engine.current?.fit(selected.id)} title="F">Focus</button>
                  <button onClick={() => { const n = updateObject(data, elements, selected.id, { locked: !selected.locked }); commit(n.previs, n.elements); }}>{selected.locked ? 'Unlock' : 'Lock'}</button>
                  <button className="pv-danger" disabled={selected.locked} onClick={deleteSelected}>Delete</button>
                </div>
                <div className="pv-framing">
                  <span className="pv-eyebrow">FRAME THIS IN {shot.name.toUpperCase()}</span>
                  <FramingButtons selected={selected} onFrame={(i) => frameSelected(i)} />
                </div>
              </>
            ) : (
              <div className="pv-inspector-empty">
                <span>◇</span>
                <strong>Select something in the set.</strong>
                <p>Click an object to move, rotate or resize it. Drag a selected object to slide it across the floor. Click a camera body to select a shot camera.</p>
              </div>
            ))}
            {inspector === 'camera' && (
              <>
                <div className="pv-inspector-intro">
                  <span className="pv-eyebrow">SHOT CAMERA</span>
                  <TextField key={shot.id} label="Shot name" value={shot.name} onChange={(name) => patchShot({ name })} />
                  <small>{onKeyframe ? `Editing keyframe at ${playhead.toFixed(2)} s` : `Between keyframes · ${playhead.toFixed(2)} s — changes add a keyframe`}</small>
                </div>
                <button className="pv-wide pv-primary" onClick={() => enterCamera(!lookThrough)}>{lookThrough ? '← Back to set view' : 'Look through camera ↗'}</button>
                <Section title="Lens & format">
                  <div className="pv-lens-presets">
                    {LENSES.map((n) => <button key={n} className={Math.abs(frame.lens - n) < 0.5 ? 'active' : ''} onClick={() => patchFrame({ lens: n })}>{n}</button>)}
                  </div>
                  <div className="pv-pair">
                    <NumberField key={`${shot.id}-${frame.lens}`} label="Focal length" value={frame.lens} min={8} max={300} step={1} unit="mm" onChange={(lens) => patchFrame({ lens })} />
                    <label className="pv-field">
                      Sensor
                      <select value={shot.sensorWidth} onChange={(e) => patchShot({ sensorWidth: Number(e.target.value) })}>
                        {[[36, 'Full frame 36'], [24.9, 'Super 35 24.9'], [27.99, 'ALEXA LF 27.99'], [23.5, 'APS-C 23.5'], [17.3, 'Micro 4/3 17.3'], [shot.sensorWidth, `Custom ${shot.sensorWidth}`]]
                          .filter(([w], i, all) => all.findIndex(([x]) => x === w) === i)
                          .map(([w, name]) => <option key={name} value={w}>{name} mm</option>)}
                      </select>
                    </label>
                  </div>
                  <label className="pv-field">
                    Frame format
                    <select value={shot.aspectRatio} onChange={(e) => patchShot({ aspectRatio: Number(e.target.value) })}>
                      {FORMATS.map(([ratio, label]) => <option key={ratio} value={ratio}>{label}</option>)}
                      {!FORMATS.some(([r]) => Math.abs(r - shot.aspectRatio) < 0.001) && <option value={shot.aspectRatio}>{shot.aspectRatio.toFixed(2)}:1</option>}
                    </select>
                  </label>
                  <p className="pv-help">{hfov.toFixed(0)}° horizontal field of view.</p>
                  <label className="pv-check pv-check-row"><input type="checkbox" checked={!!shot.dof?.enabled} onChange={(e) => patchShot({ dof: { fStop: 2.8, ...shot.dof, enabled: e.target.checked } })} /> Depth of field</label>
                  {shot.dof?.enabled && (() => {
                    const dof = shot.dof;
                    const focus = dof.focusDistance ?? pose.distance;
                    const range = focusRange(frame.lens, dof.fStop, focus, shot.sensorWidth);
                    return (
                      <>
                        <div className="pv-lens-presets">
                          {F_STOPS.map((n) => <button key={n} className={dof.fStop === n ? 'active' : ''} onClick={() => patchShot({ dof: { ...dof, fStop: n } })}>f/{n}</button>)}
                        </div>
                        <label className="pv-field">
                          Focus
                          <select value={dof.focusDistance === undefined ? 'aim' : 'fixed'} onChange={(e) => patchShot({ dof: { ...dof, focusDistance: e.target.value === 'aim' ? undefined : Math.round(focus * 100) / 100 } })}>
                            <option value="aim">Follow the aim point</option>
                            <option value="fixed">Fixed distance</option>
                          </select>
                        </label>
                        {dof.focusDistance !== undefined && (
                          <Slider key={`focus-${dof.focusDistance}`} label="Focus distance" value={dof.focusDistance} min={0.3} max={30} step={0.05} unit=" m" onCommit={(focusDistance) => patchShot({ dof: { ...dof, focusDistance } })} />
                        )}
                        <button className="pv-wide" disabled={!selected} onClick={() => selected && patchShot({ dof: { ...dof, focusDistance: Math.round(Math.hypot(selected.position[0] - frame.position[0], selected.position[1] + selected.dimensions[1] * 0.85 - frame.position[1], selected.position[2] - frame.position[2]) * 100) / 100 } })}>Focus on selected object</button>
                        <p className="pv-help">Sharp from {range.near.toFixed(2)} m to {Number.isFinite(range.far) ? `${range.far.toFixed(2)} m` : 'infinity'} at {focus.toFixed(2)} m. Shown in the camera view, stills and clips.</p>
                      </>
                    );
                  })()}
                </Section>
                <Section title="Framing">
                  <label className="pv-field">
                    Subject
                    <select aria-label="Framing subject" value={selected?.id ?? ''} onChange={(e) => setSelectedId(e.target.value || null)}>
                      <option value="">Choose an object…</option>
                      {objects.filter((o) => o.visible && assetById.get(o.assetId)?.category !== 'Architecture').map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </label>
                  <FramingButtons selected={selected} onFrame={(i) => frameSelected(i)} />
                  <button className="pv-wide" disabled={!selected} onClick={() => selected && patchFrame({ target: [selected.position[0], selected.position[1] + selected.dimensions[1] * 0.85, selected.position[2]] })}>Aim at subject without moving</button>
                </Section>
                <Section title="Height & angle">
                  <div className="pv-pills pv-height-pills">
                    {HEIGHTS.map(([label, h]) => (
                      <button key={label} className={Math.abs(frame.position[1] - h) < 0.02 ? 'active' : ''} title={`${h} m`} onClick={() => patchFrame({ position: [frame.position[0], h, frame.position[2]] })}>{label}</button>
                    ))}
                  </div>
                  <Slider key={`${shot.id}-roll-${frame.roll ?? 0}`} label="Dutch angle" value={frame.roll ?? 0} min={-45} max={45} step={0.5} unit="°" onCommit={(roll) => patchFrame({ roll })} />
                  <div className="pv-inline-actions">
                    <button onClick={() => patchFrame({ target: [frame.target[0], frame.position[1], frame.target[2]] })}>Level tilt</button>
                    <button onClick={() => patchFrame({ roll: 0 })} disabled={!frame.roll}>Level horizon</button>
                  </div>
                </Section>
                <Section title="Position" defaultOpen={false}>
                  <VectorFields label="Camera" value={frame.position} onChange={(position) => patchFrame({ position })} />
                  <VectorFields label="Look at" value={frame.target} onChange={(target) => patchFrame({ target })} />
                  <button className="pv-wide" disabled={lookThrough} onClick={() => { const view = engine.current?.captureEditor(); if (view) { patchFrame({ ...view, lens: clamp(Math.round(view.lens), 8, 300) }); toast('Camera moved to the current set view.'); } }}>Move camera to set view</button>
                  <button className="pv-wide" onClick={() => { setLookThrough(false); engine.current?.viewShot(); }}>Fly set view to this camera</button>
                </Section>
                <Section title="Movement" aside={<small>{shot.keyframes.length} key{shot.keyframes.length === 1 ? '' : 's'}</small>}>
                  <div className="pv-pair">
                    <label className="pv-field">
                      Path
                      <select value={shot.path} onChange={(e) => patchShot({ path: e.target.value as PrevisShot['path'] })}>
                        <option value="linear">Straight</option>
                        <option value="smooth">Curved</option>
                      </select>
                    </label>
                    <label className="pv-check"><input type="checkbox" checked={shot.ease} onChange={(e) => patchShot({ ease: e.target.checked })} /> Ease in/out</label>
                  </div>
                  <div className="pv-frame-list">
                    {shot.keyframes.map((f, i) => (
                      <div key={f.id}>
                        <button className={Math.abs(playhead - f.time) < 0.03 ? 'active' : ''} onClick={() => { setPlaying(false); setTime(f.time); }}>
                          <b>◆ {i === 0 ? 'Start' : i === shot.keyframes.length - 1 ? 'End' : `Key ${i + 1}`}</b>
                          <span>{f.time.toFixed(2)} s · {Math.round(f.lens)} mm{f.roll ? ` · ${f.roll.toFixed(0)}°` : ''}</span>
                        </button>
                        <button aria-label={`Delete keyframe ${i + 1}`} disabled={shot.keyframes.length <= 1} onClick={() => deleteKeyframe(f.id)}>×</button>
                      </div>
                    ))}
                  </div>
                  <p className="pv-help">To make a move: frame the start, move the playhead, reframe. Each gesture sets a keyframe. Drag diamonds on the timeline to retime.</p>
                </Section>
                <Section title="Shot list">
                  <label className="pv-field">
                    Attach this camera to a shot
                    <select aria-label="Attach camera to shot list" value="" onChange={(e) => {
                      if (e.target.value) {
                        onLinkShot(e.target.value, shot.id);
                        toast('Camera linked. Save the scene and shot list to keep the link.');
                      }
                    }}>
                      <option value="">Choose a shot…</option>
                      {shotList.scenes.map((s) => (
                        <optgroup key={s.id} label={`${s.number} · ${s.title}`}>
                          {s.shots.map((item) => <option key={item.id} value={item.id}>{item.number} · {item.description || 'Untitled shot'}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                  <p className="pv-help">{linkedShots.length ? `Linked to ${linkedShots.map((s) => s.number || 'unnumbered shot').join(', ')}` : 'Create or open a shot list to attach this camera.'}</p>
                  {shot.reference && (
                    <button className="pv-reference" onClick={() => setReferenceOpen(true)}>
                      <img src={shot.reference.dataUrl} alt={`Saved reference for ${shot.name}`} />
                      <small>Reference captured at {shot.reference.time.toFixed(2)} s · click to enlarge</small>
                    </button>
                  )}
                </Section>
                <div className="pv-object-actions">
                  <button onClick={() => {
                    const copy = { ...shot, id: uuid(), name: `${shot.name} copy`, keyframes: shot.keyframes.map((f) => ({ ...f, id: uuid() })) };
                    commit({ ...data, shots: [...data.shots, copy] });
                    chooseShot(copy.id);
                  }}>Duplicate camera</button>
                  <button className="pv-danger" disabled={data.shots.length <= 1} onClick={() => {
                    if (!window.confirm(`Delete camera "${shot.name}" and its saved reference?`)) return;
                    const remaining = data.shots.filter((s) => s.id !== shot.id);
                    commit({ ...data, shots: remaining });
                    chooseShot(remaining[0].id);
                    setSelectedId(null);
                  }}>Delete camera</button>
                </div>
              </>
            )}
            {inspector === 'scene' && (
              <>
                <div className="pv-inspector-intro">
                  <span className="pv-eyebrow">SHARED SET</span>
                  <strong>{scene.name}</strong>
                  <small>{objects.length} objects · {data.shots.length} camera{data.shots.length === 1 ? '' : 's'}</small>
                </div>
                <Section title="Time of day">
                  <div className="pv-environment-presets">
                    {TIMES_OF_DAY.map(({ label, patch }) => <button key={label} onClick={() => commit({ ...data, ...patch })}>{label}</button>)}
                  </div>
                  <Slider key={`az-${data.sunAzimuth}`} label="Sun direction" value={data.sunAzimuth ?? 225} min={0} max={360} unit="°" format={(n) => `${Math.round(n)}° ${['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(n / 45) % 8]}`} onCommit={(sunAzimuth) => commit({ ...data, sunAzimuth })} />
                  <Slider key={`el-${data.sunElevation}`} label="Sun height" value={data.sunElevation ?? 50} min={2} max={90} unit="°" onCommit={(sunElevation) => commit({ ...data, sunElevation })} />
                  <Slider key={`day-${data.daylightIntensity}`} label="Sunlight" value={data.daylightIntensity} min={0} max={6} step={0.05} onCommit={(daylightIntensity) => commit({ ...data, daylightIntensity })} />
                  <Slider key={`amb-${data.ambientIntensity}`} label="Sky fill" value={data.ambientIntensity} min={0} max={3} step={0.05} onCommit={(ambientIntensity) => commit({ ...data, ambientIntensity })} />
                  <p className="pv-help">North is toward the top of the 2D plan.</p>
                </Section>
                <Section title="Stage">
                  <div className="pv-pair">
                    <NumberField label="Floor width" value={data.floorSize[0]} min={2} max={500} unit="m" onChange={(n) => commit({ ...data, floorSize: [n, data.floorSize[1]] })} />
                    <NumberField label="Floor depth" value={data.floorSize[1]} min={2} max={500} unit="m" onChange={(n) => commit({ ...data, floorSize: [data.floorSize[0], n] })} />
                  </div>
                  <label className="pv-color">Floor<input type="color" value={data.floorColor} onChange={(e) => commit({ ...data, floorColor: e.target.value })} /></label>
                  <label className="pv-color">Sky &amp; horizon<input type="color" value={data.backgroundColor} onChange={(e) => commit({ ...data, backgroundColor: e.target.value })} /></label>
                  <label className="pv-check pv-check-row"><input type="checkbox" checked={!!data.ceiling} onChange={(e) => commit({ ...data, ceiling: e.target.checked })} /> Ceiling over walls</label>
                  {data.ceiling && <label className="pv-color">Ceiling<input type="color" value={data.ceilingColor ?? '#d9d6cf'} onChange={(e) => commit({ ...data, ceilingColor: e.target.value })} /></label>}
                  <label className="pv-field">Wall treatment
                    <select aria-label="Wall treatment" value={data.wallStyle ?? 'built'} onChange={(e) => commit({ ...data, wallStyle: e.target.value as 'built' | 'cave' })}>
                      <option value="built">Built walls</option>
                      <option value="cave">Cave rock</option>
                    </select>
                  </label>
                </Section>
                <Section title="Scale" defaultOpen={false}>
                  <NumberField label="Diagram units per metre" value={data.unitsPerMeter} min={1} max={1000} step={10} onChange={(n) => {
                    const ratio = data.unitsPerMeter / n;
                    const resolved = resolveObjects(data, elements);
                    commit({
                      ...data,
                      unitsPerMeter: n,
                      objects: resolved.map((o) => {
                        const e = o.sourceElementId ? elements.find((el) => el.id === o.sourceElementId) : undefined;
                        return e ? { ...o, dimensions: [o.dimensions[0] * ratio, o.dimensions[1], o.dimensions[2] * ratio] as Vec3, diagramSize: [e.width * Math.abs(e.scaleX), e.height * Math.abs(e.scaleY)] as [number, number] } : o;
                      }),
                      shots: data.shots.map((s) => ({
                        ...s,
                        keyframes: s.keyframes.map((f) => ({ ...f, position: [f.position[0] * ratio, f.position[1], f.position[2] * ratio] as Vec3, target: [f.target[0] * ratio, f.target[1], f.target[2] * ratio] as Vec3 })),
                      })),
                    });
                  }} />
                  <p className="pv-help">Walls, floors and doors-in-walls use their drawn length. Untouched library icons use real-world sizes; icons you resize in 2D keep your measurement.</p>
                  <button className="pv-wide" onClick={() => { commit(matchDiagramFootprints(data, elements)); toast('Sizes reset from the 2D plan. Undo to restore.'); }}>Reset sizes from 2D plan</button>
                </Section>
                {warnings > 0 && <p className="pv-notice">{warnings} diagram element{warnings === 1 ? ' uses' : 's use'} a box stand-in. Select one and choose a 3D model in the Object tab.</p>}
                <p className="pv-help">Scene geometry, camera moves, embedded models and reference thumbnails save with your scene file. Text and plan annotations stay in the 2D plan.</p>
              </>
            )}
          </div>
        </aside>
      </fieldset>
      {exporting && (
        <div className="pv-export-overlay" role="status">
          <strong>Rendering video</strong>
          {exportProgress ? (
            <span>{exportProgress.shot} · frame {exportProgress.done} of {exportProgress.total} · {Math.round((exportProgress.done / exportProgress.total) * 100)}%</span>
          ) : (
            <span>{time.toFixed(1)} / {shot.duration.toFixed(1)} s · recording in real time</span>
          )}
          <progress value={exportProgress ? exportProgress.done : time} max={exportProgress ? exportProgress.total : shot.duration} />
          <button onClick={() => engine.current?.stopExport()}>Cancel export</button>
        </div>
      )}
      {exportOpen && (
        <ExportDialog
          settings={exportSettings}
          onChange={setExportSettings}
          shot={shot}
          shots={data.shots}
          onCancel={() => setExportOpen(false)}
          onExport={() => void exportVideo(exportSettings)}
        />
      )}
      {referenceOpen && shot.reference && (
        <div className="pv-reference-modal" role="dialog" aria-modal="true" aria-label="Saved shot reference">
          <button onClick={() => setReferenceOpen(false)}>Close ×</button>
          <img src={shot.reference.dataUrl} alt={`Reference frame for ${shot.name}`} />
          <strong>{shot.name} · {shot.reference.time.toFixed(2)} s</strong>
          <span>This saved thumbnail represents the scene at capture time.</span>
        </div>
      )}
    </div>
  );

  function frameSelected(i: number) {
    if (!selected) return;
    const person = assetById.get(selected.assetId)?.shape === 'person';
    const h = selected.dimensions[1];
    // Wide shows the whole subject, medium from the waist, close on the face (for people).
    const center: Vec3 = [selected.position[0], selected.position[1] + h * (person ? [0.5, 0.7, 0.9][i] : [0.5, 0.6, 0.7][i]), selected.position[2]];
    const visibleHeight = Math.max(h * (person ? [1.25, 0.62, 0.24][i] : [1.4, 0.8, 0.45][i]), (Math.max(selected.dimensions[0], selected.dimensions[2]) / shot.aspectRatio) * [1.3, 0.7, 0.4][i]);
    const framed = frameSubject(frame, center, visibleHeight, frame.lens, shot.sensorWidth, shot.aspectRatio);
    patchFrame({ ...framed, position: [framed.position[0], person ? center[1] : framed.position[1], framed.position[2]] });
    enterCamera(true);
  }
}

/** The library grid is the largest part of the page; it stays still while the playhead moves. */
const AssetGrid = memo(function AssetGrid({ assets, thumbnails, onPick }: { assets: PrevisAsset[]; thumbnails: Record<string, string>; onPick: (id: string) => void }) {
  return (
    <div className="pv-assets">
      {assets.map((a) => (
        <button
          key={a.id}
          className="pv-asset"
          draggable
          title={`${a.name} · ${a.dimensions.map((n) => n.toFixed(2)).join(' × ')} m — click to add, or drag into the set`}
          onDragStart={(e) => {
            e.dataTransfer.setData(ASSET_DRAG_TYPE, a.id);
            e.dataTransfer.effectAllowed = 'copy';
            if (thumbnails[a.id]) {
              const img = new Image();
              img.src = thumbnails[a.id];
              e.dataTransfer.setDragImage(img, 40, 28);
            }
          }}
          onClick={() => onPick(a.id)}
        >
          <div className="pv-asset-image">
            {thumbnails[a.id] ? <img src={thumbnails[a.id]} alt="" draggable={false} /> : <span style={{ color: a.color }}>◇</span>}
          </div>
          <span>{a.name}</span>
        </button>
      ))}
      {!assets.length && <p className="pv-empty">No assets match your search.</p>}
    </div>
  );
});

function ExportDialog({ settings, onChange, shot, shots, onCancel, onExport }: {
  settings: ExportSettings; onChange: (s: ExportSettings) => void; shot: PrevisShot; shots: PrevisShot[]; onCancel: () => void; onExport: () => void;
}) {
  const set = (patch: Partial<ExportSettings>) => onChange({ ...settings, ...patch });
  const list = settings.scope === 'all' ? shots : [shot];
  const seconds = list.reduce((sum, s) => sum + s.duration, 0);
  const aspect = list[0].aspectRatio;
  const height = Math.round(settings.width / aspect / 2) * 2;
  const mixed = settings.scope === 'all' && shots.some((s) => Math.abs(s.aspectRatio - aspect) > 0.001);
  const webCodecs = typeof VideoEncoder !== 'undefined';
  return (
    <div className="pv-reference-modal pv-export-dialog" role="dialog" aria-modal="true" aria-labelledby="pv-export-title" onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}>
      <div className="pv-dialog-card">
        <h2 id="pv-export-title">Export video</h2>
        <div className="pv-field">
          What to export
          <div className="pv-pills">
            <button className={settings.scope === 'shot' ? 'active' : ''} onClick={() => set({ scope: 'shot' })}>This shot · {shot.name}</button>
            <button className={settings.scope === 'all' ? 'active' : ''} disabled={shots.length < 2} onClick={() => set({ scope: 'all' })}>All {shots.length} shots in order</button>
          </div>
        </div>
        <div className="pv-field">
          Format
          <div className="pv-pills">
            <button className={settings.format === 'mp4' ? 'active' : ''} onClick={() => set({ format: 'mp4' })}>MP4 · H.264</button>
            <button className={settings.format === 'webm' ? 'active' : ''} onClick={() => set({ format: 'webm' })}>WebM · VP9</button>
          </div>
        </div>
        <div className="pv-pair">
          <div className="pv-field">
            Size
            <div className="pv-pills">
              {[[1280, '720p'], [1920, '1080p'], [3840, '4K']].map(([w, label]) => (
                <button key={w} className={settings.width === w ? 'active' : ''} onClick={() => set({ width: Number(w) })}>{label}</button>
              ))}
            </div>
          </div>
          <div className="pv-field">
            Frame rate
            <div className="pv-pills">
              {[24, 25, 30].map((fps) => <button key={fps} className={settings.fps === fps ? 'active' : ''} onClick={() => set({ fps })}>{fps}</button>)}
            </div>
          </div>
        </div>
        <label className="pv-check pv-check-row"><input type="checkbox" checked={settings.burnIn} onChange={(e) => set({ burnIn: e.target.checked })} /> Burn in shot name and timecode</label>
        <p className="pv-help">
          {settings.width} × {height} px · {seconds.toFixed(1)} s · {Math.round(seconds * settings.fps)} frames. {webCodecs
            ? 'Every frame is rendered in full quality, including depth of field and moving actors; this can take longer or shorter than real time.'
            : 'This browser records the active shot as WebM in real time. Use the desktop app for MP4 and multi-shot export.'}
          {mixed && ' Shots with a different frame format are framed to the first shot\'s format.'}
        </p>
        <div className="pv-object-actions">
          <button onClick={onCancel}>Cancel</button>
          <button className="pv-primary" autoFocus onClick={onExport}>Export {settings.format.toUpperCase()}</button>
        </div>
      </div>
    </div>
  );
}

function FramingButtons({ selected, onFrame }: { selected?: PrevisObject; onFrame: (i: number) => void }) {
  return (
    <div className="pv-lens-presets">
      {(['Wide', 'Medium', 'Close-up'] as const).map((label, i) => (
        <button key={label} disabled={!selected} onClick={() => onFrame(i)} title={selected ? `${label} of ${selected.label}` : 'Select a subject first'}>{label}</button>
      ))}
    </div>
  );
}

const svg = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
function Eye() {
  return <svg {...svg} aria-hidden><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>;
}
function EyeOff() {
  return <svg {...svg} aria-hidden><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.9 8.3 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6" /></svg>;
}
function Lock({ open }: { open: boolean }) {
  return <svg {...svg} aria-hidden><rect x="5" y="11" width="14" height="10" rx="2" /><path d={open ? 'M8 11V7a4 4 0 0 1 7.5-2' : 'M8 11V7a4 4 0 0 1 8 0v4'} /></svg>;
}
function PanelIcon({ side }: { side: 'left' | 'right' }) {
  return <svg {...svg} aria-hidden><rect x="3" y="4" width="18" height="16" rx="2" /><path d={side === 'left' ? 'M9 4v16' : 'M15 4v16'} /></svg>;
}
