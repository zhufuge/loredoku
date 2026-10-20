import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  GAME_ACTIVE_PARTICIPANT_AVATAR_SCALE,
  GAME_ACTIVE_PARTICIPANT_NUMBER_SCALE,
  GAME_NUMBER_FONT_RATIO,
  GAME_NUMBER_GRID,
  GAME_NUMBER_STROKE_RATIO,
  type Character,
  type CharacterSlotEntry,
  type GamePlacementBoard,
} from '@loredoku/shared';
import { MapGamePlacementLayer, MapGameToolHintLayer } from './MapGameLayers';
import type { GameToolHint } from '@/lib/gamePlacement';

/**
 * v0.6.4 (docs/v0.6.4.md §3): 触碰 / 点击参与者时，放大展示地图中该参与者的
 * 头像与编号。
 *
 * The layer is pure rendering, so these are the only assertions worth making:
 * the **active** participant's avatar and their **own** 编号 glyphs grow (and
 * their avatar gains a ring), while everybody else's glyphs — including the
 * ones sharing a cell with the active participant — keep the normal size.
 */

const CELL = 40;
const BASE_FONT = CELL * GAME_NUMBER_FONT_RATIO;
const BASE_STROKE = BASE_FONT * GAME_NUMBER_STROKE_RATIO;

