import { describe, expect, it } from 'vitest'
import { CARD_ROTATIONS, GRID_SIZE_MAX, GRID_SIZE_MIN } from '../constants'
import { createCardSchema } from './card'
import {
  mapCellSchema,
  regionColorSchema,
  regionInputSchema,
  saveMapSchema,
} from './map'
import { createProjectSchema, gridSizeSchema } from './project'

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

describe('createProjectSchema', () => {
  it('applies the default grid size', () => {
    const parsed = createProjectSchema.parse({ name: '  My Map  ' })
    expect(parsed.name).toBe('My Map')
    expect(parsed.gridSize).toBe(20)
  })

  it('requires a non-empty name', () => {
    expect(createProjectSchema.safeParse({ name: '   ' }).success).toBe(false)
  })
})

describe('createCardSchema', () => {
  it('enforces the code pattern and defaults triggers', () => {
    const parsed = createCardSchema.parse({ code: 'card_1', name: 'Suspect' })
    expect(parsed.triggers).toEqual([])
    expect(createCardSchema.safeParse({ code: 'bad code', name: 'x' }).success).toBe(false)
    expect(createCardSchema.safeParse({ code: 'ok', name: 'x' }).success).toBe(true)
  })
})

describe('regionColorSchema', () => {
  it('accepts #RRGGBB and rejects other formats', () => {
    expect(regionColorSchema.safeParse('#3B82F6').success).toBe(true)
    expect(regionColorSchema.safeParse('#fff').success).toBe(false)
    expect(regionColorSchema.safeParse('blue').success).toBe(false)
  })
})

describe('mapCellSchema', () => {
  it('defaults rotation and zIndex', () => {
    const parsed = mapCellSchema.parse({ x: 1, y: 2, cardId: 5 })
    expect(parsed.rotation).toBe(0)
    expect(parsed.zIndex).toBe(0)
  })

  it('only allows valid rotations', () => {
    for (const rotation of CARD_ROTATIONS) {
      expect(mapCellSchema.safeParse({ x: 0, y: 0, cardId: 1, rotation }).success).toBe(true)
    }
    expect(mapCellSchema.safeParse({ x: 0, y: 0, cardId: 1, rotation: 45 }).success).toBe(false)
  })
})

describe('regionInputSchema', () => {
  it('requires at least one cell and applies defaults', () => {
    const parsed = regionInputSchema.parse({ name: 'Room', cells: [{ x: 0, y: 0 }] })
    expect(parsed.cells).toHaveLength(1)
    expect(parsed.color).toBe('#3B82F6')
    expect(regionInputSchema.safeParse({ name: 'Room', cells: [] }).success).toBe(false)
  })
})

describe('saveMapSchema', () => {
  it('accepts an empty map and optional updatedAt', () => {
    expect(saveMapSchema.parse({ cells: [], regions: [] }).updatedAt).toBeUndefined()
    const parsed = saveMapSchema.parse({
      updatedAt: '2026-01-01T00:00:00.000Z',
      cells: [{ x: 0, y: 0, cardId: 1 }],
      regions: [{ name: 'R', cells: [{ x: 0, y: 0 }] }],
    })
    expect(parsed.cells).toHaveLength(1)
    expect(parsed.regions).toHaveLength(1)
  })
})
