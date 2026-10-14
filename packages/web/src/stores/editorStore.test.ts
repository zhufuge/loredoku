import { beforeEach, describe, expect, it } from 'vitest'
import { useEditorStore, type NewRegionInput } from './editorStore'

function store() {
  return useEditorStore.getState()
}

const regionInput = (cells: Array<[number, number]>): NewRegionInput => ({
  name: 'Room',
  description: null,
  color: '#3B82F6',
  borderWidth: 4,
  fillOpacity: 0.08,
  cells: cells.map(([x, y]) => ({ x, y })),
})

beforeEach(() => {
  store().init(1, 5)
})

describe('card placement', () => {
  it('places a card and marks the map dirty', () => {
    store().placeCard(1, 2, 7)
    const state = store()
    expect(state.cells.get('1,2')).toEqual({ cardId: 7, rotation: 0, zIndex: 0 })
    expect(state.dirty).toBe(true)
    expect(state.past).toHaveLength(1)
  })

  it('removes a placed card', () => {
    store().placeCard(0, 0, 1)
    store().removeCard(0, 0)
    expect(store().cells.has('0,0')).toBe(false)
  })
})

describe('moveCard', () => {
  beforeEach(() => {
    store().placeCard(0, 0, 1)
  })

  it('moves into an empty cell', () => {
    store().moveCard(0, 0, 2, 2)
    expect(store().cells.get('0,0')).toBeUndefined()
    expect(store().cells.get('2,2')?.cardId).toBe(1)
  })

  it('swaps when the target is occupied', () => {
    store().placeCard(1, 0, 2)
    store().moveCard(0, 0, 1, 0)
    expect(store().cells.get('0,0')?.cardId).toBe(2)
    expect(store().cells.get('1,0')?.cardId).toBe(1)
  })
})

describe('history', () => {
  it('undoes and redoes a placement', () => {
    store().placeCard(0, 0, 7)
    store().undo()
    expect(store().cells.size).toBe(0)
    store().redo()
    expect(store().cells.get('0,0')?.cardId).toBe(7)
  })

  it('clears the redo stack after a new action', () => {
    store().placeCard(0, 0, 1)
    store().undo()
    expect(store().future).toHaveLength(1)
    store().placeCard(1, 1, 2)
    expect(store().future).toHaveLength(0)
  })

  it('markSaved resets the dirty flag', () => {
    store().placeCard(0, 0, 1)
    expect(store().dirty).toBe(true)
    store().markSaved()
    expect(store().dirty).toBe(false)
  })
})

describe('regions', () => {
  it('assigns incremental ids and selects the new region', () => {
    const id = store().applyRegionCreate(regionInput([[0, 0]]), false)
    expect(id).toBe(1)
    expect(store().selectedRegionId).toBe(1)
    const second = store().applyRegionCreate(regionInput([[2, 2]]), false)
    expect(second).toBe(2)
  })

  it('override mode removes cells from existing regions', () => {
    store().applyRegionCreate(regionInput([[0, 0], [1, 0]]), false)
    store().applyRegionCreate(regionInput([[1, 0], [2, 0]]), true)
    const [first, second] = store().regions
    expect(first?.cells).toEqual([{ x: 0, y: 0 }])
    expect(second?.cells).toHaveLength(2)
  })

  it('toggles a cell in and out of a region', () => {
    const id = store().applyRegionCreate(regionInput([[0, 0]]), false)
    store().toggleRegionCell(id, { x: 1, y: 0 })
    expect(store().regions[0]?.cells).toHaveLength(2)
    store().toggleRegionCell(id, { x: 0, y: 0 })
    expect(store().regions[0]?.cells).toEqual([{ x: 1, y: 0 }])
  })

  it('deletes a region and clears the selection', () => {
    const id = store().applyRegionCreate(regionInput([[0, 0]]), false)
    store().deleteRegion(id)
    expect(store().regions).toHaveLength(0)
    expect(store().selectedRegionId).toBeNull()
  })
})

describe('init', () => {
  it('hydrates cells and regions without marking dirty', () => {
    store().init(9, 4, {
      cells: [{ x: 0, y: 0, cardId: 3, rotation: 90, zIndex: 0 }],
      regions: [
        {
          id: 7,
          name: 'Loaded',
          description: null,
          color: '#3B82F6',
          borderWidth: 4,
          fillOpacity: 0.08,
          cells: [{ x: 0, y: 0 }],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
    expect(store().projectId).toBe(9)
    expect(store().cells.get('0,0')?.rotation).toBe(90)
    expect(store().regions).toHaveLength(1)
    expect(store().past).toHaveLength(0)
    expect(store().dirty).toBe(false)
  })
})
