import { describe, expect, it } from 'vitest';

/**
 * v0.5.1 FEAT-L01 / FEAT-L02 — the two detail forms and the two create dialogs.
 *
 * These are big pages with a lot of surrounding state, so (like
 * `EditorPage.publish.test.ts`) the durable contract is asserted on the source:
 * 「外观」区是二选一，启用按钮的可点条件是「有图 **或** 有颜色」。
 */

const sources = import.meta.glob('../{item,character}/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Comments must not satisfy an assertion about the rendered UI (wording.test.ts). */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
}

const itemForm = stripComments(sources['../item/ItemDetailForm.tsx'] ?? '');
const characterForm = stripComments(sources['../character/CharacterDetailForm.tsx'] ?? '');
const itemDialog = stripComments(sources['../item/CreateItemDialog.tsx'] ?? '');
const characterDialog = stripComments(sources['../character/CreateCharacterDialog.tsx'] ?? '');

describe('物品外观（v0.5.1 FEAT-L01）', () => {
  it('the detail form drives the shared 外观 control', () => {
    expect(itemForm).toContain("from '@/components/appearance/AppearanceField'");
    expect(itemForm).toContain('<AppearanceField');
    expect(itemForm).toContain('mode={appearanceMode}');
    expect(itemForm).toContain('onBgColorChange={setBgColor}');
    // The uploader is the image branch's child, never a sibling of the picker.
    expect(itemForm).toContain('<ImageUploader');
  });

  it('seeds the mode from the stored colour', () => {
    expect(itemForm).toContain("useState<AppearanceMode>(\n    item.bgColor ? 'color' : 'image',");
  });

  it('lets 启用 through when there is a colour but no image', () => {
    // v0.5.1 §1.2: the guard is 「已上传图片或有背景色」, not 「已上传图片」.
    expect(itemForm).toContain('const activatable = hasAppearance(Boolean(item.imageUrl), item.bgColor);');
    expect(itemForm).toContain('disabled={activeMutation.isPending || !activatable}');
    expect(itemForm).toContain("title={activatable ? undefined : '请先上传图片或选择纯色块颜色后再启用'}");
    // The v0.3.5 OPT-305 wording is gone.
    expect(itemForm).not.toContain("'请先上传图片后再启用'");
    expect(itemForm).not.toContain('!item.imageUrl');
  });

  it('the 未启用 / 已停用 badge follows the same rule', () => {
    expect(itemForm).toContain("{activatable ? '已停用' : '未启用'}");
    expect(itemForm).not.toContain("{item.imageUrl ? '已停用' : '未启用'}");
  });

  it('saves null in image mode so the colour block is dropped', () => {
    expect(itemForm).toContain("bgColor: appearanceMode === 'color' ? bgColor : null,");
  });

  it('tells the user a colour block survives an image delete', () => {
    expect(itemForm).toContain('该物品是纯色块，删除图片后仍可继续启用。');
  });

  it('the create dialog offers the same two modes', () => {
    expect(itemDialog).toContain('<AppearanceField');
    expect(itemDialog).toContain('appearanceMode: z.enum(APPEARANCE_MODES),');
    expect(itemDialog).toContain('bgColor: z.string().regex(BG_COLOR_PATTERN');
    expect(itemDialog).toContain('bgColor: DEFAULT_BG_COLOR,');
    expect(itemDialog).toContain("bgColor: values.appearanceMode === 'color' ? values.bgColor : null,");
  });
});

describe('角色外观（v0.5.1 FEAT-L02）', () => {
  it('the detail form drives the shared 外观 control', () => {
    expect(characterForm).toContain("from '@/components/appearance/AppearanceField'");
    expect(characterForm).toContain('<AppearanceField');
    expect(characterForm).toContain('<ImageUploader');
  });

  it('seeds the mode from the stored colour', () => {
    expect(characterForm).toContain(
      "useState<AppearanceMode>(\n    character.bgColor ? 'color' : 'image',",
    );
  });

  it('lets 启用 through when there is a colour but no avatar', () => {
    expect(characterForm).toContain(
      'const activatable = hasAppearance(Boolean(character.avatarUrl), character.bgColor);',
    );
    expect(characterForm).toContain('disabled={activeMutation.isPending || !activatable}');
    expect(characterForm).toContain(
      "title={activatable ? undefined : '请先上传头像或选择纯色块颜色后再启用'}",
    );
    expect(characterForm).not.toContain("'请先上传头像后再启用'");
    expect(characterForm).not.toContain('!character.avatarUrl');
  });

  it('saves null in image mode and warns about the colour-block case', () => {
    expect(characterForm).toContain("bgColor: appearanceMode === 'color' ? bgColor : null,");
    expect(characterForm).toContain('该角色是纯色块，删除头像后仍可继续启用。');
  });

  it('the create dialog offers the same two modes', () => {
    expect(characterDialog).toContain('<AppearanceField');
    expect(characterDialog).toContain('appearanceMode: z.enum(APPEARANCE_MODES),');
    expect(characterDialog).toContain('bgColor: DEFAULT_BG_COLOR,');
    expect(characterDialog).toContain(
      "bgColor: values.appearanceMode === 'color' ? values.bgColor : null,",
    );
  });
});
