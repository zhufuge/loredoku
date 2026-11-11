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
 * CLAR-602 + MOD-702/703/705/706/707/802/803 + OPT-A02 + OPT-B06
 * (docs/v0.3.1.md + v0.3.2.md + v0.3.3.md + v0.3.5.md + v0.3.6.md):
 * - Matrix layout with golden-ratio rows/cols, last row centred
 * - OPT-A02: cell min 104px tall, avatar ≥56×56, clue area 72px
 *   (3 lines @ 11px/20px), columns shrink to fit before scrolling
 * - OPT-B06: cell min width 110px, title bar 40px (aligned with the item
 *   panel header) and a 1-based sequence badge in each cell's top-left corner
 * - MOD-802: hover activates the participant's linkages, click toggles
 *   (and opens the info drawer); the parent owns the single-active state
 * - MOD-702: clue display area below the avatar
 * - MOD-703: theme color background layer behind avatar
 * - MOD-705: removal confirmation handled by parent (via onClearRequest)
 * - MOD-706: title bar shares the item panel header height
 * - v0.3.10 FIX-F07: `readOnly` renders the **same** panel on the work preview
 *   page — no drag, no remove button, pointer cursor — so the preview roster is
 *   pixel-identical to the editor's.
 * - v0.6.3 (docs/v0.6.3.md §3): the column count is the puzzle's, not the
 *   panel's. With `cols` set, the slot keeps its size and the panel widens to
 *   fit the columns; without it, the old adaptive layout is untouched.
 */
