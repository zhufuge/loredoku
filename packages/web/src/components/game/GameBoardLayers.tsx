import {
  GAME_CHECK_RING_SWEEP_MS,
  GAME_LONG_PRESS_MS,
  GAME_PRESS_RING_DELAY_MS,
  type Asset,
  type CellCoord,
  type Character,
  type CharacterSlotEntry,
  type GamePlacementBoard,
  type MapDraft,
  type MapStyle,
} from '@loredoku/shared';
import { MapCanvasFrameLayer, MapGridSeparatorLayer } from '@/components/map/MapGridLayers';
import { MapBackgroundLayer, MapItemLayer } from '@/components/map/MapAssetLayers';
import {
  MapGameCheckLayer,
  MapGamePlacementLayer,
  MapGamePressRing,
  MapGameToolHintLayer,
  type GamePlacementPulse,
  type GamePlacementWave,
} from '@/components/map/MapGameLayers';
import {
  MapRegionHighlightLayer,
  MapRegionOutlineLayer,
} from '@/components/map/MapRegionLayers';
import {
  MapBlockingMaskLayer,
  MapHighlightLayer,
  MapMouseCursorBoxLayer,
  MapRegionLabelLayer,
} from '@/components/map/MapOverlayLayers';
import type { CellMap, HoverEffects } from '@/lib/canvasLayers';
import type { CheckItem } from '@/lib/gameCheck';
import { cellKey, type GameToolHint } from '@/lib/gamePlacement';
import type { HighlightState } from '@/lib/highlight';
import type { MarkRender } from '@/lib/mark';
import type { ResolvedCheckColors } from '@/lib/checkStyle';
import type { ToolIconsRender } from '@/lib/toolIcons';
import { itemPadding } from '@/lib/canvasScale';
import type { CanvasPoint } from '@/lib/grid';

/**
 * 游戏页画布纸上的**整个图层栈**（自下而上，钉在 `MAP_LAYER_Z` 上）。
 *
 * v0.10.4：从 `GamePage` 搬出来。这一段原本是「背景 → 高亮 → 区域 → 遮罩 →
 * 网格 → 物品 → 区域标签 → 工具提示 → 长按环 → 放置层 → 校验圈 → 画布边框 →
 * 鼠标框」十几层平铺，每层都在读同一批 props（格子、资源、样式、格子大小），
 * 与放置 / 计时 / 判卷的状态机没有一行耦合 —— 它只是「这一帧的棋盘长什么样」。
 *
 * 顺序是规范的一部分（docs/layer-priority.md 是唯一权威）：这里只搬位置，
 * **没有动任何一层的相对次序**，也没有改 z 值来源。
 */
export interface GameBoardLayersProps {
  board: GamePlacementBoard;
  slots: Array<CharacterSlotEntry | null>;
  charactersById: Map<number, Character>;
  cells: CellMap;
  assetsById: Map<number, Asset>;
  regions: MapDraft['regions'];
  style: MapStyle;
  gridSize: number;
  cellSize: number;
  highlight: HighlightState | null;
  highlightLeaving: boolean;
  hoveredRegionId: string | null;
  hoveredRegion: MapDraft['regions'][number] | null;
  maskCells: Set<string>;
  hover: CellCoord | null;
  hoverPoint: CanvasPoint | null;
  hoverEffects: HoverEffects;
  toolHint: GameToolHint | null;
  mark: MarkRender | null;
  toolIcons: ToolIconsRender;
  /** v0.9.8：落笔令牌与落笔格 —— 只有点下去那一刻、那一格的 `×` 才弹。 */
  forbiddenPop: number;
  forbiddenPopCell: string | null;
  /** 主题配的长按环 / 校验圈图（`null` = 各自的内置细弧）。 */
  ringImage: string | null;
  pressCell: { x: number; y: number; seq: number } | null;
  /** 联动激活的参与者编号（1 基，`null` = 没有）。 */
  activeParticipantId: number | null;
  pulse: GamePlacementPulse;
  erasing: ReadonlySet<string>;
  forbiddenWave: GamePlacementWave;
  forbiddenWaveAlt: boolean;
  checkRun: { items: CheckItem[]; revealed: number; runId: number } | null;
  checkStyle: ResolvedCheckColors;
  /** 结案后不再给物品层任何悬停 / 指针坐标（见 `GamePage` 的 interactionLocked）。 */
  interactionLocked: boolean;
  onLabelHover: (regionId: string | null) => void;
}

