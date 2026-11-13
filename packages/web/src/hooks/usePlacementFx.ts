import { useCallback, useEffect, useRef, useState } from 'react';
import type { GamePlacementPulse, GamePlacementWave } from '@/components/map/MapGameLayers';
import { cellKey, clearCell, type GamePlacementState } from '@/lib/gamePlacement';

/**
 * v0.7.11：刚放下的编号 / 标记挂多久的 `place-pop` 类。
 *
 * 动画本身只有 180ms；多留一段是为了让**同一帧里放下的另一格**（按住滑动）也
 * 各自挂着自己的类，而不是互相顶掉。过了这个窗口就摘掉，免得以后任何一次重挂载
 * 把旧格子再「盖章」一遍。
 */
const GAME_PLACE_PULSE_MS = 400;

/**
 * v0.9.8：橡皮擦掉一格时，「退场动效演完」到「真的从棋盘上删掉」之间隔多久。
 *
 * 与 `--motion-base`（180ms）同档：动效是缩小淡出，删早了会被截在半路，删晚了
 * 那格已经透明却还占着「不可站立」的判定。留 40ms 给动画的收尾帧。
 */
const GAME_ERASE_MS = 220;

/**
 * v0.10.1：落子补出来的 `×` 每圈晚多少毫秒 —— 水波纹的波速。
 *
 * 45ms 是「看得出一圈一圈，又不至于等到不耐烦」的那一档：一圈最多 24 格，
 * 最远的格子距落子格 23 圈，末圈在 1035ms 之后才淡入；再快（30ms）就成了「雾
 * 一样整体浮出来」，再慢（80ms）在 24×24 的棋盘上要等近两秒。
 *
 * 与 `place-pop` 的 180ms 同量级 —— 每一圈自己只演 180ms，圈与圈之间留 45ms
 * 的步进，于是总能看到三四个圈同时在扩散。
 */
const GAME_FORBIDDEN_WAVE_STEP_MS = 45;

/**
 * v0.10.1：一批水波纹挂多久。末圈延迟 + 动画时长 + 一点余量。
 *
 * 摘类不是为了让动效停（`both` 已经把它停在末帧），而是让**下一波**能重新挂上
 * 同名类。这个窗口内玩家再落一子，就直接换 `animation-name`（见 `waveAlt`）。
 */
const GAME_FORBIDDEN_WAVE_MS = 1200;

