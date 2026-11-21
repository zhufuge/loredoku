import { useCallback, useEffect, useRef, useState } from 'react';
import type { GamePlacementPulse, GamePlacementWave } from '@/components/map/MapGameLayers';
import { cellKey, clearCell, type GamePlacementState } from '@/lib/gamePlacement';

/** 刚放下的编号 / 标记挂 `place-pop` 类的时长：动画 180ms，多留一段让同帧放下的另一格也各自挂着。 */
const GAME_PLACE_PULSE_MS = 400;

/** 橡皮退场演完到真删的间隔：与 `--motion-base`（180ms）同档，留 40ms 收尾帧。 */
const GAME_ERASE_MS = 220;

/**
 * 落子补的 `×` 每圈晚多少毫秒（水波波速）：45ms 可辨圈又不至等太久，与 `place-pop` 同量级。
 */
const GAME_FORBIDDEN_WAVE_STEP_MS = 45;

/** 一批水波纹挂多久：末圈延迟 + 动画时长 + 余量；摘类是为了下一波能重挂同名类。 */
const GAME_FORBIDDEN_WAVE_MS = 1200;

/**
 * 棋盘上的一次性动效：编号盖章、橡皮退场、落笔 `×` 弹一下、补出的 `×` 按圈浮出；类只挂一小会儿到点自摘，不改棋盘（例外 `eraseCell` 要等退场演完才删）。
 */
export interface GamePlacementFx {
  pulse: GamePlacementPulse;
  forbiddenPop: number;
  forbiddenPopCell: string | null;
  erasing: ReadonlySet<string>;
  forbiddenWave: GamePlacementWave;
  forbiddenWaveAlt: boolean;
  /** 给刚放下的编号挂一次盖章（400ms 后自己摘）。 */
  markPulse: (key: string, participantId: number) => void;
  /** 让悬停的那枚 `×` 弹一次，并把它钉在刚落笔的格子上。 */
  pulseForbiddenHint: (key: string) => void;
  /** 落子之后，让这一手补出来的 `×` 一圈一圈浮出来。 */
  pulseForbiddenWave: (plan: Array<{ key: string; ring: number }>) => void;
  /** 橡皮点掉一格：先演退场，`GAME_ERASE_MS` 之后才真的删。 */
  eraseCell: (x: number, y: number) => void;
  /** 重开一局：把正在退场的格子与盖章表收干净。 */
  resetBoardFx: () => void;
}

