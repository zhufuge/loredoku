import { useCallback, useEffect, useRef, useState } from 'react';
import {
  HIGHLIGHT_DURATION_CLICK_MS,
  HIGHLIGHT_DURATION_TOUCH_MS,
  type ParticipantTriggerKey,
} from '@murdoku/shared';
import type { HighlightState } from '@/lib/highlight';

export interface HighlightController {
  highlight: HighlightState | null;
  /**
   * Shows `state`. Duration depends on `state.trigger`:
   * - `click` → 3s (MOD-701)
   * - `touch` → 1s (MOD-701)
   */
  show: (state: HighlightState | null, trigger?: ParticipantTriggerKey) => void;
  clear: () => void;
}

/**
 * MOD-701 (docs/v0.3.2.md): highlight duration depends on the trigger.
 * Click → 3s, touch → 1s. The timer is synchronous — re-triggering
 * replaces the current highlight instead of stacking.
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

  const show = useCallback(
    (state: HighlightState | null, trigger?: ParticipantTriggerKey): void => {
      clearTimer();
      setHighlight(state);
      if (!state) return;
      const duration =
        (trigger ?? state.trigger) === 'click'
          ? HIGHLIGHT_DURATION_CLICK_MS
          : HIGHLIGHT_DURATION_TOUCH_MS;
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setHighlight(null);
      }, duration);
    },
    [],
  );

  const clear = useCallback((): void => {
    clearTimer();
    setHighlight(null);
  }, []);

  useEffect(() => clearTimer, []);

  return { highlight, show, clear };
}