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

describe('parseReminderInline — 重复规则', () => {
  it('~每天 紧跟 @时间', () => {
    const r = parseReminderInline('喝水 @9:00 ~每天', NOW)
    expect(r.reminders).toEqual([{ firstAt: at(2026, 5, 22, 9, 0), rule: 'daily' }])
  })

  it('~每日 等同 ~每天', () => {
    const r = parseReminderInline('喝水 @9:00 ~每日', NOW)
    expect(r.reminders[0].rule).toBe('daily')
  })

  it('~工作日', () => {
    const r = parseReminderInline('打卡 @9:30 ~工作日', NOW)
    expect(r.reminders[0].rule).toBe('weekdays')
  })

  it('~周一到周五 = ~工作日', () => {
    const r = parseReminderInline('打卡 @9:30 ~周一到周五', NOW)
    expect(r.reminders[0].rule).toBe('weekdays')
  })

  it('~每周一 → weekly:Mon', () => {
    const r = parseReminderInline('汇报 @9:00 ~每周一', NOW)
    expect(r.reminders[0].rule).toBe('weekly:Mon')
  })

  it('~每周一三五 → weekly:Mon,Wed,Fri', () => {
    const r = parseReminderInline('健身 @19:00 ~每周一三五', NOW)
    expect(r.reminders[0].rule).toBe('weekly:Mon,Wed,Fri')
  })

  it('~每周二四六', () => {
    const r = parseReminderInline('打球 @19:00 ~每周二四六', NOW)
    expect(r.reminders[0].rule).toBe('weekly:Tue,Thu,Sat')
  })

  it('~每两周一', () => {
    const r = parseReminderInline('体检 @9:00 ~每两周一', NOW)
    expect(r.reminders[0].rule).toBe('biweekly:Mon')
  })

  it('~每月15号', () => {
    const r = parseReminderInline('交房租 @9:00 ~每月15号', NOW)
    expect(r.reminders[0].rule).toBe('monthly:15')
  })

  it('~每月15 (无"号")', () => {
    const r = parseReminderInline('交房租 @9:00 ~每月15', NOW)
    expect(r.reminders[0].rule).toBe('monthly:15')
  })

  it('~每月最后一天', () => {
    const r = parseReminderInline('结账 @18:00 ~每月最后一天', NOW)
    expect(r.reminders[0].rule).toBe('monthly:last')
  })

  it('~每年5月21日', () => {
    const r = parseReminderInline('纪念日 @9:00 ~每年5月21日', NOW)
    expect(r.reminders[0].rule).toBe('yearly:5-21')
  })

  it('孤立的 ~ 保留在 cleanText', () => {
    const r = parseReminderInline('注释 ~随便写', NOW)
    expect(r.cleanText).toBe('注释 ~随便写')
    expect(r.reminders).toEqual([])
  })

  it('未识别的 ~xxx 保留在 cleanText', () => {
    const r = parseReminderInline('喝水 @9:00 ~乱写', NOW)
    expect(r.cleanText).toBe('喝水 ~乱写')
    expect(r.reminders[0].rule).toBe('once')
  })
})

describe('parseReminderInline — 日期+中文时间 复合（bug fix）', () => {
  it('用户报告 bug: @今天下午三点 应整体识别为今天 15:00', () => {
    const r = parseReminderInline('测试 @今天下午三点', NOW)
    expect(r.cleanText).toBe('测试')
    expect(r.reminders).toEqual([{ firstAt: at(2026, 5, 21, 15, 0), rule: 'once' }])
  })

  it('@今天下午3点 (mixed arabic)', () => {
    const r = parseReminderInline('测试 @今天下午3点', NOW)
    expect(r.cleanText).toBe('测试')
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 21, 15, 0))
  })

  it('@今天下午3点30 (mixed arabic + minutes)', () => {
    const r = parseReminderInline('测试 @今天下午3点30', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 21, 15, 30))
  })

  it('@今天下午三点半 (中文 + 半)', () => {
    const r = parseReminderInline('测试 @今天下午三点半', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 21, 15, 30))
  })

  it('@明天上午9点 → 明天 9:00', () => {
    const r = parseReminderInline('测试 @明天上午9点', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 22, 9, 0))
  })

  it('@明天晚上8点 → 明天 20:00', () => {
    const r = parseReminderInline('测试 @明天晚上8点', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 22, 20, 0))
  })

  it('@周一下午2点 → 下周一 14:00', () => {
    const r = parseReminderInline('测试 @周一下午2点', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 25, 14, 0))
  })

  it('@今晚九点 → 今天 21:00', () => {
    const r = parseReminderInline('测试 @今晚九点', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 21, 21, 0))
  })

  it('@5月25日下午4点 (no space)', () => {
    const r = parseReminderInline('婚礼 @5月25日下午4点', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 25, 16, 0))
  })

  it('@5/25下午4点 (no space)', () => {
    const r = parseReminderInline('婚礼 @5/25下午4点', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 25, 16, 0))
  })
})

describe('parseReminderInline — 中文数字独立时间', () => {
  it('@下午两点 (两=2)', () => {
    const r = parseReminderInline('测试 @下午两点', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 21, 14, 0))
  })

  it('@晚上十点', () => {
    const r = parseReminderInline('测试 @晚上十点', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 21, 22, 0))
  })

  it('@晚上八点半', () => {
    const r = parseReminderInline('测试 @晚上八点半', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 21, 20, 30))
  })

  it('@三点 (无 period → 3 AM，过 → tomorrow)', () => {
    const r = parseReminderInline('测试 @三点', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 22, 3, 0))
  })

  it('@十二点 (no period, 12 PM today)', () => {
    const r = parseReminderInline('测试 @十二点', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 21, 12, 0))
  })

  it('@二十三点四十五 (compound chinese hours+minutes)', () => {
    const r = parseReminderInline('测试 @二十三点四十五', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 21, 23, 45))
  })

  it('@下午三点钟 (钟 suffix ignored)', () => {
    const r = parseReminderInline('测试 @下午三点钟', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 21, 15, 0))
  })

  it('@下午三点整 (整 suffix ignored)', () => {
    const r = parseReminderInline('测试 @下午三点整', NOW)
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 21, 15, 0))
  })
})
