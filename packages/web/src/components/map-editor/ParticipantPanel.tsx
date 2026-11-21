import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { X } from 'lucide-react';
import {
  GAME_PLACED_OPACITY,
  HIGHLIGHT_BLUE,
  PARTICIPANT_AVATAR_MIN,
  PARTICIPANT_CELL_GAP,
  PARTICIPANT_CLUE_HEIGHT,
  ROSTER_PANEL_PADDING,
  PARTICIPANT_HEADER_HEIGHT,
  PARTICIPANT_MIN_HEIGHT,
  PARTICIPANT_MIN_WIDTH,
  PARTICIPANT_NAME_HEIGHT,
  PARTICIPANT_SEQ_BACKGROUND,
  PARTICIPANT_SEQ_BORDER,
  PARTICIPANT_SEQ_BORDER_RADIUS,
  PARTICIPANT_SEQ_COLOR,
  PARTICIPANT_SEQ_FONT_SIZE,
  PARTICIPANT_SEQ_INSET,
  PARTICIPANT_SEQ_SIZE,
  PARTICIPANT_SLOT_RADIUS,
  type Character,
  type CharacterSlotEntry,
} from '@loredoku/shared';
import { DRAG_THRESHOLD } from '@/lib/grid';
import {
  computeParticipantLayout,
  deriveLayout,
  fitColumns,
  participantBadgeText,
  resolveRosterCols,
  rosterPanelWidthFor,
  slotIndex,
  type ParticipantLayout,
} from '@/lib/participantLayout';
import { parseClue } from '@/lib/clue';
import { CharacterThumbnail } from '@/components/character/CharacterThumbnail';
import { cn } from '@/lib/utils';

/**
 * 名册矩阵（docs/v0.3.1.md ~ v0.6.3.md §3）：OPT-B06 卡片 110×196；OPT-A02 头像≥56、线索区 72px；MOD-802 联动预览由父级持有唯一 active 态；FIX-F07 readOnly 复用同一面板且像素一致；v0.6.3 §3 给了 `cols` 则槽位尺寸不变、面板按列数加宽，否则等比 + 收缩适配。
 */
interface ParticipantPanelProps {
  slots: Array<CharacterSlotEntry | null>;
  charactersById: Map<number, Character>;
  /** v0.6.3 §3: 谜题给定的列数；`null`/省略 = 自动（等比 + 收缩适配）。 */
  cols?: number | null;
  selectedSlotIndex: number | null;
  draggingIndex: number | null;
  /** MOD-802: slot whose linkages are currently previewed. */
  activeSlotIndex?: number | null;
  highlightedSlots?: Set<number>;
  highlightColors?: Map<number, string>;
  /** FIX-F07: 作品预览复用本组件 —— readOnly 去掉拖拽/×/抓手光标，布局与高亮框保持不变。 */
  readOnly?: boolean;
  /**
   * SPEC-H14 §1.3: 已在棋盘上的槽位。**整张卡**淡出，只由根节点一个 `opacity` 承担（子元素不再各自淡），只有游戏页会传。
   */
  placedSlotIndices?: Set<number>;
  /** 游戏页不要「参与者 5/5」标题：上面已有「游戏名 + 尺寸」，两行叠加会压掉真正有用的那行。 */
  hideHeader?: boolean;
  /** 竖屏窄屏：每行固定 2 张横卡（左头像、右上名称、右下线索），**只有游戏页**在竖屏时传。 */
  compactPortrait?: boolean;
  /** 标题行左侧挂的按钮：谜题编辑器收起「角色」列后，「展开角色列表」只剩这个入口；其余页面不传。 */
  headerLeading?: ReactNode;
  onSelect?: (slotIndex: number | null) => void;
  /** MOD-802: pointer entered a slot → hover-activate its linkages. */
  onActivateHover?: (slotIndex: number) => void;
  /** MOD-802: pointer left a slot → hover-deactivate (no-op when click-active). */
  onDeactivateHover?: (slotIndex: number) => void;
  /** MOD-802: click a slot → toggle click-activation. */
  onActivateClick?: (slotIndex: number) => void;
  /** Click on × button — parent handles confirmation (MOD-705). */
  onClearRequest?: (index: number) => void;
  onDragBegin?: (payload: { slotIndex: number; pointer: { x: number; y: number } }) => void;
  onDragMove?: (pointer: { x: number; y: number }) => void;
  onDragEnd?: (pointer: { x: number; y: number }) => void;
  onDragCancel?: () => void;
}

