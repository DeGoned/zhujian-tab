import { describe, it, expect, beforeEach } from 'vitest'
import { rebuildBindingsCache, getTodosBoundToUrl, urlIsBound, rememberUrlTitle, getUrlTitle } from '../extension/binding.js'
import { createTodo, completeTodo } from '../extension/todos.js'

beforeEach(async () => { await chrome.storage.local.clear() })

describe('bindings cache', () => {
  it('rebuild creates url -> todoIds map', async () => {
    await createTodo({ text: 'a', boundUrls: ['https://x.com', 'https://y.com'] })
    await createTodo({ text: 'b', boundUrls: ['https://x.com'] })
    await rebuildBindingsCache()
    const todosForX = await getTodosBoundToUrl('https://x.com')
    expect(todosForX).toHaveLength(2)
    const todosForY = await getTodosBoundToUrl('https://y.com')
    expect(todosForY).toHaveLength(1)
  })

  it('completed todos excluded from urlIsBound', async () => {
    const t = await createTodo({ text: 'a', boundUrls: ['https://x.com'] })
    await rebuildBindingsCache()
    expect(await urlIsBound('https://x.com')).toBe(true)
    await completeTodo(t.id)
    await rebuildBindingsCache()
    expect(await urlIsBound('https://x.com')).toBe(false)
  })

  it('urlIsBound false for unbound url', async () => {
    expect(await urlIsBound('https://nothing.com')).toBe(false)
  })

  it('getTodosBoundToUrl returns empty array for unknown url', async () => {
    const r = await getTodosBoundToUrl('https://nothing.com')
    expect(r).toEqual([])
  })
})

describe('url title cache', () => {
  it('remember and retrieve title', async () => {
    await rememberUrlTitle('https://github.com', 'GitHub - The home of code')
    expect(await getUrlTitle('https://github.com')).toBe('GitHub - The home of code')
  })

  it('falls back to url when no title cached', async () => {
    expect(await getUrlTitle('https://unknown.com')).toBe('https://unknown.com')
  })

  it('updates existing title on re-remember', async () => {
    await rememberUrlTitle('https://x.com', 'old title')
    await rememberUrlTitle('https://x.com', 'new title')
    expect(await getUrlTitle('https://x.com')).toBe('new title')
  })

  it('ignores empty/null title', async () => {
    await rememberUrlTitle('https://x.com', '')
    expect(await getUrlTitle('https://x.com')).toBe('https://x.com')
  })
})
