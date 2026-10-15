import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Character, CharacterSlotEntry } from '@murdoku/shared';
import { DRAG_THRESHOLD } from '@/lib/grid';
import {
  computeParticipantLayout,
  deriveLayout,
  fitColumns,
  slotIndex,
  type ParticipantLayout,
} from '@/lib/participantLayout';
import { parseClue } from '@/lib/clue';
import { CharacterThumbnail } from '@/components/character/CharacterThumbnail';
import { cn } from '@/lib/utils';

/**
 * CLAR-602 + MOD-702/703/705/706/707/802/803
 * (docs/v0.3.1.md + v0.3.2.md + v0.3.3.md):
 * - Matrix layout with golden-ratio rows/cols, last row centred
 * - MOD-803: min cell 72px, gap 12px, avatar padding 8px, clue area 56px
 *   (3 lines @ 11px/16px), avatar min 48×48, columns shrink to fit
 * - MOD-802: hover activates the participant's linkages, click toggles
 *   (and opens the info drawer); the parent owns the single-active state
 * - MOD-702: clue display area below the avatar
 * - MOD-703: theme color background layer behind avatar
 * - MOD-705: removal confirmation handled by parent (via onClearRequest)
 * - MOD-706: title bar height = 36px, same as item panel header
 */
interface ParticipantPanelProps {
  slots: Array<CharacterSlotEntry | null>;
  charactersById: Map<number, Character>;
  selectedSlotIndex: number | null;
  draggingIndex: number | null;
  /** MOD-802: slot whose linkages are currently previewed. */
  activeSlotIndex?: number | null;
  highlightedSlots?: Set<number>;
  highlightColors?: Map<number, string>;
  onSelect: (slotIndex: number | null) => void;
  /** MOD-802: pointer entered a slot → hover-activate its linkages. */
  onActivateHover: (slotIndex: number) => void;
  /** MOD-802: pointer left a slot → hover-deactivate (no-op when click-active). */
  onDeactivateHover: (slotIndex: number) => void;
  /** MOD-802: click a slot → toggle click-activation. */
  onActivateClick: (slotIndex: number) => void;
  /** Click on × button — parent handles confirmation (MOD-705). */
  onClearRequest: (index: number) => void;
  onDragBegin: (payload: { slotIndex: number; pointer: { x: number; y: number } }) => void;
  onDragMove: (pointer: { x: number; y: number }) => void;
  onDragEnd: (pointer: { x: number; y: number }) => void;
  onDragCancel: () => void;
}

const CLEAR_BUTTON_ATTR = 'data-slot-clear';

/** MOD-803: minimum (and default) square cell side. */
const MIN_CELL_SIZE = 72;
/** MOD-803: gap between cells. */
const CELL_GAP = 12;
/** MOD-803: clue display area fixed height (3 lines). */
const CLUE_AREA_HEIGHT = 56;
/** MOD-803: padding between the cell edge and the theme-color circle. */
const AVATAR_PADDING = 8;
/** MOD-803: minimum avatar diameter. */
const AVATAR_MIN_SIZE = 48;
/** MOD-802: don't hover-activate while a slot is being dragged. */
const DRAG_HOVER_LOCK = true;

