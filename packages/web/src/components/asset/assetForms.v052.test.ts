import { describe, expect, it } from 'vitest';
import { codeOf } from '@/testing/source';

/**
 * v0.5.2 — the asset form slimming, the item-only 「阻挡」 and create-time
 * uploads (docs/v0.5.2.md §3 / §4 / §5).
 *
 * Same technique as `appearanceForms.test.ts`: these components carry a lot of
 * surrounding state, so the durable contract is asserted on the (comment-free)
 * source.
 */

const assetForm = codeOf('components/asset/AssetDetailForm.tsx');
const assetDialog = codeOf('components/asset/CreateAssetDialog.tsx');
const characterDialog = codeOf('components/character/CreateCharacterDialog.tsx');
const assetPanel = codeOf('components/asset/AssetListPanel.tsx');
const characterPanel = codeOf('components/character/CharacterListPanel.tsx');

describe('资源详情瘦身（FEAT-M03）', () => {
  it('no longer renders the meta / trigger editors', () => {
    expect(assetForm).not.toContain('MetaEditor');
    expect(assetForm).not.toContain('TriggerEditor');
    expect(assetForm).not.toContain('parseJsonObject');
  });

  it('sends neither meta nor triggers on save', () => {
    // The payload is exactly the fields that still exist.
    expect(assetForm).not.toContain('meta,');
    expect(assetForm).not.toContain('triggers');
    expect(assetForm).not.toContain('useReplaceAssetTriggers');
  });
});

describe('背景类型恒定不阻挡（FEAT-M04）', () => {
  it('the detail form gates the checkbox on the item type', () => {
    expect(assetForm).toContain("const blockable = type === 'item';");
    expect(assetForm).toContain('{blockable ? (');
    expect(assetForm).toContain('blocking: blockingFor(type, blocking),');
  });

  it('the create dialog hides the checkbox for 背景 too', () => {
    expect(assetDialog).toContain("const type = watch('type');");
    expect(assetDialog).toContain("{type === 'item' ? (");
    expect(assetDialog).toContain('blocking: blockingFor(values.type, values.blocking),');
  });

  it('the list row only mentions 阻挡 for 物品', () => {
    expect(assetPanel).toContain("asset.type === 'item' && asset.blocking");
    expect(assetPanel).not.toContain('{asset.blocking ?');
  });
});

describe('创建时即可上传图片（FEAT-M05）', () => {
  it('the asset dialog holds a pending file and uploads after create', () => {
    expect(assetDialog).toContain("from '@/components/appearance/PendingImageField'");
    expect(assetDialog).toContain('<PendingImageField');
    expect(assetDialog).toContain('useState<File | null>(null)');
    // Two-step: create → upload with the id the create call returned.
    expect(assetDialog).toContain('await createMutation.mutateAsync({');
    expect(assetDialog).toContain('.mutateAsync({ id: asset.id, file })');
    // A failed upload must not swallow the created asset — the result of the
    // upload is captured so the auto-enable can be undone.
    expect(assetDialog).toContain('.then(() => true)');
    expect(assetDialog).toContain('.catch(() => false)');
  });

  it('the character dialog does the same for the avatar', () => {
    expect(characterDialog).toContain('<PendingImageField');
    expect(characterDialog).toContain('await createMutation.mutateAsync({');
    expect(characterDialog).toContain('.mutateAsync({ id: character.id, file })');
  });

  it('both dialogs keep the button busy across every step', () => {
    // v0.5.3 FEAT-N06 added the (conditional) revert step.
    expect(assetDialog).toContain(
      'const busy = createMutation.isPending || uploadMutation.isPending || updateMutation.isPending;',
    );
    expect(characterDialog).toContain(
      'createMutation.isPending || uploadMutation.isPending || updateMutation.isPending',
    );
    expect(assetDialog).toContain('<Button type="submit" disabled={busy}>');
  });
});

describe('创建带外观即自动启用（FEAT-N06）', () => {
  it('derives isActive from the same predicate the detail forms use', () => {
    expect(assetDialog).toContain('const isActive = hasAppearance(file !== null, bgColor);');
    expect(characterDialog).toContain('const isActive = hasAppearance(file !== null, bgColor);');
    // `hasAppearance` is shared, not re-implemented here.
    expect(characterDialog).toContain('hasAppearance,');
  });

  it('sends isActive with the create call', () => {
    expect(assetDialog).toContain('isActive,');
    expect(characterDialog).toContain('isActive,');
  });

  it('reverts an auto-enable whose image never landed', () => {
    // §5.4: only when there is no colour block to fall back on.
    expect(assetDialog).toContain('if (!uploaded && isActive && !bgColor) {');
    expect(assetDialog).toContain('payload: { isActive: false }');
    expect(characterDialog).toContain('if (!uploaded && isActive && !bgColor) {');
    expect(characterDialog).toContain('payload: { isActive: false }');
  });
});

describe('列表虚拟化（FEAT-M01）', () => {
  it('both list panels window their rows', () => {
    for (const panel of [assetPanel, characterPanel]) {
      expect(panel).toContain("from '@/components/ui/virtual-list'");
      expect(panel).toContain('<VirtualList');
      expect(panel).toContain('rowHeight={LIST_ROW_HEIGHT}');
      expect(panel).toContain('renderRow={(index) =>');
      // The un-windowed `map` over the whole array is gone.
      expect(panel).not.toContain('.map((asset) =>');
      expect(panel).not.toContain('.map((character) =>');
    }
  });

  it('no longer renders a plain <ul> of every row', () => {
    expect(assetPanel).not.toContain('<ul');
    expect(characterPanel).not.toContain('<ul');
  });
});
