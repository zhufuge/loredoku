import { describe, expect, it } from 'vitest';
import { readSource, segment } from '@/testing/source';

/**
 * SPEC-G01 / SPEC-G02 (docs/v0.4.0.md §7 / §8) — a source-level guard for the
 * two game-only layers, the same technique as `MapRegionLayers.test.ts`.
 *
 * The rules worth pinning down: both layers take their z-index from
 * `MAP_LAYER_Z` (never a hand-written number), neither receives pointer
 * events, and the number glyph really is the shared 3×3 layout.
 */

const source = readSource('components/map/MapGameLayers.tsx');

const HINT_START = 'export function MapGameToolHintLayer(';
const PLACEMENT_START = 'export function MapGamePlacementLayer(';
const PLACEMENT_END = '\n/** SPEC-G01 §7.1';

const hint = segment(source, HINT_START, PLACEMENT_START);
const placement = segment(source, PLACEMENT_START, PLACEMENT_END);

describe('游戏放置层 / 工具提示层 (SPEC-G01 / SPEC-G02)', () => {
  it('takes both z-indexes from MAP_LAYER_Z', () => {
    expect(hint).toContain('zIndex: MAP_LAYER_Z.gameToolHint');
    expect(placement).toContain('zIndex: MAP_LAYER_Z.gamePlacement');
    // No hand-written numbers for the two new layers.
    expect(hint).not.toMatch(/zIndex:\s*\d/);
    expect(placement).not.toMatch(/zIndex:\s*\d/);
  });

  it('renders neither layer interactive', () => {
    expect(hint).toContain('pointer-events-none');
    expect(placement).toContain('pointer-events-none');
    expect(placement).toContain('no-drag');
  });

  it('draws the three placement forms', () => {
    expect(placement).toContain("placement.kind === 'participant'");
    expect(placement).toContain("placement.kind === 'numbers'");
    expect(placement).toContain("placement.kind === 'forbidden'");
    // Numbers come from the shared 3×3 layout helper.
    expect(placement).toContain('numberSlotAnchor(index)');
    // The participant avatar is inset by the shared object padding.
    expect(placement).toContain('itemPadding(cellSize)');
  });

  it('keeps avatars undraggable', () => {
    // The avatar picture lives in `ParticipantAvatar`, past the placement
    // segment's end — and it is the only image in this file.
    expect(source).toContain('draggable={false}');
  });

  it('sizes the number glyph at cellSize / 4 with a scaled black stroke', () => {
    expect(placement).toContain('cellSize * GAME_NUMBER_FONT_RATIO');
    expect(placement).toContain('numberFontSize * GAME_NUMBER_STROKE_RATIO');
    expect(placement).toContain('paintOrder="stroke fill"');
  });

  it('colours each number with its participant theme colour', () => {
    expect(placement).toContain("slots[participantId - 1]?.themeColor");
  });

  it('draws the hint glyphs from the shared constants', () => {
    expect(hint).toContain('GAME_TOOL_HINT_FORBIDDEN_COLOR');
    expect(hint).toContain('GAME_TOOL_HINT_ERASER_COLOR');
    expect(hint).toContain('themeColors.get(hint.participantId)');
    expect(hint).toContain('cellSize * GAME_NUMBER_FONT_RATIO');
    expect(hint).toContain('cellSize * GAME_FORBIDDEN_FONT_RATIO');
  });

  it('renders nothing without a hint or a cell', () => {
    expect(hint).toContain('if (!hint || !cell) return null;');
  });

  it('renders nothing for an empty board', () => {
    expect(placement).toContain("if (entries.length === 0) return null;");
  });
});
