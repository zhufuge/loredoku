import { useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Character, CharacterSlotEntry } from '@murdoku/shared';
import { DRAG_THRESHOLD } from '@/lib/grid';
import {
  computeParticipantLayout,
  type ParticipantLayout,
} from '@/lib/participantLayout';
import { parseClue, truncateClue } from '@/lib/clue';
import { CharacterThumbnail } from '@/components/character/CharacterThumbnail';
import { cn } from '@/lib/utils';

/**
 * CLAR-602 + MOD-702/703/705/706/707 (docs/v0.3.1.md + v0.3.2.md):
 * - Matrix layout with golden-ratio rows/cols
 * - MOD-707: min cell 56px, gap 10px
 * - MOD-702: clue display area (40px fixed height) below avatar
 * - MOD-703: theme color background layer behind avatar (circle, +6px radius)
 * - MOD-705: removal confirmation handled by parent (via onClearRequest)
 * - MOD-706: title bar height = 36px, same as item panel header
 */
interface ParticipantPanelProps {
  slots: Array<CharacterSlotEntry | null>;
  charactersById: Map<number, Character>;
  selectedSlotIndex: number | null;
  draggingIndex: number | null;
  highlightedSlots?: Set<number>;
  highlightColors?: Map<number, string>;
  onSelect: (slotIndex: number | null) => void;
  /** Click on × button — parent handles confirmation (MOD-705). */
  onClearRequest: (index: number) => void;
  onDragBegin: (payload: { slotIndex: number; pointer: { x: number; y: number } }) => void;
  onDragMove: (pointer: { x: number; y: number }) => void;
  onDragEnd: (pointer: { x: number; y: number }) => void;
  onDragCancel: () => void;
}

const CLEAR_BUTTON_ATTR = 'data-slot-clear';

/** MOD-707: minimum square cell side. */
const MIN_CELL_SIZE = 56;
/** MOD-707: gap between cells. */
const CELL_GAP = 10;
/** MOD-702: clue display area fixed height. */
const CLUE_AREA_HEIGHT = 40;

export function ParticipantPanel({
  slots,
  charactersById,
  selectedSlotIndex,
  draggingIndex,
  highlightedSlots,
  highlightColors,
  onSelect,
  onClearRequest,
  onDragBegin,
  onDragMove,
  onDragEnd,
  onDragCancel,
}: ParticipantPanelProps): JSX.Element {
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const [cellSize, setCellSize] = useState(56);
  const armRef = useRef<{
    index: number;
    startX: number;
    startY: number;
    active: boolean;
    pointerId: number | null;
  } | null>(null);

  const layout: ParticipantLayout = useMemo(
    () => computeParticipantLayout(slots.length),
    [slots.length],
  );

  const measuredRef = useRef<HTMLDivElement | null>(null);
  useMemo(() => {
    if (typeof window === 'undefined') return;
    const node = measuredRef.current;
    if (!node) return;
    const width = node.clientWidth;
    const cols = layout.cols || 1;
    const computed = Math.floor((width - CELL_GAP * (cols - 1)) / cols);
    setCellSize(Math.max(MIN_CELL_SIZE, Math.min(80, computed || 56)));
  }, [layout.cols]);

  const placedCount = useMemo(() => slots.filter(Boolean).length, [slots]);

  const reset = (): void => {
    armRef.current = null;
  };

  const hitClearButton = (target: EventTarget | null): boolean =>
    target instanceof Element && target.closest(`[${CLEAR_BUTTON_ATTR}]`) !== null;

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
              gridTemplateColumns: `repeat(${layout.cols}, ${cellSize}px)`,
              gap: CELL_GAP,
              justifyContent: 'center',
            }}
          >
            {slots.map((slot, index) => {
              const character = slot ? charactersById.get(slot.characterId) : undefined;
              const isSelected = selectedSlotIndex === index;
              const isHovered = hoveredSlot === index;
              const isDragging = draggingIndex === index;
              const isHighlighted = highlightedSlots?.has(index) ?? false;
              const highlightColor = highlightColors?.get(index);
              const themeColor = slot?.themeColor ?? '#FFFFFF';
              const isWhiteTheme = themeColor.toUpperCase() === '#FFFFFF';
              const clueSegments = slot?.clue ? parseClue(slot.clue) : [];
              const clueTruncated = slot?.clue ? truncateClue(slot.clue, 30) : '';
              return (
                <div
                  key={index}
                  data-slot-index={index}
                  style={{ touchAction: 'none', width: cellSize, height: cellSize + CLUE_AREA_HEIGHT }}
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
                    onSelect(isSelected ? null : index);
                  }}
                  onPointerCancel={() => {
                    if (!armRef.current) return;
                    const wasActive = armRef.current.active;
                    reset();
                    if (wasActive) onDragCancel();
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
                    isDragging ? 'opacity-40' : undefined,
                  )}
                >
                  {/* Avatar area (top portion) */}
                  <div className="flex items-center justify-center" style={{ height: cellSize }}>
                    {slot ? (
                      <span
                        className="flex items-center justify-center rounded-full"
                        style={{
                          width: cellSize - 12,
                          height: cellSize - 12,
                          backgroundColor: themeColor,
                          // MOD-703: white theme → 1px light grey border
                          border: isHighlighted
                            ? `3px solid ${highlightColor ?? '#3B82F6'}`
                            : isWhiteTheme
                              ? '1px solid #D1D5DB'
                              : 'none',
                          boxShadow: isHighlighted
                            ? `0 0 0 2px ${highlightColor ?? '#3B82F6'}`
                            : undefined,
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

                  {/* MOD-702: clue display area (fixed 40px) */}
                  <div
                    className="flex w-full items-start justify-center px-1"
                    style={{ height: CLUE_AREA_HEIGHT }}
                  >
                    {clueSegments.length > 0 ? (
                      <span
                        className="line-clamp-2 text-center text-[10px] leading-tight"
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