import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ErrorCode } from '@murdoku/shared'
import { createApp } from '../src/app'
import { db } from '../src/db/knex'

const app = createApp()
const api = request(app.callback())

const createdProjects: number[] = []
const createdCards: number[] = []

function uniqueCode(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

async function createProject(body: Record<string, unknown> = {}): Promise<number> {
  const res = await api.post('/api/projects').send(body)
  expect(res.status).toBe(200)
  expect(res.body.code).toBe(ErrorCode.OK)
  const id = res.body.data.id as number
  createdProjects.push(id)
  return id
}

async function createCard(body: Record<string, unknown> = {}): Promise<number> {
  const res = await api.post('/api/cards').send({ code: uniqueCode('card'), name: 'Card', ...body })
  expect(res.status).toBe(200)
  const id = res.body.data.id as number
  createdCards.push(id)
  return id
}

afterAll(async () => {
  if (createdProjects.length) {
    await db('map_projects').whereIn('id', createdProjects).del()
  }
  if (createdCards.length) {
    await db('cards').whereIn('id', createdCards).del()
  }
  await db.destroy()
})

describe('projects API', () => {
  it('creates a project with a default grid size', async () => {
    const res = await api.post('/api/projects').send({ name: 'Smoke Project' })
    expect(res.status).toBe(200)
    expect(res.body.data.gridSize).toBe(20)
    createdProjects.push(res.body.data.id)
  })

  it('rejects an out-of-range grid size', async () => {
    const res = await api.post('/api/projects').send({ name: 'Bad', gridSize: 2 })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED)
  })

  it('lists, reads, updates, duplicates and deletes a project', async () => {
    const id = await createProject({ name: 'Lifecycle', gridSize: 8 })

    const list = await api.get('/api/projects')
    expect(list.status).toBe(200)
    expect(Array.isArray(list.body.data.list)).toBe(true)
    expect(list.body.data.list.some((p: { id: number }) => p.id === id)).toBe(true)

    const detail = await api.get(`/api/projects/${id}`)
    expect(detail.body.data.gridSize).toBe(8)

    const updated = await api.patch(`/api/projects/${id}`).send({ name: 'Renamed' })
    expect(updated.body.data.name).toBe('Renamed')

    const dup = await api.post(`/api/projects/${id}/duplicate`)
    expect(dup.status).toBe(200)
    expect(dup.body.data.gridSize).toBe(8)
    createdProjects.push(dup.body.data.id)

    const removed = await api.delete(`/api/projects/${id}`)
    expect(removed.status).toBe(200)
    const missing = await api.get(`/api/projects/${id}`)
    expect(missing.status).toBe(404)
    expect(missing.body.code).toBe(ErrorCode.NOT_FOUND)
  })
})

describe('cards API', () => {
  it('creates a card with triggers and manages its lifecycle', async () => {
    const res = await api.post('/api/cards').send({
      code: uniqueCode('suspect'),
      name: 'Colonel Mustard',
      triggers: [
        { triggerKey: 'color', triggerValue: 'yellow', effectType: 'highlight', effectConfig: {} },
      ],
    })
    expect(res.status).toBe(200)
    const id = res.body.data.id as number
    createdCards.push(id)
    expect(res.body.data.triggers).toHaveLength(1)

    const patched = await api.patch(`/api/cards/${id}`).send({ name: 'Mustard' })
    expect(patched.body.data.name).toBe('Mustard')

    const replaced = await api
      .put(`/api/cards/${id}/triggers`)
      .send([
        { triggerKey: 'weapon', triggerValue: 'knife', effectType: 'glow', effectConfig: {} },
        { triggerKey: 'room', triggerValue: 'kitchen', effectType: 'tooltip', effectConfig: { text: 'hi' } },
      ])
    expect(replaced.body.data.triggers).toHaveLength(2)

    const usages = await api.get(`/api/cards/${id}/usages`)
    expect(usages.status).toBe(200)
    expect(Array.isArray(usages.body.data)).toBe(true)

    const removed = await api.delete(`/api/cards/${id}`)
    expect(removed.status).toBe(200)
  })

  it('rejects a card code with invalid characters', async () => {
    const res = await api.post('/api/cards').send({ code: 'bad code!', name: 'x' })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED)
  })
})