const CLEAR_BUTTON_ATTR = 'data-slot-clear';

/** OPT-B06 §6.2: 卡片宽 110px，其余尺寸沿用 v0.3.5（docs/v0.3.6.md §6.2）。 */
const PANEL_CELL_WIDTH = PARTICIPANT_MIN_WIDTH;
const PANEL_CELL_HEIGHT = PARTICIPANT_MIN_HEIGHT;
/** OPT-A02: gap between cells. */
const CELL_GAP = PARTICIPANT_CELL_GAP;
/** OPT-A02: clue display area fixed height (3 lines × 20px). */
const CLUE_AREA_HEIGHT = PARTICIPANT_CLUE_HEIGHT;
/** FEAT-O12 §6.1: the name row between the avatar and the clue. */
const NAME_AREA_HEIGHT = PARTICIPANT_NAME_HEIGHT;
/** OPT-A02: clue line height. */
const CLUE_LINE_HEIGHT = 20;
/** Padding between the cell edge and the theme-color circle. */
const AVATAR_PADDING = 8;
/** OPT-A02: minimum avatar diameter (≥56×56). */
const AVATAR_MIN_SIZE = PARTICIPANT_AVATAR_MIN;
/** MOD-802: don't hover-activate while a slot is being dragged. */
const DRAG_HOVER_LOCK = true;
/** 竖屏横卡头像直径：56 是「一眼认得出」与「右边仍留得下名称 + 线索」的折中。 */
const COMPACT_AVATAR_SIZE = 56;

/** 竖屏横卡横向内边距：主题色圆心 = 它 + 头像半径 + 右移量，网格里的内边距必须与之同步。 */
const COMPACT_CARD_PADDING_X = 6;

/** 竖屏横卡头像相对网格第一列的右移量：纯视觉位移，不参与布局，只为算出头像圆心。 */
const COMPACT_AVATAR_OFFSET_X = 6;

/** 竖屏横卡最小高度（也就是卡片框高）：网格 `align-content: stretch` 会把余量摊到 auto 行，调它等于直接调框高。 */
const COMPACT_CARD_MIN_HEIGHT = 80;

/**
 * 选中框：1px 描边 + 2px 外扩同为主色，中间不留纸色，读作一条连续 3px 粗边；与预览（2px）靠粗细、抬起 2px 与反色徽标区分，不叠第二道光圈。
 */
const PARTICIPANT_SELECTED_RING =
  '0 0 0 2px hsl(var(--primary)), 0 14px 22px -16px hsl(var(--primary) / 0.65)';

/**
 * 卡片主题色的淡透明层：0.16 是中间档（0.12 看不出、0.20 像色卡）；白主题与解不出的色值退回主色 —— 此刻要说的是「被点亮」而非颜色。
 */
function themeTint(themeColor: string, isWhite: boolean): string {
  const FALLBACK = 'hsl(var(--primary) / 0.16)';
  if (isWhite) return FALLBACK;
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(themeColor.trim());
  const raw = match?.[1] ?? '';
  if (raw.length !== 3 && raw.length !== 6) return FALLBACK;
  const full = raw.length === 3 ? raw.split('').map((ch) => ch + ch).join('') : raw;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, 0.16)`;
}

/**
 * 联动金色的淡透明层：解析与透明度同 `themeTint`（0.16）；解不出时退回**联动缺省蓝**而不是主色 —— 这是「被指着」不是「被选中」。
 */
function linkTint(color: string): string {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  const raw = match?.[1] ?? '';
  if (raw.length !== 3 && raw.length !== 6) return 'rgba(144, 202, 249, 0.16)';
  const full = raw.length === 3 ? raw.split('').map((ch) => ch + ch).join('') : raw;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, 0.16)`;
}

