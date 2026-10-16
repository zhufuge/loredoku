import { describe, expect, it } from 'vitest';

/**
 * v0.5.2 — the item form slimming, the object-only 「可站立」 and create-time
 * uploads (docs/v0.5.2.md §3 / §4 / §5).
 *
 * Same technique as `appearanceForms.test.ts`: these components carry a lot of
 * surrounding state, so the durable contract is asserted on the (comment-free)
 * source.
 */

// Glob patterns must be literals (the same shape `appearanceForms.test.ts` uses).
const sources = import.meta.glob('../{item,character}/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Comments must not satisfy an assertion about the rendered UI. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
}

const itemForm = stripComments(sources['./ItemDetailForm.tsx'] ?? '');
const itemDialog = stripComments(sources['./CreateItemDialog.tsx'] ?? '');
const characterDialog = stripComments(sources['../character/CreateCharacterDialog.tsx'] ?? '');
const itemPanel = stripComments(sources['./ItemListPanel.tsx'] ?? '');
const characterPanel = stripComments(sources['../character/CharacterListPanel.tsx'] ?? '');

describe('物品详情瘦身（FEAT-M03）', () => {
  it('no longer renders 扩展信息 or 触发信息', () => {
    expect(itemForm).not.toContain('扩展信息');
    expect(itemForm).not.toContain('触发信息');
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
  it('the detail form only offers the checkbox for 物体', () => {
    expect(itemForm).toContain("const standable = category === 'object';");
    expect(itemForm).toContain('{standable ? (');
    expect(itemForm).toContain('背景类型恒定可站立');
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
    expect(itemDialog).toContain('await uploadMutation.mutateAsync({ id: item.id, file })');
    // A failed upload must not swallow the created item.
    expect(itemDialog).toContain('.catch(() => undefined)');
    expect(itemDialog).not.toContain('图片在创建后于右侧详情里上传。');
  });

  it('the character dialog does the same for the avatar', () => {
    expect(characterDialog).toContain('<PendingImageField');
    expect(characterDialog).toContain('await createMutation.mutateAsync({');
    expect(characterDialog).toContain('await uploadMutation.mutateAsync({ id: character.id, file })');
    expect(characterDialog).not.toContain('头像在创建后于右侧详情里上传。');
  });

  it('both dialogs keep the button busy across the two steps', () => {
    expect(itemDialog).toContain('const busy = createMutation.isPending || uploadMutation.isPending;');
    expect(characterDialog).toContain(
      'const busy = createMutation.isPending || uploadMutation.isPending;',
    );
    expect(itemDialog).toContain('<Button type="submit" disabled={busy}>');
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
