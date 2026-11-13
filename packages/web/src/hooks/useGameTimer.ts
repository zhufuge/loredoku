import { useCallback, useEffect, useRef, useState } from 'react';
import { clearGameCompletion } from '@/lib/gameCompletion';
import { resetGameTimer, writeGameTimer } from '@/lib/gameTimer';

/**
 * 一局的秒表：累计用时、每秒一刷、每 5 秒（以及页面隐藏 / 卸载时）落盘。
 *
 * v0.10.4：从 `GamePage` 搬出来。它是这一页唯一一块「跑在渲染之外」的东西 ——
 * 三个 ref 加两条 effect，读写的都是 localStorage 里的同一条记录；留在页面里
 * 与二十几个 `useState` 混在一起时，那条「读之前不能写」的闸很容易被下一次改动
 * 顺手拆掉（v0.9.5 修的就是它）。
 *
 * **计时与完成时间不共存**：表一重新走起来，就说明这一局不再是「已定案」的，
 * 所以 `resumeTimer` / `resetTimer` 会顺手清掉完成记录（v0.9.8 定的）。这条规矩
 * 从前写在页面里，跟着搬过来 —— 它是秒表的事，不是结案卡的事。
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
   * 允许落盘吗 —— 水合跑完、且网格已经读到。
   *
   * 两道口子都靠它挡（见下面落盘 effect 的注释）：先渲染「画布还没到」那一帧，
   * 以及换关时新一关的数据还在路上。
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
    // v0.9.8：表一旦重新走起来，这一局就不再是「已定案」的了。
    if (storageId) clearGameCompletion(storageId);
  }, [storageId]);

  /** 重新计时：清零、清掉本地记录、从这一帧重新走。 */
  const resetTimer = useCallback((): void => {
    elapsedRef.current = 0;
    runningSinceRef.current = Date.now();
    setElapsedMs(0);
    setTimerRunning(true);
    // v0.9.6：只归零用时，保留「最后离开时间」—— 重新开始也算「来玩过」。
    if (storageId) resetGameTimer(storageId, progressMeta);
    // v0.9.8：重开一局，完成时间就该跟着一起清掉（计时与完成时间不共存）。
    if (storageId) clearGameCompletion(storageId);
  }, [storageId, progressMeta]);

  /**
   * 水合：**已完成再进入 → 定格 00:00**。
   *
   * 用户给的规则：「已完成再次进入，定格 00:00，点再玩一次时再开始计时」。
   * 所以这一局不是「接着上次走」，而是「已经结案了，等你想重玩」—— `running`
   * 为假时表停着、数字归零，`resetTimer()` 才把它放回跑道。
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
   * 落盘的时机：每 5 秒一次（意外关闭最多丢 5 秒），页面隐藏 / 卸载时各补一次。
   * 为什么不是每秒：localStorage 是同步写，秒针每跳一次就写一条 JSON 没必要。
   *
   * v0.9.5 修：**水合之前不落盘**。
   *
   * 真浏览器里 `gameQuery.data` 是异步来的，所以这一页会先渲染一次「画布还没到」
   * 的形态（`progressMeta.gridSize === 0`），再渲染一次真的。上一次的那条 effect
   * 在依赖变化时会先跑一次清理 —— 那一刻 `elapsedRef` 还是 0，于是 `persist()`
   * 写进一个「0 毫秒」，而 `writeGameTimer` 对 0 的处理是**删键**。它跑在水合
   * 之前，删的正是水合要读的那条计时 —— 结果是「关掉页面再回来，秒表从 00:00
   * 重新开始」，v0.7.11 的续计时在真浏览器里从来没有生效过。
   *
   * jsdom 用例看不出来：那边 `useGameDetail` 的 mock 第一次渲染就有数据。
   *
   * 修法只加一道闸：`active` 为假时这条 effect 直接返回（不挂定时器、也不注册
   * 卸载落盘）。水合跑完才落盘，读与写就不会抢在同一个时刻。
   *
   * 同一道闸顺带挡住 v0.9.5 发现的第二个口子：**换关**。从定案卡点「下一关」跳到
   * 另一关时组件不重建，新一关的数据还在路上（`draft` 为空 ⇒ `gridSize = 0`），
   * 而秒表里留着上一关的累计值。旧版这里会一次一次把「上一关的用时 + 指纹 0」
   * 写进**新一关**的计时键，既串了成绩，留下的还是一条读不回来的垃圾。
   * 现在 `draft` 没到就把 `active` 打回 false，等新一关读完自己的存档再开闸。
   *
   * `gridSize > 0` 是最后一道保险：指纹为 0 的条目 `readGameTimer` 永远读不回来，
   * 写它没有任何意义 —— 这一条由调用方并进 `active`。
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
