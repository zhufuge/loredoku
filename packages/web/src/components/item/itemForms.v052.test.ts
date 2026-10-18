import { describe, expect, it } from 'vitest';
import { codeOf } from '@/testing/source';

/**
 * v0.5.2 — the item form slimming, the object-only 「可站立」 and create-time
 * uploads (docs/v0.5.2.md §3 / §4 / §5).
 *
 * Same technique as `appearanceForms.test.ts`: these components carry a lot of
 * surrounding state, so the durable contract is asserted on the (comment-free)
 * source.
 */

const itemForm = codeOf('components/item/ItemDetailForm.tsx');
const itemDialog = codeOf('components/item/CreateItemDialog.tsx');
const characterDialog = codeOf('components/character/CreateCharacterDialog.tsx');
const itemPanel = codeOf('components/item/ItemListPanel.tsx');
const characterPanel = codeOf('components/character/CharacterListPanel.tsx');

describe('物品详情瘦身（FEAT-M03）', () => {
  it('no longer renders the meta / trigger editors', () => {
    expect(itemForm).not.toContain('MetaEditor');
    expect(itemForm).not.toContain('TriggerEditor');
    expect(itemForm).not.toContain('parseJsonObject');
  });

  it('sends neither meta nor triggers on save', () => {
    // The payload is exactly the fields that still exist.
    expect(itemForm).not.toContain('meta,');
    expect(itemForm).not.toContain('triggers');
    expect(itemForm).not.toContain('useReplaceItemTriggers');
  });
});

describe('背景类型恒定可站立（FEAT-M04）', () => {
  it('the detail form gates the checkbox on the object category', () => {
    expect(itemForm).toContain("const standable = category === 'object';");
    expect(itemForm).toContain('{standable ? (');
    expect(itemForm).toContain('canStand: canStandFor(category, canStand),');
  });

  it('the create dialog hides the checkbox for 背景 too', () => {
    expect(itemDialog).toContain("const category = watch('category');");
    expect(itemDialog).toContain("{category === 'object' ? (");
    expect(itemDialog).toContain('canStand: canStandFor(values.category, values.canStand),');
  });

  it('the list row only mentions 可站立 for 物体', () => {
    expect(itemPanel).toContain("item.category === 'object' && item.canStand");
    expect(itemPanel).not.toContain('{item.canStand ?');
  });
});

describe('创建时即可上传图片（FEAT-M05）', () => {
  it('the item dialog holds a pending file and uploads after create', () => {
    expect(itemDialog).toContain("from '@/components/appearance/PendingImageField'");
    expect(itemDialog).toContain('<PendingImageField');
    expect(itemDialog).toContain('useState<File | null>(null)');
    // Two-step: create → upload with the id the create call returned.
    expect(itemDialog).toContain('await createMutation.mutateAsync({');
    expect(itemDialog).toContain('.mutateAsync({ id: item.id, file })');
    // A failed upload must not swallow the created item — the result of the
    // upload is captured so the auto-enable can be undone.
    expect(itemDialog).toContain('.then(() => true)');
    expect(itemDialog).toContain('.catch(() => false)');
  });

  it('the character dialog does the same for the avatar', () => {
    expect(characterDialog).toContain('<PendingImageField');
    expect(characterDialog).toContain('await createMutation.mutateAsync({');
    expect(characterDialog).toContain('.mutateAsync({ id: character.id, file })');
  });

  it('both dialogs keep the button busy across every step', () => {
    // v0.5.3 FEAT-N06 added the (conditional) revert step.
    expect(itemDialog).toContain(
      'const busy = createMutation.isPending || uploadMutation.isPending || updateMutation.isPending;',
    );
    expect(characterDialog).toContain(
      'createMutation.isPending || uploadMutation.isPending || updateMutation.isPending',
    );
    expect(itemDialog).toContain('<Button type="submit" disabled={busy}>');
  });
});

describe('创建带外观即自动启用（FEAT-N06）', () => {
  it('derives isActive from the same predicate the detail forms use', () => {
    expect(itemDialog).toContain('const isActive = hasAppearance(file !== null, bgColor);');
    expect(characterDialog).toContain('const isActive = hasAppearance(file !== null, bgColor);');
    // `hasAppearance` is shared, not re-implemented here.
    expect(characterDialog).toContain('hasAppearance,');
  });

  it('sends isActive with the create call', () => {
    expect(itemDialog).toContain('isActive,');
    expect(characterDialog).toContain('isActive,');
  });

  it('reverts an auto-enable whose image never landed', () => {
    // §5.4: only when there is no colour block to fall back on.
    expect(itemDialog).toContain('if (!uploaded && isActive && !bgColor) {');
    expect(itemDialog).toContain('payload: { isActive: false }');
    expect(characterDialog).toContain('if (!uploaded && isActive && !bgColor) {');
    expect(characterDialog).toContain('payload: { isActive: false }');
  });
});

describe('列表虚拟化（FEAT-M01）', () => {
  it('both list panels window their rows', () => {
    for (const panel of [itemPanel, characterPanel]) {
      expect(panel).toContain("from '@/components/ui/virtual-list'");
      expect(panel).toContain('<VirtualList');
      expect(panel).toContain('rowHeight={LIST_ROW_HEIGHT}');
      expect(panel).toContain('renderRow={(index) =>');
      // The un-windowed `map` over the whole array is gone.
      expect(panel).not.toContain('.map((item) =>');
      expect(panel).not.toContain('.map((character) =>');
    }
  });

  it('no longer renders a plain <ul> of every row', () => {
    expect(itemPanel).not.toContain('<ul');
    expect(characterPanel).not.toContain('<ul');
  });
});