export function GameBoardLayers({
  board,
  slots,
  charactersById,
  cells,
  assetsById,
  regions,
  style,
  gridSize,
  cellSize,
  highlight,
  highlightLeaving,
  hoveredRegionId,
  hoveredRegion,
  maskCells,
  hover,
  hoverPoint,
  hoverEffects,
  toolHint,
  mark,
  toolIcons,
  forbiddenPop,
  forbiddenPopCell,
  ringImage,
  pressCell,
  activeParticipantId,
  pulse,
  erasing,
  forbiddenWave,
  forbiddenWaveAlt,
  checkRun,
  checkStyle,
  interactionLocked,
  onLabelHover,
}: GameBoardLayersProps): JSX.Element {
  return (
    <>
      <MapBackgroundLayer cells={cells} assetsById={assetsById} cellSize={cellSize} />
      <MapHighlightLayer
        highlight={highlight}
        regions={regions}
        cellSize={cellSize}
        style={style}
        leaving={highlightLeaving}
      />
      <MapRegionHighlightLayer region={hoveredRegion} cellSize={cellSize} style={style} />
      <MapBlockingMaskLayer blockingCells={maskCells} cellSize={cellSize} style={style} />
      <MapRegionOutlineLayer
        regions={regions}
        gridSize={gridSize}
        cellSize={cellSize}
        style={style}
      />
      <MapGridSeparatorLayer gridSize={gridSize} cellSize={cellSize} style={style} />
      <MapItemLayer
        cells={cells}
        assetsById={assetsById}
        cellSize={cellSize}
        gridSize={gridSize}
        // v0.9.1 §5：物品描边（宽度 0 = 不描边）。
        itemOutline={style.itemOutline}
        padding={itemPadding(cellSize)}
        /* v0.9.7：结案后不给物品层任何悬停 / 指针坐标，物品不会隔着遮罩抬起。 */
        hover={interactionLocked ? null : hover}
        pointer={interactionLocked ? null : hoverPoint}
      />

      <MapRegionLabelLayer
        regions={regions}
        cellSize={cellSize}
        style={style}
        hoveredRegionId={hoveredRegionId}
        onHover={onLabelHover}
      />

      {/* 层 4 · 工具提示层 — SPEC-G02 */}
      <MapGameToolHintLayer
        hint={toolHint}
        cell={hoverEffects.cell}
        cellSize={cellSize}
        slots={slots}
        mark={mark}
        // v0.9.1 §3：清除工具配了图，指针底下就画同一张（与按钮一致）。
        clearIcon={toolIcons.clear ?? null}
        /* v0.9.8：落笔令牌与落笔格 —— 只有点下去那一刻、那一格的 `×` 才弹。 */
        pop={forbiddenPop}
        popCell={forbiddenPopCell}
      />

      {/* v0.7.11：长按进度环 —— 按住 500ms 的等待可见化（SPEC-J02）。
          环延迟 160ms 才挂载，所以只画剩下的 340ms。 */}
      <MapGamePressRing
        cell={pressCell}
        cellSize={cellSize}
        durationMs={GAME_LONG_PRESS_MS - GAME_PRESS_RING_DELAY_MS}
        seq={pressCell?.seq ?? 0}
        imageUrl={ringImage}
      />

      {/* 层 5 · 游戏放置层 — SPEC-G01 */}
      <MapGamePlacementLayer
        board={board}
        slots={slots}
        charactersById={charactersById}
        cellSize={cellSize}
        /*
         * v0.6.4 §3: 触碰 / 点击参与者时，放大展示地图中该参与者的头像
         * 与编号，提示当前放置的情况。面板说的是 0 基槽位号，棋盘从 1
         * 编号——和放置态同样 +1。悬停与点击都走激活态，所以摸一下和
         * 点一下效果一致。
         */
        activeParticipantId={activeParticipantId}
        /*
         * v0.7.11：正在长按的那一格 —— 长按落地后头像在这里落定。
         * 环还在（抬手前）就说明这一格是「刚刚」放下的，不需要再记一个
         * 时间戳：抬手即清环，窗口自然结束。
         */
        settleKey={pressCell ? `${pressCell.x},${pressCell.y}` : null}
        /* v0.7.11：刚放下的编号各「盖章」一次。 */
        pulse={pulse}
        /* v0.9.8：橡皮点掉的格子先演退场，动效放完才真删。 */
        erasing={erasing}
        /* v0.10.1：落子补出来的 `×` 按圈错峰浮出，像水波从落点推出去。 */
        wave={forbiddenWave}
        waveAlt={forbiddenWaveAlt}
        /* v0.8.6：配置了图片时，放下的标记画那张图而不是 `×`。 */
        mark={mark}
      />

      {/*
        * v0.9.3 §2：提交后逐人校验的圈。按序号一位一位揭开，颜色取主题的
        * 「通过 / 未通过」两档；圈留在棋盘上，直到结算弹窗被关掉。
        */}
      {checkRun ? (
        <MapGameCheckLayer
          marks={checkRun.items.slice(0, checkRun.revealed)}
          cellSize={cellSize}
          passColor={checkStyle.passColor}
          failColor={checkStyle.failColor}
          ringUrl={ringImage}
          sweepMs={GAME_CHECK_RING_SWEEP_MS}
          runId={checkRun.runId}
        />
      ) : null}

      <MapCanvasFrameLayer gridSize={gridSize} cellSize={cellSize} style={style} />

      {/* 层 1 — 鼠标提示框（游戏页无操作提示框）。 A placed `×` counts
          as blocked too, so the cursor turns red on marked cells. */}
      <MapMouseCursorBoxLayer
        cell={hoverEffects.cell}
        blocked={
          hoverEffects.blocked ||
          (hoverEffects.cell !== null &&
            maskCells.has(cellKey(hoverEffects.cell.x, hoverEffects.cell.y)))
        }
        cellSize={cellSize}
        style={style}
      />
    </>
  );
}
