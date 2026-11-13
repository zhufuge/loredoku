// // 角色与外观。
// v0.10.4：从 `constants.ts`（1324 行、287 个导出）按主题拆开。值、注释、次序一律
// 照搬 —— 只是把「谁在用」相近的那些放在一个文件里，改一处不必在一千行里翻。
// 对外仍是同一组名字：`constants/index.ts` 全部再导出，`@loredoku/shared` 不变。

// ---- Character ----
export const CHARACTER_NAME_MAX_LENGTH = 100;
export const CHARACTER_CODE_MAX_LENGTH = 64;
export const CHARACTER_CODE_PATTERN = /^[A-Za-z0-9_]+$/;
export const CHARACTER_DESCRIPTION_MAX_LENGTH = 500;
export const CHARACTER_AVATAR_MAX_DIMENSION = 256;
export const CHARACTER_SLOT_COUNT = 20;

// CLAR-601: gender is restricted to `male` / `female`; default is `male`.
export const CHARACTER_GENDERS = ['male', 'female'] as const;
export const DEFAULT_CHARACTER_GENDER = 'male';
export const CHARACTER_GENDER_LABELS: Record<(typeof CHARACTER_GENDERS)[number], string> = {
  male: '男',
  female: '女',
};
/** Small glyph shown next to a character name; every character always has one. */
export const CHARACTER_GENDER_GLYPHS: Record<(typeof CHARACTER_GENDERS)[number], string> = {
  male: '♂',
  female: '♀',
};
// OPT-601: tinted gender glyphs (male = light blue, female = light pink).
export const GENDER_SYMBOL_COLORS: Record<(typeof CHARACTER_GENDERS)[number], string> = {
  male: '#7DB9E8',
  female: '#F4A9C0',
};

// ---- Appearance ----
// An asset / character renders as an uploaded image or a colour block (`bgColor`),
// which needs no upload and can be activated straight away.
export const APPEARANCE_MODES = ['image', 'color'] as const;
export const DEFAULT_APPEARANCE_MODE = 'image';
export const APPEARANCE_MODE_LABELS: Record<(typeof APPEARANCE_MODES)[number], string> = {
  image: '图片',
  color: '纯色块',
};
/** Accepted colour format: `#RRGGBB` (6 hex digits, case-insensitive). */
export const BG_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
/** Default colour of a freshly created colour block. */
export const DEFAULT_BG_COLOR = '#FFFFFF';
/**
 * v0.7.13 (docs/v0.7.13.md §11): a character's **default participant colour**
 * (`characters.color`). Distinct from `bgColor`: that one is how the character
 * *looks* as a colour block, this one is the 主题色 it hands to a roster slot
 * when it is 加入'd as a participant.
 *
 * `null` = no default, the slot keeps `DEFAULT_THEME_COLOR`. **白 = 未指定**
 * （§11.4）：取色器常驻，没有复选框，白色就是它显示「没指定」的那个颜色，
 * 于是白色不落库 —— 代价是一个角色无法要求「白色槽位」，而它本来也区分不出
 * 「指定白」和「没指定」。
 */
export const CHARACTER_COLOR_PATTERN = BG_COLOR_PATTERN;
