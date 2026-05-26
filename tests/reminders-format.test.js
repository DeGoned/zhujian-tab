import { describe, it, expect } from 'vitest'
import { formatReminderHuman } from '../extension/reminders.js'

const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min, 0).getTime()
const NOW = at(2026, 5, 21, 10, 0)

describe('formatReminderHuman', () => {
  it('once 今天 → "今天 14:30"', () => {
    expect(formatReminderHuman({ firstAt: at(2026, 5, 21, 14, 30), rule: 'once' }, NOW))
      .toBe('今天 14:30')
  })

  it('once 明天 → "明天 9:00"', () => {
    expect(formatReminderHuman({ firstAt: at(2026, 5, 22, 9, 0), rule: 'once' }, NOW))
      .toBe('明天 9:00')
  })

  it('once 一周内 → "周五 9:00"', () => {
    expect(formatReminderHuman({ firstAt: at(2026, 5, 22, 9, 0), rule: 'once' }, NOW))
      .toBe('明天 9:00')
  })

  it('once 一周外 → "6/1 9:00"', () => {
    expect(formatReminderHuman({ firstAt: at(2026, 6, 1, 9, 0), rule: 'once' }, NOW))
      .toBe('6/1 9:00')
  })

  it('daily 当日内 → "今天 14:30 · 每天"', () => {
    expect(formatReminderHuman({ firstAt: at(2026, 5, 21, 14, 30), rule: 'daily' }, NOW))
      .toBe('今天 14:30 · 每天')
  })

  it('weekdays', () => {
    expect(formatReminderHuman({ firstAt: at(2026, 5, 22, 9, 30), rule: 'weekdays' }, NOW))
      .toBe('明天 9:30 · 工作日')
  })

  it('weekly:Mon → 每周一', () => {
    expect(formatReminderHuman({ firstAt: at(2026, 5, 25, 9, 0), rule: 'weekly:Mon' }, NOW))
      .toBe('周一 9:00 · 每周一')
  })

  it('weekly:Mon,Wed,Fri → 每周一三五', () => {
    expect(formatReminderHuman({ firstAt: at(2026, 5, 22, 9, 0), rule: 'weekly:Mon,Wed,Fri' }, NOW))
      .toBe('明天 9:00 · 每周一三五')
  })

  it('biweekly:Mon → 每两周周一', () => {
    expect(formatReminderHuman({ firstAt: at(2026, 6, 1, 9, 0), rule: 'biweekly:Mon' }, NOW))
      .toBe('6/1 9:00 · 每两周一')
  })

  it('monthly:15', () => {
    expect(formatReminderHuman({ firstAt: at(2026, 6, 15, 9, 0), rule: 'monthly:15' }, NOW))
      .toBe('6/15 9:00 · 每月 15 号')
  })

  it('monthly:last', () => {
    expect(formatReminderHuman({ firstAt: at(2026, 5, 31, 18, 0), rule: 'monthly:last' }, NOW))
      .toBe('5/31 18:00 · 每月最后一天')
  })

  it('yearly:5-21', () => {
    expect(formatReminderHuman({ firstAt: at(2026, 5, 21, 9, 0), rule: 'yearly:5-21' }, NOW))
      .toBe('今天 9:00 · 每年 5 月 21 日')
  })

  it('snoozedUntil 优先级最高', () => {
    const r = { firstAt: at(2026, 5, 21, 9, 0), rule: 'daily', snoozedUntil: at(2026, 5, 21, 16, 30) }
    expect(formatReminderHuman(r, NOW)).toBe('推迟到 16:30 · 每天')
  })
})
