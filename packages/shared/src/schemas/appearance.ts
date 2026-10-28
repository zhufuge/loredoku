import { z } from 'zod';
import { APPEARANCE_MODES, BG_COLOR_PATTERN, DEFAULT_APPEARANCE_MODE } from '../constants';

/**
 * v0.5.1 FEAT-L01 / FEAT-L02: items and characters carry an uploaded image **or**
 * render as a colour block. `bgColor` is that colour — `null` / omitted means
 * image mode; a `#RRGGBB` string activates the entry with no upload at all.
 */
/**
 * An optional `#RRGGBB` colour — absent and `null` both mean "none".
 *
 * v0.5.1 introduced it for `bgColor` (`null` = image mode); v0.7.13 reuses the
 * very same shape for `characters.color`, where `null` means "this character
 * brings no participant default". One definition, because "no colour" has to
 * behave identically in both places or the editor's 清除 button stops working.
 */
export const optionalColorSchema = z
  .string()
  .trim()
  .regex(BG_COLOR_PATTERN, '颜色需为 #RRGGBB 格式')
  .nullable()
  .optional();

export const bgColorSchema = optionalColorSchema;

export const appearanceModeSchema = z.enum(APPEARANCE_MODES).default(DEFAULT_APPEARANCE_MODE);

export type AppearanceMode = z.infer<typeof appearanceModeSchema>;

/**
 * True when the entry can be activated — it has an image or is a colour block.
 * Used by the web UI and the server.
 */
export function hasAppearance(imagePresent: boolean, bgColor: string | null | undefined): boolean {
  return imagePresent || (bgColor !== null && bgColor !== undefined && bgColor !== '');
}
