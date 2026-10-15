import { describe, expect, it } from 'vitest'
import { DEFAULT_CELL_SIZE } from '@murdoku/shared'
import {
  boardSize,
  centerPan,
  clampZoom,
  clientToCell,
  isInBounds,
  zoomAtPoint,
  ZOOM_MAX,
  ZOOM_MIN,
} from './grid'

const rect = { left: 100, top: 50, width: 600, height: 600 } as DOMRect

describe('clampZoom', () => {
  it('clamps to the supported zoom range', () => {
    expect(clampZoom(0.1)).toBe(ZOOM_MIN)
    expect(clampZoom(5)).toBe(ZOOM_MAX)
    expect(clampZoom(1.24)).toBe(1.24)
  })

  it('rounds to three decimals to avoid float drift', () => {
    expect(clampZoom(1.2 + 1.3000000000000003 - 1.3)).toBe(1.2)
  })
})

describe('clientToCell', () => {
  it('maps the top-left visible cell to (0, 0)', () => {
    expect(clientToCell(rect.left, rect.top, { rect, pan: { x: 0, y: 0 }, zoom: 1, cellSize: DEFAULT_CELL_SIZE })).toEqual({
      x: 0,
      y: 0,
    })
  })

  it('accounts for pan and zoom', () => {
    const coord = clientToCell(
      rect.left + DEFAULT_CELL_SIZE * 2 + 1,
      rect.top + DEFAULT_CELL_SIZE * 3 + 1,
      { rect, pan: { x: 0, y: 0 }, zoom: 2, cellSize: DEFAULT_CELL_SIZE },
    )
    expect(coord).toEqual({ x: 1, y: 1 })
  })

  it('can return negative coordinates outside the grid', () => {
    const coord = clientToCell(rect.left - 10, rect.top - 10, {
      rect,
      pan: { x: 0, y: 0 },
      zoom: 1,
      cellSize: DEFAULT_CELL_SIZE,
    })
    expect(coord).toEqual({ x: -1, y: -1 })
  })
})

describe('isInBounds', () => {
  it('accepts cells inside the grid', () => {
    expect(isInBounds({ x: 0, y: 0 }, 5)).toBe(true)
    expect(isInBounds({ x: 4, y: 4 }, 5)).toBe(true)
  })

  it('rejects cells on or beyond the edges', () => {
    expect(isInBounds({ x: 5, y: 0 }, 5)).toBe(false)
    expect(isInBounds({ x: -1, y: 0 }, 5)).toBe(false)
  })
})

describe('boardSize', () => {
  it('scales the board with zoom', () => {
    expect(boardSize(6, DEFAULT_CELL_SIZE)).toBe(6 * DEFAULT_CELL_SIZE)
    expect(boardSize(6, DEFAULT_CELL_SIZE, 2)).toBe(12 * DEFAULT_CELL_SIZE)
  })
})

describe('centerPan', () => {
  it('centers the board within the viewport', () => {
    const rect = { width: 800, height: 600 } as DOMRect
    expect(centerPan(rect, 6, DEFAULT_CELL_SIZE)).toEqual({
      x: (800 - 6 * DEFAULT_CELL_SIZE) / 2,
      y: (600 - 6 * DEFAULT_CELL_SIZE) / 2,
    })
  })
})

describe('zoomAtPoint', () => {
  it('keeps the pointer anchored when zooming in', () => {
    const pointer = { x: rect.left + 120, y: rect.top + 80 }
    const pan = { x: 0, y: 0 }
    const next = zoomAtPoint(pointer, rect, pan, 2, 1)
    const before = (pointer.x - rect.left - pan.x) / 1
    const after = (pointer.x - rect.left - next.x) / 2
    expect(after).toBeCloseTo(before, 6)
  })

  it('is a no-op when zoom does not change', () => {
    expect(zoomAtPoint({ x: 0, y: 0 }, rect, { x: 5, y: 5 }, 1, 1)).toEqual({ x: 5, y: 5 })
  })
})
