import { describe, expect, it } from 'vitest';
import { readSource } from '@/testing/source';

/**
 * FEAT-E01 (docs/v0.4.1.md §7 / §12.5): source-level guards for the roster
 * drawer's new 「位置条件」 module. The module is pure presentation — the page
 * owns the canvas pointer — so the contract we must not lose is *which props
 * carry the intent* and *what the save patch contains*.
 *
 * CRLF: the file on disk is CRLF, so the source is normalised before any
 * multi-line `toContain`.
 */

const source = readSource('components/editor/ParticipantDrawer.tsx');

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

  it('renders the position-pick toggle', () => {
    expect(source).toContain('onClick={onTogglePositionPick}');
    // The canvas hint is only shown while picking.
    expect(source).toContain('{positionPickActive ? (');
  });

  it('lists each condition as an R/C label and lets it be removed', () => {
    expect(source).toContain('R{entry.y + 1} C{entry.x + 1}');
    expect(source).toContain('previous.filter((_, i) => i !== index),');
  });

  it('consumes the picked cell exactly once and ignores duplicates', () => {
    expect(source).toContain('if (!pickedPosition) return;');
    expect(source).toContain(
      'previous.some((entry) => entry.x === x && entry.y === y) ? previous : [...previous, { x, y }],',
    );
    expect(source).toContain('onPositionPicked?.();');
  });
});

const pageSource = readSource('pages/PuzzleEditorPage.tsx');

describe('PuzzleEditorPage position-pick mode (FEAT-E01 §7.3, v0.5.0 搬家)', () => {
  it('enters the mode from the drawer toggle and exits on a second press', () => {
    expect(pageSource).toContain('const [positionPickSlot, setPositionPickSlot] = useState<number | null>(null);');
    expect(pageSource).toContain('setPositionPickSlot((current) =>');
    expect(pageSource).toContain('current === null ? puzzle.selectedSlotIndex : null)');
    expect(pageSource).toContain('positionPickActive={positionPickSlot !== null}');
  });

  it('routes a canvas click to the picked position instead of the cell info box', () => {
    expect(pageSource).toContain('if (positionPickSlot !== null) {');
    expect(pageSource).toContain('setPickedPosition({ x: selection.x, y: selection.y });');
    expect(pageSource).toContain('onPositionPicked={() => setPickedPosition(null)}');
  });

  it('cancels the mode with Esc', () => {
    // the two standalone Escape listeners merged into the shared
    // shortcut hook's cascade (`handlePuzzleEscape`).
    const escape = pageSource.slice(
      pageSource.indexOf('const handlePuzzleEscape'),
      pageSource.indexOf('const moveSelection'),
    );
    expect(escape).toContain('if (positionPickSlot !== null) {');
    expect(escape).toContain('setPositionPickSlot(null);');
  });

  it('clears the pick mode when the drawer saves or closes', () => {
    expect(pageSource).toContain('setPositionPickSlot(null);');
    expect(pageSource.match(/setPositionPickSlot\(null\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});

/**
 * OPT-H07 / OPT-H08 / OPT-H09（docs/v0.4.2.md §7 ~ §9）。
 *
 * - OPT-H07：联动列表不渲染「高亮」徽标（效果固定，徽标不携带信息）；
 * - OPT-H08：主题色只显示当前选中（一行色块 + hex + 修改），调色板下沉到
 *   `ThemeColorDialog`；
 * - OPT-H09：保存 / 取消固定在抽屉底部，位于滚动区之外；× 与 Esc 等同取消。
 */
describe('ParticipantDrawer — v0.4.2 抽屉改版（OPT-H07 / H08 / H09）', () => {
  it('OPT-H09: the footer sits outside the scroll area', () => {
    // 滚动区：`min-h-0 flex-1 ... overflow-y-auto`
    expect(source).toContain('min-h-0 flex-1 space-y-4 overflow-y-auto');
    // 页脚：`shrink-0` + 上边框，且出现在滚动区之后
    const scrollAt = source.indexOf('min-h-0 flex-1 space-y-4 overflow-y-auto');
    const footerAt = source.indexOf('flex shrink-0 gap-2 border-t px-4 py-3');
    expect(footerAt).toBeGreaterThan(scrollAt);
    // 保存仍然是唯一的写回路径。
    expect(source).toContain('onSave(slotIndex, { themeColor, clue, linkages, positionConditions });');
  });

  it('OPT-H09: cancel is shared by the × button and the footer', () => {
    // 三处入口共用同一个 `cancel`。
    expect(source).toContain('const cancel = (): void => {');
    expect(source.split('onClick={cancel}').length - 1).toBe(2); // × 按钮 + 页脚取消
    // cancel 内部只重置本地草稿 + 关弹窗 + 通知父级，绝不调用 onSave。
    const cancelBody = source.slice(
      source.indexOf('const cancel = (): void => {'),
      source.indexOf('// MOD-702: clue char count'),
    );
    expect(cancelBody).not.toContain('onSave');
    expect(cancelBody).toContain('onClose();');
  });

  it('OPT-H08: theme colour is one row that opens the dialog', () => {
    expect(source).toContain('aria-label="修改主题色"');
    expect(source).toContain('data-testid="theme-color-chip"');
    expect(source).toContain('onClick={() => setThemeDialogOpen(true)}');
    // The palette / hex input moved into the dialog.
    expect(source).not.toContain('THEME_COLOR_PALETTE');
    expect(source).not.toContain('hexDraft');
    expect(source).toContain('<ThemeColorDialog');
    expect(source).toContain('open={themeDialogOpen}');
    expect(source).toContain('value={themeColor}');
  });

  it('OPT-H07: the linkage rows render the colour dot only', () => {
    const rows = source.slice(
      source.indexOf('linkages.map((linkage, index) => ('),
      source.indexOf('</ul>', source.indexOf('linkages.map(')),
    );
    expect(rows.length).toBeGreaterThan(0);
    // Only the colour dot is left next to the description.
    // v0.5.0 FEAT-K14 (Q16): the palette is a prop of its own now.
    expect(rows).toContain('linkageColorFor(linkageColors, linkage.color)');
  });
});