/**
 * 棋盘上的**一次性动效**：刚落下的编号盖章、橡皮的退场、落笔的 `×` 弹一下、
 * 落子补出来的 `×` 按圈浮出。
 *
 * v0.10.4：从 `GamePage` 搬出来。四样东西各有各的令牌与定时器，却共享同一条
 * 规矩 —— **类只挂一小会儿，到点自己摘**；谁都不改棋盘，改棋盘是调用方的事
 * （唯一的例外是 `eraseCell`：它要等退场演完才真的删）。这一整块原先散在页面
 * 的 state 区和一千行之外，搬到一起之后「哪一格在演什么」能一次读完。
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
   * v0.9.8：**落笔令牌 + 落笔格** —— 点下去放一枚 `×` 时两样一起动。
   *
   * - `forbiddenPop` 让提示层在**两支同款动画**之间换名字（`forbidden-pop` /
   *   `forbidden-pop-alt`）：`animation-name` 一变，CSS 动画就从头播。只增不减。
   * - `forbiddenPopCell` 是**刚落笔的那一格**；动效只在这一格上演，窗口一关归
   *   `null`。这枚 `×` 跟着指针走、是同一个 DOM 节点 —— 不按格子收窄的话，
   *   点完立刻挪到隔壁格，它会带着类飞过去又弹一次。
   *
   * **不用 React `key` 重挂载来重播**：那样 `<img>` 会有一帧没画出来，身后刚
   * 落下的那枚 `×` 从缝里露一下再被盖回去 —— 玩家以为「放下的 × 浮上来闪了
   * 一下」。换 `animation-name` 不碰元素身份，画面不断。
   */
  const [forbiddenPop, setForbiddenPop] = useState(0);
  const [forbiddenPopCell, setForbiddenPopCell] = useState<string | null>(null);
  const forbiddenPopTimerRef = useRef<number | null>(null);
  /** v0.9.8：正在退场的格子（橡皮点掉它了）；见 `MapGamePlacementLayer` 的 `erasing`。 */
  const [erasing, setErasing] = useState<ReadonlySet<string>>(() => new Set());
  const eraseTimersRef = useRef<Map<string, number>>(new Map());
  /**
   * v0.10.1：刚落子那一圈自动补出来的 `×` —— 格子键 → 入场延迟（毫秒）。
   * 见 `MapGamePlacementLayer` 的 `wave`。
   */
  const [forbiddenWave, setForbiddenWave] = useState<GamePlacementWave>({});
  /** 这一波用哪支动画名；每落一子翻转一次，让同名元素也能重播。 */
  const [forbiddenWaveAlt, setForbiddenWaveAlt] = useState(false);
  const forbiddenWaveTimerRef = useRef<number | null>(null);

  /**
   * v0.7.11：给刚放下的编号挂一次「盖章」动效。
   *
   * 用一张「格子键 → 参与者编号」的表而不是单个「最后一格」：按住滑动会连着
   * 放好几格，单值会让前一格的字形在动画播到一半时被摘掉类，缩放猛地弹回原样。
   * 每一格 400ms 后自己过期（动画只有 180ms），表不会越积越大。
   *
   * v0.9.8：`×` 不再走这里 —— 见 `pulseForbiddenHint`。
   */
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

  /**
   * v0.9.8：让悬停的那枚 `×` 弹一次 —— 令牌 +1，并把动效**钉在刚落笔的那一格**。
   *
   * `GAME_PLACE_PULSE_MS`（400ms）之后两样一起收：令牌留着不动（它是 `key` 的
   * 替代品，改回去也算一次变化），`popCell` 归 `null` —— 窗口一关，指针再进来
   * 就只是静止的一枚 `×`。
   *
   * 为什么要 `popCell`：这枚 `×` 跟着指针走，是**同一个** DOM 节点。只告诉它
   * 「现在该弹」，玩家点完立刻挪到隔壁格，它就带着类飞过去、在新格子上又弹一次。
   */
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

  /**
   * v0.10.1：落子之后，让这一手补出来的 `×` 一圈一圈地浮出来。
   *
   * `plan` 是 `autoForbiddenWavePlan` 算好的「格子键 → 距落子格几圈」。这里把圈号
   * 换算成延迟写进 `forbiddenWave`，放置层照延迟给每枚 `×` 挂入场动画 —— 于是
   * 距落子格 1 圈的先生，2 圈的晚 45ms，依此类推，看起来就是一圈水波推出去。
   *
   * 两支动画名交替（`forbiddenWaveAlt`）：连落两位时，第二波如果沿用同名，
   * 已经在演的元素不会重头播；换 `key` 又会丢一帧。换 `animation-name` 两头都躲开。
   */
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
   * v0.9.8：橡皮点掉一格 —— **先演退场，再删**。
   *
   * 直接 `clearCell` 的话，格子上的东西是瞬间消失的：玩家只看到画面重绘了一次，
   * 分不清刚擦掉的是哪一格，按住滑过一片时更是完全跟不上。这里先把格子记进
   * `erasing`（放置层据此挂 `erase-out`：缩小 + 淡出），动画放完才真的删。
   *
   * 每一格各记各的 timer：按住滑过好几格时，几段退场应当并排演，而不是后一格
   * 把前一格的定时器顶掉 —— 那会让前一格永远停在半透明状态。
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

  /**
   * v0.9.8 / v0.10.1：重开一局时把「正在演的东西」收干净。
   *
   * 退场中的格子必须连定时器一起撤 —— 那些 timer 到点会去清一个已经清空的盘，
   * 把下一局刚放下的东西删掉。盖章表同理：一张空棋盘上不该还挂着一格「刚放下」。
   */
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
