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
 * 「棋盘长多大、摆在哪儿、放大到几倍」—— 玩家页的视口：格子大小与 pan / zoom 共用一套，游戏逻辑一次不读；`fit`、四边留白、不自动重排是「自适应」的全部输入输出。
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
  ready,
}: {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  gridSize: number;
  style: MapStyle;
  showRulers: boolean;
  /**
   * `<main>` 这一拍是否真的挂载：loading 期间不渲染，effect 只依赖稳定的 `containerRef` 不会自己醒，必须靠 `false → true` 重跑，否则 `fit()` 一次都不跑、格子停在 32、棋盘缩左上角。
   */
  ready: boolean;
}): GameViewport {
  /**
   * 是否「竖屏窄屏」：按 window 宽高判定，必须与 `portrait:max-md:` 同一条件；阈值是 `PORTRAIT_BREAKPOINT`（`lib/canvasSize.ts`），只影响渲染不落盘。
   */
  const [portraitFit, setPortraitFit] = useState(false);

  /**
   * `<main>` 量出来的可见区，只给定案遮罩估缩放用（横屏手机上棋盘可比 `<main>` 大得多）；`null` = 还没量过，那时只按棋盘算。
   */
  const [stageBox, setStageBox] = useState<{ width: number; height: number } | null>(null);

  /** 视图缩放与拖拽平移：缩放簇、Ctrl+滚轮、空格或中键拖拽，与只读预览页同一套手感。 */
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  /** 用户手动调过视图后，容器尺寸变化不再强制重排（预览页同款豁免）。 */
  const userAdjustedRef = useRef(false);

  const [autoCellSize, setAutoCellSize] = useState<number>(DEFAULT_CELL_SIZE);
  /* 竖屏只认「按宽度铺满」的值，否则样式写死的 cellSize 会抵消自适应。 */
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
    [containerRef, gridSize, pan, zoom, cellSize],
  );

  /** 同一套换算但不除格子大小，得到「光标在纸上哪个像素」；物品提示用它。 */
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
    [containerRef, pan, zoom, cellSize],
  );

  /**
   * 测量视口并重排（OPT-A01 §1.2），也是「重置视图」：回 100% 居中并清掉「用户调整过」；游戏页没有浮动底栏，故 `showBottomBar: false`。
   */
  const fit = useCallback((): void => {
    const node = containerRef.current;
    userAdjustedRef.current = false;
    if (!node || gridSize === 0) return;
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    /* 顺手把可见区记下来，给「定案」遮罩估缩放（见 `stageBox`）。 */
    setStageBox((previous) =>
      previous && previous.width === rect.width && previous.height === rect.height
        ? previous
        : { width: rect.width, height: rect.height },
    );
    /*
     * 竖屏按宽度铺满（下限 8px）：视图簇已收起、也没法平移，取「宽高较小」会把 24×24 撑到 864 只看左上角；量 window 而非容器才能与 `portrait:max-md:` 判同一件事，竖屏也不画标尺。
     */
    const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth;
    const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight;
    const portrait = isPortraitViewport(viewportWidth, viewportHeight);
    setPortraitFit(portrait);
    /* 竖屏用自己那套四边留白（四面 8）；桌面那套每边 40，在 375 宽屏上白扔两列半。 */
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

  /* `ready` 必须在依赖里，否则 loading 期间 `<main>` 不在，apply 与 observe 全没跑。 */
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const apply = (): void => {
      /* 可见区与「玩家有没有自己调过视图」无关，先记下来再决定要不要重排。 */
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setStageBox((previous) =>
          previous && previous.width === rect.width && previous.height === rect.height
            ? previous
            : { width: rect.width, height: rect.height },
        );
      }
      // 玩家放大 / 平移之后，改窗口大小不该把视图打回原形。
      if (userAdjustedRef.current) return;
      fitRef.current();
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
  }, [containerRef, gridSize, ready]);

  /** 标尺开关一变就要重排（标尺条带占了四边留白）。落盘在页面那一侧。 */
  useEffect(() => {
    fitRef.current();
  }, [showRulers]);

  /** 按住空格 + 拖拽 = 平移（v0.6.2 §4）；`preventDefault` 挡浏览器把空格当翻页。 */
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

  /** 以视口中心为锚点缩放（按钮在右栏）；`clampZoom` 同值时直接短路。 */
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
