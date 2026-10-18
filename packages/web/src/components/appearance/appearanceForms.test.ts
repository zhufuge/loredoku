import { describe, expect, it } from 'vitest';
import { codeOf } from '@/testing/source';

/**
 * v0.5.1 FEAT-L01 / FEAT-L02 — the two detail forms and the two create dialogs.
 *
 * These are big pages with a lot of surrounding state, so (like
 * `EditorPage.publish.test.ts`) the durable contract is asserted on the source:
 * 「外观」区是二选一，启用按钮的可点条件是「有图 **或** 有颜色」。
 *
 * 物品 and 角色 are the same contract twice, so they share one table — only the
 * entity name, the media field and the wording differ.
 */

const subjects = [
  {
    kind: '物品',
    ref: 'item',
    media: '图片',
    url: 'imageUrl',
    form: codeOf('components/item/ItemDetailForm.tsx'),
    dialog: codeOf('components/item/CreateItemDialog.tsx'),
    badge: '该物品是纯色块，删除图片后仍可继续启用。',
  },
  {
    kind: '角色',
    ref: 'character',
    media: '头像',
    url: 'avatarUrl',
    form: codeOf('components/character/CharacterDetailForm.tsx'),
    dialog: codeOf('components/character/CreateCharacterDialog.tsx'),
    badge: '该角色是纯色块，删除头像后仍可继续启用。',
  },
] as const;

describe.each(subjects)('$kind 外观（v0.5.1 FEAT-L01 / FEAT-L02）', (s) => {
  it('the detail form drives the shared 外观 control', () => {
    expect(s.form).toContain("from '@/components/appearance/AppearanceField'");
    expect(s.form).toContain('<AppearanceField');
    expect(s.form).toContain('mode={appearanceMode}');
    expect(s.form).toContain('onBgColorChange={setBgColor}');
    // The uploader is the image branch's child, never a sibling of the picker.
    expect(s.form).toContain('<ImageUploader');
  });

  it('seeds the mode from the stored colour', () => {
    expect(s.form).toContain(
      `useState<AppearanceMode>(\n    ${s.ref}.bgColor ? 'color' : 'image',`,
    );
  });

  it('lets 启用 through when there is a colour but no media', () => {
    // the guard is 「已上传图片或有背景色」, not 「已上传图片」.
    expect(s.form).toContain(
      `const activatable = hasAppearance(Boolean(${s.ref}.${s.url}), ${s.ref}.bgColor);`,
    );
    expect(s.form).toContain('disabled={activeMutation.isPending || !activatable}');
    expect(s.form).toContain(
      `title={activatable ? undefined : '请先上传${s.media}或选择纯色块颜色后再启用'}`,
    );
    // The v0.3.5 OPT-305 wording is gone.
    expect(s.form).not.toContain(`'请先上传${s.media}后再启用'`);
    expect(s.form).not.toContain(`!${s.ref}.${s.url}`);
  });

  it('the 未启用 / 已停用 badge follows the same rule', () => {
    expect(s.form).toContain("{activatable ? '已停用' : '未启用'}");
    expect(s.form).not.toContain(`{${s.ref}.${s.url} ? '已停用' : '未启用'}`);
  });

  it('saves null in image mode so the colour block is dropped', () => {
    expect(s.form).toContain("bgColor: appearanceMode === 'color' ? bgColor : null,");
  });

  it('tells the user a colour block survives a media delete', () => {
    expect(s.form).toContain(s.badge);
  });

  it('the create dialog offers the same two modes', () => {
    expect(s.dialog).toContain('<AppearanceField');
    expect(s.dialog).toContain('appearanceMode: z.enum(APPEARANCE_MODES),');
    expect(s.dialog).toContain('bgColor: z.string().regex(BG_COLOR_PATTERN');
    expect(s.dialog).toContain('bgColor: DEFAULT_BG_COLOR,');
    // v0.5.3 FEAT-N06: the colour is hoisted into a local so both the payload
    // and the auto-enable rule read the same value.
    expect(s.dialog).toContain(
      "const bgColor = values.appearanceMode === 'color' ? values.bgColor : null;",
    );
  });
});
