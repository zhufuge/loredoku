import { useCallback, useEffect, useRef, useState } from 'react';
import { clearGameCompletion } from '@/lib/gameCompletion';
import { resetGameTimer, writeGameTimer } from '@/lib/gameTimer';

/**
 * 一局的秒表：累计用时、每秒一刷、每 5 秒（及页面隐藏 / 卸载）落盘；「读之前不能写」的闸别拆，计时与完成时间不共存。
 */
export interface GameTimer {
  /** 累计用时（毫秒），渲染每秒读一次。 */
  elapsedMs: number;
  /** 停表（提交那一刻），并把结果落盘。返回停在第几毫秒。 */
  pauseTimer: () => number;
  /** 接着走表（未通过关掉弹窗 / 继续游戏）。 */
  resumeTimer: () => void;
  /** 归零重计（重新开始 / 再玩一次）。 */
  resetTimer: () => void;
  /** 水合：把读到的存档装进秒表，并按需起表或停在 00:00。 */
  hydrateTimer: (elapsedMs: number, running: boolean) => void;
}

export function useGameTimer({
  storageId,
  progressMeta,
  active,
}: {
  storageId: string | null;
  progressMeta: { gridSize: number; participantCount: number };
  /**
   * 允许落盘吗 —— 水合跑完且网格已读到；挡「画布还没到」与换关时数据未到两处。
   */
  active: boolean;
}): GameTimer {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [timerRunning, setTimerRunning] = useState(true);
  const elapsedRef = useRef(0);
  const runningSinceRef = useRef<number | null>(null);

  const currentElapsed = useCallback((): number => {
    const since = runningSinceRef.current;
    return since === null ? elapsedRef.current : elapsedRef.current + (Date.now() - since);
  }, []);

  /** 停表：把当前这一段并进累计值，并立刻落盘。返回停在第几毫秒。 */
  const pauseTimer = useCallback((): number => {
    const value = currentElapsed();
    elapsedRef.current = value;
    runningSinceRef.current = null;
    setElapsedMs(value);
    setTimerRunning(false);
    if (storageId) writeGameTimer(storageId, progressMeta, value);
    return value;
  }, [currentElapsed, storageId, progressMeta]);

  const resumeTimer = useCallback((): void => {
    if (runningSinceRef.current !== null) return;
    runningSinceRef.current = Date.now();
    setElapsedMs(elapsedRef.current);
    setTimerRunning(true);
    // 表一旦重新走起来，这一局就不再是「已定案」的了。
    if (storageId) clearGameCompletion(storageId);
  }, [storageId]);

  /** 重新计时：清零、清掉本地记录、从这一帧重新走。 */
  const resetTimer = useCallback((): void => {
    elapsedRef.current = 0;
    runningSinceRef.current = Date.now();
    setElapsedMs(0);
    setTimerRunning(true);
    // 只归零用时，保留「最后离开时间」—— 重新开始也算「来玩过」。
    if (storageId) resetGameTimer(storageId, progressMeta);
    // 重开一局，完成时间就该跟着一起清掉（计时与完成时间不共存）。
    if (storageId) clearGameCompletion(storageId);
  }, [storageId, progressMeta]);

  /**
   * 水合：已完成再进入 → 定格 00:00，等 `resetTimer()` 才重新起表（用户规则）。
   */
  const hydrateTimer = useCallback((value: number, running: boolean): void => {
    elapsedRef.current = value;
    runningSinceRef.current = running ? Date.now() : null;
    setElapsedMs(value);
    setTimerRunning(running);
  }, []);

  useEffect(() => {
    if (!timerRunning) return;
    const interval = window.setInterval(() => {
      const since = runningSinceRef.current;
      if (since === null) return;
      setElapsedMs(elapsedRef.current + (Date.now() - since));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [timerRunning]);

  /**
   * 每 5 秒落盘一次（意外关闭最多丢 5 秒）；水合前不落盘（0 毫秒是删键，会删掉正要读的记录），`active` 同时挡换关串成绩。
   */
  useEffect(() => {
    if (!storageId || !active) return;
    const persist = (): void => {
      writeGameTimer(storageId, progressMeta, currentElapsed());
    };
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') persist();
    };
    const interval = window.setInterval(persist, 5000);
    window.addEventListener('pagehide', persist);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('pagehide', persist);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      persist();
    };
  }, [storageId, progressMeta, currentElapsed, active]);

  return { elapsedMs, pauseTimer, resumeTimer, resetTimer, hydrateTimer };
}
