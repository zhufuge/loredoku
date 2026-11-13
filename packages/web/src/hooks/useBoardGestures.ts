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
 * 棋盘上的**手势**：一格一次落下、一格一次长按、清除按钮的单击与长按。
 *
 * v0.10.4：从 `GamePage` 搬出来。这一块的特点是「定时器里做事」—— 长按 500ms 才
 * 放头像、清空要 800ms，单点与长按还共用同一颗按钮，于是每个手势都要处理
 * 「抬手早于阈值」「长按已生效、随后那一记 click 要吞掉」这些尾巴。它只读
 * `mode`（现在是哪支工具），只管「把这一手变成棋盘上的变化」，与计时、判卷、
 * 结算都没有一行关系。
 *
 * 长按环的两个 `ref` 留在这一层：`pressCell` 是给图层画的，`clearPress` 是给
 * 按钮画的，两者共用同一个递增器 —— 它们不会同时出现。
 */
export interface BoardGestures {
  /** 正在被长按的格子（有值时棋盘上画一圈进度环）。 */
  pressCell: { x: number; y: number; seq: number } | null;
  /** 清除按钮上的长按进度（`null` = 环不在画）。 */
  clearPress: number | null;
  /** 长按状态本体 —— 指针处理器要读 `fired` 判断「这一手已经生效」。 */
  cellPressRef: MutableRefObject<{ timer: number; ringTimer: number; fired: boolean } | null>;
  dispatchCell: (x: number, y: number, variant: ParticipantPlacementVariant) => boolean;
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
  /**
   * v0.7.11：正在被长按的格子 —— 有值时棋盘上画一圈进度环，抬手 / 移出 /
   * 中断即清。`seq` 每次按下递增，环靠它重新挂载、从头画（同一格连按两次
   * 也要重来，不能接着上一轮的满环）。
   */
  const [pressCell, setPressCell] = useState<{ x: number; y: number; seq: number } | null>(null);
  /**
   * v0.7.11：清除按钮上的长按进度环。存的是轮次号（非空 = 环在画），
   * 与格子环共用 `pressSeqRef` —— 两个环不会同时出现，共用一个递增器足够。
   */
  const [clearPress, setClearPress] = useState<number | null>(null);
  const pressSeqRef = useRef(0);
  /** Long-press on the clear button wipes the whole board (SPEC-G04 §10.2). */
  const clearPressRef = useRef<{ timer: number; ringTimer: number; fired: boolean } | null>(null);
  /**
   * v0.4.0 验收补充 + v0.4.3 CLAR-J01 / SPEC-J02：放置态下在格子上长按 → 放置
   * **参与者头像**（这才是「把参与者放到格子上」，也只有它补同行同列的 ×）；
   * 短按放的是**编号**。与工具栏清除按钮同一模式：定时器触发即生效，随后到来的
   * click 必须被吞掉，否则同一手势会既放头像又放编号。
   *
   * v0.7.11：两个长按都多一个 `ringTimer` —— 进度环延迟 160ms 才挂载，单点
   * （抬手早于 160ms）就什么都不闪。
   */
  const cellPressRef = useRef<{ timer: number; ringTimer: number; fired: boolean } | null>(null);

