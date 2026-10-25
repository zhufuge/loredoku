import { describe, expect, it } from 'vitest'
import { MAP_JSON_VERSION } from '../constants'
import { draftAnchorItemSchema, draftAssetRefSchema } from './mapDraft'

/**
 * v0.7.6：`asset_forms` 改名 `asset_variants`，画布锚点的键也跟着从 `formId`
 * 变成 `variantId`（docs/v0.7.6.md §10）。
 *
 * 库里的草稿由迁移 `20260101000035` 改写；这里盯的是**读取路径**：v0.7.6 之前
 * 导出的 JSON 文件仍然带着旧键，必须被认出来并归一化，而不是悄悄丢掉——那样
 * 多形态资源会退化成第一个长相。
 */
describe('锚点旧键 formId → variantId', () => {
  it('旧键被认出来并改写', () => {
    const parsed = draftAnchorItemSchema.parse({
      assetId: 7,
      formId: 12,
      w: 2,
      h: 2,
    })
    expect(parsed.variantId).toBe(12)
    expect(parsed).not.toHaveProperty('formId')
    // 占格不动：它描述的是那一次放置。
    expect(parsed.w).toBe(2)
    expect(parsed.h).toBe(2)
  })

  it('背景格的旧键同样认', () => {
    const parsed = draftAssetRefSchema.parse({ assetId: 3, formId: 9 })
    expect(parsed.variantId).toBe(9)
  })

  it('两个键都在时以新键为准', () => {
    const parsed = draftAnchorItemSchema.parse({ assetId: 7, formId: 12, variantId: 13, w: 1, h: 1 })
    expect(parsed.variantId).toBe(13)
    expect(parsed).not.toHaveProperty('formId')
  })

  it('都没有也合法——老草稿靠「第一个形态」兜底', () => {
    expect(draftAnchorItemSchema.parse({ assetId: 7, w: 1, h: 1 }).variantId).toBeUndefined()
  })

  it('整张草稿按 v8 写出来', () => {
    expect(MAP_JSON_VERSION).toBe(8)
  })
})
