import { useCallback, useState, useSyncExternalStore } from 'react';

/** Desktop panels become mutually exclusive drawers on compact windows. */
export function useWorkspacePanels(breakpoint = 1000, initialLeft = true, initialRight = true) {
  const query = `(max-width: ${breakpoint}px)`;
  const subscribe = useCallback((notify: () => void) => {
    const media = window.matchMedia(query);
    media.addEventListener('change', notify);
    return () => media.removeEventListener('change', notify);
  }, [query]);
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  const compact = useSyncExternalStore(subscribe, getSnapshot);
  const [left, setLeft] = useState(initialLeft);
  const [right, setRight] = useState(initialRight);
  const [drawer, setDrawer] = useState<'left' | 'right' | null>(null);
  const leftOpen = compact ? drawer === 'left' : left;
  const rightOpen = compact ? drawer === 'right' : right;
  return {
    leftOpen, rightOpen,
    toggleLeft: () => compact ? setDrawer(d => d === 'left' ? null : 'left') : setLeft(v => !v),
    toggleRight: () => compact ? setDrawer(d => d === 'right' ? null : 'right') : setRight(v => !v),
    closeLeft: () => compact ? setDrawer(null) : setLeft(false),
    closeRight: () => compact ? setDrawer(null) : setRight(false),
    openLeft: () => compact ? setDrawer('left') : setLeft(true),
    toggleBoth: () => {
      if (compact) setDrawer(d => d ? null : 'right');
      else { const open = !left && !right; setLeft(open); setRight(open); }
    },
  };
}
