import { useCallback, useEffect, useRef, useState } from 'react';
import { HIGHLIGHT_DURATION_MS } from '@murdoku/shared';
import type { HighlightState } from '@/lib/highlight';

export interface HighlightController {
  highlight: HighlightState | null;
  /** Shows `state` for HIGHLIGHT_DURATION_MS; a second call replaces it. */
  show: (state: HighlightState | null) => void;
  clear: () => void;
}

/**
 * One shared highlight timer. Re-triggering replaces the current highlight
 * instead of stacking (docs/v0.3.0.md §2.2.4).
 */
export function useHighlight(): HighlightController {
  const [highlight, setHighlight] = useState<HighlightState | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = (): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const show = useCallback((state: HighlightState | null): void => {
    clearTimer();
    setHighlight(state);
    if (!state) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setHighlight(null);
    }, HIGHLIGHT_DURATION_MS);
  }, []);

  const clear = useCallback((): void => {
    clearTimer();
    setHighlight(null);
  }, []);

  useEffect(() => clearTimer, []);

  return { highlight, show, clear };
}
