import { describe, it, expect, beforeEach } from 'vitest'
import { createTodo, listTodos, runDailyRollover, completeTodo } from '../extension/todos.js'
import { setStorage, KEYS } from '../extension/storage.js'

beforeEach(async () => { await chrome.storage.local.clear() })

function todayYmd() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('runDailyRollover', () => {
  it('no rollover when lastRolloverDate === today', async () => {
    await createTodo({ text: 'a' })
    const changed = await runDailyRollover()
    expect(changed).toBe(false)
    const all = await listTodos()
    expect(all[0].rolloverCount).toBe(0)
    expect(all[0].lastRolloverDate).toBe(todayYmd())
  })

  it('rolls over by diff days when lastRolloverDate is in the past', async () => {
    await createTodo({ text: 'a' })
    const all = await listTodos()
    // Pretend the todo was last rolled over 7 days ago
    const d = new Date()
    d.setDate(d.getDate() - 7)
    const sevenDaysAgo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    all[0].lastRolloverDate = sevenDaysAgo
    await setStorage(KEYS.todos, all)

    const changed = await runDailyRollover()
    expect(changed).toBe(true)
    const after = await listTodos()
    expect(after[0].rolloverCount).toBe(7)
    expect(after[0].lastRolloverDate).toBe(todayYmd())
  })

  it('accumulates across multiple invocations', async () => {
    await createTodo({ text: 'a' })
    const all1 = await listTodos()
    const d1 = new Date()
    d1.setDate(d1.getDate() - 2)
    all1[0].lastRolloverDate = `${d1.getFullYear()}-${String(d1.getMonth() + 1).padStart(2, '0')}-${String(d1.getDate()).padStart(2, '0')}`
    all1[0].rolloverCount = 3  // already had 3 from previous
    await setStorage(KEYS.todos, all1)

    await runDailyRollover()
    const after = await listTodos()
    expect(after[0].rolloverCount).toBe(5)  // 3 + 2
  })

  it('does not roll over done todos', async () => {
    const t = await createTodo({ text: 'a' })
    await completeTodo(t.id)
    const all = await listTodos()
    all[0].lastRolloverDate = '2026-01-01'
    const oldCount = all[0].rolloverCount
    await setStorage(KEYS.todos, all)

    await runDailyRollover()
    const after = await listTodos()
    expect(after[0].rolloverCount).toBe(oldCount)  // unchanged
    expect(after[0].lastRolloverDate).toBe('2026-01-01')  // unchanged
  })

  it('returns false when nothing changed', async () => {
    await createTodo({ text: 'a' })
    await runDailyRollover()  // first run sets everything to today
    const changed = await runDailyRollover()  // second run: nothing to do
    expect(changed).toBe(false)
  })

  it('handles missing lastRolloverDate (legacy data) gracefully', async () => {
    await createTodo({ text: 'a' })
    const all = await listTodos()
    delete all[0].lastRolloverDate
    await setStorage(KEYS.todos, all)

    const changed = await runDailyRollover()
    // Should set lastRolloverDate to today without crashing
    expect(changed).toBe(true)
    const after = await listTodos()
    expect(after[0].lastRolloverDate).toBe(todayYmd())
    // No diff to compute, rolloverCount unchanged
    expect(after[0].rolloverCount).toBe(0)
  })
})
