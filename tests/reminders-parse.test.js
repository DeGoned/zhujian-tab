import { describe, it, expect } from 'vitest'
import { parseReminderInline } from '../extension/reminders.js'

// 固定 now = 2026-05-21 (Thu) 10:00:00 本地时间
const NOW = new Date(2026, 4, 21, 10, 0, 0).getTime()
const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min, 0).getTime()

describe('parseReminderInline — 绝对日期时间', () => {
  it('@YYYY-MM-DD HH:MM', () => {
    const r = parseReminderInline('回邮件 @2026-06-01 14:30', NOW)
    expect(r.cleanText).toBe('回邮件')
    expect(r.reminders).toEqual([{ firstAt: at(2026, 6, 1, 14, 30), rule: 'once' }])
  })

  it('@YYYY-MM-DD 默认 9:00', () => {
    const r = parseReminderInline('交报告 @2026-06-01', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 6, 1, 9, 0))
  })

  it('@M/D HH:MM 今年未到', () => {
    const r = parseReminderInline('喝水 @6/1 14:30', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 6, 1, 14, 30))
  })

  it('@M/D 已过 → 明年', () => {
    const r = parseReminderInline('过生日 @1/15', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2027, 1, 15, 9, 0))
  })

  it('@M月D日 HH:MM', () => {
    const r = parseReminderInline('婚礼 @5月25日 16:00', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 25, 16, 0))
  })
})

describe('parseReminderInline — 相对天数', () => {
  it('@明天 9:00', () => {
    const r = parseReminderInline('看牙医 @明天 9:00', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 22, 9, 0))
  })

  it('@后天 14:00', () => {
    const r = parseReminderInline('面试 @后天 14:00', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 23, 14, 0))
  })

  it('@明天 默认 9:00', () => {
    const r = parseReminderInline('记得 @明天', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 22, 9, 0))
  })

  it('@今晚 20:00 → 今天 20:00', () => {
    const r = parseReminderInline('看球 @今晚 20:00', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 21, 20, 0))
  })

  it('@今晚 默认 20:00', () => {
    const r = parseReminderInline('看球 @今晚', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 21, 20, 0))
  })

  it('@今天 已过 8:00 → 顺延到明天 8:00', () => {
    const r = parseReminderInline('喝水 @今天 8:00', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 22, 8, 0))
  })
})

describe('parseReminderInline — 星期', () => {
  // NOW 是 Thu (周四)
  it('@周一 9:00 → 下周一', () => {
    const r = parseReminderInline('开会 @周一 9:00', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 25, 9, 0))
  })

  it('@周日 → 本周日（3 天后）', () => {
    const r = parseReminderInline('收拾 @周日', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 24, 9, 0))
  })

  it('@周天 同 @周日', () => {
    const r = parseReminderInline('收拾 @周天', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 24, 9, 0))
  })

  it('@下周一 → 跳过本周（如本周一已过）', () => {
    const r = parseReminderInline('汇报 @下周一', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 25, 9, 0))
  })

  it('@星期五 = @周五', () => {
    const r = parseReminderInline('交周报 @星期五 17:00', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 22, 17, 0))
  })
})

describe('parseReminderInline — 上下午 + 点钟', () => {
  it('@下午 3 点', () => {
    const r = parseReminderInline('回邮件 @下午 3 点', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 21, 15, 0))
  })

  it('@晚上 8 点 30', () => {
    const r = parseReminderInline('健身 @晚上 8 点 30', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 21, 20, 30))
  })

  it('@上午 9 点 → 不加 12', () => {
    const r = parseReminderInline('开会 @上午 9 点', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 22, 9, 0))
  })
})

describe('parseReminderInline — 纯时间', () => {
  it('@14:30 今天', () => {
    const r = parseReminderInline('回邮件 @14:30', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 21, 14, 30))
  })

  it('@9:00 已过 → 明天', () => {
    const r = parseReminderInline('喝水 @9:00', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 22, 9, 0))
  })

  it('@9 点 同 @9:00', () => {
    const r = parseReminderInline('喝水 @9 点', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 22, 9, 0))
  })

  it('@9 点 30 同 @9:30', () => {
    const r = parseReminderInline('喝水 @9 点 30', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 22, 9, 30))
  })
})

describe('parseReminderInline — 相对时间', () => {
  it('@30 分钟后', () => {
    const r = parseReminderInline('喝水 @30 分钟后', NOW)
    expect(r.reminders[0].firstAt).toBe(NOW + 30 * 60 * 1000)
  })

  it('@2 小时后', () => {
    const r = parseReminderInline('喝水 @2 小时后', NOW)
    expect(r.reminders[0].firstAt).toBe(NOW + 2 * 60 * 60 * 1000)
  })

  it('@3 天后 9:00 → 3 天后的 9 点（不是 +72h）', () => {
    const r = parseReminderInline('交报告 @3 天后 9:00', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 24, 9, 0))
  })
})

describe('parseReminderInline — 兜底', () => {
  it('无 @ → reminders 空', () => {
    const r = parseReminderInline('普通待办', NOW)
    expect(r).toEqual({ cleanText: '普通待办', reminders: [] })
  })

  it('未识别的 @xxx 保留在 cleanText', () => {
    const r = parseReminderInline('看文档 @乱写', NOW)
    expect(r.cleanText).toBe('看文档 @乱写')
    expect(r.reminders).toEqual([])
  })

  it('多个 @ → 多个 reminder', () => {
    const r = parseReminderInline('喝水 @9:00 @14:00', NOW)
    expect(r.reminders).toHaveLength(2)
  })

  it('@ 和 # 项目可共存', () => {
    const r = parseReminderInline('回邮件 #work @14:30', NOW)
    expect(r.cleanText).toBe('回邮件 #work')
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 21, 14, 30))
  })
})
