import { z } from 'zod'
import { bgColorSchema } from './appearance'
import { assetFitModeSchema } from './asset'
import {
  ASSET_VARIANT_FOOTPRINT_MAX,
  ASSET_VARIANT_FOOTPRINT_MIN,
  ASSET_VARIANT_NAME_MAX_LENGTH,
  DEFAULT_ASSET_VARIANT_NAME,
} from '../constants'

/** v0.6.1 (docs/v0.6.1.md §5.3): variant CRUD payloads; the asset-level rules (≥1 variant, unique name) live in the service, which needs sibling rows. Footprint must stay `.optional()` — `.default()` would let an empty PATCH pass the "at least one field" refine; defaults live in the repo. */
const footprintSchema = z
  .number()
  .int()
  .min(ASSET_VARIANT_FOOTPRINT_MIN, `占格尺寸不能小于 ${ASSET_VARIANT_FOOTPRINT_MIN}`)
  .max(ASSET_VARIANT_FOOTPRINT_MAX, `占格尺寸不能超过 ${ASSET_VARIANT_FOOTPRINT_MAX}`)

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
    /** FEAT-L01: pass `null` to drop back to the image mode. */
    bgColor: bgColorSchema,
    /** 占格足迹（缺省 1×1），仅物品形态有意义。 */
    w: footprintSchema.optional(),
    h: footprintSchema.optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.fitMode !== undefined ||
      value.bgColor !== undefined ||
      value.w !== undefined ||
      value.h !== undefined,
    { message: '至少要修改一个字段' },
  )

export const assetVariantParamSchema = z.object({
  assetId: z.coerce.number().int().positive(),
  variantId: z.coerce.number().int().positive(),
})

export type CreateAssetVariantInput = z.infer<typeof createAssetVariantSchema>
export type UpdateAssetVariantInput = z.infer<typeof updateAssetVariantSchema>

export { DEFAULT_ASSET_VARIANT_NAME }
