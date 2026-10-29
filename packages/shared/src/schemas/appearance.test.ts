import { describe, expect, it } from 'vitest'
import { BG_COLOR_PATTERN, DEFAULT_BG_COLOR } from '../constants'
import { appearanceModeSchema, bgColorSchema, hasAppearance } from './appearance'
import { createCharacterSchema, updateCharacterSchema } from './character'
import { createAssetSchema } from './asset'
import { updateAssetVariantSchema } from './assetVariant'

/**
 * v0.5.1 FEAT-L01 / FEAT-L02 — the colour-block field.
 *
 * `bgColor` is optional and nullable: omitted / `null` means image mode (the
 * pre-v0.5.1 behaviour), a `#RRGGBB` string means colour block. Anything else
 * must be rejected by **both** the asset and the character schema, because the
 * server never validates it a second time.
 */

describe('bgColorSchema', () => {
  it('accepts a full #RRGGBB colour', () => {
    expect(bgColorSchema.parse('#FF8800')).toBe('#FF8800')
    expect(bgColorSchema.parse('#ffffff')).toBe('#ffffff')
  })

  it('accepts null and undefined — both mean image mode', () => {
    expect(bgColorSchema.parse(null)).toBeNull()
    expect(bgColorSchema.parse(undefined)).toBeUndefined()
  })

  it('trims surrounding whitespace', () => {
    expect(bgColorSchema.parse('  #FF8800  ')).toBe('#FF8800')
  })

  it('rejects every malformed colour', () => {
    for (const bad of ['#FFF', 'FF8800', 'red', '#GGGGGG', '#FF88000', '']) {
      expect(bgColorSchema.safeParse(bad).success).toBe(false)
    }
  })

  it('shares one pattern with the constants table', () => {
    expect(BG_COLOR_PATTERN.test(DEFAULT_BG_COLOR)).toBe(true)
  })
})

describe('appearanceModeSchema', () => {
  it('defaults to image so existing callers are unaffected', () => {
    expect(appearanceModeSchema.parse(undefined)).toBe('image')
  })

  it('accepts both modes and nothing else', () => {
    expect(appearanceModeSchema.parse('color')).toBe('color')
    expect(appearanceModeSchema.safeParse('gradient').success).toBe(false)
  })
})

describe('hasAppearance', () => {
  it('is true with an image or a colour, false with neither', () => {
    expect(hasAppearance(true, null)).toBe(true)
    expect(hasAppearance(false, '#FFFFFF')).toBe(true)
    expect(hasAppearance(false, null)).toBe(false)
    expect(hasAppearance(false, undefined)).toBe(false)
  })
})

describe('createAssetSchema — bgColor (FEAT-L01)', () => {
  const base = { code: 'block_1', name: '色块', themeCode: 'fixture' }

  it('defaults to no colour block', () => {
    expect(createAssetSchema.parse(base).bgColor).toBeUndefined()
  })

  it('keeps a supplied colour and rejects a malformed one', () => {
    expect(createAssetSchema.parse({ ...base, bgColor: '#123456' }).bgColor).toBe('#123456')
    expect(createAssetSchema.safeParse({ ...base, bgColor: '#GGG' }).success).toBe(false)
  })
})

describe('create schemas — isActive (FEAT-N06)', () => {
  const item = { code: 'block_1', name: '色块', themeCode: 'fixture' }
  const character = { code: 'block_c', name: '色块人', themeCode: 'fixture' }

  it('omit it and the OPT-305 default (false) stands', () => {
    // The repository turns `undefined` into `false`, so an old caller's
    // behaviour is bit-for-bit unchanged.
    expect(createAssetSchema.parse(item).isActive).toBeUndefined()
    expect(createCharacterSchema.parse(character).isActive).toBeUndefined()
  })

  it('accepts both values so a create can land enabled', () => {
    expect(createAssetSchema.parse({ ...item, isActive: true }).isActive).toBe(true)
    expect(createAssetSchema.parse({ ...item, isActive: false }).isActive).toBe(false)
    expect(createCharacterSchema.parse({ ...character, isActive: true }).isActive).toBe(true)
  })

  it('rejects anything that is not a boolean', () => {
    expect(createAssetSchema.safeParse({ ...item, isActive: 'yes' }).success).toBe(false)
    expect(createCharacterSchema.safeParse({ ...character, isActive: 1 }).success).toBe(false)
  })
})

// v0.6.1: the colour block moved from the asset to its variants, so this is the
// update path that carries it now.
describe('updateAssetVariantSchema — bgColor (FEAT-L01)', () => {
  it('accepts null, which drops back to the image mode', () => {
    expect(updateAssetVariantSchema.parse({ bgColor: null }).bgColor).toBeNull()
  })

  it('rejects a malformed colour', () => {
    expect(updateAssetVariantSchema.safeParse({ bgColor: 'white' }).success).toBe(false)
  })

  it('rejects an empty patch — there would be nothing to write', () => {
    expect(updateAssetVariantSchema.safeParse({}).success).toBe(false)
    expect(updateAssetVariantSchema.safeParse({ name: '横放' }).success).toBe(true)
  })
})

describe('createCharacterSchema / updateCharacterSchema — bgColor (FEAT-L02)', () => {
  const base = { code: 'block_c', name: '色块人', themeCode: 'fixture' }

  it('defaults to no colour block and accepts one when given', () => {
    expect(createCharacterSchema.parse(base).bgColor).toBeUndefined()
    expect(createCharacterSchema.parse({ ...base, bgColor: '#ABCDEF' }).bgColor).toBe('#ABCDEF')
  })

  it('accepts null on update and rejects a malformed colour on both', () => {
    expect(updateCharacterSchema.parse({ bgColor: null }).bgColor).toBeNull()
    expect(createCharacterSchema.safeParse({ ...base, bgColor: '#GGG' }).success).toBe(false)
    expect(updateCharacterSchema.safeParse({ bgColor: '#GGG' }).success).toBe(false)
  })
})
