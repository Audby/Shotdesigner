import { useState, useCallback, useRef } from 'react';

export function useHistory<T>(initialState: T) {
  const [state, setState] = useState<T>(initialState);
  const pastRef = useRef<T[]>([]);
  const futureRef = useRef<T[]>([]);

  const set = useCallback((newState: T | ((prev: T) => T)) => {
    setState((prev) => {
      const resolved = typeof newState === 'function' ? (newState as (p: T) => T)(prev) : newState;
      pastRef.current = [...pastRef.current.slice(-49), prev];
      futureRef.current = [];
      return resolved;
    });
  }, []);

  const undo = useCallback(() => {
    setState((prev) => {
      if (pastRef.current.length === 0) return prev;
      const previous = pastRef.current[pastRef.current.length - 1];
      pastRef.current = pastRef.current.slice(0, -1);
      futureRef.current = [prev, ...futureRef.current];
      return previous;
    });
  }, []);

  const redo = useCallback(() => {
    setState((prev) => {
      if (futureRef.current.length === 0) return prev;
      const next = futureRef.current[0];
      futureRef.current = futureRef.current.slice(1);
      pastRef.current = [...pastRef.current, prev];
      return next;
    });
  }, []);

  const canUndo = pastRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;

  const reset = useCallback((newState: T) => {
    pastRef.current = [];
    futureRef.current = [];
    setState(newState);
  }, []);

  return { state, set, undo, redo, canUndo, canRedo, reset };
}
