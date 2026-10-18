import { useCallback, useEffect, useRef } from 'react';
import { useBlocker, useNavigate } from 'react-router-dom';

export interface UnsavedChangesGuard {
  open: boolean;
  confirmLeave: () => void;
  cancelLeave: () => void;
}

/**
 * BUG-101: unified unsaved-changes guard built on the Data Router blocker.
 *
 * - In-app navigation is intercepted by `useBlocker`; the confirmation dialog
 *   is driven solely by `blocker.state === 'blocked'` (no local open state).
 * - Refresh / tab close is caught by `beforeunload`.
 * - `proceed()` / `reset()` are called synchronously while the blocker state is
 *   still `blocked`; the latest blocker is held in a ref to avoid stale closures.
 */
export function useUnsavedChangesGuard(dirty: boolean): UnsavedChangesGuard {
  const navigate = useNavigate();
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  const blockerRef = useRef(blocker);
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    blockerRef.current = blocker;
    dirtyRef.current = dirty;
  }, [blocker, dirty]);

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
    if (!dirty) return;
    const onPopState = (): void => {
      window.setTimeout(() => {
        const current = blockerRef.current;
        if (current.state === 'blocked') return;
        if (!dirtyRef.current) return;
        if (window.location.pathname.startsWith('/maps/')) {
          console.warn('[useUnsavedChangesGuard] popstate fallback: forcing navigation back');
          navigate(-1);
        }
      }, 500);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [dirty, navigate]);

  const confirmLeave = useCallback((): void => {
    const current = blockerRef.current;
    if (current.state !== 'blocked') return;
    current.proceed();
  }, []);

  const cancelLeave = useCallback((): void => {
    const current = blockerRef.current;
    if (current.state !== 'blocked') return;
    current.reset();
  }, []);

  return { open: blocker.state === 'blocked', confirmLeave, cancelLeave };
}
