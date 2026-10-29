import { describe, expect, it } from 'vitest'
import { GRID_SIZE_MAX, GRID_SIZE_MIN } from '../constants'
import { createAssetSchema } from './asset'
import { createMapSchema, gridSizeSchema } from './map'

describe('gridSizeSchema', () => {
  it('accepts values within the supported range', () => {
    expect(gridSizeSchema.parse(GRID_SIZE_MIN)).toBe(GRID_SIZE_MIN)
    expect(gridSizeSchema.parse(GRID_SIZE_MAX)).toBe(GRID_SIZE_MAX)
  })

  it('rejects out-of-range and non-integer values', () => {
    expect(gridSizeSchema.safeParse(GRID_SIZE_MIN - 1).success).toBe(false)
    expect(gridSizeSchema.safeParse(GRID_SIZE_MAX + 1).success).toBe(false)
    expect(gridSizeSchema.safeParse(10.5).success).toBe(false)
  })
})

describe('createMapSchema', () => {
  it('no longer carries a canvas size', () => {
    const parsed = createMapSchema.parse({ name: '  My Map  ', themeCode: 'fixture' })
    expect(parsed.name).toBe('My Map')
    expect(parsed).not.toHaveProperty('gridSize')
  })

  it('requires a non-empty name', () => {
    expect(createMapSchema.safeParse({ name: '   ', themeCode: 'fixture' }).success).toBe(false)
  })
})

describe('createAssetSchema', () => {
  it('enforces the code pattern and defaults the size', () => {
    const parsed = createAssetSchema.parse({ code: 'asset_1', name: 'Suspect', themeCode: 'fixture' })
    expect(parsed).not.toHaveProperty('triggers')
    expect(parsed.blocking).toBe(false)
    expect(createAssetSchema.safeParse({ code: 'bad code', name: 'x', themeCode: 'fixture' }).success).toBe(false)
    expect(createAssetSchema.safeParse({ code: 'ok', name: 'x', themeCode: 'fixture' }).success).toBe(true)
  })

  it('a background asset never blocks', () => {
    expect(createAssetSchema.parse({ code: 'bg_1', name: 'Wall', type: 'background', blocking: true, themeCode: 'fixture' }).blocking).toBe(false)
    expect(createAssetSchema.parse({ code: 'ob_1', name: 'Lamp', type: 'item', blocking: false, themeCode: 'fixture' }).blocking).toBe(false)
  })
})
