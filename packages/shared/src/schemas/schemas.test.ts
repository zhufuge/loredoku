import { describe, expect, it } from 'vitest'
import { GRID_SIZE_MAX, GRID_SIZE_MIN } from '../constants'
import { createItemSchema } from './item'
import { createMapSchema, gridSizeSchema } from './map'
import { regionColorSchema } from './mapDraft'

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
    const parsed = createMapSchema.parse({ name: '  My Map  ' })
    expect(parsed.name).toBe('My Map')
    expect(parsed).not.toHaveProperty('gridSize')
  })

  it('requires a non-empty name', () => {
    expect(createMapSchema.safeParse({ name: '   ' }).success).toBe(false)
  })
})

describe('createItemSchema', () => {
  it('enforces the code pattern and defaults the size', () => {
    const parsed = createItemSchema.parse({ code: 'item_1', name: 'Suspect' })
    expect(parsed).not.toHaveProperty('triggers')
    expect(parsed.canStand).toBe(true)
    expect(createItemSchema.safeParse({ code: 'bad code', name: 'x' }).success).toBe(false)
    expect(createItemSchema.safeParse({ code: 'ok', name: 'x' }).success).toBe(true)
  })

  it('a background item is always standable', () => {
    expect(createItemSchema.parse({ code: 'bg_1', name: 'Wall', category: 'background', canStand: false }).canStand).toBe(true)
    expect(createItemSchema.parse({ code: 'ob_1', name: 'Lamp', category: 'object', canStand: false }).canStand).toBe(false)
  })
})

describe('regionColorSchema', () => {
  it('accepts #RRGGBB and rejects other formats', () => {
    expect(regionColorSchema.safeParse('#3B82F6').success).toBe(true)
    expect(regionColorSchema.safeParse('#fff').success).toBe(false)
    expect(regionColorSchema.safeParse('blue').success).toBe(false)
  })
})