export function ParticipantPanel({
  slots,
  charactersById,
  cols = null,
  selectedSlotIndex,
  draggingIndex,
  activeSlotIndex = null,
  highlightedSlots,
  highlightColors,
  readOnly = false,
  placedSlotIndices,
  hideHeader = false,
  compactPortrait = false,
  headerLeading,
  onSelect,
  onActivateHover,
  onDeactivateHover,
  onActivateClick,
  onClearRequest,
  onDragBegin,
  onDragMove,
  onDragEnd,
  onDragCancel,
}: ParticipantPanelProps): JSX.Element {
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const [panelWidth, setPanelWidth] = useState(0);
  const armRef = useRef<{
    index: number;
    startX: number;
    startY: number;
    active: boolean;
    pointerId: number | null;
  } | null>(null);
  /**
   * 每格最近一次的联动色：`highlightColors` 撤掉那一帧就空了，而 `--link-hole` 要跑完整条 `--motion-retract`，不记住退场会变缺省蓝。
   */
  const lastLinkColorsRef = useRef<Map<number, string>>(new Map());

  const preferred = useMemo<ParticipantLayout>(
    () => computeParticipantLayout(slots.length),
    [slots.length],
  );

  /**
   * v0.6.3 §3: 有存下来的列数就直接赢 —— 槽位尺寸固定，面板宽度跟着列数走；`null` 才走旧的「等比 → 收缩适配」两步。
   */
  const fixedCols = useMemo(() => resolveRosterCols(cols, slots.length), [cols, slots.length]);

  // MOD-803: 放不下就减列，一列都放不下交给滚动容器；竖屏固定每行 2 张，直接压过 `fixedCols`。
  const layout = useMemo<ParticipantLayout>(() => {
    if (compactPortrait) return deriveLayout(slots.length, 2);
    if (fixedCols !== null) return deriveLayout(slots.length, fixedCols);
    if (panelWidth <= 0) return preferred;
    const fit = fitColumns(
      panelWidth - ROSTER_PANEL_PADDING * 2,
      preferred.cols,
      PANEL_CELL_WIDTH,
      CELL_GAP,
    );
    return deriveLayout(slots.length, fit);
  }, [panelWidth, preferred, slots.length, fixedCols, compactPortrait]);

  /** v0.6.3 §3.3: the panel is as wide as its columns demand. */
  const panelBoxWidth = rosterPanelWidthFor(cols, slots.length);

  const measuredRef = useRef<HTMLDivElement | null>(null);

  // MOD-803: track the panel width so the column count can shrink to fit.
  // Only 自动 needs it — with an explicit column count the side we measure is
  // the one we just set ourselves.
  useEffect(() => {
    const node = measuredRef.current;
    if (!node || typeof window === 'undefined' || fixedCols !== null) return;
    const update = (): void => {
      const width = node.clientWidth;
      setPanelWidth((current) => (current === width ? current : width));
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [fixedCols]);

  const placedCount = useMemo(() => slots.filter(Boolean).length, [slots]);

  const reset = (): void => {
    armRef.current = null;
  };

  const hitClearButton = (target: EventTarget | null): boolean =>
    target instanceof Element && target.closest(`[${CLEAR_BUTTON_ATTR}]`) !== null;

  // Row-major render order with placeholders for the centred last-row gap.
  const cells = useMemo(() => {
    const items: Array<{ kind: 'slot'; index: number } | { kind: 'gap' }> = [];
    for (let row = 0; row < layout.rows; row += 1) {
      for (let col = 0; col < layout.cols; col += 1) {
        const index = slotIndex({ row, col }, layout);
        items.push(index === null ? { kind: 'gap' } : { kind: 'slot', index });
      }
    }
    return items;
  }, [layout]);

  const avatarSize = Math.max(AVATAR_MIN_SIZE, PANEL_CELL_WIDTH - AVATAR_PADDING * 2);
  const hoverLocked = DRAG_HOVER_LOCK && draggingIndex !== null;

  return (
    <aside
      ref={measuredRef}
      className={cn(
        'flex shrink-0 flex-col border-r bg-background',
        // 竖屏：这张面板不再是左栏的一条竖条，而是棋盘下面横躺的一整行 ——
        // 宽度跟着外面的容器走，右边框与「只占自己那点宽度」的收缩都取消。
        compactPortrait && 'w-full flex-1 border-r-0',
      )}
      style={compactPortrait ? undefined : { width: panelBoxWidth }}
    >
      {/* OPT-B06 §6.1: 标题栏 40px，与资源面板头等高；游戏页不渲染。颜色**必须**用前景色 —— 写死深灰在夜墨下只剩 1.22:1。 */}
      {hideHeader ? null : (
        <div
          data-testid="participant-header"
          className="relative shrink-0 border-b px-3 text-center text-foreground"
          style={{
            height: PARTICIPANT_HEADER_HEIGHT,
            lineHeight: `${PARTICIPANT_HEADER_HEIGHT}px`,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {/* `headerLeading` **必须**绝对定位：分格会让标题在「面板宽 − 28px」里居中，右偏 14px 看得出来。 */}
          {headerLeading ? (
            <span className="absolute left-0.5 top-1/2 flex -translate-y-1/2 leading-none">
              {headerLeading}
            </span>
          ) : null}
          参与者{' '}
          <span className="tabular-nums">
            {placedCount}/{slots.length}
          </span>
        </div>
      )}
      {/*
        v0.6.3 §3.3: 左右内边距**必须**是常量（面板宽度由它算出，漂移会让面板窄 8px）；竖屏这一层不自己滚 —— 外层已是唯一滚动区，再套一层手指会停在卡片上。
      */}
      <div
        className={cn('min-h-0 flex-1 py-2', compactPortrait ? 'overflow-visible' : 'overflow-auto')}
        style={{ paddingLeft: ROSTER_PANEL_PADDING, paddingRight: ROSTER_PANEL_PADDING }}
      >
        {slots.length === 0 ? (
          <p className="px-2 py-6 text-center text-2xs text-muted-foreground">
            {readOnly ? '该谜题暂无参与者' : '从角色列表拖拽到参与者区'}
          </p>
        ) : (
          <div
            className="grid"
            data-testid="roster-matrix"
            style={{
              // 竖屏：两条等宽的弹性轨道（屏宽两边分），而不是 110px 定宽。
              gridTemplateColumns: compactPortrait
                ? `repeat(${layout.cols}, minmax(0, 1fr))`
                : `repeat(${layout.cols}, ${PANEL_CELL_WIDTH}px)`,
              gap: CELL_GAP,
              justifyContent: 'center',
              // v0.6.3 §3.3: `max-content` 防止宽矩阵被居中后左边缘被裁掉；竖屏轨道弹性，加了反而溢出，故只在定宽轨道时生效。
              minWidth: compactPortrait ? undefined : 'max-content',
            }}
          >
            {cells.map((item, position) => {
              if (item.kind === 'gap') {
                return <div key={`gap-${position}`} aria-hidden="true" />;
              }
              const index = item.index;
              const slot = slots[index] ?? null;
              const character = slot ? charactersById.get(slot.characterId) : undefined;
              const isSelected = selectedSlotIndex === index;
              const isHovered = hoveredSlot === index;
              const isDragging = draggingIndex === index;
              const isActive = activeSlotIndex === index;
              const isHighlighted = highlightedSlots?.has(index) ?? false;
              const highlightColor = highlightColors?.get(index);
              if (highlightColor) lastLinkColorsRef.current.set(index, highlightColor);
              const linkColor = highlightColor ?? lastLinkColorsRef.current.get(index) ?? HIGHLIGHT_BLUE;
              /** SPEC-H14 §1.3: already on the game board → the whole card dims. */
              const isPlaced = placedSlotIndices?.has(index) ?? false;
              /**
               * FIX-E04: 每格**只画一道**描边（单层 box-shadow，不带偏移环）；选中与预览不共用同一圈，靠粗细（3px/2px）、抬起与反色徽标区分。
               */
              const themeColor = slot?.themeColor ?? '#FFFFFF';
              const isWhiteTheme = themeColor.toUpperCase() === '#FFFFFF';
              const clueSegments = slot?.clue ? parseClue(slot.clue) : [];
              /**
               * 悬停 = 卡片被拎起（抬起 2px + `--shadow-hover`）：`--shadow-float` 的 28px 扩散会漫到邻格的缝里；选中那张本就抬着，不再叠。
               */
              const lifted = isHovered || isSelected;
              const hoverShadow = isHovered && !isSelected ? 'var(--shadow-hover)' : null;
              /**
               * 三档高亮（选中 > 联动预览 > 指针激活）互斥，至多一条线；悬停**不给描边上色** —— 那正是「两层高亮线」的来源。
               */
              const ringLayers: string[] = isSelected
                ? [PARTICIPANT_SELECTED_RING]
                : isHighlighted
                  ? [`0 0 0 2px ${highlightColor ?? HIGHLIGHT_BLUE}`]
                  : isActive
                    ? ['0 0 0 2px hsl(var(--primary))']
                    : [];
              if (hoverShadow) ringLayers.push(hoverShadow);
              const focusRingStyle: CSSProperties = ringLayers.length
                ? { boxShadow: ringLayers.join(', ') }
                : {};
              return (
                <div
                  key={index}
                  data-slot-index={index}
                  /*
                    `data-tint` 切主题色层，`data-link-tint` 切「被别人联动指着」的淡金层；两条轴独立可叠加。收回交给 CSS 基线规则，React 不留「正在收回」状态。
                  */
                  data-tint={slot && (isHovered || isSelected) ? 'on' : undefined}
                  data-link-tint={slot && isHighlighted ? 'on' : undefined}
                  style={{
                    // 竖屏名册（compactPortrait）里卡片不拦截触摸滚动：
                    // touchAction: 'none' 会把手指上下划动锁在卡片上，导致整块名册划不动。
                    // 非竖屏（编辑器等）仍保留 'none'，避免卡片被意外拖动/缩放。
                    touchAction: compactPortrait ? 'auto' : 'none',
                    // 竖屏：卡片是弹性轨道里的一格，宽度交给轨道，
                    // 高度由内容（横排的头像与两行文字）决定，但不低于
                    // COMPACT_CARD_MIN_HEIGHT —— 否则短线索那张卡会比旁边矮一截。
                    width: compactPortrait ? '100%' : PANEL_CELL_WIDTH,
                    // FEAT-O12: the name row is added to the card's height.
                    height: compactPortrait
                      ? undefined
                      : PANEL_CELL_HEIGHT + NAME_AREA_HEIGHT + CLUE_AREA_HEIGHT,
                    minHeight: compactPortrait ? COMPACT_CARD_MIN_HEIGHT : undefined,
                    // The radius is inline, not a utility class, because the
                    // sequence badge rounds its top-left corner with it — the
                    // two must never drift apart.
                    borderRadius: PARTICIPANT_SLOT_RADIUS,
                    // FIX-E04: the slot's single highlight frame.
                    ...focusRingStyle,
                    /*
                      选中 = 从纸页抽起：抬起 2px，投影落在下方。用 `translate` 不用 `transform` —— `roster-select-pop` 动的也是它，同一条轨才不会在动画开头被抹平。
                    */
                    translate: lifted ? '0 -2px' : undefined,
                    zIndex: lifted ? 1 : undefined,
                    /* 影子与位移都要补间：指针扫过一排时不能三张有影一张没有。180ms 与 `roster-select-pop` 同档。 */
                    transition:
                      'translate var(--motion-base) var(--motion-ease-out), box-shadow var(--motion-base) var(--motion-ease-out)',
                    // SPEC-H14 §1.3: placed → 整张卡只由根节点一个 opacity 变淡（子元素各带会连乘成 0.45×0.45）；**选中的那张不淡**。
                    opacity: isPlaced && !isSelected ? GAME_PLACED_OPACITY : undefined,
                  }}
                  onPointerDown={(event) => {
                    if (readOnly) return;
                    if (hitClearButton(event.target)) return;
                    if (event.button !== 0) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    armRef.current = {
                      index,
                      startX: event.clientX,
                      startY: event.clientY,
                      active: false,
                      pointerId: event.pointerId,
                    };
                  }}
                  onPointerMove={(event) => {
                    if (readOnly) return;
                    const arm = armRef.current;
                    if (!arm || arm.pointerId !== event.pointerId) return;
                    if (!arm.active) {
                      const distance = Math.hypot(
                        event.clientX - arm.startX,
                        event.clientY - arm.startY,
                      );
                      if (distance <= DRAG_THRESHOLD) return;
                      arm.active = true;
                      onDragBegin?.({
                        slotIndex: arm.index,
                        pointer: { x: event.clientX, y: event.clientY },
                      });
                    }
                    onDragMove?.({ x: event.clientX, y: event.clientY });
                  }}
                  onPointerUp={(event) => {
                    if (readOnly) {
                      // FIX-F07: read-only mode only toggles the linkage preview.
                      if (event.button === 0 && slots[index]) onActivateClick?.(index);
                      return;
                    }
                    const arm = armRef.current;
                    if (!arm || arm.pointerId !== event.pointerId) return;
                    reset();
                    if (arm.active) {
                      onDragEnd?.({ x: event.clientX, y: event.clientY });
                      return;
                    }
                    if (!slots[index]) return;
                    // MOD-802: a click both toggles the linkage activation
                    // and opens the info drawer for editing.
                    onActivateClick?.(index);
                    onSelect?.(isSelected ? null : index);
                  }}
                  onPointerCancel={() => {
                    if (readOnly) return;
                    if (!armRef.current) return;
                    const wasActive = armRef.current.active;
                    reset();
                    if (wasActive) onDragCancel?.();
                  }}
                  onPointerEnter={() => {
                    if (hoverLocked || !slots[index]) return;
                    onActivateHover?.(index);
                  }}
                  onPointerLeave={() => {
                    if (hoverLocked || !slots[index]) return;
                    onDeactivateHover?.(index);
                  }}
                  onMouseEnter={() => setHoveredSlot(index)}
                  onMouseLeave={() =>
                    setHoveredSlot((current) => (current === index ? null : current))
                  }
                  title={
                    slot
                      ? charactersById.get(slot.characterId)?.name ?? `#${slot.characterId}`
                      : `空参与者框 ${index + 1}`
                  }
                  className={cn(
                    /* `isolate` 是主题色层待在内容**下面**的前提：绝对定位的兄弟会画在普通流内容之上，建 stacking context 后色层 `z-index: -1` 只盖自己的底色。 */
                    'relative isolate flex flex-col items-center justify-start border',
                    /* 竖屏：卡片横过来 —— 头像跨满第一列两行，名称/线索顺次落进第二列；列间距 14px（8px 时 56 的头像几乎贴到名字上）。 */
                    compactPortrait &&
                      'grid grid-cols-[auto_minmax(0,1fr)] grid-rows-[auto_auto] content-center items-center justify-items-start gap-x-3.5 gap-y-0 px-1.5 py-2',
                    readOnly
                      ? slot
                        ? 'cursor-pointer'
                        : 'cursor-default'
                      : draggingIndex !== null
                        ? 'cursor-grabbing'
                        : slot
                          ? 'cursor-grab'
                          : undefined,
                    slot
                      ? isSelected
                        ? /* 选中：**一条连续的主色边**（1px + 2px 同色相接 = 3px），中间不留纸色；底色用主人自己的颜色而不是主色的淡透明。 */
                          'border-primary bg-background roster-select-pop'
                        : /* 悬停**不给描边上色** —— 它和「指针激活」的 2px 环叠在一条边上就是「两层高亮线」；反馈交给抬起 + 影子 + 主题色铺开。 */
                          'border-border bg-background'
                      : 'border-dashed border-muted-foreground/40 bg-muted/30',
                    isDragging ? 'opacity-40' : undefined,
                  )}
                >
                  {/*
                    主题色层是**底色**不是盖在卡上的膜：`.participant-tint` 用 `z-index: -1` 躲在兄弟下面（根节点已建层叠上下文）。半径从头像圆心长出，横坐标交给组件（竖屏头像贴左，写死 50% 会从文字区冒出来）。
                  */}
                  {slot ? (
                    <>
                      <span
                        aria-hidden="true"
                        data-testid={`slot-tint-${index}`}
                        className="participant-tint"
                        style={
                          {
                            '--tint-color': themeTint(themeColor, isWhiteTheme),
                            '--tint-x': compactPortrait
                              ? `${COMPACT_CARD_PADDING_X + COMPACT_AVATAR_SIZE / 2 + COMPACT_AVATAR_OFFSET_X}px`
                              : '50%',
                            '--tint-y': compactPortrait
                              ? '50%'
                              : `${AVATAR_PADDING + avatarSize / 2}px`,
                          } as CSSProperties
                        }
                      />
                      {/*
                        联动金色层与主题色层**同圆心、反方向**：从金框往头像收（`--link-hole`）。颜色取 `lastLinkColorsRef` 记的最近一支，否则撤掉高亮的几百毫秒里会变缺省蓝。
                      */}
                      <span
                        aria-hidden="true"
                        data-testid={`slot-link-tint-${index}`}
                        className="participant-link-tint"
                        style={
                          {
                            '--link-color': linkTint(linkColor),
                            '--tint-x': compactPortrait
                              ? `${COMPACT_CARD_PADDING_X + COMPACT_AVATAR_SIZE / 2 + COMPACT_AVATAR_OFFSET_X}px`
                              : '50%',
                            '--tint-y': compactPortrait
                              ? '50%'
                              : `${AVATAR_PADDING + avatarSize / 2}px`,
                          } as CSSProperties
                        }
                      />
                    </>
                  ) : null}
                  {/* OPT-B06 §6.3: 1-based 序号在左上角，只圆右下、左上跟随**卡片**圆角（inset 0 处留方角会戳出边框）。v0.6.4 §2: 有编号展示时用配置的字形。 */}
                  <span
                    data-testid={`slot-seq-${index}`}
                    className="absolute flex items-center justify-center"
                    style={{
                      top: PARTICIPANT_SEQ_INSET,
                      left: PARTICIPANT_SEQ_INSET,
                      minWidth: PARTICIPANT_SEQ_SIZE,
                      height: PARTICIPANT_SEQ_SIZE,
                      padding: '0 5px',
                      borderRadius: PARTICIPANT_SEQ_BORDER_RADIUS,
                      fontSize: PARTICIPANT_SEQ_FONT_SIZE,
                      fontWeight: 700,
                      lineHeight: `${PARTICIPANT_SEQ_SIZE - 1}px`,
                      // 选中时徽标反色（主色底 + 纸色字）。这是「是谁」
                      // 的那一笔 —— 位置固定、对比最高，扫一眼就知道手上是哪位。
                      color: isSelected ? 'hsl(var(--primary-foreground))' : PARTICIPANT_SEQ_COLOR,
                      background: isSelected ? 'hsl(var(--primary))' : PARTICIPANT_SEQ_BACKGROUND,
                      border: PARTICIPANT_SEQ_BORDER,
                      borderColor: isSelected ? 'hsl(var(--primary))' : undefined,
                      borderTopWidth: 0,
                      borderLeftWidth: 0,
                      /*
                        选中时徽标填主色、卡片描边也是主色，两段弧在交界处各抗锯齿一次，纸白会漏成一道细弧；加 1px 同色外扩让内 5px/外 6px 弧重合。只在填色时加，纸白徽标上会盖住描边。
                      */
                      boxShadow: isSelected ? '0 0 0 1px hsl(var(--primary))' : undefined,
                    }}
                  >
                    {participantBadgeText(slot, index)}
                  </span>

                  {/* Avatar area (top portion) — MOD-803: 8px padding */}
                  <div
                    className={cn(
                      'flex items-center justify-center',
                      // 竖屏：头像在左，纵向跨两行（名称 + 线索）。
                      compactPortrait && 'col-start-1 row-span-2 self-center',
                    )}
                    style={
                      compactPortrait
                        ? /* 竖屏不留左侧内边距（卡片够高后序号徽标与头像纵向错开）；右移用 `translateX` 不用 `padding`，否则 `auto` 列被撑宽、线索多折一行。该量即 `COMPACT_AVATAR_OFFSET_X`。 */
                          {
                            padding: 0,
                            transform: `translateX(${COMPACT_AVATAR_OFFSET_X}px)`,
                          }
                        : { height: PANEL_CELL_HEIGHT, padding: AVATAR_PADDING }
                    }
                  >
                    {slot ? (
                      /*
                       * OPT-H06 §6.2 (docs/v0.4.2.md §6): 只有这一枚圆 —— 它同时是主题色盘与唯一裁剪；缩略图不画环、也不自带圆形边框。
                       */
                      <span
                        data-testid={`slot-avatar-${index}`}
                        className="flex items-center justify-center overflow-hidden rounded-full"
                        style={{
                          width: compactPortrait ? COMPACT_AVATAR_SIZE : avatarSize,
                          height: compactPortrait ? COMPACT_AVATAR_SIZE : avatarSize,
                          backgroundColor: themeColor,
                          // MOD-802 §1.2.5 / FIX-E04: 高亮只剩那一道 2px 框，头像不画第二道环、**也不放大**（放大读成「自己要干嘛」，而联动说的是「别人指着他」）。
                          // MOD-703: 白主题头像需要 1px 灰边，且只有这一处描边。
                          border: isWhiteTheme ? '1px solid #D1D5DB' : 'none',
                        }}
                      >
                        {character ? (
                          <CharacterThumbnail
                            character={character}
                            shape="plain"
                            bordered={false}
                            className="h-full w-full text-2xl"
                          />
                        ) : (
                          <span className="text-2xs text-muted-foreground">
                            #{slot.characterId}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-2xs text-muted-foreground">空</span>
                    )}
                  </div>

                  {/* FEAT-O12 §6.1: the character's name, between the avatar
                      and the clue. Empty slots render nothing. */}
                  <div
                    className={cn(
                      'flex w-full items-center justify-center px-1',
                      // 竖屏：名称在右上。
                      compactPortrait && 'col-start-2 row-start-1 w-auto justify-start px-0',
                    )}
                    style={{ height: compactPortrait ? undefined : NAME_AREA_HEIGHT }}
                  >
                    {character ? (
                      <span
                        data-testid={`slot-name-${index}`}
                        className={cn(
                          'max-w-full truncate text-center text-xs font-medium',
                          compactPortrait && 'text-left',
                        )}
                        title={character.name}
                      >
                        {character.name}
                      </span>
                    ) : null}
                  </div>

                  {/* OPT-A02: clue area 72px, 3 lines @ 11px/20px, ellipsis + title tooltip
                      线索短的时候（一两行）也要在 72px 里上下居中 —— 否则一两行的卡
                      看着「上半截有字、下半截空」。 */}
                  <div
                    className={cn(
                      'flex w-full items-center justify-center px-1',
                      // 竖屏：线索在右下。
                      compactPortrait && 'col-start-2 row-start-2 w-auto justify-start px-0',
                    )}
                    style={{ height: compactPortrait ? undefined : CLUE_AREA_HEIGHT }}
                  >
                    {clueSegments.length > 0 ? (
                      <span
                        className={cn(
                          /* 竖屏：线索要**读全** —— 横卡高度随内容走，不做三行截断，截断只会藏掉玩家最需要的那半句。 */
                          compactPortrait ? 'text-left' : 'line-clamp-3 text-center',
                        )}
                        style={{
                          fontSize: 11,
                          /* 竖屏行距 16px：20px 在 11px 的字上看像三条平行虚线，读不出一段话。 */
                          lineHeight: compactPortrait ? '16px' : `${CLUE_LINE_HEIGHT}px`,
                        }}
                        title={slot?.clue}
                      >
                        {clueSegments.map((seg, i) =>
                          seg.bold ? (
                            <strong key={i}>{seg.text}</strong>
                          ) : (
                            <span key={i}>{seg.text}</span>
                          ),
                        )}
                      </span>
                    ) : null}
                  </div>

                  {/* MOD-705: × button triggers confirmation via parent */}
                  {!readOnly && slot ? (
                    <button
                      type="button"
                      {...{ [CLEAR_BUTTON_ATTR]: 'true' }}
                      aria-label="移出参与者"
                      data-testid={`slot-clear-${index}`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!slots[index]) return;
                        onClearRequest?.(index);
                        setHoveredSlot(null);
                      }}
                      className={cn(
                        'absolute -right-1 -top-1 flex h-4 w-4 cursor-pointer items-center justify-center',
                        'rounded-full border bg-background text-muted-foreground shadow-paper',
                        'transition-opacity hover:text-destructive',
                        isHovered ? 'opacity-100' : 'opacity-0',
                      )}
                      title="移出参与者"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
