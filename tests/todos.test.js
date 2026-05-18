import { describe, it, expect, beforeEach } from 'vitest'
import { createTodo, listTodos, updateTodo, deleteTodo, completeTodo, listTodayTodos, pinTodayTodo, unpinTodayTodo } from '../extension/todos.js'

beforeEach(async () => { await chrome.storage.local.clear() })

describe('todo CRUD', () => {
  it('create then list', async () => {
    const t = await createTodo({ text: '催小李合同' })
    expect(t.text).toBe('催小李合同')
    expect(t.status).toBe('pending')
    expect(t.pinnedToday).toBe(false)
    expect(t.boundUrls).toEqual([])
    expect(t.projectId).toBe(null)
    expect(t.rolloverCount).toBe(0)

    const all = await listTodos()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe(t.id)
  })

  it('create with projectId and boundUrls', async () => {
    const t = await createTodo({ text: '评审', projectId: 'p1', boundUrls: ['https://x.com'] })
    expect(t.projectId).toBe('p1')
    expect(t.boundUrls).toEqual(['https://x.com'])
  })

  it('update text', async () => {
    const t = await createTodo({ text: 'old' })
    await updateTodo(t.id, { text: 'new' })
    const all = await listTodos()
    expect(all[0].text).toBe('new')
  })

  it('complete sets status and completedAt', async () => {
    const t = await createTodo({ text: 'x' })
    await completeTodo(t.id)
    const all = await listTodos()
    expect(all[0].status).toBe('done')
    expect(all[0].completedAt).toBeTypeOf('number')
  })

  it('delete removes the todo', async () => {
    const t = await createTodo({ text: 'x' })
    await deleteTodo(t.id)
    const all = await listTodos()
    expect(all).toEqual([])
  })
})

describe('today view aggregation', () => {
  it('includes unpinned no-project todos created today', async () => {
    await createTodo({ text: 'a' })
    const today = await listTodayTodos()
    expect(today.pending.map(t => t.text)).toContain('a')
  })

  it('excludes project todos unless pinnedToday', async () => {
    await createTodo({ text: 'p-task', projectId: 'p1' })
    let today = await listTodayTodos()
    expect(today.pending.find(t => t.text === 'p-task')).toBeUndefined()

    const all = await listTodos()
    await pinTodayTodo(all[0].id)
    today = await listTodayTodos()
    expect(today.pending.find(t => t.text === 'p-task')).toBeDefined()
  })

  it('completed today are in done bucket', async () => {
    const t = await createTodo({ text: 'x' })
    await completeTodo(t.id)
    const today = await listTodayTodos()
    expect(today.done.map(t => t.text)).toContain('x')
    expect(today.pending.find(t => t.text === 'x')).toBeUndefined()
  })

  it('unpin removes from today', async () => {
    const t = await createTodo({ text: 'p', projectId: 'p1' })
    await pinTodayTodo(t.id)
    await unpinTodayTodo(t.id)
    const today = await listTodayTodos()
    expect(today.pending.find(x => x.text === 'p')).toBeUndefined()
  })
})