const CHARACTER: Character = {
  id: 11,
  code: 'jade',
  name: '阿玉',
  gender: 'female',
  description: null,
  avatarPath: null,
  avatarUrl: null,
  avatarThumbUrl: null,
  avatarMime: null,
  avatarSize: null,
  avatarWidth: null,
  avatarHeight: null,
  bgColor: '#AA0000',
  meta: {},
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const SLOTS: Array<CharacterSlotEntry | null> = [
  { characterId: 11, themeColor: '#AA0000' },
  { characterId: 12, themeColor: '#00AA00' },
  null,
];

/** 1's avatar, a cell shared by 1 and 2, 2's number alone, and a forbidden ×. */
const BOARD: GamePlacementBoard = {
  '1,0': { kind: 'participant', index: 1 },
  '2,1': { kind: 'numbers', entries: [1, 2] },
  '0,2': { kind: 'numbers', entries: [2] },
  '3,3': { kind: 'forbidden' },
};

describe('MapGamePlacementLayer — 激活参与者放大（v0.6.4 §3）', () => {
  let container: HTMLDivElement;
  let root: Root;

  function render(activeParticipantId: number | null): void {
    act(() => {
      root.render(
        <MapGamePlacementLayer
          board={BOARD}
          slots={SLOTS}
          charactersById={new Map([[11, CHARACTER]])}
          cellSize={CELL}
          activeParticipantId={activeParticipantId}
        />,
      );
    });
  }

  /** The avatar disc's wrapper — the element that carries the magnification. */
  const avatarWrapper = (): HTMLElement =>
    container.querySelector('[data-color-block]')?.parentElement as HTMLElement;

  /** Every 编号 glyph on the board, as `text → font-size` pairs. */
  const glyphs = (): Array<{ text: string; fontSize: string; strokeWidth: string }> =>
    Array.from(container.querySelectorAll('text')).map((node) => ({
      text: node.textContent ?? '',
      fontSize: node.getAttribute('font-size') ?? '',
      strokeWidth: node.getAttribute('stroke-width') ?? '',
    }));

  const glyphOf = (participantId: number) =>
    glyphs().filter((entry) => entry.text === String(participantId));

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('magnifies the active participant’s avatar and rings it', () => {
    render(1);
    expect(avatarWrapper().style.transform).toBe(
      `scale(${GAME_ACTIVE_PARTICIPANT_AVATAR_SCALE})`,
    );
    expect(avatarWrapper().style.boxShadow).toContain('hsl(var(--primary))');
    expect(avatarWrapper().style.transition).toContain('transform');
  });

  it('leaves another participant’s avatar untouched', () => {
    render(2);
    // The only avatar on the board belongs to participant 1.
    expect(avatarWrapper().style.transform).toBe('');
    expect(avatarWrapper().style.boxShadow).toBe('');
  });

  it('magnifies only the active participant’s own 编号 glyphs', () => {
    render(1);
    // Participant 1 has two glyphs (the shared cell + their own cell); both grow.
    for (const glyph of glyphOf(1)) {
      expect(glyph.fontSize).toBe(String(BASE_FONT * GAME_ACTIVE_PARTICIPANT_NUMBER_SCALE));
      // The stroke scales with the font (float-tolerant: the layer derives it
      // from the already-scaled font, the other factorisation rounds alike).
      expect(Number(glyph.strokeWidth)).toBeCloseTo(
        BASE_STROKE * GAME_ACTIVE_PARTICIPANT_NUMBER_SCALE,
        10,
      );
    }
    // Participant 2 shares a cell with 1 and has a cell of their own — neither
    // grows: a shared cell must not imply the whole cell belongs to the active.
    for (const glyph of glyphOf(2)) {
      expect(glyph.fontSize).toBe(String(BASE_FONT));
      expect(glyph.strokeWidth).toBe(String(BASE_STROKE));
    }
  });

  it('magnifies the other participant when they are the active one', () => {
    render(2);
    for (const glyph of glyphOf(2)) {
      expect(glyph.fontSize).toBe(String(BASE_FONT * GAME_ACTIVE_PARTICIPANT_NUMBER_SCALE));
    }
    for (const glyph of glyphOf(1)) {
      expect(glyph.fontSize).toBe(String(BASE_FONT));
    }
  });

  it('magnifies nothing when no participant is active', () => {
    render(null);
    expect(avatarWrapper().style.transform).toBe('');
    // Only the 编号 glyphs — the forbidden × keeps its own (larger) size.
    for (const glyph of [...glyphOf(1), ...glyphOf(2)]) {
      expect(glyph.fontSize).toBe(String(BASE_FONT));
    }
  });

  it('leaves the forbidden × alone', () => {
    render(1);
    const forbidden = glyphs().find((entry) => entry.text === '×');
    expect(forbidden?.fontSize).not.toBe(String(BASE_FONT * GAME_ACTIVE_PARTICIPANT_NUMBER_SCALE));
  });
});

/**
 * v0.6.4 fix (docs/v0.6.4.md §4): the 9-grid 编号 glyph shows the
 * participant's configured 编号展示 text when they have one, and their
 * sequence number otherwise. The label lives on the slot entry, so a
 * participant carries their label wherever the board puts them — rearranging
 * the roster renumbers the unconfigured ones only.
 */
describe('MapGamePlacementLayer — 方格内编号走编号展示（v0.6.4 fix §4）', () => {
  const SLOTS: Array<CharacterSlotEntry | null> = [
    { characterId: 11, themeColor: '#AA0000', displayNumber: '甲' },
    { characterId: 12, themeColor: '#00AA00' },
    { characterId: 13, themeColor: '#0000AA', displayNumber: 'K1' },
  ];
  /** A cell shared by 1 and 2, and a cell holding 3's number alone. */
  const BOARD: GamePlacementBoard = {
    '1,1': { kind: 'numbers', entries: [1, 2] },
    '4,4': { kind: 'numbers', entries: [3] },
  };

  let container: HTMLDivElement;
  let root: Root;

  function render(): void {
    act(() => {
      root.render(
        <MapGamePlacementLayer
          board={BOARD}
          slots={SLOTS}
          charactersById={new Map()}
          cellSize={CELL}
        />,
      );
    });
  }

  /** Every 编号 glyph on the board, as `text → font-size / fill` records. */
  const glyphs = (): Array<{ text: string; fontSize: string; fill: string; strokeWidth: string }> =>
    Array.from(container.querySelectorAll('text')).map((node) => ({
      text: node.textContent ?? '',
      fontSize: node.getAttribute('font-size') ?? '',
      fill: node.getAttribute('fill') ?? '',
      strokeWidth: node.getAttribute('stroke-width') ?? '',
    }));

  const glyphOf = (text: string) => glyphs().filter((entry) => entry.text === text);

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('shows the configured text, and the sequence number without one', () => {
    render();
    expect(glyphOf('甲')).toHaveLength(1);
    expect(glyphOf('K1')).toHaveLength(1);
    // Participant 2 has no configuration — the number stays.
    expect(glyphOf('2')).toHaveLength(1);
    // …and no raw participant id leaked through.
    expect(glyphs().map((entry) => entry.text).sort()).toEqual(['2', 'K1', '甲']);
  });

  it('keeps the configured glyph’s theme colour', () => {
    render();
    expect(glyphOf('甲')[0]?.fill).toBe('#AA0000');
    expect(glyphOf('K1')[0]?.fill).toBe('#0000AA');
    expect(glyphOf('2')[0]?.fill).toBe('#00AA00');
  });

  it('shrinks a configured label that would not fit its slot', () => {
    render();
    // 'K1' is two narrow glyphs — it fits a third of the cell at full size.
    expect(glyphOf('K1')[0]?.fontSize).toBe(String(BASE_FONT));
    // '甲' is a single wide glyph — still fits.
    expect(glyphOf('甲')[0]?.fontSize).toBe(String(BASE_FONT));
    // A stroke scales with the font it belongs to.
    expect(glyphOf('甲')[0]?.strokeWidth).toBe(String(BASE_FONT * GAME_NUMBER_STROKE_RATIO));
  });

  it('shrinks a long label instead of letting it spill over the neighbours', () => {
    const long: Array<CharacterSlotEntry | null> = [
      { characterId: 11, themeColor: '#AA0000', displayNumber: '甲乙丙' },
    ];
    act(() => {
      root.render(
        <MapGamePlacementLayer
          board={{ '1,1': { kind: 'numbers', entries: [1] } }}
          slots={long}
          charactersById={new Map()}
          cellSize={CELL}
        />,
      );
    });
    const [glyph] = glyphs();
    if (!glyph) throw new Error('编号字形没渲染出来');
    // 3 em at the base size would need the whole cell; the fitted font is the
    // slot width over the glyph count (slot / 3), so the label fits exactly.
    expect(Number(glyph.fontSize)).toBeCloseTo(CELL / GAME_NUMBER_GRID / 3, 6);
    expect(Number(glyph.fontSize)).toBeLessThan(BASE_FONT);
  });
});

/**
 * v0.6.4 fix (docs/v0.6.4.md §4): the hover preview must promise the same
 * label the placement layer will draw — otherwise a configured participant
 * would hover as `3` and place as `甲`.
 */
describe('MapGameToolHintLayer — 悬停预览编号走编号展示（v0.6.4 fix §4）', () => {
  const SLOTS: Array<CharacterSlotEntry | null> = [
    { characterId: 11, themeColor: '#AA0000', displayNumber: '甲' },
    { characterId: 12, themeColor: '#00AA00' },
  ];

  let container: HTMLDivElement;
  let root: Root;

  function render(hint: GameToolHint): void {
    act(() => {
      root.render(
        <MapGameToolHintLayer
          hint={hint}
          cell={{ x: 2, y: 3 }}
          cellSize={CELL}
          slots={SLOTS}
        />,
      );
    });
  }

  const glyph = (): { text: string; fontSize: string; fill: string } => {
    const node = container.querySelector('text');
    return {
      text: node?.textContent ?? '',
      fontSize: node?.getAttribute('font-size') ?? '',
      fill: node?.getAttribute('fill') ?? '',
    };
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('previews the configured label with its theme colour', () => {
    render({ kind: 'number', participantId: 1 });
    expect(glyph().text).toBe('甲');
    expect(glyph().fill).toBe('#AA0000');
    expect(glyph().fontSize).toBe(String(BASE_FONT));
  });

  it('previews the sequence number for a participant without one', () => {
    render({ kind: 'number', participantId: 2 });
    expect(glyph().text).toBe('2');
    expect(glyph().fill).toBe('#00AA00');
  });

  it('shrinks a long label to fit the hint slot', () => {
    act(() => {
      root.render(
        <MapGameToolHintLayer
          hint={{ kind: 'number', participantId: 1 }}
          cell={{ x: 0, y: 0 }}
          cellSize={CELL}
          slots={[{ characterId: 11, themeColor: '#AA0000', displayNumber: '甲乙丙' }]}
        />,
      );
    });
    expect(Number(glyph().fontSize)).toBeCloseTo(CELL / GAME_NUMBER_GRID / 3, 6);
  });
});
