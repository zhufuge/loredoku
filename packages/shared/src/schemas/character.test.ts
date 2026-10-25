import { describe, expect, it } from 'vitest'
import { createCharacterSchema, updateCharacterSchema } from './character'

/**
 * v0.7.6：`characters.avatar_mime` / `characters.meta` 两列删除
 * （docs/v0.7.6.md）。schema 这边只做一件事——**不再声明 `meta`**，
 * 于是老前端多塞的键被 zod 默认剥掉，而不是把请求打成 400。
 */
describe('createCharacterSchema / updateCharacterSchema — v0.7.6 删掉 meta', () => {
  const base = { code: 'legacy_c', name: '旧客户端' }

  it('创建时多塞的 meta 被剥掉，其余字段照常落库', () => {
    const parsed = createCharacterSchema.parse({ ...base, meta: { a: 1 } })
    expect(parsed).not.toHaveProperty('meta')
    expect(parsed.name).toBe('旧客户端')
  })

  it('更新时多塞的 meta 被剥掉，不当作「有东西要更新」', () => {
    const parsed = updateCharacterSchema.parse({ name: '改名', meta: { a: 1 } })
    expect(parsed).not.toHaveProperty('meta')
    expect(parsed.name).toBe('改名')
  })

  it('只发 meta 的更新仍然被拒——剥完就是空补丁', () => {
    expect(updateCharacterSchema.safeParse({ meta: { a: 1 } }).success).toBe(false)
  })
})
