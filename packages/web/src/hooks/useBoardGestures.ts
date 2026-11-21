import { useRef, useState, type MutableRefObject } from 'react';
import { GAME_CLEAR_LONG_PRESS_MS, GAME_LONG_PRESS_MS, GAME_PRESS_RING_DELAY_MS } from '@loredoku/shared';
import {
  autoForbiddenWavePlan,
  canPlaceForbidden,
  cellKey,
  clearAll,
  modeAfterPlacement,
  placeForbidden,
  placeParticipant,
  placementBlockReason,
  toggleForbidden,
  type GameOperationMode,
  type GamePlacementState,
  type ParticipantPlacementVariant,
} from '@/lib/gamePlacement';

/**
 * 棋盘手势：一格一次落下 / 长按、清除按钮单击与长按（500ms 放头像、800ms 清空）；只读 `mode`，与计时、判卷、结算无关。
 */
export interface BoardGestures {
  /** 正在被长按的格子（有值时棋盘上画一圈进度环）。 */
  pressCell: { x: number; y: number; seq: number } | null;
  /** 清除按钮上的长按进度（`null` = 环不在画）。 */
  clearPress: number | null;
  /** 长按状态本体 —— 指针处理器要读 `fired` 判断「这一手已经生效」。 */
  cellPressRef: MutableRefObject<{ timer: number; ringTimer: number; fired: boolean } | null>;
  /** 落一格。`stroke` = 按住拖动的一笔（只加不清，见实现）。 */
  dispatchCell: (
    x: number,
    y: number,
    variant: ParticipantPlacementVariant,
    stroke?: boolean,
  ) => boolean;
  startCellPress: (x: number, y: number, participantId: number) => void;
  endCellPress: () => void;
  dropCellPress: () => void;
  cancelCellPress: () => void;
  startClearPress: () => void;
  endClearPress: () => void;
}

