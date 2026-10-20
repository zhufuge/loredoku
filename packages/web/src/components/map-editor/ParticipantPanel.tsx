import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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
  const layout = useMemo<ParticipantLayout>(() => {
    if (fixedCols !== null) return deriveLayout(slots.length, fixedCols);
    if (panelWidth <= 0) return preferred;
    const fit = fitColumns(
      panelWidth - ROSTER_PANEL_PADDING * 2,
      preferred.cols,
      PANEL_CELL_WIDTH,
      CELL_GAP,
    );
    return deriveLayout(slots.length, fit);
  }, [panelWidth, preferred, slots.length, fixedCols]);

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
      className="flex shrink-0 flex-col border-r bg-background"
      style={{ width: panelBoxWidth }}
    >
      {/* OPT-B06 §6.1: title bar 40px, aligned with the item panel header */}
      <div
        className="shrink-0 border-b px-3 text-center"
        style={{
          height: PARTICIPANT_HEADER_HEIGHT,
          lineHeight: `${PARTICIPANT_HEADER_HEIGHT}px`,
          fontSize: 13,
          fontWeight: 600,
          color: '#1F2937',
        }}
      >
        参与者 {placedCount}/{slots.length}
      </div>
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
          <p className="px-2 py-6 text-center text-[10px] text-muted-foreground">
            {readOnly ? '该谜题暂无参与者' : '从角色列表拖拽到参与者区'}
          </p>
        ) : (
          <div
            className="grid"
            data-testid="roster-matrix"
            style={{
              gridTemplateColumns: `repeat(${layout.cols}, ${PANEL_CELL_WIDTH}px)`,
              gap: CELL_GAP,
              justifyContent: 'center',
              // v0.6.3 §3.3: never narrower than its own tracks. Without this,
              // a matrix wider than the panel would be centred and its left
              // edge clipped — the part `overflow` can never scroll back to.
              minWidth: 'max-content',
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
               */
              const focusRingStyle: CSSProperties = isHighlighted
                ? { boxShadow: `0 0 0 2px ${highlightColor ?? HIGHLIGHT_BLUE}` }
                : isActive
                  ? { boxShadow: '0 0 0 2px hsl(var(--primary))' }
                  : {};
              const themeColor = slot?.themeColor ?? '#FFFFFF';
              const isWhiteTheme = themeColor.toUpperCase() === '#FFFFFF';
              const clueSegments = slot?.clue ? parseClue(slot.clue) : [];
              return (
                <div
                  key={index}
                  data-slot-index={index}
                  style={{
                    touchAction: 'none',
                    width: PANEL_CELL_WIDTH,
                    // FEAT-O12: the name row is added to the card's height.
                    height: PANEL_CELL_HEIGHT + NAME_AREA_HEIGHT + CLUE_AREA_HEIGHT,
                    // The radius is inline (not `rounded-md`) because the
                    // sequence badge rounds its top-left corner with it — the
                    // two must never drift apart.
                    borderRadius: PARTICIPANT_SLOT_RADIUS,
                    // FIX-E04: the slot's single highlight frame.
                    ...focusRingStyle,
                    // SPEC-H14 §1.3: placed → the **whole** card dims (frame +
                    // badge + avatar + clue). One opacity, on the root only, so
                    // nothing multiplies down to 0.45 × 0.45.
                    opacity: isPlaced ? GAME_PLACED_OPACITY : undefined,
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
                    'relative flex flex-col items-center justify-start border',
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
                        ? 'border-primary bg-accent'
                        : 'border-border bg-background hover:border-primary'
                      : 'border-dashed border-muted-foreground/40 bg-muted/30',
                    isDragging ? 'opacity-40' : undefined,
                  )}
                >
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
                      color: PARTICIPANT_SEQ_COLOR,
                      background: PARTICIPANT_SEQ_BACKGROUND,
                      border: PARTICIPANT_SEQ_BORDER,
                      borderTopWidth: 0,
                      borderLeftWidth: 0,
                    }}
                  >
                    {participantBadgeText(slot, index)}
                  </span>

                  {/* Avatar area (top portion) — MOD-803: 8px padding */}
                  <div
                    className="flex items-center justify-center"
                    style={{ height: PANEL_CELL_HEIGHT, padding: AVATAR_PADDING }}
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
                          width: avatarSize,
                          height: avatarSize,
                          backgroundColor: themeColor,
                          // MOD-802 §1.2.5 / FIX-E04: highlighting is shown by
                          // the slot's single outline + this subtle scale-up;
                          // the avatar no longer draws a second ring.
                          transform: isHighlighted ? 'scale(1.08)' : undefined,
                          transition: 'transform 150ms linear',
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
                          <span className="text-[10px] text-muted-foreground">
                            #{slot.characterId}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">空</span>
                    )}
                  </div>

                  {/* FEAT-O12 §6.1: the character's name, between the avatar
                      and the clue. Empty slots render nothing. */}
                  <div
                    className="flex w-full items-center justify-center px-1"
                    style={{ height: NAME_AREA_HEIGHT }}
                  >
                    {character ? (
                      <span
                        data-testid={`slot-name-${index}`}
                        className="max-w-full truncate text-center text-xs font-medium"
                        title={character.name}
                      >
                        {character.name}
                      </span>
                    ) : null}
                  </div>

                  {/* OPT-A02: clue area 72px, 3 lines @ 11px/20px, ellipsis + title tooltip */}
                  <div
                    className="flex w-full items-start justify-center px-1"
                    style={{ height: CLUE_AREA_HEIGHT }}
                  >
                    {clueSegments.length > 0 ? (
                      <span
                        className="line-clamp-3 text-center"
                        style={{ fontSize: 11, lineHeight: `${CLUE_LINE_HEIGHT}px` }}
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
                        'rounded-full border bg-background text-muted-foreground shadow-sm',
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