export function usePlacementFx({
  updatePlacement,
}: {
  updatePlacement: (updater: (state: GamePlacementState) => GamePlacementState) => void;
}): GamePlacementFx {
  /** 刚放下的编号 / 标记，按格子键索引；见 `MapGamePlacementLayer` 的 `pulse`。 */
  const [pulse, setPulse] = useState<GamePlacementPulse>({});
  const pulseTimersRef = useRef<Map<string, number>>(new Map());
  /**
   * 落笔令牌 + 落笔格：换 `animation-name` 重播（只增不减），`forbiddenPopCell` 把动效钉在刚落笔的格子；不用 React `key` 重挂载——那样 `<img>` 会丢一帧。
   */
  const [forbiddenPop, setForbiddenPop] = useState(0);
  const [forbiddenPopCell, setForbiddenPopCell] = useState<string | null>(null);
  const forbiddenPopTimerRef = useRef<number | null>(null);
  /** 正在退场的格子（橡皮点掉它了）；见 `MapGamePlacementLayer` 的 `erasing`。 */
  const [erasing, setErasing] = useState<ReadonlySet<string>>(() => new Set());
  const eraseTimersRef = useRef<Map<string, number>>(new Map());
  /** 刚落子那一圈自动补出的 `×`：格子键 → 入场延迟（ms）。 */
  const [forbiddenWave, setForbiddenWave] = useState<GamePlacementWave>({});
  /** 这一波用哪支动画名；每落一子翻转一次，让同名元素也能重播。 */
  const [forbiddenWaveAlt, setForbiddenWaveAlt] = useState(false);
  const forbiddenWaveTimerRef = useRef<number | null>(null);

  /** 给刚放下的编号挂「盖章」，按格子键存表（按住滑动时每格各自 400ms 过期）。 */
  const markPulse = useCallback((key: string, participantId: number): void => {
    setPulse((previous) => ({ ...previous, [key]: participantId }));
    const timers = pulseTimersRef.current;
    const existing = timers.get(key);
    if (existing !== undefined) window.clearTimeout(existing);
    timers.set(
      key,
      window.setTimeout(() => {
        timers.delete(key);
        setPulse((previous) => {
          if (!(key in previous)) return previous;
          const next = { ...previous };
          delete next[key];
          return next;
        });
      }, GAME_PLACE_PULSE_MS),
    );
  }, []);

  /** 令牌 +1 让悬停的 `×` 弹一次，并把动效钉在刚落笔的格子（否则指针挪格会又弹一次）。 */
  const pulseForbiddenHint = useCallback((key: string): void => {
    setForbiddenPop((previous) => previous + 1);
    setForbiddenPopCell(key);
    if (forbiddenPopTimerRef.current !== null) {
      window.clearTimeout(forbiddenPopTimerRef.current);
    }
    forbiddenPopTimerRef.current = window.setTimeout(() => {
      forbiddenPopTimerRef.current = null;
      setForbiddenPopCell(null);
    }, GAME_PLACE_PULSE_MS);
  }, []);

  /** 把圈号换算成延迟写进 `forbiddenWave`，并按 `forbiddenWaveAlt` 换动画名重播。 */
  const pulseForbiddenWave = useCallback((plan: Array<{ key: string; ring: number }>): void => {
    if (plan.length === 0) return;
    const next: Record<string, number> = {};
    for (const cell of plan) next[cell.key] = cell.ring * GAME_FORBIDDEN_WAVE_STEP_MS;
    setForbiddenWave(next);
    setForbiddenWaveAlt((previous) => !previous);
    if (forbiddenWaveTimerRef.current !== null) {
      window.clearTimeout(forbiddenWaveTimerRef.current);
    }
    forbiddenWaveTimerRef.current = window.setTimeout(() => {
      forbiddenWaveTimerRef.current = null;
      setForbiddenWave({});
    }, GAME_FORBIDDEN_WAVE_MS);
  }, []);

  /**
   * 先演退场再删：先记进 `erasing`（挂 `erase-out`），`GAME_ERASE_MS` 后才 `clearCell`；每格各记各的 timer，避免按住滑过多格时互相顶掉。
   */
  const eraseCell = useCallback(
    (x: number, y: number): void => {
      const key = cellKey(x, y);
      const timers = eraseTimersRef.current;
      // 已经在退场：这一格不再重启动画，否则按住来回蹭会把动画一直按在第一帧。
      if (timers.has(key)) return;
      setErasing((previous) => {
        if (previous.has(key)) return previous;
        const next = new Set(previous);
        next.add(key);
        return next;
      });
      timers.set(
        key,
        window.setTimeout(() => {
          timers.delete(key);
          setErasing((previous) => {
            if (!previous.has(key)) return previous;
            const next = new Set(previous);
            next.delete(key);
            return next;
          });
          updatePlacement((state) => clearCell(state, { x, y }));
        }, GAME_ERASE_MS),
      );
    },
    [updatePlacement],
  );

  /** 重开一局：撤掉退场中的格子及其定时器（到点会清掉下一局刚放的东西）。 */
  const resetBoardFx = useCallback((): void => {
    setPulse({});
    for (const timer of eraseTimersRef.current.values()) window.clearTimeout(timer);
    eraseTimersRef.current.clear();
    setErasing(new Set());
  }, []);

  /** 动效的定时器都挂在 DOM 之外，卸载时要撤 —— 到点会对着已卸载的组件 setState。 */
  useEffect(
    () => () => {
      for (const timer of pulseTimersRef.current.values()) window.clearTimeout(timer);
      pulseTimersRef.current.clear();
      for (const timer of eraseTimersRef.current.values()) window.clearTimeout(timer);
      eraseTimersRef.current.clear();
      if (forbiddenPopTimerRef.current !== null) {
        window.clearTimeout(forbiddenPopTimerRef.current);
        forbiddenPopTimerRef.current = null;
      }
      if (forbiddenWaveTimerRef.current !== null) {
        window.clearTimeout(forbiddenWaveTimerRef.current);
        forbiddenWaveTimerRef.current = null;
      }
    },
    [],
  );

  return {
    pulse,
    forbiddenPop,
    forbiddenPopCell,
    erasing,
    forbiddenWave,
    forbiddenWaveAlt,
    markPulse,
    pulseForbiddenHint,
    pulseForbiddenWave,
    eraseCell,
    resetBoardFx,
  };
}
