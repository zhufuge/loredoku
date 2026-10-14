import { useEffect, useState } from 'react';
import { useBlocker } from 'react-router-dom';

export interface UnsavedChangesGuard {
  open: boolean;
  confirmLeave: () => void;
  cancelLeave: () => void;
}

/**
 * BUG-01: unified unsaved-changes guard built on the Data Router blocker.
 *
 * - In-app navigation is intercepted by `useBlocker`; the confirmation dialog
 *   is driven solely by `blocker.state === 'blocked'`.
 * - Refresh / tab close is caught by `beforeunload`.
 * - A `popstate` fallback covers browsers where the router blocker does not fire
 *   in time; it surfaces the same dialog so the user can still choose to stay.
 */
export function useUnsavedChangesGuard(dirty: boolean): UnsavedChangesGuard {
  const blocker = useBlocker(dirty);
  const [fallbackOpen, setFallbackOpen] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) {
      setFallbackOpen(false);
      return;
    }
    const onPopState = (): void => {
      window.setTimeout(() => {
        setFallbackOpen(true);
      }, 300);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [dirty]);

  return {
    open: blocker.state === 'blocked' || fallbackOpen,
    confirmLeave: () => {
      setFallbackOpen(false);
      if (blocker.state === 'blocked') {
        requestAnimationFrame(() => blocker.proceed());
      }
    },
    cancelLeave: () => {
      setFallbackOpen(false);
      if (blocker.state === 'blocked') blocker.reset();
    },
  };
}
