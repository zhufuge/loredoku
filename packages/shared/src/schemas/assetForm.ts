import { z } from 'zod';
import { bgColorSchema } from './appearance';
import { assetFitModeSchema, assetSizeSchema } from './asset';
import {
  ASSET_FORM_NAME_MAX_LENGTH,
  ASSET_SIZE_DEFAULT,
  DEFAULT_ASSET_FORM_NAME,
} from '../constants';

/**
 * v0.6.1: form CRUD payloads (docs/v0.6.1.md §5.3). The asset-level rules —
 * 「an asset keeps at least one form」「the form name is unique within its
 * asset」 — live in the service, because they need the sibling rows, not just
 * the payload.
 */
export const assetFormNameSchema = z
  .string()
  .trim()
  .min(1, '形态名称不能为空')
  .max(ASSET_FORM_NAME_MAX_LENGTH, `形态名称长度不能超过 ${ASSET_FORM_NAME_MAX_LENGTH}`);

export const createAssetFormSchema = z.object({
  name: assetFormNameSchema,
  widthCells: assetSizeSchema.default(ASSET_SIZE_DEFAULT),
  heightCells: assetSizeSchema.default(ASSET_SIZE_DEFAULT),
});

export const updateAssetFormSchema = z
  .object({
    name: assetFormNameSchema.optional(),
    widthCells: assetSizeSchema.optional(),
    heightCells: assetSizeSchema.optional(),
    fitMode: assetFitModeSchema.optional(),
    /** v0.5.1 FEAT-L01: pass `null` to drop back to the image mode. */
    bgColor: bgColorSchema,
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.widthCells !== undefined ||
      value.heightCells !== undefined ||
      value.fitMode !== undefined ||
      value.bgColor !== undefined,
    { message: '至少要修改一个字段' },
  );

export const assetFormParamSchema = z.object({
  assetId: z.coerce.number().int().positive(),
  formId: z.coerce.number().int().positive(),
});

export type CreateAssetFormInput = z.infer<typeof createAssetFormSchema>;
export type UpdateAssetFormInput = z.infer<typeof updateAssetFormSchema>;

export { DEFAULT_ASSET_FORM_NAME };
