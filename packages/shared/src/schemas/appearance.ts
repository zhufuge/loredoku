import { z } from 'zod';
import { APPEARANCE_MODES, BG_COLOR_PATTERN, DEFAULT_APPEARANCE_MODE } from '../constants';

/** FEAT-L01 / FEAT-L02: items and characters carry an uploaded image **or** render as a colour block. `bgColor` is that colour — `null` / omitted means image mode; a `#RRGGBB` string activates the entry with no upload at all. */
/** 可选 `#RRGGBB`：缺省与 `null` 都表示「没有」。`bgColor`（`null` = 图片模式）与 `characters.color` 共用这一份定义 —— 「没有颜色」两处必须同义，否则编辑器的「清除」会失效。 */
export const optionalColorSchema = z
  .string()
  .trim()
  .regex(BG_COLOR_PATTERN, '颜色需为 #RRGGBB 格式')
  .nullable()
  .optional();

export const bgColorSchema = optionalColorSchema;

export const appearanceModeSchema = z.enum(APPEARANCE_MODES).default(DEFAULT_APPEARANCE_MODE);

export type AppearanceMode = z.infer<typeof appearanceModeSchema>;

/** True when the entry can be activated — it has an image or is a colour block. Used by the web UI and the server. */
export function hasAppearance(imagePresent: boolean, bgColor: string | null | undefined): boolean {
  return imagePresent || (bgColor !== null && bgColor !== undefined && bgColor !== '');
}
