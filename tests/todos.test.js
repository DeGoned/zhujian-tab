import { describe, it, expect, beforeEach } from 'vitest'
import { createTodo, listTodos, updateTodo, deleteTodo, completeTodo } from '../extension/todos.js'

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