interface ParticipantPanelProps {
  slots: Array<CharacterSlotEntry | null>;
  charactersById: Map<number, Character>;
  /**
   * v0.6.3 (docs/v0.6.3.md §3): the column count the puzzle asks for.
   * `null` / omitted = 自动 — the old golden-ratio + shrink-to-fit behaviour.
   */
  cols?: number | null;
  selectedSlotIndex: number | null;
  draggingIndex: number | null;
  /** MOD-802: slot whose linkages are currently previewed. */
  activeSlotIndex?: number | null;
  highlightedSlots?: Set<number>;
  highlightColors?: Map<number, string>;
  /**
   * v0.3.10 FIX-F07: the work preview reuses this component. Read-only mode
   * drops every editing affordance (drag, × button, grab cursor) and keeps the
   * layout, the metrics and the highlight frame identical.
   */
  readOnly?: boolean;
  /**
   * SPEC-H14 (docs/v0.4.2.md §1.3): slot indices whose participant has already
   * been placed on the game board. The **whole card** dims — frame, avatar,
   * sequence badge, clue, everything — so the roster reads as "these are off
   * the table". One `opacity` on the card root; no child carries its own.
   * Only the game page passes this — the editor and the work preview are
   * unaffected (and the editor has no board to derive it from).
   */
  placedSlotIndices?: Set<number>;
  /**
   * v0.7.11：游戏页不要「参与者 5/5」那行标题。
   *
   * 那一行是编辑器的语法（这块面板是「参与者」这个资源本身，标题在说它有多少
   * 格）；玩家端的名册只是工具栏的一部分，上面已经有一行「游戏名 + 尺寸」。
   * 两行标题叠在一起，真正有用的那行反而被压下去。
   */
  hideHeader?: boolean;
  /**
   * v0.10.1：竖屏窄屏下换一套卡片布局 —— 每行固定 2 张、卡片本身横过来
   * （左头像，右上名称、右下线索）。
   *
   * 名册这时不在左栏里，而是横躺在棋盘下面一整条，宽度是屏宽而不是 256 像素；
   * 竖着的 110×196 卡片在这条里既浪费宽度又占高度。**只有游戏页会传**
   * （且只在自己判定竖屏时为真），编辑器与作品预览维持原样。
   */
  compactPortrait?: boolean;
  /**
   * v0.7.13：标题行**左侧**可以挂一颗按钮。
   *
   * 谜题编辑器把「角色」列整列收起（连 40px 细条也不留）之后，「展开角色列表」
   * 就只剩这一个落点 —— 那一列原来自己带着的 40px 细条被整段删掉了，入口必须
   * 挪到还站着的那一列上（参与者面板紧贴它原来的位置）。
   *
   * 只有谜题编辑器会传；地图编辑器与作品预览不传，那两处的标题行与以前逐像素一样。
   */
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

/**
 * OPT-B06 (docs/v0.3.6.md §6.2): the cell is now 110px wide (was 88) while
 * every other metric keeps its v0.3.5 value.
 */
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
/**
 * v0.10.1：竖屏横卡里头像的直径。
 *
 * 桌面那张竖卡头像能到 94px，是因为它自己占满一整块 104 高的区域；横卡里
 * 头像只在左边占一列，右边还要放两行字。第一版给 44（与序号徽标同量级），
 * 但玩家在手机上要靠这张脸认人 —— 56 是「一眼认得出」与「右边还留得下
 * 70 多像素给名称和线索」之间的那个数。
 */
const COMPACT_AVATAR_SIZE = 56;

/**
 * v0.10.1：竖屏横卡的最小高度。
 *
 * 卡片高度原本由右边那两行字撑（名称 20 + 线索最多 60），头像只是居中摆着，
 * 于是「有头像的那一格」和「两行短字的格子」一样高，头像显得局促。给一个
 * 下限之后整行卡片等高、头像四周也有了呼吸。
 *
 * 这个数就是卡片高度本身：网格的 `align-content` 默认 `stretch`，多出来的
 * 空间会摊到那两条 `auto` 行上，所以调它等于直接调框高。
 */
const COMPACT_CARD_MIN_HEIGHT = 80;

/**
 * **选中**的框：一条**连续**的主色边（1px 描边 + 2px 外扩，中间不留纸色）。
 *
 * 演变：v0.7.11 是双环（里圈 2px 纸色把卡片与外环隔开），因此与「预览激活」的
 * 单环能靠**层数**区分；v0.7.14 拿掉双环里那圈纸色（用户说「中间不要有空白」），
 * 描边也跟着改回主色 —— 两段同色相接，读作一条 3px 的粗边，而不是两条线。
 *
 * 与预览（2px）的区分因此落在**别的维度**上，而且不靠数层数：
 * - 边更粗（3px vs 2px）；
 * - 卡片 `translate` 上移 2px，影子落在下方（负 spread、向下 14px）—— 这一层是
 *   **投影**，不是又一道光圈；发光描边是 `.impeccable.md` 明令避开的 AI 味。
 * - 序号徽标反色（主色底 + 纸色字）。看清「是谁」靠徽标，它本来就在最显眼的位置。
 *
 * 边框自己占最里面 1px、阴影从 border-box 外沿起算 2px，所以合起来是 `0 → 3px`
 * 一整条，没有缝。名册内边距 8px、格间距 14px，最边上的卡片也不会被 `overflow-auto`
 * 切掉。
 */
const PARTICIPANT_SELECTED_RING =
  '0 0 0 2px hsl(var(--primary)), 0 14px 22px -16px hsl(var(--primary) / 0.65)';

/**
 * 卡片里铺的那层「主题色的淡透明色」（v0.7.14）。
 *
 * 0.12 / 0.16 / 0.20 三档并排看过（1440×900，无头 Chrome 截图逐格比对）：
 * 0.12 与纸底（`248,246,242`）只差 15 个色阶，一屏并排才看得出来；0.20 开始
 * 读成「一块色卡」，11px 的线索文字被压下去。0.16 落在中间：一眼能看出这张卡
 * 是谁的颜色，又还是纸。
 *
 * **白色退回主色**：白主题的头像本来就是一碟宣纸，白上加白等于什么都没发生，
 * 而这张卡片此刻最该说的是「它被点亮了」，不是「它是什么颜色」。
 * 解不出来的色值（旧数据里可能的 `red` / `transparent`）走同一条退路。
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

  const preferred = useMemo<ParticipantLayout>(
    () => computeParticipantLayout(slots.length),
    [slots.length],
  );

  /**
   * v0.6.3 §3: a stored column count wins outright — the slot size is fixed,
   * so the panel width follows the columns instead of the other way round.
   * `null` means the puzzle has no opinion and the old two-step rule applies:
   * golden ratio, then shrink to whatever the container can hold.
   */
  const fixedCols = useMemo(() => resolveRosterCols(cols, slots.length), [cols, slots.length]);

