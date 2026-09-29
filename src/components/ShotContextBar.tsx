import { useState } from 'react';
import type { Shot, ShotListScene, ShotStatus } from '../types';

interface Props {
  scene: ShotListScene;
  /** Shots of the scene staged in the open set. */
  shots: Shot[];
  activeShotId: string | null;
  workspace: 'canvas' | 'previs';
  onSelectShot: (shotId: string) => void;
  onAddShot: () => void;
  onUpdateShot: (shotId: string, patch: Partial<Shot>) => void;
  onOpenShotList: () => void;
}

const FIELDS: [keyof Shot, string][] = [
  ['subjects', 'Subjects'],
  ['framing', 'Framing'],
  ['angle', 'Angle'],
  ['movement', 'Movement'],
  ['cameraLens', 'Camera & lens'],
  ['equipment', 'Equipment'],
  ['setup', 'Setup'],
];
const STATUSES: ShotStatus[] = ['planned', 'ready', 'shot', 'cut'];

/** The scene being staged and its shots, shown above the 2D plan and the 3D studio. */
export default function ShotContextBar({ scene, shots, activeShotId, workspace, onSelectShot, onAddShot, onUpdateShot, onOpenShotList }: Props) {
  const [open, setOpen] = useState(false);
  const active = shots.find((shot) => shot.id === activeShotId);
  const summary = active ? [active.framing, active.movement, active.cameraLens].filter(Boolean).join(' · ') : '';
  return (
    <div className="shot-context">
      <button className="shot-context-scene" onClick={onOpenShotList} title="Open this scene in the shot list">
        <span>Scene {scene.number}</span>
        {scene.title}
      </button>
      <div className="shot-context-chips" role="tablist" aria-label={`Shots in scene ${scene.number}`}>
        {shots.map((shot) => (
          <button
            key={shot.id}
            role="tab"
            aria-selected={shot.id === activeShotId}
            className={`shot-context-chip status-${shot.status} ${shot.id === activeShotId ? 'active' : ''}`}
            onClick={() => onSelectShot(shot.id)}
            title={`${shot.number}${shot.description ? ` — ${shot.description}` : ''}${workspace === 'previs' ? (shot.previsShotId ? '\nLook through this shot\'s camera' : '\nCreate a camera for this shot') : ''}`}
          >
            <b>{shot.number || '—'}</b>
            <span>{shot.description || 'Untitled shot'}</span>
            {workspace === 'previs' && !shot.previsShotId && <i aria-label="No camera yet">＋</i>}
          </button>
        ))}
        <button className="shot-context-add" onClick={onAddShot} title={`Add a shot to scene ${scene.number}`}>＋ Shot</button>
      </div>
      {active && summary && <span className="shot-context-summary">{summary}</span>}
      {active && (
        <button className="shot-context-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? 'Close details' : 'Shot details'}
        </button>
      )}
      {open && active && (
        <div className="shot-context-details" role="region" aria-label={`Shot ${active.number} details`}>
          <label className="shot-context-wide">
            Description
            <textarea rows={2} value={active.description} onChange={(e) => onUpdateShot(active.id, { description: e.target.value })} placeholder="What happens in this shot" />
          </label>
          {FIELDS.map(([key, label]) => (
            <label key={key}>
              {label}
              <input value={active[key] as string} onChange={(e) => onUpdateShot(active.id, { [key]: e.target.value })} />
            </label>
          ))}
          <label>
            Status
            <select value={active.status} onChange={(e) => onUpdateShot(active.id, { status: e.target.value as ShotStatus })}>
              {STATUSES.map((status) => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}
            </select>
          </label>
          <label className="shot-context-wide">
            Notes
            <textarea rows={2} value={active.notes} onChange={(e) => onUpdateShot(active.id, { notes: e.target.value })} />
          </label>
        </div>
      )}
    </div>
  );
}
