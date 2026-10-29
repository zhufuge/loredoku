import { describe, expect, it } from 'vitest'
import { createCharacterSchema, updateCharacterSchema } from './character'
import { CHARACTER_DISPLAY_NAME_MAX, DEFAULT_THEME_COLOR } from '../constants'
import { characterSlotEntrySchema } from './mapDraft'

/**
 * v0.7.6：`characters.avatar_mime` / `characters.meta` 两列删除
 * （docs/v0.7.6.md）。schema 这边只做一件事——**不再声明 `meta`**，
 * 于是老前端多塞的键被 zod 默认剥掉，而不是把请求打成 400。
 */
describe('createCharacterSchema / updateCharacterSchema — v0.7.6 删掉 meta', () => {
  const base = { code: 'legacy_c', name: '旧客户端', themeCode: 'fixture' }

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

/**
 * v0.7.13（docs/v0.7.13.md §11）—— 角色的参与者默认值 `color` / `displayName`。
 *
 * 关键字是**「空 = 没有默认」的三种写法都要落到同一个值**：缺席、`null`、
 * 空串。少一种就会漏一条路径 —— 前端「清除」按钮发的是 `null`，输入框清空后
 * 发的是 `''`，老客户端压根不发这个键。
 */
describe('角色参与者默认值（v0.7.13 §11）', () => {
  const base = { code: 'pc_1', name: '侦探', themeCode: 'fixture' }

  it('两个字段都可以缺席', () => {
    expect(createCharacterSchema.parse(base)).not.toHaveProperty('color')
    expect(createCharacterSchema.parse(base)).not.toHaveProperty('displayName')
  })

  it('接受 #RRGGBB，并归一成大写', () => {
    expect(createCharacterSchema.parse({ ...base, color: '#AABBCC' }).color).toBe('#AABBCC')
    expect(createCharacterSchema.parse({ ...base, color: '#aabbcc' }).color).toBe('#AABBCC')
  })

  /**
   * §11.4：白色是「未指定」的显示值，不落库。大小写都要塌 —— 取色器在某些
   * 浏览器里给小写，手写 JSON 更是随便写。
   */
  it('白色 = 没有默认，不进库', () => {
    expect(createCharacterSchema.parse({ ...base, color: DEFAULT_THEME_COLOR }).color).toBeNull()
    expect(createCharacterSchema.parse({ ...base, color: '#ffffff' }).color).toBeNull()
    // update 里同样是**有效补丁**：把已有的默认值改回白，得真的清掉。
    const parsed = updateCharacterSchema.parse({ color: '#ffffff' })
    expect(parsed.color).toBeNull()
    expect(parsed).toHaveProperty('color')
  })

  it('拒掉非 hex 的颜色，而不是静默丢掉', () => {
    expect(updateCharacterSchema.safeParse({ color: 'red' }).success).toBe(false)
    expect(updateCharacterSchema.safeParse({ color: '#FFF' }).success).toBe(false)
  })

  it('`null` 是「没有默认」：原样留着，update 认它是个有效补丁', () => {
    expect(createCharacterSchema.parse({ ...base, color: null }).color).toBeNull()
    const parsed = updateCharacterSchema.parse({ color: null })
    expect(parsed.color).toBeNull()
    expect(parsed).toHaveProperty('color')
  })

  it('编号默认值的空串塌成 null，与「清空输入框」等价', () => {
    expect(createCharacterSchema.parse({ ...base, displayName: '  ' }).displayName).toBeNull()
    expect(updateCharacterSchema.parse({ displayName: '' }).displayName).toBeNull()
  })

  it('编号默认值两端空格被去掉', () => {
    expect(createCharacterSchema.parse({ ...base, displayName: ' 甲 ' }).displayName).toBe('甲')
  })

  it('编号默认值有长度上限', () => {
    expect(createCharacterSchema.parse({ ...base, displayName: '一'.repeat(6) }).displayName).toBe(
      '一一一一一一',
    )
    expect(updateCharacterSchema.safeParse({ displayName: '一'.repeat(7) }).success).toBe(false)
  })

  /**
   * 这条是两端上限的**实际**耦合：角色默认值要原样抄进槽位，若角色的上限比
   * 槽位宽，一个合法的角色默认值会在保存谜题时被 400 拒掉。比断言「常量等于
   * 6」有用 —— 那只是把数字抄一遍。
   */
  it('最长的合法默认值能原样搬进槽位', () => {
    const longest = '一'.repeat(CHARACTER_DISPLAY_NAME_MAX)
    const character = createCharacterSchema.parse({ ...base, displayName: longest })
    const slot = characterSlotEntrySchema.parse({ characterId: 1, displayNumber: character.displayName })
    expect(slot.displayNumber).toBe(longest)
  })
})
