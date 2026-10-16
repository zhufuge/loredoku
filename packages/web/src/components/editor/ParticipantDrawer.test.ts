import { describe, expect, it } from 'vitest';

/**
 * FEAT-E01 (docs/v0.4.1.md §7 / §12.5): source-level guards for the roster
 * drawer's new 「位置条件」 module. The module is pure presentation — the page
 * owns the canvas pointer — so the contract we must not lose is *which props
 * carry the intent* and *what the save patch contains*.
 *
 * CRLF: the file on disk is CRLF, so the source is normalised before any
 * multi-line `toContain`.
 */

const source =
  ((import.meta.glob('./ParticipantDrawer.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>)['./ParticipantDrawer.tsx'] ?? '').replace(/\r\n/g, '\n');

describe('ParticipantDrawer position conditions (FEAT-E01 §7.5)', () => {
  it('declares the pick-intent props the page drives', () => {
    expect(source).toContain('positionPickActive?: boolean;');
    expect(source).toContain('onTogglePositionPick?: () => void;');
    expect(source).toContain('pickedPosition?: { x: number; y: number } | null;');
    expect(source).toContain('onPositionPicked?: () => void;');
    expect(source).toContain('positionPickActive = false,');
  });

  it('requires the save patch to carry positionConditions', () => {
    expect(source).toContain('positionConditions: Array<{ x: number; y: number }>;');
    expect(source).toContain('onSave(slotIndex, { themeColor, clue, linkages, positionConditions });');
  });

  it('refills the list when the drawer opens for a slot', () => {
    expect(source).toContain(
      'setPositionConditions((slot.positionConditions ?? []).map((entry) => ({ ...entry })));',
    );
  });

  it('renders the 位置条件 module with the add / cancel toggle', () => {
    expect(source).toContain('位置条件');
    expect(source).toContain('添加位置');
    expect(source).toContain("'取消选择'");
    expect(source).toContain('onClick={onTogglePositionPick}');
    // The canvas hint is only shown while picking.
    expect(source).toContain('{positionPickActive ? (');
  });

  it('lists each condition as an R/C label and lets it be removed', () => {
    expect(source).toContain('R{entry.y + 1} C{entry.x + 1}');
    expect(source).toContain('title="删除该位置"');
    expect(source).toContain('previous.filter((_, i) => i !== index),');
    expect(source).toContain('多个位置之间为「或」关系；留空表示不限制位置。');
  });

  it('consumes the picked cell exactly once and ignores duplicates', () => {
    expect(source).toContain('if (!pickedPosition) return;');
    expect(source).toContain(
      'previous.some((entry) => entry.x === x && entry.y === y) ? previous : [...previous, { x, y }],',
    );
    expect(source).toContain('onPositionPicked?.();');
  });
});

const pageSource =
  ((import.meta.glob('../../pages/EditorPage.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>)['../../pages/EditorPage.tsx'] ?? '').replace(/\r\n/g, '\n');

describe('EditorPage position-pick mode (FEAT-E01 §7.3)', () => {
  it('enters the mode from the drawer toggle and exits on a second press', () => {
    expect(pageSource).toContain('const [positionPickSlot, setPositionPickSlot] = useState<number | null>(null);');
    expect(pageSource).toContain('setPositionPickSlot((current) =>');
    expect(pageSource).toContain('current === null ? editor.selectedSlotIndex : null,');
    expect(pageSource).toContain('positionPickActive={positionPickSlot !== null}');
  });

  it('routes a canvas click to the picked position instead of the cell info box', () => {
    expect(pageSource).toContain('if (positionPickSlot !== null) {');
    expect(pageSource).toContain('setPickedPosition({ x: selection.x, y: selection.y });');
    expect(pageSource).toContain('onPositionPicked={() => setPickedPosition(null)}');
  });

  it('cancels the mode with Esc', () => {
    expect(pageSource).toContain("if (event.key === 'Escape') setPositionPickSlot(null);");
  });

  it('clears the pick mode when the drawer saves or closes', () => {
    expect(pageSource).toContain('setPositionPickSlot(null);');
    expect(pageSource.match(/setPositionPickSlot\(null\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});