export function useBoardGestures({
  mode,
  applyMode,
  toggleTool,
  gridSize,
  blockingCells,
  updatePlacement,
  placementRef,
  markPulse,
  pulseForbiddenHint,
  pulseForbiddenWave,
  eraseCell,
}: {
  mode: GameOperationMode;
  applyMode: (next: GameOperationMode) => void;
  toggleTool: (tool: 'forbidden' | 'clearing') => void;
  gridSize: number;
  blockingCells: Set<string>;
  updatePlacement: (updater: (state: GamePlacementState) => GamePlacementState) => void;
  /** 棋盘的镜像：手势在渲染之外触发，必须读「此刻」的那一份。 */
  placementRef: MutableRefObject<GamePlacementState>;
  markPulse: (key: string, participantId: number) => void;
  pulseForbiddenHint: (key: string) => void;
  pulseForbiddenWave: (plan: Array<{ key: string; ring: number }>) => void;
  eraseCell: (x: number, y: number) => void;
}): BoardGestures {
  /** 正在被长按的格子；`seq` 每次按下递增，环靠它重新挂载、从头画。 */
  const [pressCell, setPressCell] = useState<{ x: number; y: number; seq: number } | null>(null);
  /** 清除按钮上的长按进度（轮次号）；与格子环共用 `pressSeqRef`，两环不会同时出现。 */
  const [clearPress, setClearPress] = useState<number | null>(null);
  const pressSeqRef = useRef(0);
  /** Long-press on the clear button wipes the whole board (SPEC-G04 §10.2). */
  const clearPressRef = useRef<{ timer: number; ringTimer: number; fired: boolean } | null>(null);
  /**
   * 长按放头像（短按放编号），触发后紧随的 click 必须吞掉；`ringTimer` 让进度环延迟 160ms 挂载，单点不闪。
   */
  const cellPressRef = useRef<{ timer: number; ringTimer: number; fired: boolean } | null>(null);

  /**
   * 一格交互按 `mode` 分派；必须读 `placementRef.current`（拖动在同一事件循环内连调）；被拒静默 `return false`；拖动只加不清。
   */
  const dispatchCell = (
    x: number,
    y: number,
    variant: ParticipantPlacementVariant,
    stroke = false,
  ): boolean => {
    const board = placementRef.current.board;
    if (mode.kind === 'placing') {
      /** 笔画里重复滑过已有编号：不做，也不返回 `true`（环 / 动效不该当成功）。 */
      if (stroke && variant === 'number') {
        const current = board[cellKey(x, y)] ?? null;
        if (current?.kind === 'numbers' && current.entries.includes(mode.participantId)) {
          return false;
        }
      }
      const block = placementBlockReason({
        board,
        x,
        y,
        participantId: mode.participantId,
        blockingCells,
        variant,
      });
      if (block) return false;
      /** 波纹计划必须在落子前算：`placeParticipant` 只回状态，说不出新增哪几格。 */
      const wavePlan = autoForbiddenWavePlan({
        board,
        x,
        y,
        gridSize,
        blockingCells,
        variant,
      });
      updatePlacement((state) =>
        placeParticipant(state, {
          x,
          y,
          participantId: mode.participantId,
          blockingCells,
          gridSize,
          variant,
        }),
      );
      if (wavePlan) pulseForbiddenWave(wavePlan);
      if (variant === 'number') markPulse(cellKey(x, y), mode.participantId);
      /** 头像落下即整手结束，走 `applyMode`（离开放置态 → `escape` 的规矩收在它一处）。 */
      const nextMode = modeAfterPlacement(mode, variant);
      if (nextMode !== mode) applyMode(nextMode);
      return true;
    }
    if (mode.kind === 'forbidden') {
      const key = cellKey(x, y);
      const before = placementRef.current.board[key] ?? null;
      /** `×` 只在单击时是开关；拖动划回来时跳过，不擦除。 */
      if (before?.kind === 'forbidden') {
        if (stroke) return false;
        updatePlacement((state) => toggleForbidden(state, { x, y, blockingCells }));
        return true;
      }
      // 放不进去（不可站立 / 头像格）时什么都不做 —— 那一格本来就没有
      // `×` 可放。
      if (!canPlaceForbidden({ board: placementRef.current.board, x, y, blockingCells })) {
        return false;
      }
      // 静默放置，不挂 `markPulse`；入场动效由提示层在落笔这一格演。
      updatePlacement((state) => placeForbidden(state, { x, y, blockingCells }));
      pulseForbiddenHint(cellKey(x, y));
      return true;
    }
    if (mode.kind === 'clearing') {
      const key = cellKey(x, y);
      // 空格上什么都不会发生 —— 连动效都不该有，那一格本来就没东西可擦。
      if (!placementRef.current.board[key]) return false;
      eraseCell(x, y);
      return true;
    }
    return false;
  };

  /**
   * 按下启动长按定时器（到点放头像），短按由随后的 click 收尾；环延迟 160ms 挂载，被拒立刻收回、不留满环。
   */
  const startCellPress = (x: number, y: number, participantId: number): void => {
    /** 放不进去（不可站立 / `×` / 自己头像格）就不开始：不挂定时器、不画环、不提示。 */
    const refused = placementBlockReason({
      board: placementRef.current.board,
      x,
      y,
      participantId,
      blockingCells,
      variant: 'image',
    });
    if (refused) return;

    const stale = cellPressRef.current;
    if (stale) {
      window.clearTimeout(stale.timer);
      window.clearTimeout(stale.ringTimer);
    }
    const press = { timer: 0, ringTimer: 0, fired: false };
    pressSeqRef.current += 1;
    const seq = pressSeqRef.current;
    press.ringTimer = window.setTimeout(() => {
      // 已经抬手 / 换了手势：这一圈不该再出现。
      if (cellPressRef.current !== press) return;
      setPressCell({ x, y, seq });
    }, GAME_PRESS_RING_DELAY_MS);
    press.timer = window.setTimeout(() => {
      press.fired = true;
      if (!dispatchCell(x, y, 'image')) setPressCell(null);
    }, GAME_LONG_PRESS_MS);
    cellPressRef.current = press;
  };

  /** 抬手：定时器作废；长按已生效则保留 `fired` 供随后的 click 吞掉。 */
  const endCellPress = (): void => {
    setPressCell(null);
    const press = cellPressRef.current;
    if (!press) return;
    window.clearTimeout(press.timer);
    window.clearTimeout(press.ringTimer);
    if (!press.fired) cellPressRef.current = null;
  };

  /** 移出画布 / 指针中断：连 `fired` 一起丢——不会再有 click 来收尾。 */
  const dropCellPress = (): void => {
    setPressCell(null);
    const press = cellPressRef.current;
    if (!press) return;
    window.clearTimeout(press.timer);
    window.clearTimeout(press.ringTimer);
    cellPressRef.current = null;
  };

  /** 按住滑动不是长按：定时器与环作废，`fired` 不留（click 由 `paintedRef` 吞）。 */
  const cancelCellPress = (): void => {
    setPressCell(null);
    const press = cellPressRef.current;
    if (!press) return;
    window.clearTimeout(press.timer);
    window.clearTimeout(press.ringTimer);
    cellPressRef.current = null;
  };

  const startClearPress = (): void => {
    const press = { timer: 0, ringTimer: 0, fired: false };
    pressSeqRef.current += 1;
    const seq = pressSeqRef.current;
    // 与格子上的环同一个延迟：单点（切换清除工具）不该闪一圈。
    press.ringTimer = window.setTimeout(() => {
      if (clearPressRef.current !== press) return;
      setClearPress(seq);
    }, GAME_PRESS_RING_DELAY_MS);
    press.timer = window.setTimeout(() => {
      press.fired = true;
      // 清空是一次性的，棋盘随即变空 —— 满环留在空棋盘上没有意义，立即收。
      // v0.9.1 §4：不再弹「已清空全部放置」—— 棋盘当场变空本身就是反馈。
      setClearPress(null);
      applyMode({ kind: 'clearing' });
      updatePlacement(clearAll);
      // v0.9.2 §3：清空是「整盘抹掉」，比棋格的 500ms 更长（800ms）——
      // 两者后果不是一个量级，触发阈值也不该一样轻。
    }, GAME_CLEAR_LONG_PRESS_MS);
    clearPressRef.current = press;
  };

  const endClearPress = (): void => {
    setClearPress(null);
    const press = clearPressRef.current;
    if (!press) return;
    window.clearTimeout(press.timer);
    window.clearTimeout(press.ringTimer);
    clearPressRef.current = null;
    // A completed long-press already acted; only a short tap toggles the mode.
    if (press.fired) return;
    toggleTool('clearing');
  };

  return {
    pressCell,
    clearPress,
    cellPressRef,
    dispatchCell,
    startCellPress,
    endCellPress,
    dropCellPress,
    cancelCellPress,
    startClearPress,
    endClearPress,
  };
}
