import { useState, useCallback } from 'react';

/** Pure state updates remain safe when React StrictMode evaluates an updater twice. */
export function useHistory<T>(initialState: T) {
  const [history, setHistory] = useState<{ state: T; past: T[]; future: T[] }>({
    state: initialState,
    past: [],
    future: [],
  });
  const set = useCallback((next: T | ((prev: T) => T)) => {
    setHistory((prev) => {
      const resolved =
        typeof next === 'function' ? (next as (p: T) => T)(prev.state) : next;
      if (resolved === prev.state) return prev;
      return {
        state: resolved,
        past: [...prev.past.slice(-49), prev.state],
        future: [],
      };
    });
  }, []);
  // Saving can update storage metadata without creating a meaningless undo step.
  const replace = useCallback((state: T) => setHistory(prev => ({ ...prev, state })), []);
  const undo = useCallback(
    () =>
      setHistory((prev) =>
        prev.past.length
          ? {
              state: prev.past[prev.past.length - 1],
              past: prev.past.slice(0, -1),
              future: [prev.state, ...prev.future],
            }
          : prev,
      ),
    [],
  );
  const redo = useCallback(
    () =>
      setHistory((prev) =>
        prev.future.length
          ? {
              state: prev.future[0],
              past: [...prev.past, prev.state],
              future: prev.future.slice(1),
            }
          : prev,
      ),
    [],
  );
  const reset = useCallback(
    (state: T) => setHistory({ state, past: [], future: [] }),
    [],
  );
  return {
    state: history.state,
    set,
    replace,
    undo,
    redo,
    reset,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
