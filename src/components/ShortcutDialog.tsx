import { useEffect, useRef } from 'react';
import type { WorkspaceMode } from '../types';

const common = [['⌘ / Ctrl + S', 'Save'], ['⌘ / Ctrl + Shift + S', 'Save as'], ['⌘ / Ctrl + Z', 'Undo'], ['⌘ / Ctrl + Shift + Z', 'Redo'], ['⌘ / Ctrl + D', 'Duplicate selection'], ['Delete / Backspace', 'Delete selection'], ['?', 'Open this guide']];
const shortcuts: Record<WorkspaceMode, string[][]> = {
  canvas: [['V / H', 'Select / pan tool'], ['Space + drag', 'Pan temporarily'], ['F', 'Fit the plan'], ['G / S', 'Toggle grid / snapping'], ['Arrow keys', 'Nudge selection; Shift for a grid step'], ['⌘ / Ctrl + A', 'Select all'], ['⌘ / Ctrl + C / V', 'Copy / paste'], ['Escape', 'Clear selection']],
  previs: [['C', 'Switch set view / camera view'], ['Drag · right-drag', 'Orbit / pan the set'], ['Double-click', 'Focus on a point'], ['Drag selected object', 'Slide it across the floor'], ['1 / 2 / 3', 'Move / rotate / resize gizmo'], ['⌥ W A S D · ⌥ Q / E', 'Move selection relative to the view · down / up (⇧ faster)'], ['⌥ J / K / L', 'Turn selection: yaw / pitch / roll (⇧ reverses)'], ['Arrows · ⌥ ↑ / ↓', 'Nudge 10 cm along the grid (⇧ 1 m) · raise / lower'], ['[ / ]', 'Turn selection 15°'], ['F / T', 'Frame selection / plan view from above'], ['Drag · Shift-drag', 'Pan-tilt / truck the shot camera'], ['Alt-drag', 'Dutch angle (camera view)'], ['Scroll', 'Zoom set / dolly camera'], ['W A S D · Q / E', 'Walk · down / up (Shift: faster)'], ['K', 'Set camera keyframe at playhead'], [', / .', 'Previous / next keyframe'], ['Space', 'Play / pause camera move'], ['G', 'Show / hide grid, cameras and beams'], ['\\', 'Toggle side panels'], ['⌘D · Delete', 'Duplicate / delete selection'], ['Escape', 'Leave camera view, then clear selection']],
  shotList: [['N / Shift + N', 'New shot / new scene'], ['↑ / ↓', 'Select previous / next visible shot'], ['Alt + ↑ / ↓', 'Reorder selected shot'], ['C / V', 'Open the shot in the 2D plan / 3D studio'], ['/', 'Focus search'], ['Escape in a cell', 'Finish editing and select the row'], ['Escape', 'Clear selection']],
};
export default function ShortcutDialog({ workspace, onClose }: { workspace: WorkspaceMode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="shortcut-dialog" aria-labelledby="shortcut-title" onClose={onClose} onClick={e => { if (e.target === e.currentTarget) e.currentTarget.close(); }}>
    <div className="shortcut-content">
      <header><div><span className="shortcut-eyebrow">WORK FASTER</span><h2 id="shortcut-title">Keyboard shortcuts</h2></div><button autoFocus aria-label="Close keyboard shortcuts" onClick={() => ref.current?.close()}>×</button></header>
      <p>Shortcuts pause while you type. Press Escape to close this guide.</p>
      <div className="shortcut-columns"><section><h3>{workspace === 'previs' ? '3D studio' : workspace === 'canvas' ? '2D plan' : 'Shot list'}</h3><dl>{shortcuts[workspace].map(([key, action]) => <div key={key}><dt><kbd>{key}</kbd></dt><dd>{action}</dd></div>)}</dl></section>
      <section><h3>Every workspace</h3><dl>{common.map(([key, action]) => <div key={key}><dt><kbd>{key}</kbd></dt><dd>{action}</dd></div>)}</dl>
      <aside>{workspace === 'previs' ? 'Every camera gesture sets a keyframe at the playhead. With Auto-key on, moving an object after 0 s sets a mark and it travels between marks during the shot. Each held key or drag is one undo step.' : workspace === 'shotList' ? 'Click the circle beside a shot number to select its row, then press Delete. Undo restores deleted shots. Escape leaves a text cell so row shortcuts work.' : 'Select objects on the plan or in Layers. Locked objects stay in place when nudging.'}</aside></section></div>
    </div>
  </dialog>;
}