describe('map API', () => {
  it('saves and loads a map, then enforces optimistic concurrency', async () => {
    const projectId = await createProject({ name: 'Map Project', gridSize: 6 })
    const cardId = await createCard({ name: 'Map Card' })

    const empty = await api.get(`/api/projects/${projectId}/map`)
    expect(empty.status).toBe(200)
    expect(empty.body.data.cells).toEqual([])
    expect(empty.body.data.regions).toEqual([])
    const { updatedAt } = empty.body.data.project as { updatedAt: string }

    const payload = {
      updatedAt,
      cells: [
        { x: 0, y: 0, cardId, rotation: 0, zIndex: 0 },
        { x: 1, y: 1, cardId, rotation: 90, zIndex: 1 },
      ],
      regions: [
        {
          name: 'Lounge',
          description: null,
          color: '#ef4444',
          borderWidth: 3,
          fillOpacity: 0.2,
          cells: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        },
      ],
    }

    const saved = await api.put(`/api/projects/${projectId}/map`).send(payload)
    expect(saved.status).toBe(200)
    expect(saved.body.data.cells).toHaveLength(2)
    expect(saved.body.data.regions).toHaveLength(1)

    const loaded = await api.get(`/api/projects/${projectId}/map`)
    expect(loaded.body.data.cells).toHaveLength(2)
    expect(loaded.body.data.regions[0].name).toBe('Lounge')

    const stale = await api.put(`/api/projects/${projectId}/map`).send({
      updatedAt,
      cells: [],
      regions: [],
    })
    expect(stale.status).toBe(409)
    expect(stale.body.code).toBe(ErrorCode.CONFLICT)
  })

  it('rejects cells outside the canvas and unknown cards', async () => {
    const projectId = await createProject({ name: 'Bounds', gridSize: 4 })
    const cardId = await createCard({ name: 'Bounds Card' })

    const outOfBounds = await api
      .put(`/api/projects/${projectId}/map`)
      .send({ cells: [{ x: 10, y: 0, cardId }], regions: [] })
    expect(outOfBounds.status).toBe(400)

    const unknownCard = await api
      .put(`/api/projects/${projectId}/map`)
      .send({ cells: [{ x: 0, y: 0, cardId: 99999999 }], regions: [] })
    expect(unknownCard.status).toBe(400)
  })

  it('rejects overlapping regions within one save', async () => {
    const projectId = await createProject({ name: 'Overlap', gridSize: 5 })
    const res = await api.put(`/api/projects/${projectId}/map`).send({
      cells: [],
      regions: [
        { name: 'A', cells: [{ x: 0, y: 0 }] },
        { name: 'B', cells: [{ x: 0, y: 0 }] },
      ],
    })
    expect(res.status).toBe(409)
    expect(res.body.code).toBe(ErrorCode.CONFLICT)
  })

  it('manages individual regions and blocks conflicts', async () => {
    const projectId = await createProject({ name: 'Regions', gridSize: 5 })

    const first = await api.post(`/api/projects/${projectId}/regions`).send({
      name: 'Study',
      color: '#3b82f6',
      borderWidth: 4,
      fillOpacity: 0.1,
      cells: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    })
    expect(first.status).toBe(200)
    const regionId = first.body.data.id as number

    const conflict = await api.post(`/api/projects/${projectId}/regions`).send({
      name: 'Clash',
      cells: [{ x: 1, y: 0 }],
    })
    expect(conflict.status).toBe(409)

    const list = await api.get(`/api/projects/${projectId}/regions`)
    expect(list.body.data).toHaveLength(1)

    const patched = await api.patch(`/api/regions/${regionId}`).send({ name: 'Library' })
    expect(patched.body.data.name).toBe('Library')

    const removed = await api.delete(`/api/regions/${regionId}`)
    expect(removed.status).toBe(200)
    const after = await api.get(`/api/projects/${projectId}/regions`)
    expect(after.body.data).toHaveLength(0)
  })

  it('returns 404 for a missing project', async () => {
    const res = await api.get('/api/projects/99999999/map')
    expect(res.status).toBe(404)
    expect(res.body.code).toBe(ErrorCode.NOT_FOUND)
  })
})
