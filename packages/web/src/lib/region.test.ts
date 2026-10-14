import { describe, expect, it } from 'vitest'
import { CELL_SIZE } from '@murdoku/shared'
import type { RegionData } from '@murdoku/shared'
import { buildRegionEdges, coordKey, findConflicts, rectCells, regionAt, regionCellSet } from './region'

function region(id: number, cells: Array<[number, number]>): RegionData {
  return {
    id,
    name: `R${id}`,
    description: null,
    color: '#3B82F6',
    borderWidth: 4,
    fillOpacity: 0.08,
    cells: cells.map(([x, y]) => ({ x, y })),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('coordKey', () => {
  it('produces a stable composite key', () => {
    expect(coordKey(3, 4)).toBe('3,4')
  })
})

describe('rectCells', () => {
  it('normalizes reversed corners', () => {
    const cells = rectCells({ x: 2, y: 2 }, { x: 0, y: 0 })
    expect(cells).toHaveLength(9)
    expect(cells[0]).toEqual({ x: 0, y: 0 })
    expect(cells.at(-1)).toEqual({ x: 2, y: 2 })
  })

  it('covers a single cell when corners match', () => {
    expect(rectCells({ x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([{ x: 1, y: 1 }])
  })
})

describe('regionCellSet', () => {
  it('builds a key set for membership checks', () => {
    const set = regionCellSet(region(1, [[0, 0], [1, 0]]))
    expect(set.has('0,0')).toBe(true)
    expect(set.has('2,0')).toBe(false)
  })
})

describe('buildRegionEdges', () => {
  it('emits four edges for a lone cell', () => {
    const edges = buildRegionEdges([{ x: 0, y: 0 }])
    expect(edges).toHaveLength(4)
    expect(edges).toContainEqual([0, 0, CELL_SIZE, 0])
  })

  it('omits the shared edge between adjacent cells', () => {
    const edges = buildRegionEdges([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ])
    expect(edges).toHaveLength(6)
    expect(edges).not.toContainEqual([CELL_SIZE, 0, CELL_SIZE, CELL_SIZE])
  })

  it('wraps an L-shape without inner separators', () => {
    const edges = buildRegionEdges([
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ])
    expect(edges).toHaveLength(8)
  })
})

describe('findConflicts', () => {
  const regions = [region(1, [[0, 0], [1, 1]]), region(2, [[2, 2]])]

  it('returns cells already owned by another region', () => {
    const conflicts = findConflicts([{ x: 1, y: 1 }, { x: 3, y: 3 }], regions)
    expect(conflicts).toEqual([{ x: 1, y: 1 }])
  })

  it('ignores regions excluded via override id', () => {
    expect(findConflicts([{ x: 0, y: 0 }], regions, 1)).toEqual([])
  })
})

describe('regionAt', () => {
  const regions = [region(1, [[0, 0]]), region(2, [[5, 5]])]

  it('finds the region containing a coordinate', () => {
    expect(regionAt(regions, { x: 5, y: 5 })?.id).toBe(2)
  })

  it('returns undefined for an uncovered coordinate', () => {
    expect(regionAt(regions, { x: 9, y: 9 })).toBeUndefined()
  })
})
