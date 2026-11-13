import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import {
  DEFAULT_CELL_SIZE,
  RULER_ACTIVE_FONT_DELTA,
  type CellCoord,
  type MapStyle,
} from '@loredoku/shared';
import { cellScale, scaleFontSize } from '@/lib/canvasScale';
import {
  canvasInsets,
  centeredPan,
  computeCellSizeForInsets,
  computeWidthFitCellSize,
  isPortraitViewport,
  portraitInsets,
  portraitStageHeight,
  topAlignedPan,
} from '@/lib/canvasSize';
import {
  clientToCanvasPoint,
  clientToCell,
  clampZoom,
  isInBounds,
  zoomAtPoint,
  ZOOM_STEP,
  type CanvasPoint,
} from '@/lib/grid';
import { effectiveCellSize } from '@/lib/mapStyle';
import { rulerStripSize } from '@/lib/ruler';

/**
 * 「棋盘长多大、摆在哪儿、放大到几倍」—— 玩家页的视口。
 *
 * v0.10.4：从 `GamePage` 搬出来。这一块自成一套：格子大小由容器与视口算，
 * 缩放 / 平移由玩家操作，两者共用同一组 `pan` / `zoom`，而游戏逻辑（放置、
 * 计时、判卷）一次都不读它们。原先它散在页面里三处（state 区、`fit` 那一带、
 * 末尾的 `zoomBy`），搬出来才看得清「自适应」这件事的全部输入输出。
 *
 * 一像素都没改：`fit` 的两个分支（竖屏按宽度铺满 / 其余按宽高取小）、标尺条带
 * 计入的四边留白、以及「玩家自己调过视图之后不再自动重排」的豁免，全部照旧。
 */
export interface GameViewport {
  /** 自适应算出来的格子边长（未套地图样式的 `cellSize`）。 */
  autoCellSize: number;
  /** 真正使用的格子边长：竖屏只认自适应值，其余听样式的。 */
  cellSize: number;
  /** 棋盘纸的边长（`gridSize × cellSize`）。 */
  total: number;
  /** 当前是不是「窄且竖着」的屏（棋盘按宽度铺满、视图簇收起）。 */
  portraitFit: boolean;
  /** `<main>` 量出来的可见区，只给定案遮罩估缩放用；`null` = 还没量过。 */
  stageBox: { width: number; height: number } | null;
  pan: { x: number; y: number };
  setPan: (next: { x: number; y: number }) => void;
  zoom: number;
  setZoom: (next: number) => void;
  /** 空格键按住中（抓手光标 / 拖拽平移）。 */
  spaceHeld: boolean;
  /** 重新测量并铺满：也是「重置视图」。 */
  fit: () => void;
  zoomBy: (direction: 1 | -1) => void;
  toCell: (clientX: number, clientY: number) => CellCoord | null;
  toCanvasPoint: (clientX: number, clientY: number) => CanvasPoint | null;
  /** 用户手动调过视图后，容器尺寸变化不再强制重排。 */
  userAdjustedRef: MutableRefObject<boolean>;
  /** 竖屏下 `<main>` 要定高（棋盘 + 上下留白）；其余返回 `undefined`。 */
  stageHeight: number | undefined;
}