  // MOD-803: shrink the column count when the panel can't hold it; when even
  // one column doesn't fit, the scroll container takes over.
  // v0.10.1 竖屏：横躺的一条名册，固定每行 2 张 —— 谜题配的列数在这条里没有意义
  // （2 张卡就把屏宽占满了），所以直接压过 `fixedCols`。
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
        // v0.10.1 竖屏：这张面板不再是左栏的一条竖条，而是棋盘下面横躺的一整行 ——
        // 宽度跟着外面的容器走，右边框与「只占自己那点宽度」的收缩都取消。
        compactPortrait && 'w-full flex-1 border-r-0',
      )}
      style={compactPortrait ? undefined : { width: panelBoxWidth }}
    >
      {/* OPT-B06 §6.1: title bar 40px, aligned with the item panel header.
          v0.7.11：游戏页不用（`hideHeader`）—— 玩家端名册头上已经有一行了。

          v0.7.13：颜色从写死的 `#1F2937` 换成 `text-foreground`。那个值是
          为纸底挑的深灰（slate-800），落在夜墨 `28 12% 9%` 上只剩 1.22:1 ——
          夜间模式里这行标题几乎是黑的。标题属于「前景」这一层，跟着主题走。 */}
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
          {/*
            v0.7.13：`headerLeading` 用**绝对定位**挂，而不是在标题行里分一格。
            分了格，标题就会在「面板宽 − 28px」里居中 —— 往右偏 14px，而这一行
            只有「参与者」三个字加一个分数，偏一点点就看得出来。绝对定位让按钮
            浮在左侧，文本仍按 `text-center` 居中于整块面板。
          */}
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
        v0.6.3 §3.3: the horizontal padding is a constant, not a Tailwind class,
        because the panel's width is computed from it — a drift between the two
        would make the panel 8px too narrow for its own matrix. `overflow-auto`
        so a column count wider than the cap scrolls instead of clipping.
      */}
      <div
        className="min-h-0 flex-1 overflow-auto py-2"
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
              // v0.10.1 竖屏：两条等宽的弹性轨道（屏宽两边分），而不是 110px 定宽。
              gridTemplateColumns: compactPortrait
                ? `repeat(${layout.cols}, minmax(0, 1fr))`
                : `repeat(${layout.cols}, ${PANEL_CELL_WIDTH}px)`,
              gap: CELL_GAP,
              justifyContent: 'center',
              // v0.6.3 §3.3: never narrower than its own tracks. Without this,
              // a matrix wider than the panel would be centred and its left
              // edge clipped — the part `overflow` can never scroll back to.
              // v0.10.1 竖屏：轨道是弹性的，`max-content` 会让它按内容最小宽度
              // 撑出去、反而溢出，所以这一条只在定宽轨道时生效。
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
              /** SPEC-H14 §1.3: already on the game board → the whole card dims. */
              const isPlaced = placedSlotIndices?.has(index) ?? false;
              /**
               * FIX-E04: the slot draws **one** outline. A referenced slot uses
               * its linkage colour; the previewed slot falls back to the primary
               * colour. Implemented as a single `box-shadow` ring (no
               * `ring-offset`) so it hugs the border and reads as one frame.
               *
               * v0.7.11：**选中**不再和「预览」共用同一圈 —— 选中是玩家要持续
               * 操作的那一格（编辑器里抽屉开着，游戏里是手上这位），预览只是
               * 指针路过。v0.7.14 起两者靠粗细（3px / 2px）与抬起、反色徽标区分，
               * 不再靠「中间那圈纸色缝隙」。
               */
              const themeColor = slot?.themeColor ?? '#FFFFFF';
              const isWhiteTheme = themeColor.toUpperCase() === '#FFFFFF';
              const clueSegments = slot?.clue ? parseClue(slot.clue) : [];
              /**
               * v0.7.14「触碰悬浮」：指针压上去 = 这张卡片被拎起来。
               *
               * 抬起 2px、影子换成 `--shadow-hover`（`--shadow-float` 的 28px 扩散
               * 在 110px 宽、格间距 14px 的名册里会漫到邻居的缝里，看着像整片脏了）。
               * 选中那张本来就抬着，不再叠一次 —— 它的影子在 `PARTICIPANT_SELECTED_RING`
               * 的第三层里，再叠就糊成一块。
               */
              const lifted = isHovered || isSelected;
              const hoverShadow = isHovered && !isSelected ? 'var(--shadow-hover)' : null;
              /**
               * 一圈**或者**不画。高亮的三档（选中 / 联动预览 / 指针激活）互斥，
               * 选中优先，所以至多一条线；`hover` 不再给描边上色（v0.7.14）——
               * 那条 1px 主色边框紧贴外面的 2px 环，正是「两层高亮线」的来源。
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
                    v0.7.14：`data-tint` 是那层主题色的开关。悬停与选中都算「点亮」，
                    收回交给 CSS 的基线规则（`.participant-tint` 的 `--tint-r`）——
                    属性一撤，颜色自己慢慢缩回头像那枚圆，不必在 React 里留一个
                    「正在收回」的状态。
                  */
                  data-tint={slot && (isHovered || isSelected) ? 'on' : undefined}
                  style={{
                    touchAction: 'none',
                    // v0.10.1 竖屏：卡片是弹性轨道里的一格，宽度交给轨道，
                    // 高度由内容（横排的头像与两行文字）决定，但不低于
                    // COMPACT_CARD_MIN_HEIGHT —— 否则短线索那张卡会比旁边矮一截。
                    width: compactPortrait ? '100%' : PANEL_CELL_WIDTH,
                    // FEAT-O12: the name row is added to the card's height.
                    height: compactPortrait
                      ? undefined
                      : PANEL_CELL_HEIGHT + NAME_AREA_HEIGHT + CLUE_AREA_HEIGHT,
                    minHeight: compactPortrait ? COMPACT_CARD_MIN_HEIGHT : undefined,
                    // The radius is inline (not `rounded-md`) because the
                    // sequence badge rounds its top-left corner with it — the
                    // two must never drift apart.
                    borderRadius: PARTICIPANT_SLOT_RADIUS,
                    // FIX-E04: the slot's single highlight frame.
                    ...focusRingStyle,
                    /*
                      v0.7.12：选中 = 从纸页上抽起来的卡片 —— 抬起 2px，投影落在下方
                      （见 `PARTICIPANT_SELECTED_RING` 第三层）。

                      v0.7.14：**悬停也抬**。用 `translate` 不用 `transform`：选中时的
                      鼓起（`roster-select-pop`）动的是 `translate`，两者同一条轨才能
                      接着走 —— 抬起不会在动画开头被抹平，落下也不会跳。
                    */
                    translate: lifted ? '0 -2px' : undefined,
                    zIndex: lifted ? 1 : undefined,
                    /*
                      影子与位移都要补间：指针扫过一排卡片时，影子是「慢慢落下来」，
                      不是三格里两张有影、一张没有。180ms 与 `roster-select-pop` 同档。
                    */
                    transition:
                      'translate var(--motion-base) var(--motion-ease-out), box-shadow var(--motion-base) var(--motion-ease-out)',
                    // SPEC-H14 §1.3: placed → the **whole** card dims (frame +
                    // badge + avatar + clue). One opacity, on the root only, so
                    // nothing multiplies down to 0.45 × 0.45.
                    //
                    // v0.7.12：**选中的那张不淡**。玩家把一位已经落子的参与者
                    // 重新拿在手上（要给他搬家）时，淡掉的卡片会把双环、抬起和
                    // 反色徽标一起压暗 —— 那正是此刻最该看清的一格。
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
                    /*
                     * v0.7.14：`isolate` 是主题色那层能待在内容**下面**的前提。
                     *
                     * `.participant-tint` 是绝对定位的，绝对定位的兄弟在绘制顺序里
                     * 排在普通流内容（头像 / 名字 / 线索）之上 —— 不隔离的话，那层
                     * 颜色会糊在头像上。给了 `isolate`（建一个 stacking context），
                     * 再让色层 `z-index: -1`，它就只盖过卡片自己的底色，头像仍是
                     * 干净的一枚圆。
                     */
                    'relative isolate flex flex-col items-center justify-start border',
                    /* v0.10.1 竖屏：卡片横过来 —— 左头像（纵向跨满两行），右边一列
                       上下两行：名称在上、线索在下。不搬动 DOM，只换一套网格：
                       头像 `row-span-2` 占第一列，名称与线索顺次落进第二列。
                       `gap-x-3.5`（14px）：头像与文字之间要有一点间隔，8px 时
                       56 的头像几乎贴到名字上；横向内边距从 `p-2` 的 8px 收到
                       `px-1.5` 的 6px，把省下的宽度让给这一列间隔 —— 卡片总宽
                       不变、右边那列还是 88.5，头像也因此更靠左一点。 */
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
                        ? /*
                            选中：**一条连续的主色边**。描边与外面的 2px 同色相接
                            （1px + 2px = 3px 一整条），中间不留纸色 —— 用户说的
                            「外出蓝色高亮线和内部中间不要有空白」。粗细与预览的
                            2px 单环区分开，另外还有抬起 2px 与反色徽标。
                            底色不用 `bg-primary/10`，用下面那层**主人自己的**颜色。
                          */
                          'border-primary bg-background roster-select-pop'
                        : /*
                            悬停不再给描边上色。那条 `hover:border-primary` 与「指针激活」
                            的 2px 环叠在同一条边上，正是用户说的「两层高亮线」；现在悬停
                            的反馈交给抬起 + 影子 + 主题色铺开（v0.7.14）。
                          */
                          'border-border bg-background'
                      : 'border-dashed border-muted-foreground/40 bg-muted/30',
                    isDragging ? 'opacity-40' : undefined,
                  )}
                >
                  {/*
                    v0.7.14：卡片里那层「主题色的淡透明色」。它是一层**底色**，
                    不是盖在卡片上的一层膜 —— `.participant-tint` 用 `z-index: -1`
                    躲在所有兄弟下面（卡片根节点有 `isolate` 兜住这个负层级）。
                    半径从头像圆心长出来（`--tint-y` 由组件按头像实际中心算），
                    铺满整张卡时是均一的一层（`.participant-tint` 的注释里有算式）。
                  */}
                  {slot ? (
                    <span
                      aria-hidden="true"
                      data-testid={`slot-tint-${index}`}
                      className="participant-tint"
                      style={
                        {
                          '--tint-color': themeTint(themeColor, isWhiteTheme),
                          '--tint-y': `${AVATAR_PADDING + avatarSize / 2}px`,
                        } as CSSProperties
                      }
                    />
                  ) : null}
                  {/* OPT-B06 §6.3: 1-based sequence, top-left corner.
                      FEAT-O13 (docs/v0.5.4.md §6.2): bigger, and pushed into
                      the corner — its top / left edges are dropped so the
                      **card's frame** is those two lines, and only the
                      bottom-right corner is rounded. The top-left rounds with
                      the **card's** radius: the badge sits at inset 0, so a
                      square corner there would poke past the card's rounded
                      frame.
                      v0.6.4 §2: the glyph is the configured 编号展示 when the
                      participant has one, and the sequence number otherwise. */}
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
                      // v0.7.12：选中时徽标反色（主色底 + 纸色字）。这是「是谁」
                      // 的那一笔 —— 位置固定、对比最高，扫一眼就知道手上是哪位。
                      color: isSelected ? 'hsl(var(--primary-foreground))' : PARTICIPANT_SEQ_COLOR,
                      background: isSelected ? 'hsl(var(--primary))' : PARTICIPANT_SEQ_BACKGROUND,
                      border: PARTICIPANT_SEQ_BORDER,
                      borderColor: isSelected ? 'hsl(var(--primary))' : undefined,
                      borderTopWidth: 0,
                      borderLeftWidth: 0,
                      /*
                        v0.7.14：选中时徽标填的是主色，卡片描边也是主色 —— 两段弧
                        紧挨着（内圆角 5px 与外圆角 6px 同心），但各自都要抗锯齿，
                        交界那一像素两边都只盖了一半，纸白就漏成一道细弧。用户看到
                        的「高亮环和序号之间有白色区」正是它。
                        给徽标加 1px 同色外扩：圆弧半径从 5 长到 6，正好与卡片的外弧
                        重合 —— 两条边合成一条，抗锯齿只发生在外轮廓上（和卡片其它三
                        个角一样）。只在填色时加，纸白徽标上加了会盖住卡片描边。
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
                      // v0.10.1 竖屏：头像在左，纵向跨两行（名称 + 线索）。
                      compactPortrait && 'col-start-1 row-span-2 self-center',
                    )}
                    style={
                      compactPortrait
                        ? /*
                            v0.10.1 竖屏：横卡里不留左侧内边距 —— 卡片够高之后，
                            序号徽标（左上角 20×20）与居中的头像**纵向错开**，
                            不必再为它让出 20px；省下来的那一截正好把头像推回左边。
                            再往右挪 6px 用 `translateX` 而不是 `padding`：网格的
                            第一列是 `auto` 宽，加内边距会把列撑宽、把右边那列
                            挤窄，线索于是多折一行、卡片又长回去。
                          */
                          { padding: 0, transform: 'translateX(6px)' }
                        : { height: PANEL_CELL_HEIGHT, padding: AVATAR_PADDING }
                    }
                  >
                    {slot ? (
                      /*
                       * OPT-H06 §6.2 (docs/v0.4.2.md §6): exactly **one** circle.
                       * This span is the theme-colour disc and the only clip
                       * (`overflow-hidden rounded-full`); the thumbnail fills it
                       * and draws neither a ring nor its own round frame, so a
                       * character without artwork shows its first character
                       * instead of a white inner disc.
                       */
                      <span
                        data-testid={`slot-avatar-${index}`}
                        className="flex items-center justify-center overflow-hidden rounded-full"
                        style={{
                          width: compactPortrait ? COMPACT_AVATAR_SIZE : avatarSize,
                          height: compactPortrait ? COMPACT_AVATAR_SIZE : avatarSize,
                          backgroundColor: themeColor,
                          // MOD-802 §1.2.5 / FIX-E04: highlighting is shown by
                          // the slot's single outline + this subtle scale-up;
                          // the avatar no longer draws a second ring.
                          transform: isHighlighted ? 'scale(1.08)' : undefined,
                          transition: 'transform var(--motion-fast) var(--motion-ease-out)',
                          // MOD-703: a white theme needs its 1 px grey edge, the
                          // only stroke the spec allows, on this disc alone.
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
                      // v0.10.1 竖屏：名称在右上。
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
                      v0.9.8：线索短的时候（一两行）也要在 72px 里上下居中 ——
                      原来 items-start 让一两行的卡看着「上半截有字、下半截空」。 */}
                  <div
                    className={cn(
                      'flex w-full items-center justify-center px-1',
                      // v0.10.1 竖屏：线索在右下。
                      compactPortrait && 'col-start-2 row-start-2 w-auto justify-start px-0',
                    )}
                    style={{ height: compactPortrait ? undefined : CLUE_AREA_HEIGHT }}
                  >
                    {clueSegments.length > 0 ? (
                      <span
                        className={cn('line-clamp-3 text-center', compactPortrait && 'text-left')}
                        style={{
                          fontSize: 11,
                          /* v0.10.1 竖屏：横卡里行距收到 16px。桌面那张竖卡线索区
                             独占 72px、三行 20px 行距是版式的一部分；横卡里线索
                             只是头像右边的一小块字，20px 行距在 11px 的字上看是
                             三条平行的虚线，读不出是一段话。 */
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
