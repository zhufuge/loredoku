import { z } from 'zod';
import { APPEARANCE_MODES, BG_COLOR_PATTERN, DEFAULT_APPEARANCE_MODE } from '../constants';

/**
 * v0.5.1 FEAT-L01 / FEAT-L02: items and characters may either carry an
 * uploaded image or be rendered as a **colour block**.
 *
 * `bgColor` is the colour-block colour:
 * - `null` / omitted → image mode (the pre-v0.5.1 behaviour);
 * - a `#RRGGBB` string → colour-block mode, and the entry can be activated
 *   without any upload at all.
 */
export const bgColorSchema = z
  .string()
  .trim()
  .regex(BG_COLOR_PATTERN, '颜色需为 #RRGGBB 格式')
  .nullable()
  .optional();

export const appearanceModeSchema = z.enum(APPEARANCE_MODES).default(DEFAULT_APPEARANCE_MODE);

export type AppearanceMode = z.infer<typeof appearanceModeSchema>;

/**
 * True when the entry can be activated: it either has an image or is a colour
 * block. Used by the web UI to enable 启用 and by the server to guard it.
 */
export function hasAppearance(imagePresent: boolean, bgColor: string | null | undefined): boolean {
  return imagePresent || (bgColor !== null && bgColor !== undefined && bgColor !== '');
}
