import { z } from 'zod';
import { APPEARANCE_MODES, BG_COLOR_PATTERN, DEFAULT_APPEARANCE_MODE } from '../constants';

/**
 * v0.5.1 FEAT-L01 / FEAT-L02: items and characters carry an uploaded image **or**
 * render as a colour block. `bgColor` is that colour — `null` / omitted means
 * image mode; a `#RRGGBB` string activates the entry with no upload at all.
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
 * True when the entry can be activated — it has an image or is a colour block.
 * Used by the web UI and the server.
 */
export function hasAppearance(imagePresent: boolean, bgColor: string | null | undefined): boolean {
  return imagePresent || (bgColor !== null && bgColor !== undefined && bgColor !== '');
}