  /**
   * SPEC-G01 / SPEC-G03 / SPEC-G04 / SPEC-G05 + v0.4.3 SPEC-J02 / SPEC-J03 /
   * SPEC-J05: one cell interaction, dispatched by mode. 放置态下 `variant` 区分
   * **短按（切换编号）**与**长按（放头像）**；其余工具态忽略它。
   *
   * v0.7.11：
   * - 棋盘一律读 `placementRef.current`。按住滑动会在**同一个事件循环**里连着
   *   调用好几次，读渲染闭包里的 `placementState` 会让后一次把前一次覆盖掉。
   * - 返回**是否真的执行了**：长按的进度环靠它决定收场 —— 环画满却什么都没发生，
   *   会读成「按成功了但没反应」，比不画环更糟。
   *
   * v0.9.1 §4：放置被拒一律**静默** —— 不再弹吐司。原先唯一还会说话的是
   * 「该格编号已满」，但它和之前删掉的几条一样属于噪音：格子上的编号已经写满
   * 九个，玩家看得见；再弹一句只是挡住棋盘。`quiet`（滑动时压掉提示）因此也
   * 一并退场，拒绝路径只剩 `return false`。
   */
  const dispatchCell = (x: number, y: number, variant: ParticipantPlacementVariant): boolean => {
    const board = placementRef.current.board;
    if (mode.kind === 'placing') {
      const block = placementBlockReason({
        board,
        x,
        y,
        participantId: mode.participantId,
        blockingCells,
        variant,
      });
      if (block) return false;
      /**
       * v0.10.1：落头像（长按 / 拖动确认）之后，同行同列补出来的 `×` 按圈依次
       * 浮出来，像水波从落点推出去。
       *
       * 计划必须在**落子之前**算：`placeParticipant` 只回一个状态，说不出「这一手
       * 新添了哪几格」，而波纹要的是按圈排好的次序。先用同一份输入算一遍，落盘时
       * 走的是同一个 `autoForbiddenCells`，两者不会跑偏。
       */
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
      /**
       * v0.8.5：头像落下之后，手上就没有东西了 —— 名册那张卡的选中环跟着退掉。
       * 规则本身在 `modeAfterPlacement` 里（编号不受影响，见那里的注释）。
       *
       * v0.8.7：退的还有**触碰态**。之前这里只 `setMode`，于是名册上那道 2px
       * 主色环、棋盘上这位参与者的联动高亮与放大头像一起留了下来 —— 头像明明
       * 已经落定，界面还在说「这位正被拿着」。放置态结束就是整手操作结束，
       * 走 `applyMode`（它已经把「离开放置态 → `escape`」这条规矩收在一处，
       * 见 SPEC-G04）。
       */
      const nextMode = modeAfterPlacement(mode, variant);
      if (nextMode !== mode) applyMode(nextMode);
      return true;
    }
    if (mode.kind === 'forbidden') {
      const key = cellKey(x, y);
      const before = placementRef.current.board[key] ?? null;
      /**
       * v0.7.12：`×` 是一支开关 —— 已经有 `×` 的格子再点一下就收回它
       * （`toggleForbidden`）。这一支要求来自「点错了只好切橡皮」的绕路。
       */
      if (before?.kind === 'forbidden') {
        updatePlacement((state) => toggleForbidden(state, { x, y, blockingCells }));
        return true;
      }
      // v0.7.12：放不进去（不可站立 / 头像格）时什么都不做 —— 那一格本来就没有
      // `×` 可放。
      if (!canPlaceForbidden({ board: placementRef.current.board, x, y, blockingCells })) {
        return false;
      }
      // v0.9.8：放下的 `×` 静默出现，不再挂 `markPulse` —— 演入场动效的是跟着
      // 指针悬停的那一枚（`MapGameToolHintLayer`），放置本身没有可看的动作。
      //
      // 而且是**落笔这一刻、在这一格**才演：提示层按 `forbiddenPop` 换动画名，
      // 并只在自己正停在 `popCell` 时挂类 —— 指针只是移动不该有动效。
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
   * 放置态下在格子上按下：启动长按定时器（到点放**头像**）。没到点就抬手的
   * 短按由随后到来的 `click` 收尾 —— 那一路走 SPEC-J03 的**编号切换**。
   *
   * v0.7.11 两件事：
   * - 环**延迟** 160ms 才挂载。单点根本不会长按，之前它却会在按下的第一帧就
   *   闪出来 —— 那是在预告一件不会发生的事。因此环只画剩下的 340ms，画满的
   *   那一帧仍然是头像落下的那一帧。
   * - 动作被规则拒绝时 `dispatchCell` 返回 false，环立刻收回：不能让一个满环
   *   停在那里冒充「已经放好了」。
   */
  const startCellPress = (x: number, y: number, participantId: number): void => {
    /**
     * v0.7.12：这一格根本放不进去 —— 整段手势都不开始。
     *
     * 不可站立的格子、已经标了 `×` 的格子、以及这位参与者自己的头像格：长按
     * 500ms 的**结果**是不存在的（`placeParticipant` 会原样返回）。但环会照画
     * 一圈满的，画满那一刻却什么都没发生 —— 那是界面在替玩家宣布一件没做成的事。
     * 需求给的说法是「不出现圆圈，不提示，就是无效果」，所以这里在按下的一刻就
     * 退回，连定时器都不挂。
     *
     * v0.9.1 §4：短按（编号）现在同样静默 —— 放置被拒一律不弹提示，于是两类
     * 手势在「放不进去」这件事上的反馈完全一致：环不画、话不说、棋盘不动。
     */
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

  /**
   * 抬手：两个定时器都作废；长按已生效时**保留** `fired`——紧随其后的 click
   * 还要靠它识别「这一手是长按」并把 click 吞掉。
   *
   * 环在抬手时一律收掉：长按已生效的话，满环套在刚放下的头像上只会挡住它。
   */
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

  /**
   * v0.7.11：按住滑动 = 不是长按。定时器与环一起作废，`fired` 也不需要保留 ——
   * 这一笔后面的 click 由 `paintedRef` 吞掉，不靠 `fired`。
   */
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
