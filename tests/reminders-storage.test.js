import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createTodo, addReminder, updateReminder, removeReminder, completeReminderCycle, snoozeReminder, listTodos } from '../extension/todos.js'

beforeEach(() => {
  vi.spyOn(chrome.alarms, 'create').mockResolvedValue()
  vi.spyOn(chrome.alarms, 'clear').mockResolvedValue(true)
})

describe('createTodo — 默认 reminders []', () => {
  it('新 todo 有 reminders: []', async () => {
    const t = await createTodo({ text: 'foo' })
    expect(t.reminders).toEqual([])
  })
})

describe('addReminder', () => {
  it('append 一个 reminder 并 chrome.alarms.create', async () => {
    const t = await createTodo({ text: 'foo' })
    const firstAt = Date.now() + 60_000
    const r = await addReminder(t.id, { firstAt, rule: 'once' })
    expect(r.id).toMatch(/^rmd_/)
    expect(r.firstAt).toBe(firstAt)
    expect(r.rule).toBe('once')
    expect(r.snoozedUntil).toBe(null)
    expect(r.lastFiredAt).toBe(null)
    expect(r.lastCompletedAt).toBe(null)
    expect(chrome.alarms.create).toHaveBeenCalledWith(r.id, { when: firstAt })
    const all = await listTodos()
    expect(all[0].reminders).toHaveLength(1)
  })
})

describe('updateReminder', () => {
  it('改 firstAt → clear + re-create alarm', async () => {
    const t = await createTodo({ text: 'foo' })
    const r = await addReminder(t.id, { firstAt: Date.now() + 60_000, rule: 'once' })
    const newAt = Date.now() + 120_000
    await updateReminder(t.id, r.id, { firstAt: newAt })
    expect(chrome.alarms.clear).toHaveBeenCalledWith(r.id)
    expect(chrome.alarms.create).toHaveBeenLastCalledWith(r.id, { when: newAt })
  })
})

describe('removeReminder', () => {
  it('删 + clear alarm', async () => {
    const t = await createTodo({ text: 'foo' })
    const r = await addReminder(t.id, { firstAt: Date.now() + 60_000, rule: 'once' })
    await removeReminder(t.id, r.id)
    expect(chrome.alarms.clear).toHaveBeenCalledWith(r.id)
    const all = await listTodos()
    expect(all[0].reminders).toHaveLength(0)
  })
})

describe('snoozeReminder', () => {
  it('设 snoozedUntil + clear + create alarm at snoozedUntil', async () => {
    const t = await createTodo({ text: 'foo' })
    const r = await addReminder(t.id, { firstAt: Date.now() + 60_000, rule: 'daily' })
    const snoozeTo = Date.now() + 30 * 60_000
    await snoozeReminder(t.id, r.id, snoozeTo)
    expect(chrome.alarms.create).toHaveBeenLastCalledWith(r.id, { when: snoozeTo })
    const all = await listTodos()
    expect(all[0].reminders[0].snoozedUntil).toBe(snoozeTo)
  })
})

describe('completeReminderCycle — once', () => {
  it('once 完成 → todo.status=done + clear alarm + 不再 schedule', async () => {
    const t = await createTodo({ text: 'foo' })
    const r = await addReminder(t.id, { firstAt: Date.now() + 60_000, rule: 'once' })
    await completeReminderCycle(t.id, r.id, Date.now())
    const all = await listTodos()
    expect(all[0].status).toBe('done')
    expect(all[0].reminders[0].lastCompletedAt).toBeGreaterThan(0)
    expect(chrome.alarms.clear).toHaveBeenCalledWith(r.id)
  })
})

describe('completeReminderCycle — daily', () => {
  it('daily 完成 → 不动 status、schedule 下次 alarm', async () => {
    const t = await createTodo({ text: 'foo' })
    const NOW = new Date(2026, 4, 21, 10, 0, 0).getTime()
    const firstAt = new Date(2026, 4, 21, 14, 0, 0).getTime()
    const r = await addReminder(t.id, { firstAt, rule: 'daily' })
    chrome.alarms.create.mockClear()
    await completeReminderCycle(t.id, r.id, NOW)
    const all = await listTodos()
    expect(all[0].status).toBe('pending')
    expect(all[0].reminders[0].lastCompletedAt).toBe(NOW)
    expect(all[0].reminders[0].snoozedUntil).toBe(null)
    expect(chrome.alarms.create).toHaveBeenCalledWith(r.id, { when: firstAt })
  })
})
