import { describe, it, expect } from 'vitest'
import { nextOccurrence } from '../extension/reminders.js'

const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min, 0).getTime()

describe('nextOccurrence — once', () => {
  it('未来时间 → 返回 firstAt', () => {
    const firstAt = at(2026, 6, 1, 9, 0)
    expect(nextOccurrence('once', firstAt, at(2026, 5, 1, 0, 0))).toBe(firstAt)
  })

  it('已过 → null', () => {
    const firstAt = at(2026, 6, 1, 9, 0)
    expect(nextOccurrence('once', firstAt, at(2026, 7, 1, 0, 0))).toBe(null)
  })
})

describe('nextOccurrence — daily', () => {
  it('今天某时未到 → 今天该时', () => {
    const firstAt = at(2026, 5, 21, 14, 0)
    expect(nextOccurrence('daily', firstAt, at(2026, 5, 21, 10, 0))).toBe(at(2026, 5, 21, 14, 0))
  })

  it('今天某时已过 → 明天该时', () => {
    const firstAt = at(2026, 5, 21, 9, 0)
    expect(nextOccurrence('daily', firstAt, at(2026, 5, 21, 10, 0))).toBe(at(2026, 5, 22, 9, 0))
  })

  it('firstAt 在未来 → 直接返回 firstAt', () => {
    const firstAt = at(2026, 6, 1, 9, 0)
    expect(nextOccurrence('daily', firstAt, at(2026, 5, 21, 10, 0))).toBe(firstAt)
  })
})

describe('nextOccurrence — weekdays', () => {
  // 2026-05-21 是周四
  it('周四 14:00（今天未到）→ 今天 14:00', () => {
    const firstAt = at(2026, 5, 21, 14, 0)
    expect(nextOccurrence('weekdays', firstAt, at(2026, 5, 21, 10, 0))).toBe(at(2026, 5, 21, 14, 0))
  })

  it('周五 9:00（已过）→ 下周一', () => {
    const firstAt = at(2026, 5, 22, 9, 0)
    expect(nextOccurrence('weekdays', firstAt, at(2026, 5, 22, 10, 0))).toBe(at(2026, 5, 25, 9, 0))
  })

  it('周六 → 下周一', () => {
    const firstAt = at(2026, 5, 23, 9, 0)
    expect(nextOccurrence('weekdays', firstAt, at(2026, 5, 23, 10, 0))).toBe(at(2026, 5, 25, 9, 0))
  })

  it('周日 → 下周一', () => {
    const firstAt = at(2026, 5, 24, 9, 0)
    expect(nextOccurrence('weekdays', firstAt, at(2026, 5, 24, 10, 0))).toBe(at(2026, 5, 25, 9, 0))
  })
})

describe('nextOccurrence — weekly', () => {
  it('weekly:Mon — 周四 → 下周一', () => {
    const firstAt = at(2026, 5, 18, 9, 0)
    expect(nextOccurrence('weekly:Mon', firstAt, at(2026, 5, 21, 10, 0))).toBe(at(2026, 5, 25, 9, 0))
  })

  it('weekly:Mon,Wed,Fri — 周四 10:00 → 周五 9:00', () => {
    const firstAt = at(2026, 5, 18, 9, 0)
    expect(nextOccurrence('weekly:Mon,Wed,Fri', firstAt, at(2026, 5, 21, 10, 0))).toBe(at(2026, 5, 22, 9, 0))
  })

  it('weekly:Sat — 周四 → 周六', () => {
    const firstAt = at(2026, 5, 23, 9, 0)
    expect(nextOccurrence('weekly:Sat', firstAt, at(2026, 5, 21, 10, 0))).toBe(firstAt)
  })

  it('weekly:Sun — 周六 → 周日', () => {
    const firstAt = at(2026, 5, 17, 9, 0)
    expect(nextOccurrence('weekly:Sun', firstAt, at(2026, 5, 23, 10, 0))).toBe(at(2026, 5, 24, 9, 0))
  })
})

describe('nextOccurrence — biweekly', () => {
  it('biweekly:Mon — firstAt 是 5/18 周一 → 下个是 6/1', () => {
    const firstAt = at(2026, 5, 18, 9, 0)
    expect(nextOccurrence('biweekly:Mon', firstAt, at(2026, 5, 19, 0, 0))).toBe(at(2026, 6, 1, 9, 0))
  })

  it('biweekly:Mon — firstAt 是 5/18 周一 → now 在 5/18 当天上午 → 当天', () => {
    const firstAt = at(2026, 5, 18, 9, 0)
    expect(nextOccurrence('biweekly:Mon', firstAt, at(2026, 5, 18, 6, 0))).toBe(firstAt)
  })

  it('biweekly:Mon — now 在 5/26（中间那周一）→ 应跳到 6/1', () => {
    const firstAt = at(2026, 5, 18, 9, 0)
    expect(nextOccurrence('biweekly:Mon', firstAt, at(2026, 5, 26, 10, 0))).toBe(at(2026, 6, 1, 9, 0))
  })
})
