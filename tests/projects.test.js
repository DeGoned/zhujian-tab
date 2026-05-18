import { describe, it, expect, beforeEach } from 'vitest'
import { createProject, listProjects, updateProject, deleteProject, archiveIfAllDone, searchProjects } from '../extension/projects.js'
import { createTodo, completeTodo } from '../extension/todos.js'

beforeEach(async () => { await chrome.storage.local.clear() })

describe('project CRUD', () => {
  it('create assigns a color from rotating palette', async () => {
    const p1 = await createProject({ name: 'A' })
    const p2 = await createProject({ name: 'B' })
    const p3 = await createProject({ name: 'C' })
    expect(p1.color).toBe('purple')
    expect(p2.color).toBe('orange')
    expect(p3.color).toBe('green')
  })

  it('createProject with explicit color', async () => {
    const p = await createProject({ name: 'X', color: 'red' })
    expect(p.color).toBe('red')
  })

  it('list returns all non-archived by default', async () => {
    const a = await createProject({ name: 'A' })
    const b = await createProject({ name: 'B' })
    await updateProject(b.id, { archived: true })
    const list = await listProjects()
    expect(list.map(p => p.id)).toEqual([a.id])
  })

  it('list with includeArchived returns all', async () => {
    const a = await createProject({ name: 'A' })
    const b = await createProject({ name: 'B' })
    await updateProject(b.id, { archived: true })
    const list = await listProjects({ includeArchived: true })
    expect(list).toHaveLength(2)
  })

  it('archiveIfAllDone archives when all todos in project are done; returns boolean', async () => {
    const p = await createProject({ name: 'X' })
    const t1 = await createTodo({ text: 'a', projectId: p.id })
    const t2 = await createTodo({ text: 'b', projectId: p.id })
    await completeTodo(t1.id)
    const r1 = await archiveIfAllDone(p.id)
    expect(r1).toBe(false)
    let list = await listProjects({ includeArchived: true })
    expect(list.find(x => x.id === p.id).archived).toBe(false)

    await completeTodo(t2.id)
    const r2 = await archiveIfAllDone(p.id)
    expect(r2).toBe(true)
    list = await listProjects({ includeArchived: true })
    expect(list.find(x => x.id === p.id).archived).toBe(true)

    // 已归档不重复归档
    const r3 = await archiveIfAllDone(p.id)
    expect(r3).toBe(false)
  })

  it('archiveIfAllDone returns false for a project with no todos', async () => {
    const p = await createProject({ name: 'X' })
    const r = await archiveIfAllDone(p.id)
    expect(r).toBe(false)
    const list = await listProjects()
    expect(list.find(x => x.id === p.id).archived).toBe(false)
  })

  it('searchProjects fuzzy matches', async () => {
    await createProject({ name: 'Alpha' })
    await createProject({ name: 'Beta' })
    await createProject({ name: 'Alphabet' })
    const results = await searchProjects('alp')
    expect(results.map(p => p.name).sort()).toEqual(['Alpha', 'Alphabet'])
  })
})