export function useGameViewport({
  containerRef,
  gridSize,
  style,
  showRulers,
}: {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  gridSize: number;
  style: MapStyle;
  showRulers: boolean;
}): GameViewport {
  /**
   * v0.10.1：当前是不是「竖屏窄屏」—— 棋盘按宽度铺满、视图簇收起。
   *
   * 判定口径是**窗口**的宽高（`window.innerWidth < 768 && innerHeight > innerWidth`），
   * 与右栏那串 `portrait:max-md:` 媒体查询是同一个条件；之所以两边都写，是因为
   * CSS 只能管「显示不显示」，管不了「格子怎么算」。数字必须一致，
   * `PORTRAIT_BREAKPOINT` 是两边共同的出处（见 `lib/canvasSize.ts`）。
   *
   * 只影响渲染，不落盘：转屏、拖窗口都会重新 `fit` 一遍。
   */
  const [portraitFit, setPortraitFit] = useState(false);

  /**
   * v0.10.2：`<main>` 量出来的可见区，只给「定案」遮罩估缩放用。
   *
   * 为什么不能只看棋盘：横屏手机上棋盘按作者配的 `cellSize` 能有 900 多，而
   * `<main>` 只有一百来像素高 —— 按棋盘算出来是「不用缩」，字就顶出可见区了
   * （用户：「大小要自适应屏幕」）。这里量的是画布容器本身，`<main>` 就是那个
   * 容器（`containerRef`），`fit` 与它的 `ResizeObserver` 每次都会经过，顺手同步。
   *
   * `null` 表示还没量过；那时 `verdictMarkScale` 只按棋盘算（挂载瞬间不闪小的）。
   */
  const [stageBox, setStageBox] = useState<{ width: number; height: number } | null>(null);

  /**
   * v0.6.2：视图缩放与拖拽平移，与只读预览页同一套手感 ——
   * 缩放簇（放大 / 百分比 / 缩小 / 重置）、Ctrl+滚轮、空格或中键拖拽。
   */
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  /** 用户手动调过视图后，容器尺寸变化不再强制重排（预览页同款豁免）。 */
  const userAdjustedRef = useRef(false);

  const [autoCellSize, setAutoCellSize] = useState<number>(DEFAULT_CELL_SIZE);
  /*
   * v0.10.1：竖屏下格子大小只认「按宽度铺满」算出来的那个数 —— 地图样式里写死的
   * cellSize（比如 36）会让 24×24 又变成 864px 宽，把「自适应宽度」抵消掉。
   * 横屏与桌面仍然听样式的（作者配了就用他的）。
   */
  const cellSize = portraitFit ? autoCellSize : effectiveCellSize(autoCellSize, style);
  const total = gridSize * cellSize;

  const rulerScale = cellScale(cellSize);
  const rulerMaxFont = scaleFontSize(style.ruler.fontSize + RULER_ACTIVE_FONT_DELTA, rulerScale);
  const rulerStrip = rulerStripSize({ maxFontSize: rulerMaxFont, gap: style.ruler.gap });

  const toCell = useCallback(
    (clientX: number, clientY: number): CellCoord | null => {
      const node = containerRef.current;
      if (!node || gridSize === 0) return null;
      const coord = clientToCell(clientX, clientY, {
        rect: node.getBoundingClientRect(),
        pan,
        zoom,
        cellSize,
      });
      return isInBounds(coord, gridSize) ? coord : null;
    },
    [gridSize, pan, zoom, cellSize],
  );

  /**
   * v0.8.7 §8：同一套换算，但不除格子大小 —— 得到的是「光标在纸上的哪个像素」。
   * 物品名称提示要用它，格子多大都不影响「指头在哪儿」这件事。
   */
  const toCanvasPoint = useCallback(
    (clientX: number, clientY: number): CanvasPoint | null => {
      const node = containerRef.current;
      if (!node) return null;
      return clientToCanvasPoint(clientX, clientY, {
        rect: node.getBoundingClientRect(),
        pan,
        zoom,
        cellSize,
      });
    },
    [pan, zoom, cellSize],
  );

  /**
   * OPT-A01 §1.2: measure the viewport and re-fit the board. The game page has
   * no floating bottom toolbar, hence `showBottomBar: false`.
   *
   * v0.6.2：这也是「重置视图」——回到 100% 并居中，同时清掉「用户调整过」
   * 的标记，让容器尺寸变化重新接管布局。
   */
  const fit = useCallback((): void => {
    const node = containerRef.current;
    userAdjustedRef.current = false;
    if (!node || gridSize === 0) return;
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    /* v0.10.2：顺手把可见区记下来，给「定案」遮罩估缩放（见 `stageBox`）。 */
    setStageBox((previous) =>
      previous && previous.width === rect.width && previous.height === rect.height
        ? previous
        : { width: rect.width, height: rect.height },
    );
    /*
     * v0.10.1：竖屏下棋盘**按宽度铺满**，而不是「宽高取小」。
     *
     * 窄屏上那一簇放大 / 缩小 / 重置已经收掉（见右栏视图簇的 `portrait:` 类），
     * 玩家既没法把棋盘缩小、也没有中键 / 空格去平移 —— 一旦按老算法取「宽高较
     * 小的那个」，24×24 的棋盘会被 32px 的下限撑到 864 宽，屏幕里只看得到左上
     * 一角，剩下的永远够不着。改成以宽度为准、下限放到 8px，整张图就在屏内。
     *
     * 标尺在竖屏下也一起不画：开关都收起来了，还把 28px 的刻度条留着，等于
     * 让玩家为一条关不掉的边付宽度。
     *
     * 量的是 **window** 而不是画布容器 —— 要和 `portrait:max-md:` 那串媒体查询
     * 判同一件事，否则会出现「按钮收起来了、棋盘还按桌面排」。jsdom 里窗口是
     * 1024×768，所以既有用例仍走桌面分支。
     */
    const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth;
    const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight;
    const portrait = isPortraitViewport(viewportWidth, viewportHeight);
    setPortraitFit(portrait);
    /*
     * v0.10.1：竖屏用自己那一套四边留白（左右 8、上下 12），桌面那套
     * （`CANVAS_PADDING + EXTRA_MARGIN` = 每边 40）在 375 宽的屏上等于白扔两列半
     * 格子。上下比左右多 4px：棋盘上边贴着标题、下边贴着题面面板，四面一样宽会
     * 读成「两块拼在一起」；再多给也不成 —— 竖屏一屏就这么高，上下多占的每一
     * 像素都是从下面的线索与名册里扣的。
     */
    const insets = portrait
      ? portraitInsets()
      : canvasInsets({ showRulers, showBottomBar: false, rulerSize: rulerStrip });
    const next = portrait
      ? computeWidthFitCellSize({ width: rect.width, gridSize, insets })
      : computeCellSizeForInsets({ width: rect.width, height: rect.height, gridSize, insets });
    setAutoCellSize((previous) => (previous === next ? previous : next));
    setZoom(1);
    const placed = portrait ? next : effectiveCellSize(next, style);
    setPan(
      portrait
        ? topAlignedPan(rect, insets, gridSize, placed, 1)
        : centeredPan(rect, insets, gridSize, placed, 1),
    );
  }, [containerRef, gridSize, showRulers, rulerStrip, style]);

  const fitRef = useRef(fit);
  fitRef.current = fit;

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const apply = (): void => {
      /* v0.10.2：可见区与「玩家有没有自己调过视图」无关，先记下来再决定要不要重排。 */
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setStageBox((previous) =>
          previous && previous.width === rect.width && previous.height === rect.height
            ? previous
            : { width: rect.width, height: rect.height },
        );
      }
      // v0.6.2：玩家放大 / 平移之后，改窗口大小不该把视图打回原形。
      if (userAdjustedRef.current) return;
      fitRef.current();
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
  }, [containerRef, gridSize]);

  /** 标尺开关一变就要重排（标尺条带占了四边留白）。落盘在页面那一侧。 */
  useEffect(() => {
    fitRef.current();
  }, [showRulers]);

  /**
   * v0.6.2 §4：按住空格 + 拖拽 = 平移画布，与只读预览页同一套手感。
   *
   * `preventDefault` 挡的是浏览器把空格当成「翻页 / 点击聚焦元素」——
   * 这一页没有任何输入框，不会误伤打字。
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code !== 'Space') return;
      event.preventDefault();
      setSpaceHeld(true);
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code === 'Space') setSpaceHeld(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  /**
   * v0.6.2 §4：按钮以**视口中心**为锚点缩放。按钮在右栏，但用户看的是画布
   * 中间；以按钮位置为锚点会让棋盘每点一下就往一边跑。
   *
   * 缩小到底 / 放大到顶时 `clampZoom` 返回同一个值，这里直接短路 —— 不做无谓
   * 的 pan 重算。
   */
  const zoomBy = (direction: 1 | -1): void => {
    const next = clampZoom(zoom + direction * ZOOM_STEP);
    if (next === zoom) return;
    userAdjustedRef.current = true;
    const node = containerRef.current;
    if (node) {
      const rect = node.getBoundingClientRect();
      const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      setPan(zoomAtPoint(center, rect, pan, next, zoom));
    }
    setZoom(next);
  };

  return {
    autoCellSize,
    cellSize,
    total,
    portraitFit,
    stageBox,
    pan,
    setPan,
    zoom,
    setZoom,
    spaceHeld,
    fit,
    zoomBy,
    toCell,
    toCanvasPoint,
    userAdjustedRef,
    stageHeight: portraitFit ? portraitStageHeight(gridSize, cellSize) : undefined,
  };
}
