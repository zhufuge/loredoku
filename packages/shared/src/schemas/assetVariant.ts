import { z } from 'zod'
import { bgColorSchema } from './appearance'
import { assetFitModeSchema } from './asset'
import { ASSET_VARIANT_NAME_MAX_LENGTH, DEFAULT_ASSET_VARIANT_NAME } from '../constants'

/**
 * v0.6.1: variant CRUD payloads (docs/v0.6.1.md §5.3). The asset-level rules —
 * 「an asset keeps at least one variant」「the variant name is unique within its
 * asset」 — live in the service, because they need the sibling rows, not just
 * the payload.
 *
 * v0.7.6: `widthCells` / `heightCells` are gone (docs/v0.7.6.md §9). A variant
 * no longer declares a footprint — a newly placed item is always 1×1 and grows
 * on screen through `scale`.
 */
export const assetVariantNameSchema = z
  .string()
  .trim()
  .min(1, '形态名称不能为空')
  .max(ASSET_VARIANT_NAME_MAX_LENGTH, `形态名称长度不能超过 ${ASSET_VARIANT_NAME_MAX_LENGTH}`)

export const createAssetVariantSchema = z.object({
  name: assetVariantNameSchema,
})

export const updateAssetVariantSchema = z
  .object({
    name: assetVariantNameSchema.optional(),
    fitMode: assetFitModeSchema.optional(),
    /** v0.5.1 FEAT-L01: pass `null` to drop back to the image mode. */
    bgColor: bgColorSchema,
  })
  .refine(
    (value) =>
      value.name !== undefined || value.fitMode !== undefined || value.bgColor !== undefined,
    { message: '至少要修改一个字段' },
  )

export const assetVariantParamSchema = z.object({
  assetId: z.coerce.number().int().positive(),
  variantId: z.coerce.number().int().positive(),
})

export type CreateAssetVariantInput = z.infer<typeof createAssetVariantSchema>
export type UpdateAssetVariantInput = z.infer<typeof updateAssetVariantSchema>

export { DEFAULT_ASSET_VARIANT_NAME }
