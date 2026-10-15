import { useCallback, useEffect, useRef, useState } from 'react';
import { HIGHLIGHT_FADEOUT_MS, type HighlightState } from '@/lib/highlight';

export { HIGHLIGHT_FADEOUT_MS };

export interface HighlightController {
  highlight: HighlightState | null;
  /** True while a previous highlight is fading out (150ms). */
  leaving: boolean;
  /**
   * Shows `state` persistently (MOD-802: no auto-expiry). Re-triggering
   * replaces the current highlight and cancels any fade-out.
   */
  show: (state: HighlightState | null) => void;
  /** Starts the 150ms fade-out; the layer unmounts afterwards. */
  clear: () => void;
}

/**
 * MOD-802 (docs/v0.3.3.md): highlights no longer expire on a timer. They
 * stay until the activation state machine clears them, with a short
 * 150ms fade-out transition (spec §1.2.4).
 */
export function useHighlight(): HighlightController {
  const [highlight, setHighlight] = useState<HighlightState | null>(null);
  const [leaving, setLeaving] = useState(false);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback((): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const show = useCallback(
    (state: HighlightState | null): void => {
      clearTimer();
      setLeaving(false);
      setHighlight(state);
    },
    [clearTimer],
  );

  const clear = useCallback((): void => {
    clearTimer();
    setLeaving(true);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setLeaving(false);
      setHighlight(null);
    }, HIGHLIGHT_FADEOUT_MS);
  }, [clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  return { highlight, show, clear, leaving };
}