export function ParticipantPanel({
  slots,
  charactersById,
  selectedSlotIndex,
  draggingIndex,
  activeSlotIndex = null,
  highlightedSlots,
  highlightColors,
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

  // MOD-803: shrink the column count when the panel can't hold it; when even
  // one column doesn't fit, the scroll container takes over.
  const layout = useMemo<ParticipantLayout>(() => {
    if (panelWidth <= 0) return preferred;
    const cols = fitColumns(panelWidth - 16, preferred.cols, MIN_CELL_SIZE, CELL_GAP);
    return deriveLayout(slots.length, cols);
  }, [panelWidth, preferred, slots.length]);

  const measuredRef = useRef<HTMLDivElement | null>(null);

  // MOD-803: track the panel width so the column count can shrink to fit.
  useEffect(() => {
    const node = measuredRef.current;
    if (!node || typeof window === 'undefined') return;
    const update = (): void => {
      const width = node.clientWidth;
      setPanelWidth((current) => (current === width ? current : width));
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

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

  const avatarSize = Math.max(AVATAR_MIN_SIZE, MIN_CELL_SIZE - AVATAR_PADDING * 2);
  const hoverLocked = DRAG_HOVER_LOCK && draggingIndex !== null;

  return (
    <aside
      ref={measuredRef}
      className="flex w-[180px] shrink-0 flex-col border-r bg-background"
    >
      {/* MOD-706: title bar height 36px, font 13px/600, color #1F2937 */}
      <div
        className="shrink-0 border-b px-3 text-center"
        style={{ height: 36, lineHeight: '36px', fontSize: 13, fontWeight: 600, color: '#1F2937' }}
      >
        参与者 {placedCount}/{slots.length}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {slots.length === 0 ? (
          <p className="px-2 py-6 text-center text-[10px] text-muted-foreground">
            从角色列表拖拽到参与者区
          </p>
        ) : (
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${layout.cols}, ${MIN_CELL_SIZE}px)`,
              gap: CELL_GAP,
              justifyContent: 'center',
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
              const themeColor = slot?.themeColor ?? '#FFFFFF';
              const isWhiteTheme = themeColor.toUpperCase() === '#FFFFFF';
              const clueSegments = slot?.clue ? parseClue(slot.clue) : [];
              return (
                <div
                  key={index}
                  data-slot-index={index}
                  style={{
                    touchAction: 'none',
                    width: MIN_CELL_SIZE,
                    height: MIN_CELL_SIZE + CLUE_AREA_HEIGHT,
                  }}
                  onPointerDown={(event) => {
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
                    const arm = armRef.current;
                    if (!arm || arm.pointerId !== event.pointerId) return;
                    if (!arm.active) {
                      const distance = Math.hypot(
                        event.clientX - arm.startX,
                        event.clientY - arm.startY,
                      );
                      if (distance <= DRAG_THRESHOLD) return;
                      arm.active = true;
                      onDragBegin({
                        slotIndex: arm.index,
                        pointer: { x: event.clientX, y: event.clientY },
                      });
                    }
                    onDragMove({ x: event.clientX, y: event.clientY });
                  }}
                  onPointerUp={(event) => {
                    const arm = armRef.current;
                    if (!arm || arm.pointerId !== event.pointerId) return;
                    reset();
                    if (arm.active) {
                      onDragEnd({ x: event.clientX, y: event.clientY });
                      return;
                    }
                    if (!slots[index]) return;
                    // MOD-802: a click both toggles the linkage activation
                    // and opens the info drawer for editing.
                    onActivateClick(index);
                    onSelect(isSelected ? null : index);
                  }}
                  onPointerCancel={() => {
                    if (!armRef.current) return;
                    const wasActive = armRef.current.active;
                    reset();
                    if (wasActive) onDragCancel();
                  }}
                  onPointerEnter={() => {
                    if (hoverLocked || !slots[index]) return;
                    onActivateHover(index);
                  }}
                  onPointerLeave={() => {
                    if (hoverLocked || !slots[index]) return;
                    onDeactivateHover(index);
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
                    'relative flex flex-col items-center justify-start rounded-md border',
                    draggingIndex !== null ? 'cursor-grabbing' : slot ? 'cursor-grab' : undefined,
                    slot
                      ? isSelected
                        ? 'border-primary bg-accent'
                        : 'border-border bg-background hover:border-primary'
                      : 'border-dashed border-muted-foreground/40 bg-muted/30',
                    // MOD-802: the previewed participant stays visibly marked
                    // (hover ends on leave, click is a toggle → needs a ring).
                    isActive ? 'ring-2 ring-primary ring-offset-1' : undefined,
                    isDragging ? 'opacity-40' : undefined,
                  )}
                >
                  {/* Avatar area (top portion) — MOD-803: 8px padding */}
                  <div
                    className="flex items-center justify-center"
                    style={{ height: MIN_CELL_SIZE, padding: AVATAR_PADDING }}
                  >
                    {slot ? (
                      <span
                        className="flex items-center justify-center rounded-full"
                        style={{
                          width: avatarSize,
                          height: avatarSize,
                          backgroundColor: themeColor,
                          // MOD-802 §1.2.5: highlighted character → 3px param
                          // colour outline + subtle scale-up.
                          transform: isHighlighted ? 'scale(1.08)' : undefined,
                          transition: 'transform 150ms linear',
                          // MOD-703: white theme → 1px light grey border
                          border: isHighlighted
                            ? `3px solid ${highlightColor ?? '#3B82F6'}`
                            : isWhiteTheme
                              ? '1px solid #D1D5DB'
                              : 'none',
                        }}
                      >
                        {character ? (
                          <CharacterThumbnail
                            character={character}
                            className="h-[80%] w-[80%] rounded-full"
                          />
                        ) : (
                          <span className="text-[10px] text-muted-foreground">
                            #{slot.characterId}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">{index + 1}</span>
                    )}
                  </div>

                  {/* MOD-803: clue area 56px, 3 lines @ 11px/16px */}
                  <div
                    className="flex w-full items-start justify-center px-1"
                    style={{ height: CLUE_AREA_HEIGHT }}
                  >
                    {clueSegments.length > 0 ? (
                      <span
                        className="line-clamp-3 text-center"
                        style={{ fontSize: 11, lineHeight: '16px' }}
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
                  {slot ? (
                    <button
                      type="button"
                      {...{ [CLEAR_BUTTON_ATTR]: 'true' }}
                      aria-label="移出参与者"
                      data-testid={`slot-clear-${index}`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!slots[index]) return;
                        onClearRequest(index);
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
