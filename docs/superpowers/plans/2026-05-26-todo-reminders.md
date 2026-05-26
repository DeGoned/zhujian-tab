# Todo 提醒 + Mac 系统通知 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给每个 todo 加 0~N 个时间提醒，到点弹 macOS 原生系统通知；支持「once / daily / weekdays / weekly:X,Y / biweekly:X / monthly:N / monthly:last / yearly:M-D / custom:RRULE-subset」9 种重复规则；inline 输入 `@时间 ~重复` + todo hover 🔔 popover 双入口；推迟 / 完成 通知按钮；Chrome 重启后 7 天内错过的聚合通知补报。

**Architecture:**
- **纯函数 `extension/reminders.js`**：`parseReminderInline / nextOccurrence / previousOccurrence / formatReminderHuman` + 自定义 rule 序列化。100% 单测覆盖，无 chrome API 依赖。
- **存储扩展 `extension/todos.js`**：`reminders: []` 字段；CRUD 函数 `addReminder/updateReminder/removeReminder/completeReminderCycle` 内部联动 `chrome.alarms.create/clear`。
- **Service Worker `extension/background.js`**：`chrome.alarms.onAlarm` → 弹通知 + 排下次；`chrome.notifications.onButtonClicked/onClicked` 处理交互；`onStartup` 跑 catch-up + 重建 alarm。
- **UI 入口** `extension/reminder-popover.js`（新）+ `extension/todos-view.js`（修改）+ `extension/input-parser.js`（修改）。

**Tech Stack:** Vanilla ES modules (no build step) · Chrome MV3 (alarms / notifications / storage.local) · vitest + jest-chrome 单测。

---

## 本计划相对 spec 的范围裁剪

| spec 项 | 本 plan | 理由 |
|---------|---------|------|
| Rule 类型 `custom:FREQ=...;INTERVAL=N;BYDAY=...` | **推迟到 v1.2**（不在本 plan） | 9 个预设已覆盖 95% 用例；自定义 UI（"自定义..."展开 + freq/interval/byday picker） + `nextCustomAt/previousCustomAt` 实现约 +3 task。先发 v1.1 验证使用情况，确认需求再做。 |
| 多个 reminder per todo | ✅ 做（popover 支持「+ 添加提醒」） | 跟 spec 一致 |
| 内联 + UI 双入口 | ✅ 做 | 跟 spec 一致 |
| Catch-up 聚合通知 | ✅ 做（7 天回溯） | 跟 spec 一致 |
| ✅完成 / 😴推迟 双按钮 | ✅ 做（chrome 最多 2 按钮硬限制） | 跟 spec 一致 |

发 v1.1 时在 README 已知限制里列一句"重复规则暂支持 9 个预设；自定义 RRULE 子集 v1.2 提供"。

---

## 文件结构

**新建：**

| 文件 | 职责 | 依赖 |
|------|------|------|
| `extension/reminders.js` | 纯函数：parseReminderInline / nextOccurrence / previousOccurrence / formatReminderHuman / parseCustomRule / serializeCustomRule | 无（纯函数） |
| `extension/reminder-popover.js` | 🔔 popover UI（datetime + 重复 select + 多 reminder 编辑） | reminders.js · todos.js |
| `tests/reminders-parse.test.js` | parseReminderInline 全量测试（~60 cases） | reminders.js |
| `tests/reminders-occurrence.test.js` | nextOccurrence + previousOccurrence 测试（~80 cases，涵盖 DST/跨月/闰年） | reminders.js |
| `tests/reminders-format.test.js` | formatReminderHuman 测试（~20 cases） | reminders.js |
| `tests/reminders-storage.test.js` | addReminder/updateReminder/removeReminder/completeReminderCycle 测试 | todos.js · chrome.alarms mock |

**修改：**

| 文件 | 改动要点 |
|------|----------|
| `extension/manifest.json` | +`alarms` +`notifications` permission |
| `extension/input-parser.js` | `parseTodoInput()` 返回值多 `reminders: []` 字段；新增 `parseInlineTimeAndRepeat()` 调 reminders.parseReminderInline |
| `extension/todos.js` | `createTodo` 默认 `reminders: []`；新增 `addReminder/updateReminder/removeReminder/completeReminderCycle` 都内部联动 chrome.alarms |
| `extension/background.js` | 顶部 import 新增 reminders.js + addReminder 等；新增 `onAlarm` listener；新增 `notifications.onButtonClicked/onClicked` listener；扩展 `onStartup` 跑 catchupMissed |
| `extension/todos-view.js` | `renderTodoLi` 加 🔔 hover icon + 卡片底部 reminder 行；wire popover 打开/保存 |
| `extension/settings.js` | DEFAULT_SETTINGS 加 `notifyOnComplete: false`, `defaultSnoozeMin: 30` |
| `extension/settings-panel.js` | wire `defaultSnoozeMin` select + `notifyOnComplete` checkbox |
| `extension/index.html` | settingsPanel 加"通知行为"section；body 末尾加 `<div id="reminderPopover">`；import 加 reminder-popover.js（通过 app.js） |
| `extension/app.js` | `wireReminderPopover()` 调用；监听 `notification-clicked` 消息 → 滚到 todo 高亮 |
| `extension/style.css` | append：`.t-reminder` icon + `.t-reminder-line` 卡片底部行 + `.reminder-popover` |
| `README.md` | 在 v1.0.0 smoke test 后追加 §"reminder smoke test" |

---

## Task 1: manifest.json 加权限

**Files:**
- Modify: `extension/manifest.json:6`

- [ ] **Step 1: 编辑 permissions 数组**

```json
"permissions": ["tabs", "activeTab", "storage", "scripting", "alarms", "notifications"],
```

- [ ] **Step 2: 在 Chrome 里 chrome://extensions reload extension**

期望：不报错。打开 chrome://extensions 看 "Tab Out + Todo" 仍是绿色启用。

- [ ] **Step 3: Commit**

```bash
git add extension/manifest.json
git commit -m "feat: +alarms +notifications permissions (reminders MVP scaffolding)"
```

---

## Task 2: reminders.js — parseReminderInline 时间部分

**Files:**
- Create: `extension/reminders.js`
- Create: `tests/reminders-parse.test.js`

实现 `parseReminderInline(text, now = Date.now())` —— 从原始文本里抽出 `@时间` `~重复` 子串，返回 `{ cleanText, reminders }`。本任务**只做时间 `@xxx`**，下个任务做重复 `~xxx`。

`reminders` 数组的每项：`{ firstAt: number, rule: 'once' }`（rule 留 'once' 占位，task 3 再处理 `~`）。

支持的 pattern（按优先级，从精确到模糊）：

| Pattern | 例子 | 解析为 |
|---------|------|--------|
| `@YYYY-MM-DD HH:MM` | `@2026-05-21 14:30` | 绝对 |
| `@YYYY-MM-DD` | `@2026-05-21` | 当日 9:00 |
| `@M/D HH:MM` 或 `@M/D` | `@5/21 14:30` `@5/21` | 今年或明年（如已过则明年）+ 9:00 默认 |
| `@M月D日 HH:MM?` | `@5月21日 9:00` | 同上 |
| `@(明天\|后天\|大后天) HH:MM?` | `@明天 9:00` | 相对 |
| `@(今天\|今晚) HH:MM?` | `@今晚 20:00` | 今天 |
| `@(下\|下下)?(周\|星期)[一二三四五六日天] HH:MM?` | `@下周一 9:00` | 最近匹配的星期 |
| `@(上午\|下午\|晚上)N点(M)?` | `@下午 3 点` `@晚上 8 点 30` | 转 24h（上午+12 不变，下午+12，晚上+12） |
| `@HH:MM` 或 `@H:M` | `@9:00` `@14:30` | 今天该时；若已过 → 明天 |
| `@N点(M)?` | `@9 点` `@9 点 30` | 同上 |
| `@N(小时\|分钟\|天)后 HH:MM?` | `@30 分钟后` `@3 天后 9:00` | 相对 |

未匹配的 `@xxx` 留在 cleanText 里。

- [ ] **Step 1: 写测试**

```js
// tests/reminders-parse.test.js
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
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 25, 9, 0))  // 下周一
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
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 22, 9, 0))  // 已过 → 明天
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
    // 此函数只管 @ —— # 由 parseTodoInput 处理，所以 cleanText 保留 #work
    expect(r.cleanText).toBe('回邮件 #work')
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 21, 14, 30))
  })
})
```

- [ ] **Step 2: 跑测试，确认全部失败**

```bash
npm test -- tests/reminders-parse.test.js
```

期望：`Cannot find module '../extension/reminders.js'` 或全 FAIL。

- [ ] **Step 3: 创建 reminders.js 实现**

```js
// extension/reminders.js
// 纯函数。不依赖 chrome / DOM / storage。

const WEEKDAY_MAP = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 }

/**
 * 给定本地时间各分量，返回该时刻的 timestamp。
 */
function localTs(y, m, d, h, min) {
  return new Date(y, m - 1, d, h, min, 0).getTime()
}

/**
 * 把 12 小时制（含上午/下午/晚上）转成 24 小时。
 */
function to24h(period, hour) {
  if (period === '上午') return hour === 12 ? 0 : hour
  if (period === '下午') return hour === 12 ? 12 : hour + 12
  if (period === '晚上') return hour < 6 ? hour + 12 : (hour === 12 ? 12 : hour + 12)
  return hour
}

/**
 * 把"今天 h:m"转 timestamp；若已 ≤ now，则顺延到明天。
 */
function todayOrTomorrowAt(now, h, m) {
  const d = new Date(now)
  let t = localTs(d.getFullYear(), d.getMonth() + 1, d.getDate(), h, m)
  if (t <= now) t += 24 * 60 * 60 * 1000
  return t
}

/**
 * 解析时间子串 → { firstAt, matchLength } 或 null。
 * sub 是从 '@' 之后开始的字符串。
 *
 * 注意：这个解析器是一个有序匹配链。第一个匹配成功的就 return。
 */
function tryParseTimeSub(sub, now) {
  // 1. @YYYY-MM-DD HH:MM
  let m = sub.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})\b/)
  if (m) {
    return { firstAt: localTs(+m[1], +m[2], +m[3], +m[4], +m[5]), matchLength: m[0].length }
  }
  // 2. @YYYY-MM-DD
  m = sub.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\b/)
  if (m) return { firstAt: localTs(+m[1], +m[2], +m[3], 9, 0), matchLength: m[0].length }

  // 3. @M/D HH:MM / @M/D
  m = sub.match(/^(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?\b/)
  if (m) {
    const d = new Date(now)
    let yr = d.getFullYear()
    let ts = localTs(yr, +m[1], +m[2], m[3] ? +m[3] : 9, m[4] ? +m[4] : 0)
    if (ts <= now) ts = localTs(yr + 1, +m[1], +m[2], m[3] ? +m[3] : 9, m[4] ? +m[4] : 0)
    return { firstAt: ts, matchLength: m[0].length }
  }

  // 4. @M月D日 HH:MM?
  m = sub.match(/^(\d{1,2})月(\d{1,2})日(?:\s+(\d{1,2}):(\d{2}))?/)
  if (m) {
    const d = new Date(now)
    let yr = d.getFullYear()
    let ts = localTs(yr, +m[1], +m[2], m[3] ? +m[3] : 9, m[4] ? +m[4] : 0)
    if (ts <= now) ts = localTs(yr + 1, +m[1], +m[2], m[3] ? +m[3] : 9, m[4] ? +m[4] : 0)
    return { firstAt: ts, matchLength: m[0].length }
  }

  // 5. @(明天|后天|大后天) HH:MM?
  m = sub.match(/^(明天|后天|大后天)(?:\s+(\d{1,2}):(\d{2}))?/)
  if (m) {
    const offset = { '明天': 1, '后天': 2, '大后天': 3 }[m[1]]
    const d = new Date(now); d.setDate(d.getDate() + offset)
    return {
      firstAt: localTs(d.getFullYear(), d.getMonth() + 1, d.getDate(), m[2] ? +m[2] : 9, m[3] ? +m[3] : 0),
      matchLength: m[0].length,
    }
  }

  // 6. @(今天|今晚) HH:MM?
  m = sub.match(/^(今天|今晚)(?:\s+(\d{1,2}):(\d{2}))?/)
  if (m) {
    const defaultHour = m[1] === '今晚' ? 20 : 9
    const h = m[2] ? +m[2] : defaultHour
    const min = m[3] ? +m[3] : 0
    return { firstAt: todayOrTomorrowAt(now, h, min), matchLength: m[0].length }
  }

  // 7. @(下|下下)?(周|星期)X HH:MM?
  m = sub.match(/^(下下|下)?(周|星期)([一二三四五六日天])(?:\s+(\d{1,2}):(\d{2}))?/)
  if (m) {
    const targetDow = WEEKDAY_MAP[m[3]]
    const d = new Date(now)
    const today = d.getDay()
    let daysAhead = (targetDow - today + 7) % 7
    if (daysAhead === 0) daysAhead = 7        // 同一天 → 下一次
    if (m[1] === '下') daysAhead += 7
    if (m[1] === '下下') daysAhead += 14
    d.setDate(d.getDate() + daysAhead)
    return {
      firstAt: localTs(d.getFullYear(), d.getMonth() + 1, d.getDate(), m[4] ? +m[4] : 9, m[5] ? +m[5] : 0),
      matchLength: m[0].length,
    }
  }

  // 8. @(上午|下午|晚上)N 点 M?
  m = sub.match(/^(上午|下午|晚上)\s*(\d{1,2})\s*点\s*(\d{1,2})?/)
  if (m) {
    const h = to24h(m[1], +m[2])
    const min = m[3] ? +m[3] : 0
    return { firstAt: todayOrTomorrowAt(now, h, min), matchLength: m[0].length }
  }

  // 9. @N(小时|分钟|天)后 HH:MM?
  m = sub.match(/^(\d+)\s*(小时|分钟|天)后(?:\s+(\d{1,2}):(\d{2}))?/)
  if (m) {
    const n = +m[1]
    const unit = m[2]
    if (unit === '天') {
      const d = new Date(now); d.setDate(d.getDate() + n)
      return {
        firstAt: localTs(d.getFullYear(), d.getMonth() + 1, d.getDate(), m[3] ? +m[3] : 9, m[4] ? +m[4] : 0),
        matchLength: m[0].length,
      }
    }
    const ms = unit === '小时' ? n * 3600_000 : n * 60_000
    return { firstAt: now + ms, matchLength: m[0].length }
  }

  // 10. @HH:MM
  m = sub.match(/^(\d{1,2}):(\d{2})\b/)
  if (m) return { firstAt: todayOrTomorrowAt(now, +m[1], +m[2]), matchLength: m[0].length }

  // 11. @N 点 M?
  m = sub.match(/^(\d{1,2})\s*点\s*(\d{1,2})?\b/)
  if (m) return { firstAt: todayOrTomorrowAt(now, +m[1], m[2] ? +m[2] : 0), matchLength: m[0].length }

  return null
}

/**
 * @param {string} text
 * @param {number} [now=Date.now()]
 * @returns {{ cleanText: string, reminders: Array<{firstAt: number, rule: string}> }}
 */
export function parseReminderInline(text, now = Date.now()) {
  const reminders = []
  let cursor = 0
  let out = ''
  while (cursor < text.length) {
    const atIdx = text.indexOf('@', cursor)
    if (atIdx === -1) {
      out += text.slice(cursor)
      break
    }
    out += text.slice(cursor, atIdx)
    const sub = text.slice(atIdx + 1)
    const parsed = tryParseTimeSub(sub, now)
    if (parsed) {
      reminders.push({ firstAt: parsed.firstAt, rule: 'once' })
      cursor = atIdx + 1 + parsed.matchLength
    } else {
      out += '@'
      cursor = atIdx + 1
    }
  }
  return { cleanText: out.replace(/\s+/g, ' ').trim(), reminders }
}
```

- [ ] **Step 4: 跑测试，全部 PASS**

```bash
npm test -- tests/reminders-parse.test.js
```

期望：所有 case PASS。如某 case 跪了，查正则边界，**不要改测试**——除非测试本身的预期算错了（重读 NOW 时间和星期）。

- [ ] **Step 5: Commit**

```bash
git add extension/reminders.js tests/reminders-parse.test.js
git commit -m "feat(reminders): parseReminderInline 时间部分（@绝对/相对/星期/上下午）"
```

---

## Task 3: reminders.js — 重复 `~` 部分

**Files:**
- Modify: `extension/reminders.js`
- Modify: `tests/reminders-parse.test.js`

支持的 `~` pattern：

| Pattern | Rule string |
|---------|-------------|
| `~每天` `~每日` | `daily` |
| `~工作日` `~周一到周五` | `weekdays` |
| `~每周X` 单字 | `weekly:Mon` (英文三字缩写) |
| `~每周XYZ` 多字 | `weekly:Mon,Wed,Fri` |
| `~每两周X` | `biweekly:Mon` |
| `~每月N号?` | `monthly:15` |
| `~每月最后一天` | `monthly:last` |
| `~每年M月D日?` | `yearly:5-21` |

匹配后："**最后一个被 parse 到的 reminder**的 rule 设为该 ~ 值"。如果 `~` 出现时 reminders 还是空（没 @），把 rule 应用到 cleanText 末尾下次第一个 @ —— **或者更简单：忽略孤立 `~`，保留在 cleanText**。本任务采用简单方案：**`~` 必须紧跟在 `@时间`后（中间可有空格），否则视作未识别**。

- [ ] **Step 1: 加测试**

在 `tests/reminders-parse.test.js` 末尾追加：

```js
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
    expect(r.reminders[0].rule).toBe('once')  // 没识别 ~，rule 保留 once
  })
})
```

- [ ] **Step 2: 跑测试，重复部分 FAIL**

```bash
npm test -- tests/reminders-parse.test.js
```

期望：上面新加的 12 个 case FAIL。

- [ ] **Step 3: 在 reminders.js 加 tryParseRepeatSub + 集成到 parseReminderInline**

把现有 `parseReminderInline` 改成：

```js
const WEEKDAY_ENGLISH = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAY_CHAR_TO_NUM = WEEKDAY_MAP  // 复用

/**
 * 解析 `~xxx` → { rule, matchLength } 或 null
 */
function tryParseRepeatSub(sub) {
  // ~每天 / ~每日
  let m = sub.match(/^(每天|每日)/)
  if (m) return { rule: 'daily', matchLength: m[0].length }

  // ~工作日 / ~周一到周五
  m = sub.match(/^(工作日|周一到周五)/)
  if (m) return { rule: 'weekdays', matchLength: m[0].length }

  // ~每两周X
  m = sub.match(/^每两周([一二三四五六日天])/)
  if (m) {
    return { rule: `biweekly:${WEEKDAY_ENGLISH[WEEKDAY_CHAR_TO_NUM[m[1]]]}`, matchLength: m[0].length }
  }

  // ~每周XYZ（贪婪匹配连续中文星期数）
  m = sub.match(/^每周([一二三四五六日天]+)/)
  if (m) {
    const days = [...m[1]].map(ch => WEEKDAY_ENGLISH[WEEKDAY_CHAR_TO_NUM[ch]])
    return { rule: `weekly:${days.join(',')}`, matchLength: m[0].length }
  }

  // ~每月最后一天
  m = sub.match(/^每月最后一天/)
  if (m) return { rule: 'monthly:last', matchLength: m[0].length }

  // ~每月N号?
  m = sub.match(/^每月(\d{1,2})号?/)
  if (m) return { rule: `monthly:${+m[1]}`, matchLength: m[0].length }

  // ~每年M月D日?
  m = sub.match(/^每年(\d{1,2})月(\d{1,2})日?/)
  if (m) return { rule: `yearly:${+m[1]}-${+m[2]}`, matchLength: m[0].length }

  return null
}

export function parseReminderInline(text, now = Date.now()) {
  const reminders = []
  let cursor = 0
  let out = ''
  while (cursor < text.length) {
    const ch = text[cursor]
    if (ch === '@') {
      const sub = text.slice(cursor + 1)
      const parsed = tryParseTimeSub(sub, now)
      if (parsed) {
        reminders.push({ firstAt: parsed.firstAt, rule: 'once' })
        cursor = cursor + 1 + parsed.matchLength
        continue
      }
      out += '@'; cursor++; continue
    }
    if (ch === '~') {
      const sub = text.slice(cursor + 1)
      const parsed = tryParseRepeatSub(sub)
      if (parsed && reminders.length > 0) {
        // 应用到最近的 reminder
        reminders[reminders.length - 1].rule = parsed.rule
        cursor = cursor + 1 + parsed.matchLength
        continue
      }
      out += '~'; cursor++; continue
    }
    out += ch; cursor++
  }
  return { cleanText: out.replace(/\s+/g, ' ').trim(), reminders }
}
```

- [ ] **Step 4: 跑测试，全部 PASS**

```bash
npm test -- tests/reminders-parse.test.js
```

- [ ] **Step 5: Commit**

```bash
git add extension/reminders.js tests/reminders-parse.test.js
git commit -m "feat(reminders): parseReminderInline 重复部分（~每天/工作日/每周XYZ/每月N/每年M-D）"
```

---

## Task 4: reminders.js — nextOccurrence (once/daily/weekdays/weekly/biweekly)

**Files:**
- Modify: `extension/reminders.js`
- Create: `tests/reminders-occurrence.test.js`

实现 `nextOccurrence(rule, firstAt, now, lastFiredAt = null)`：返回 `> now` 的下一次触发 timestamp，或 `null`（一次性且已过）。

本任务只做 `once / daily / weekdays / weekly:* / biweekly:*` 5 种。

- [ ] **Step 1: 写测试**

```js
// tests/reminders-occurrence.test.js
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
    const firstAt = at(2026, 5, 18, 9, 0)  // 上周一
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
```

- [ ] **Step 2: 跑测试，全部 FAIL**

```bash
npm test -- tests/reminders-occurrence.test.js
```

- [ ] **Step 3: 实现 nextOccurrence (5 种 rule)**

在 reminders.js 追加：

```js
const WEEKDAY_NUM_TO_ENGLISH = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAY_ENGLISH_TO_NUM = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

function extractHM(ts) {
  const d = new Date(ts)
  return { h: d.getHours(), m: d.getMinutes() }
}

function setHM(ts, h, m) {
  const d = new Date(ts); d.setHours(h, m, 0, 0); return d.getTime()
}

function startOfDay(ts) {
  const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime()
}

function addDays(ts, n) {
  const d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime()
}

/**
 * @param {string} rule
 * @param {number} firstAt
 * @param {number} now
 * @param {number|null} lastFiredAt
 * @returns {number|null}
 */
export function nextOccurrence(rule, firstAt, now, lastFiredAt = null) {
  // firstAt 还在未来 → 永远先用 firstAt
  if (firstAt > now) return firstAt

  if (rule === 'once') return null

  const { h, m } = extractHM(firstAt)

  if (rule === 'daily') {
    let candidate = setHM(now, h, m)
    if (candidate <= now) candidate = addDays(candidate, 1)
    return candidate
  }

  if (rule === 'weekdays') {
    let candidate = setHM(now, h, m)
    if (candidate <= now) candidate = addDays(candidate, 1)
    while (new Date(candidate).getDay() === 0 || new Date(candidate).getDay() === 6) {
      candidate = addDays(candidate, 1)
    }
    return candidate
  }

  if (rule.startsWith('weekly:')) {
    const dows = rule.slice(7).split(',').map(s => WEEKDAY_ENGLISH_TO_NUM[s])
    for (let i = 0; i < 8; i++) {
      const candidate = setHM(addDays(now, i), h, m)
      if (candidate <= now) continue
      if (dows.includes(new Date(candidate).getDay())) return candidate
    }
    return null  // unreachable for valid rule
  }

  if (rule.startsWith('biweekly:')) {
    const targetDow = WEEKDAY_ENGLISH_TO_NUM[rule.slice(9)]
    // 从 firstAt 算起，每 14 天的同一星期
    const firstDayStart = startOfDay(firstAt)
    for (let i = 0; i < 21; i++) {
      const candidate = setHM(addDays(now, i), h, m)
      if (candidate <= now) continue
      if (new Date(candidate).getDay() !== targetDow) continue
      const daysFromFirst = Math.round((startOfDay(candidate) - firstDayStart) / 86400_000)
      if (daysFromFirst % 14 === 0) return candidate
    }
    return null
  }

  return null  // 其他 rule 留到 Task 5
}
```

- [ ] **Step 4: 跑测试，5 类全 PASS**

```bash
npm test -- tests/reminders-occurrence.test.js
```

- [ ] **Step 5: Commit**

```bash
git add extension/reminders.js tests/reminders-occurrence.test.js
git commit -m "feat(reminders): nextOccurrence — once/daily/weekdays/weekly:*/biweekly:*"
```

---

## Task 5: reminders.js — nextOccurrence (monthly/yearly)

**Files:**
- Modify: `extension/reminders.js`
- Modify: `tests/reminders-occurrence.test.js`

补 `monthly:N` `monthly:last` `yearly:M-D` 3 种。需要处理边界：
- `monthly:31` + 当月只有 30 天 → 跳到下月 31 日 / 当月 30 日（**本设计选当月最后一天**）
- `monthly:last` → 当月最后一天
- `yearly:2-29` 闰年外 → 当年 2/28（妥协，避免漏弹）

- [ ] **Step 1: 加测试**

```js
// 末尾追加
describe('nextOccurrence — monthly', () => {
  it('monthly:15 — 今天 5/21，下次 6/15', () => {
    const firstAt = at(2026, 5, 15, 9, 0)
    expect(nextOccurrence('monthly:15', firstAt, at(2026, 5, 21, 10, 0))).toBe(at(2026, 6, 15, 9, 0))
  })

  it('monthly:15 — 今天 5/14，下次 5/15', () => {
    const firstAt = at(2026, 5, 15, 9, 0)
    expect(nextOccurrence('monthly:15', firstAt, at(2026, 5, 14, 10, 0))).toBe(at(2026, 5, 15, 9, 0))
  })

  it('monthly:31 — 2 月跳到 28', () => {
    const firstAt = at(2026, 1, 31, 9, 0)
    expect(nextOccurrence('monthly:31', firstAt, at(2026, 2, 1, 10, 0))).toBe(at(2026, 2, 28, 9, 0))
  })

  it('monthly:31 — 闰年 2 月 → 29', () => {
    const firstAt = at(2024, 1, 31, 9, 0)
    expect(nextOccurrence('monthly:31', firstAt, at(2024, 2, 1, 10, 0))).toBe(at(2024, 2, 29, 9, 0))
  })

  it('monthly:last — 5 月 → 5/31', () => {
    const firstAt = at(2026, 5, 31, 18, 0)
    expect(nextOccurrence('monthly:last', firstAt, at(2026, 5, 30, 10, 0))).toBe(at(2026, 5, 31, 18, 0))
  })

  it('monthly:last — 已过 5/31 → 6/30', () => {
    const firstAt = at(2026, 5, 31, 18, 0)
    expect(nextOccurrence('monthly:last', firstAt, at(2026, 6, 1, 10, 0))).toBe(at(2026, 6, 30, 18, 0))
  })

  it('monthly:last — 2 月最后一天 = 28（非闰）', () => {
    const firstAt = at(2026, 1, 31, 18, 0)
    expect(nextOccurrence('monthly:last', firstAt, at(2026, 2, 1, 10, 0))).toBe(at(2026, 2, 28, 18, 0))
  })
})

describe('nextOccurrence — yearly', () => {
  it('yearly:5-21 — 今年 5/21 已过 → 明年', () => {
    const firstAt = at(2026, 5, 21, 9, 0)
    expect(nextOccurrence('yearly:5-21', firstAt, at(2026, 5, 22, 10, 0))).toBe(at(2027, 5, 21, 9, 0))
  })

  it('yearly:5-21 — 今年 5/21 未到 → 今年', () => {
    const firstAt = at(2026, 5, 21, 9, 0)
    expect(nextOccurrence('yearly:5-21', firstAt, at(2026, 5, 20, 10, 0))).toBe(at(2026, 5, 21, 9, 0))
  })

  it('yearly:2-29 — 非闰年妥协到 2/28', () => {
    const firstAt = at(2024, 2, 29, 9, 0)
    expect(nextOccurrence('yearly:2-29', firstAt, at(2024, 3, 1, 10, 0))).toBe(at(2025, 2, 28, 9, 0))
  })
})
```

- [ ] **Step 2: 跑测试，新加 case FAIL**

- [ ] **Step 3: 加 monthly + yearly 实现**

在 nextOccurrence 的 biweekly 之后插入：

```js
  if (rule.startsWith('monthly:')) {
    const dayPart = rule.slice(8)   // '15' or 'last'
    let yr = new Date(now).getFullYear()
    let mo = new Date(now).getMonth()  // 0-indexed
    for (let i = 0; i < 13; i++) {
      const targetMonth = (mo + i) % 12
      const targetYear = yr + Math.floor((mo + i) / 12)
      const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0).getDate()
      const dayNum = dayPart === 'last' ? lastDayOfMonth : Math.min(+dayPart, lastDayOfMonth)
      const candidate = localTs(targetYear, targetMonth + 1, dayNum, h, m)
      if (candidate > now) return candidate
    }
    return null
  }

  if (rule.startsWith('yearly:')) {
    const [mStr, dStr] = rule.slice(7).split('-')
    const monthNum = +mStr
    const dayNum = +dStr
    let yr = new Date(now).getFullYear()
    for (let i = 0; i < 4; i++) {
      const lastDayOfMonth = new Date(yr + i, monthNum, 0).getDate()
      const actualDay = Math.min(dayNum, lastDayOfMonth)
      const candidate = localTs(yr + i, monthNum, actualDay, h, m)
      if (candidate > now) return candidate
    }
    return null
  }
```

- [ ] **Step 4: 跑测试全 PASS**

```bash
npm test -- tests/reminders-occurrence.test.js
```

- [ ] **Step 5: Commit**

```bash
git add extension/reminders.js tests/reminders-occurrence.test.js
git commit -m "feat(reminders): nextOccurrence — monthly:N/monthly:last/yearly:M-D（含 31 号 + 闰年妥协）"
```

---

## Task 6: reminders.js — previousOccurrence

**Files:**
- Modify: `extension/reminders.js`
- Modify: `tests/reminders-occurrence.test.js`

`previousOccurrence(rule, firstAt, now)` 返回 `<= now` 的最近一次应触发时间，或 `null`（rule 还没开始 / once 未到）。catch-up 算法需要。

镜像 nextOccurrence 即可，把"找下一次"换成"找上一次"。

- [ ] **Step 1: 加测试**

把 `tests/reminders-occurrence.test.js` 顶部的 import 改为：

```js
import { nextOccurrence, previousOccurrence } from '../extension/reminders.js'
```

然后在文件末尾追加：

```js
describe('previousOccurrence — once', () => {
  it('已过 → firstAt', () => {
    const firstAt = at(2026, 5, 1, 9, 0)
    expect(previousOccurrence('once', firstAt, at(2026, 5, 21, 10, 0))).toBe(firstAt)
  })

  it('未到 → null', () => {
    const firstAt = at(2026, 6, 1, 9, 0)
    expect(previousOccurrence('once', firstAt, at(2026, 5, 21, 10, 0))).toBe(null)
  })
})

describe('previousOccurrence — daily', () => {
  it('今天 14:00（11:00 时）→ 昨天 14:00', () => {
    const firstAt = at(2026, 5, 1, 14, 0)
    expect(previousOccurrence('daily', firstAt, at(2026, 5, 21, 11, 0))).toBe(at(2026, 5, 20, 14, 0))
  })

  it('今天 14:00（15:00 时）→ 今天 14:00', () => {
    const firstAt = at(2026, 5, 1, 14, 0)
    expect(previousOccurrence('daily', firstAt, at(2026, 5, 21, 15, 0))).toBe(at(2026, 5, 21, 14, 0))
  })

  it('firstAt 在未来 → null', () => {
    const firstAt = at(2026, 6, 1, 9, 0)
    expect(previousOccurrence('daily', firstAt, at(2026, 5, 21, 10, 0))).toBe(null)
  })
})

describe('previousOccurrence — weekly', () => {
  it('weekly:Mon — 今天周四 10:00 → 上周一', () => {
    const firstAt = at(2026, 5, 4, 9, 0)
    expect(previousOccurrence('weekly:Mon', firstAt, at(2026, 5, 21, 10, 0))).toBe(at(2026, 5, 18, 9, 0))
  })

  it('weekly:Mon,Wed,Fri — 今天周四 10:00 → 周三', () => {
    const firstAt = at(2026, 5, 4, 9, 0)
    expect(previousOccurrence('weekly:Mon,Wed,Fri', firstAt, at(2026, 5, 21, 10, 0))).toBe(at(2026, 5, 20, 9, 0))
  })
})

describe('previousOccurrence — monthly', () => {
  it('monthly:15 — 今天 5/21 → 5/15', () => {
    const firstAt = at(2026, 1, 15, 9, 0)
    expect(previousOccurrence('monthly:15', firstAt, at(2026, 5, 21, 10, 0))).toBe(at(2026, 5, 15, 9, 0))
  })

  it('monthly:15 — 今天 5/10 → 4/15', () => {
    const firstAt = at(2026, 1, 15, 9, 0)
    expect(previousOccurrence('monthly:15', firstAt, at(2026, 5, 10, 10, 0))).toBe(at(2026, 4, 15, 9, 0))
  })

  it('monthly:last — 今天 5/21 → 4/30', () => {
    const firstAt = at(2026, 1, 31, 18, 0)
    expect(previousOccurrence('monthly:last', firstAt, at(2026, 5, 21, 10, 0))).toBe(at(2026, 4, 30, 18, 0))
  })
})
```

- [ ] **Step 2: 跑测试，FAIL**

- [ ] **Step 3: 实现 previousOccurrence**

在 reminders.js 追加：

```js
/**
 * 镜像 nextOccurrence — 返回 <= now 的最近一次应触发时间，或 null。
 */
export function previousOccurrence(rule, firstAt, now) {
  if (firstAt > now) return null

  if (rule === 'once') return firstAt

  const { h, m } = extractHM(firstAt)

  if (rule === 'daily') {
    let candidate = setHM(now, h, m)
    if (candidate > now) candidate = addDays(candidate, -1)
    return candidate < firstAt ? null : candidate
  }

  if (rule === 'weekdays') {
    let candidate = setHM(now, h, m)
    if (candidate > now) candidate = addDays(candidate, -1)
    while (new Date(candidate).getDay() === 0 || new Date(candidate).getDay() === 6) {
      candidate = addDays(candidate, -1)
    }
    return candidate < firstAt ? null : candidate
  }

  if (rule.startsWith('weekly:')) {
    const dows = rule.slice(7).split(',').map(s => WEEKDAY_ENGLISH_TO_NUM[s])
    for (let i = 0; i < 8; i++) {
      const candidate = setHM(addDays(now, -i), h, m)
      if (candidate > now) continue
      if (dows.includes(new Date(candidate).getDay())) {
        return candidate < firstAt ? null : candidate
      }
    }
    return null
  }

  if (rule.startsWith('biweekly:')) {
    const targetDow = WEEKDAY_ENGLISH_TO_NUM[rule.slice(9)]
    const firstDayStart = startOfDay(firstAt)
    for (let i = 0; i < 21; i++) {
      const candidate = setHM(addDays(now, -i), h, m)
      if (candidate > now) continue
      if (new Date(candidate).getDay() !== targetDow) continue
      const daysFromFirst = Math.round((startOfDay(candidate) - firstDayStart) / 86400_000)
      if (daysFromFirst >= 0 && daysFromFirst % 14 === 0) return candidate
    }
    return null
  }

  if (rule.startsWith('monthly:')) {
    const dayPart = rule.slice(8)
    let yr = new Date(now).getFullYear()
    let mo = new Date(now).getMonth()
    for (let i = 0; i < 13; i++) {
      const targetMonth = (((mo - i) % 12) + 12) % 12
      const targetYear = yr + Math.floor((mo - i) / 12)
      const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0).getDate()
      const dayNum = dayPart === 'last' ? lastDayOfMonth : Math.min(+dayPart, lastDayOfMonth)
      const candidate = localTs(targetYear, targetMonth + 1, dayNum, h, m)
      if (candidate <= now) return candidate < firstAt ? null : candidate
    }
    return null
  }

  if (rule.startsWith('yearly:')) {
    const [mStr, dStr] = rule.slice(7).split('-')
    const monthNum = +mStr
    const dayNum = +dStr
    let yr = new Date(now).getFullYear()
    for (let i = 0; i < 4; i++) {
      const lastDayOfMonth = new Date(yr - i, monthNum, 0).getDate()
      const actualDay = Math.min(dayNum, lastDayOfMonth)
      const candidate = localTs(yr - i, monthNum, actualDay, h, m)
      if (candidate <= now) return candidate < firstAt ? null : candidate
    }
    return null
  }

  return null
}
```

- [ ] **Step 4: 跑测试，全 PASS**

```bash
npm test -- tests/reminders-occurrence.test.js
```

- [ ] **Step 5: Commit**

```bash
git add extension/reminders.js tests/reminders-occurrence.test.js
git commit -m "feat(reminders): previousOccurrence — catch-up 所需的反向算法"
```

---

## Task 7: reminders.js — formatReminderHuman

**Files:**
- Modify: `extension/reminders.js`
- Create: `tests/reminders-format.test.js`

UI 显示用：`'下次 周一 15:00 · 每周一三五'`、`'下次 6/15 9:00 · 每月'`、`'推迟到 16:30'`。

- [ ] **Step 1: 写测试**

```js
// tests/reminders-format.test.js
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
      .toBe('明天 9:00')   // 明天优先
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
```

- [ ] **Step 2: 跑测试，FAIL**

- [ ] **Step 3: 实现 formatReminderHuman**

在 reminders.js 追加：

```js
const ZH_WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']
const ZH_WEEKDAY_FROM_ENG = { Sun: '日', Mon: '一', Tue: '二', Wed: '三', Thu: '四', Fri: '五', Sat: '六' }

function sameYmd(ts1, ts2) {
  const d1 = new Date(ts1), d2 = new Date(ts2)
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate()
}

function formatTime(ts) {
  const d = new Date(ts)
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatDate(ts, now) {
  const d = new Date(ts)
  if (sameYmd(ts, now)) return `今天 ${formatTime(ts)}`
  if (sameYmd(ts, now + 86400_000)) return `明天 ${formatTime(ts)}`
  const daysAhead = Math.round((startOfDay(ts) - startOfDay(now)) / 86400_000)
  if (daysAhead > 0 && daysAhead < 7) {
    return `周${ZH_WEEKDAY[d.getDay()]} ${formatTime(ts)}`
  }
  return `${d.getMonth() + 1}/${d.getDate()} ${formatTime(ts)}`
}

function formatRule(rule) {
  if (rule === 'once') return ''
  if (rule === 'daily') return '每天'
  if (rule === 'weekdays') return '工作日'
  if (rule.startsWith('weekly:')) {
    const days = rule.slice(7).split(',').map(d => ZH_WEEKDAY_FROM_ENG[d]).join('')
    return `每周${days}`
  }
  if (rule.startsWith('biweekly:')) {
    return `每两周${ZH_WEEKDAY_FROM_ENG[rule.slice(9)]}`
  }
  if (rule.startsWith('monthly:')) {
    const part = rule.slice(8)
    return part === 'last' ? '每月最后一天' : `每月 ${part} 号`
  }
  if (rule.startsWith('yearly:')) {
    const [m, d] = rule.slice(7).split('-')
    return `每年 ${m} 月 ${d} 日`
  }
  return ''
}

/**
 * @param {{firstAt: number, rule: string, snoozedUntil?: number|null}} reminder
 * @param {number} [now=Date.now()]
 * @returns {string}
 */
export function formatReminderHuman(reminder, now = Date.now()) {
  let datePart
  if (reminder.snoozedUntil) {
    datePart = `推迟到 ${formatTime(reminder.snoozedUntil)}`
  } else {
    datePart = formatDate(reminder.firstAt, now)
  }
  const rulePart = formatRule(reminder.rule)
  return rulePart ? `${datePart} · ${rulePart}` : datePart
}
```

- [ ] **Step 4: 跑测试，全 PASS**

```bash
npm test -- tests/reminders-format.test.js
```

- [ ] **Step 5: Commit**

```bash
git add extension/reminders.js tests/reminders-format.test.js
git commit -m "feat(reminders): formatReminderHuman — UI 渲染用的人类可读字符串"
```

---

## Task 8: input-parser.js 集成 — parseTodoInput 返回 reminders

**Files:**
- Modify: `extension/input-parser.js`
- Modify: `tests/input-parser.test.js`

`parseTodoInput(raw)` 当前返回 `{ text, projectName }`；扩展为 `{ text, projectName, reminders }`，内部调 `parseReminderInline`。先抽 `@/~`、再抽 `#`，避免两者冲突。

- [ ] **Step 1: 加测试到 tests/input-parser.test.js（不动现有 case）**

末尾追加：

```js
import { parseTodoInput } from '../extension/input-parser.js'

// 顶部如果还没 import 上面这行，加上
const NOW = new Date(2026, 4, 21, 10, 0, 0).getTime()
const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min, 0).getTime()

describe('parseTodoInput — 加 @reminder + ~repeat', () => {
  it('文本 + #项目 + @时间', () => {
    const r = parseTodoInput('回邮件 #work @14:30', NOW)
    expect(r.text).toBe('回邮件')
    expect(r.projectName).toBe('work')
    expect(r.reminders[0].firstAt).toBe(at(2026, 5, 21, 14, 30))
    expect(r.reminders[0].rule).toBe('once')
  })

  it('文本 + @时间 + ~重复 + #项目', () => {
    const r = parseTodoInput('喝水 @9:00 ~每天 #health', NOW)
    expect(r.text).toBe('喝水')
    expect(r.projectName).toBe('health')
    expect(r.reminders[0].rule).toBe('daily')
  })

  it('无 @/~ → reminders 空（向后兼容）', () => {
    const r = parseTodoInput('做事 #work', NOW)
    expect(r.reminders).toEqual([])
  })
})
```

- [ ] **Step 2: 跑测试 FAIL**

```bash
npm test -- tests/input-parser.test.js
```

期望：3 个新 case FAIL（reminders 字段 undefined 或不存在）。其余原 cases 应继续 PASS。

- [ ] **Step 3: 改 input-parser.js**

```js
// extension/input-parser.js
import { parseReminderInline } from './reminders.js'

/**
 * 抽 @time ~repeat 再抽 #project。
 * @param {string} raw
 * @param {number} [now=Date.now()]
 * @returns {{ text: string, projectName: string | null, reminders: Array<{firstAt: number, rule: string}> }}
 */
export function parseTodoInput(raw, now = Date.now()) {
  // 1. 先抽 @ ~（reminders.js 已实现）
  const { cleanText: afterReminders, reminders } = parseReminderInline(raw, now)

  // 2. 再抽 # 项目（保留现有逻辑，直接照抄）
  const allMatches = [...afterReminders.matchAll(/#/g)]
  if (allMatches.length === 0) {
    return { text: afterReminders.trim(), projectName: null, reminders }
  }
  const lastMatch = allMatches[allMatches.length - 1]
  const lastHashIndex = lastMatch.index
  const isAtStart = lastHashIndex === 0
  const afterHash = afterReminders.substring(lastHashIndex + 1)
  let projectName, lastProjectEndIndex
  if (isAtStart) {
    const m = afterHash.match(/^(\S+)/)
    projectName = m ? m[1] : ''
    lastProjectEndIndex = lastHashIndex + 1 + (m ? m[0].length : 0)
  } else {
    const m = afterHash.match(/^([^#]*)/)
    projectName = m ? m[1].trim() : ''
    lastProjectEndIndex = lastHashIndex + 1 + (m ? m[0].length : 0)
  }
  let text = ''
  let lastIndex = 0
  for (let i = 0; i < allMatches.length; i++) {
    const hashIndex = allMatches[i].index
    if (hashIndex > lastIndex) text += afterReminders.substring(lastIndex, hashIndex) + ' '
    if (i === allMatches.length - 1) {
      lastIndex = lastProjectEndIndex
    } else {
      const afterThisHash = afterReminders.substring(hashIndex + 1)
      const wordMatch = afterThisHash.match(/^(\S+)/)
      lastIndex = hashIndex + 1 + (wordMatch ? wordMatch[0].length : 0)
    }
  }
  if (lastIndex < afterReminders.length) text += afterReminders.substring(lastIndex)
  text = text.replace(/\s+/g, ' ').trim()
  return { text, projectName: projectName || null, reminders }
}
```

- [ ] **Step 4: 跑测试，全 PASS（包括原 9 个 + 新 3 个）**

```bash
npm test -- tests/input-parser.test.js
```

- [ ] **Step 5: Commit**

```bash
git add extension/input-parser.js tests/input-parser.test.js
git commit -m "feat(parser): parseTodoInput 支持 @time ~repeat（先抽时间再抽项目）"
```

---

## Task 9: todos.js — reminders schema + CRUD

**Files:**
- Modify: `extension/todos.js`
- Create: `tests/reminders-storage.test.js`

加 4 个新函数：

- `addReminder(todoId, partialReminder)` — 创建 id、补默认字段、写回 todo、`chrome.alarms.create`
- `updateReminder(todoId, reminderId, patch)` — `chrome.alarms.clear` + `create` 重建
- `removeReminder(todoId, reminderId)` — 删 reminder + clear alarm
- `completeReminderCycle(todoId, reminderId, now)` — 设 `lastCompletedAt = now`、清 `snoozedUntil`、重排下次 alarm
- `snoozeReminder(todoId, reminderId, untilTs)` — 设 `snoozedUntil`、重建 alarm

`createTodo()` 默认 `reminders: []`。

- [ ] **Step 1: 写测试 — 覆盖所有 5 个 CRUD 函数**

```js
// tests/reminders-storage.test.js
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
    // 一次性 reminder 完成 → todo 也完成
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
    expect(all[0].status).toBe('pending')   // 不变
    expect(all[0].reminders[0].lastCompletedAt).toBe(NOW)
    expect(all[0].reminders[0].snoozedUntil).toBe(null)
    // 应排今天 14:00（next > NOW）
    expect(chrome.alarms.create).toHaveBeenCalledWith(r.id, { when: firstAt })
  })
})
```

- [ ] **Step 2: 跑测试 FAIL**

- [ ] **Step 3: 在 todos.js 顶部 import**

```js
import { nextOccurrence } from './reminders.js'
```

- [ ] **Step 4: createTodo 默认 reminders**

把现有 createTodo 内 `notes: '',` 后加：`reminders: input.reminders ?? [],`

- [ ] **Step 5: 加新函数（在文件末尾）**

```js
function ridFor() {
  return 'rmd_' + Math.random().toString(36).slice(2, 10)
}

/**
 * 排定（或重排）某 reminder 的 alarm。snoozedUntil 优先。
 */
async function scheduleAlarm(reminder, now = Date.now()) {
  await chrome.alarms.clear(reminder.id)
  const when = reminder.snoozedUntil ?? nextOccurrence(reminder.rule, reminder.firstAt, now, reminder.lastFiredAt)
  if (when) await chrome.alarms.create(reminder.id, { when })
}

export async function addReminder(todoId, partial) {
  const reminder = {
    id: ridFor(),
    firstAt: partial.firstAt,
    rule: partial.rule || 'once',
    snoozedUntil: null,
    lastFiredAt: null,
    lastCompletedAt: null,
    createdAt: Date.now(),
  }
  const all = await listTodos()
  const idx = all.findIndex(t => t.id === todoId)
  if (idx === -1) throw new Error(`todo ${todoId} not found`)
  all[idx] = { ...all[idx], reminders: [...(all[idx].reminders || []), reminder] }
  await setStorage(KEYS.todos, all)
  await scheduleAlarm(reminder)
  return reminder
}

export async function updateReminder(todoId, reminderId, patch) {
  const all = await listTodos()
  const idx = all.findIndex(t => t.id === todoId)
  if (idx === -1) throw new Error(`todo ${todoId} not found`)
  const reminders = (all[idx].reminders || []).map(r =>
    r.id === reminderId ? { ...r, ...patch } : r
  )
  all[idx] = { ...all[idx], reminders }
  await setStorage(KEYS.todos, all)
  const updated = reminders.find(r => r.id === reminderId)
  if (updated) await scheduleAlarm(updated)
  return updated
}

export async function removeReminder(todoId, reminderId) {
  const all = await listTodos()
  const idx = all.findIndex(t => t.id === todoId)
  if (idx === -1) return
  all[idx] = {
    ...all[idx],
    reminders: (all[idx].reminders || []).filter(r => r.id !== reminderId),
  }
  await setStorage(KEYS.todos, all)
  await chrome.alarms.clear(reminderId)
}

export async function snoozeReminder(todoId, reminderId, untilTs) {
  return await updateReminder(todoId, reminderId, { snoozedUntil: untilTs })
}

export async function completeReminderCycle(todoId, reminderId, now = Date.now()) {
  const all = await listTodos()
  const idx = all.findIndex(t => t.id === todoId)
  if (idx === -1) return
  const reminder = (all[idx].reminders || []).find(r => r.id === reminderId)
  if (!reminder) return

  const patchedReminder = { ...reminder, lastCompletedAt: now, snoozedUntil: null }
  const reminders = all[idx].reminders.map(r => r.id === reminderId ? patchedReminder : r)

  // 一次性 reminder 完成且 todo 没其他活跃 reminder → todo 也完成
  const isOnce = reminder.rule === 'once'
  const otherActive = reminders.some(r => r.id !== reminderId && r.rule !== 'once')
  if (isOnce && !otherActive) {
    all[idx] = { ...all[idx], reminders, status: 'done', completedAt: now }
    await setStorage(KEYS.todos, all)
    await chrome.alarms.clear(reminderId)
    return
  }

  all[idx] = { ...all[idx], reminders }
  await setStorage(KEYS.todos, all)
  if (isOnce) {
    await chrome.alarms.clear(reminderId)
  } else {
    await scheduleAlarm(patchedReminder, now)
  }
}
```

- [ ] **Step 6: 跑测试，所有 case PASS**

```bash
npm test -- tests/reminders-storage.test.js
```

- [ ] **Step 7: 跑全套测试**

```bash
npm test
```

期望：所有既有测试 + 新测试全 PASS（合计 60+ case）。

- [ ] **Step 8: Commit**

```bash
git add extension/todos.js tests/reminders-storage.test.js
git commit -m "feat(todos): reminders schema + CRUD（add/update/remove/snooze/completeReminderCycle）"
```

---

## Task 10: background.js — alarm + notification handlers + catch-up

**Files:**
- Modify: `extension/background.js`

加 3 个 listener：
1. `chrome.alarms.onAlarm` — fire 通知 + 更新 lastFiredAt + 排下次
2. `chrome.notifications.onButtonClicked` — 处理 ✅ 完成 / 😴 推迟
3. `chrome.notifications.onClicked` — 跳新标签页 + 广播 highlight 消息

`chrome.runtime.onStartup` 已存在，扩展加 catchupMissed。

- [ ] **Step 1: 在 background.js 顶部 import 区加**

```js
import { listTodos, completeReminderCycle, snoozeReminder, updateReminder } from './todos.js'
import { nextOccurrence, previousOccurrence } from './reminders.js'
```

注意：`listTodos`/`updateTodo` 已 import；只需追加 `completeReminderCycle, snoozeReminder, updateReminder` 和 reminders.js 的两个函数。

- [ ] **Step 2: 加 alarm handler（在文件末尾）**

```js
// ============================================================
// Reminders — alarm fires + notifications
// ============================================================

const MAX_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000
const DEDUP_WINDOW_MS = 60_000

/**
 * 找到 alarm.name (= reminder.id) 对应的 todo + reminder。
 */
async function findReminderTarget(reminderId) {
  const all = await listTodos()
  for (const t of all) {
    const r = (t.reminders || []).find(x => x.id === reminderId)
    if (r) return { todo: t, reminder: r }
  }
  return null
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith('rmd_')) return
  const target = await findReminderTarget(alarm.name)
  if (!target) {
    await chrome.alarms.clear(alarm.name).catch(() => {})
    return
  }
  const { todo, reminder } = target

  // skip 已完成的一次性 reminder
  if (todo.status === 'done' && reminder.rule === 'once') {
    await chrome.alarms.clear(alarm.name).catch(() => {})
    return
  }

  const settings = await getSettings()
  const snoozeMin = settings.defaultSnoozeMin || 30

  // 弹通知
  try {
    chrome.notifications.create(reminder.id, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: todo.text.slice(0, 50) || '提醒',
      message: '',
      contextMessage: 'Tab Out + Todo',
      buttons: [
        { title: '✅ 完成' },
        { title: `😴 推迟 ${snoozeMin} 分钟` },
      ],
      priority: 1,
      requireInteraction: false,
    })
  } catch (e) {
    console.warn('notifications.create failed', e)
  }

  // 更新 lastFiredAt + 清 snoozedUntil + 排下次
  const now = Date.now()
  await updateReminder(todo.id, reminder.id, { lastFiredAt: now, snoozedUntil: null })
  // updateReminder 会重新 scheduleAlarm；因为 snoozedUntil 已清，nextOccurrence 走 rule 算
})

chrome.notifications.onButtonClicked.addListener(async (notifId, btnIdx) => {
  if (!notifId.startsWith('rmd_')) return
  const target = await findReminderTarget(notifId)
  if (!target) return
  const { todo, reminder } = target
  const settings = await getSettings()
  const snoozeMin = settings.defaultSnoozeMin || 30

  if (btnIdx === 0) {
    await completeReminderCycle(todo.id, reminder.id)
  } else if (btnIdx === 1) {
    await snoozeReminder(todo.id, reminder.id, Date.now() + snoozeMin * 60_000)
  }
  chrome.notifications.clear(notifId)
})

chrome.notifications.onClicked.addListener(async (notifId) => {
  if (!notifId.startsWith('rmd_') && !notifId.startsWith('catchup_')) return
  chrome.notifications.clear(notifId)
  // 打开新标签页 → 等 app.js listener 注册 → 广播 highlight
  await chrome.tabs.create({ url: 'chrome://newtab', active: true })
  setTimeout(async () => {
    try {
      if (notifId.startsWith('rmd_')) {
        const target = await findReminderTarget(notifId)
        if (target) {
          await chrome.runtime.sendMessage({
            type: 'reminder-clicked',
            todoId: target.todo.id,
            reminderId: target.reminder.id,
          })
        }
      } else if (notifId.startsWith('catchup_')) {
        await chrome.runtime.sendMessage({ type: 'catchup-clicked' })
      }
    } catch (e) {
      // 没有 listener 时 sendMessage 会 reject，吞掉
    }
  }, 500)
})

/**
 * 启动时跑：找过去 7 天内"应该 fire 但没 fire"的 reminders，聚合一条通知；
 * 同时重建所有 reminders 的 alarm（alarm 在 chrome restart 后可能丢）。
 */
async function catchupMissed() {
  const todos = await listTodos()
  const now = Date.now()
  const missed = []
  for (const t of todos) {
    for (const r of (t.reminders || [])) {
      // 重建 alarm
      const next = r.snoozedUntil ?? nextOccurrence(r.rule, r.firstAt, now, r.lastFiredAt)
      if (next) {
        await chrome.alarms.clear(r.id).catch(() => {})
        await chrome.alarms.create(r.id, { when: next }).catch(() => {})
      }
      // 算上一次应触发
      const prev = previousOccurrence(r.rule, r.firstAt, now - DEDUP_WINDOW_MS)
      if (!prev) continue
      if (prev < now - MAX_LOOKBACK_MS) continue
      if (r.lastFiredAt && r.lastFiredAt >= prev) continue
      if (t.status === 'done' && r.rule === 'once') continue
      missed.push({ todo: t, reminder: r })
    }
  }
  if (missed.length === 0) return
  const titles = missed.slice(0, 3).map(m => m.todo.text).join('；')
  try {
    chrome.notifications.create('catchup_' + Date.now(), {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: `🔔 你有 ${missed.length} 条错过的提醒`,
      message: titles + (missed.length > 3 ? '...' : ''),
      contextMessage: 'Tab Out + Todo',
      priority: 1,
    })
  } catch (e) {
    console.warn('catchup notification failed', e)
  }
}

chrome.runtime.onStartup.addListener(catchupMissed)
chrome.runtime.onInstalled.addListener(catchupMissed)
```

- [ ] **Step 3: 手动 smoke test**

```
1. chrome://extensions reload 扩展
2. 打开新标签页 → Todos 视图
3. 输入 "测试 @1 分钟后" 回车
4. 等 1 分钟（保持新标签页或切到别的窗口都可）
5. 右上角应弹出 macOS 横幅通知 "测试"，2 按钮
6. 点 ✅ 完成 → 通知消失；回新标签页看到 todo 已划线进归档
7. 再创建 "测试2 @1 分钟后" → 1 分钟后再次弹通知
8. 点 😴 推迟 → 30 分钟后再弹一次
9. 命令行验证 alarms 状态：DevTools (Service worker) → console
   await chrome.alarms.getAll() → 应看到正确的 alarm 列表
```

- [ ] **Step 4: Commit**

```bash
git add extension/background.js
git commit -m "feat(bg): alarm.onAlarm + notification 按钮 + catchupMissed (启动后聚合错过提醒)"
```

---

## Task 11: settings.js + settings-panel.js — 通知行为段

**Files:**
- Modify: `extension/settings.js`
- Modify: `extension/settings-panel.js`
- Modify: `extension/index.html`

加 `notifyOnComplete` checkbox（默认 false）和 `defaultSnoozeMin` select（5/15/30/60）。

- [ ] **Step 1: 改 settings.js DEFAULT_SETTINGS**

```js
export const DEFAULT_SETTINGS = {
  layoutMode: 'toggle',
  toggleVisible: 'tabs',
  splitRatio: 0.5,
  soundEnabled: true,
  hotkeyEnabled: true,
  nativeCloseAction: 'keep',
  notifyOnComplete: false,    // 新增
  defaultSnoozeMin: 30,       // 新增
}
```

- [ ] **Step 2: index.html settingsPanel 在"快捷键"之前插入**

```html
  <h3>🔔 通知行为</h3>
  <label><input type="checkbox" id="cbNotifyOnComplete"> 完成 todo 时通知确认（默认关）</label>
  <label>默认推迟时长：
    <select id="selSnoozeMin">
      <option value="5">5 分钟</option>
      <option value="15">15 分钟</option>
      <option value="30">30 分钟</option>
      <option value="60">60 分钟</option>
    </select>
  </label>
  <details class="settings-hint-fold">
    <summary class="hint">系统通知须知</summary>
    <ul class="hint">
      <li>Chrome 必须在运行才能弹通知（后台进程在即可，无窗口也行）</li>
      <li>macOS 系统设置 → 通知 → Google Chrome 必须允许</li>
      <li>勿扰 / 专注模式下系统会强制静音</li>
      <li>错过的提醒会在 Chrome 下次启动时聚合通知（最多回溯 7 天）</li>
      <li>chrome.alarms 不保证准时，可能延后 1-2 分钟</li>
    </ul>
  </details>
```

- [ ] **Step 3: 改 settings-panel.js — wireSettingsPanel 加 listener**

在现有 `nativeCloseAction` listener 之后添加：

```js
  const cbNotify = document.getElementById('cbNotifyOnComplete')
  if (cbNotify) {
    cbNotify.addEventListener('change', async (e) => {
      await updateSettings({ notifyOnComplete: e.target.checked })
    })
  }
  const selSnooze = document.getElementById('selSnoozeMin')
  if (selSnooze) {
    selSnooze.addEventListener('change', async (e) => {
      await updateSettings({ defaultSnoozeMin: +e.target.value })
    })
  }
```

并在 `refreshPanelState` 末尾加：

```js
  const cbN = document.getElementById('cbNotifyOnComplete')
  if (cbN) cbN.checked = !!s.notifyOnComplete
  const selS = document.getElementById('selSnoozeMin')
  if (selS) selS.value = String(s.defaultSnoozeMin || 30)
```

- [ ] **Step 4: 手动 smoke test**

```
1. reload extension
2. 打开新标签页，点右下齿轮
3. 看到"🔔 通知行为"标题 + 2 个控件 + "系统通知须知"折叠区
4. 切换"默认推迟时长 = 5 分钟"
5. 关 panel 再开 → checkbox/select 状态保持
6. DevTools console: (await chrome.storage.local.get('taboutSettings')).taboutSettings → 看到 defaultSnoozeMin: 5
```

- [ ] **Step 5: Commit**

```bash
git add extension/settings.js extension/settings-panel.js extension/index.html
git commit -m "feat(settings): 通知行为段（notifyOnComplete + defaultSnoozeMin + 限制说明）"
```

---

## Task 12: reminder-popover.js — 🔔 popover UI

**Files:**
- Create: `extension/reminder-popover.js`
- Modify: `extension/index.html`
- Modify: `extension/style.css`

提供 `openReminderPopover(todoId, anchorEl)` 和 `closeReminderPopover()`。
内部从 todos.js 读取 todo 的 reminders，渲染编辑面板，保存时调 add/update/remove。

- [ ] **Step 1: index.html 在 bindPopover 后追加**

```html
<div id="reminderPopover" class="reminder-popover" hidden role="dialog" aria-label="设置提醒">
  <div class="rp-header">设置提醒</div>
  <div id="rpList" class="rp-list"></div>
  <div class="rp-actions">
    <button id="rpAdd" class="rp-add">+ 添加提醒</button>
    <div class="rp-spacer"></div>
    <button id="rpCancel" class="rp-cancel">取消</button>
    <button id="rpSave" class="rp-save">保存</button>
  </div>
</div>
```

- [ ] **Step 2: 创建 reminder-popover.js**

```js
// extension/reminder-popover.js
import { listTodos, addReminder, updateReminder, removeReminder } from './todos.js'
import { formatReminderHuman } from './reminders.js'

let _todoId = null
let _draft = []  // [{id?, firstAt, rule, _new?, _deleted?}]
let _wired = false

const REPEAT_OPTIONS = [
  { value: 'once',       label: '不重复' },
  { value: 'daily',      label: '每天' },
  { value: 'weekdays',   label: '工作日（周一~五）' },
  { value: 'weekly:Mon', label: '每周一' },
  { value: 'weekly:Tue', label: '每周二' },
  { value: 'weekly:Wed', label: '每周三' },
  { value: 'weekly:Thu', label: '每周四' },
  { value: 'weekly:Fri', label: '每周五' },
  { value: 'weekly:Sat', label: '每周六' },
  { value: 'weekly:Sun', label: '每周日' },
  { value: 'biweekly:Mon', label: '每两周一' },
  { value: 'monthly:1',  label: '每月 1 号' },
  { value: 'monthly:15', label: '每月 15 号' },
  { value: 'monthly:last', label: '每月最后一天' },
]

function fmtForInputDate(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtForInputTime(ts) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function combineDateTimeLocal(dateStr, timeStr) {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, mi] = timeStr.split(':').map(Number)
  return new Date(y, mo - 1, d, h, mi, 0).getTime()
}

function renderItem(idx, item) {
  const opts = REPEAT_OPTIONS
    .map(o => `<option value="${o.value}" ${o.value === item.rule ? 'selected' : ''}>${o.label}</option>`)
    .join('')
  return `<div class="rp-item" data-idx="${idx}" ${item._deleted ? 'hidden' : ''}>
    <input type="date" class="rp-date" value="${fmtForInputDate(item.firstAt)}">
    <input type="time" class="rp-time" value="${fmtForInputTime(item.firstAt)}">
    <select class="rp-rule">${opts}</select>
    <button class="rp-del" title="删除">🗑</button>
  </div>`
}

function refresh() {
  const root = document.getElementById('rpList')
  root.innerHTML = _draft.map((it, i) => renderItem(i, it)).join('')
}

export async function openReminderPopover(todoId, anchorEl) {
  const all = await listTodos()
  const todo = all.find(t => t.id === todoId)
  if (!todo) return
  _todoId = todoId
  _draft = (todo.reminders || []).map(r => ({ ...r }))
  if (_draft.length === 0) {
    _draft.push({
      firstAt: Date.now() + 60 * 60 * 1000,  // 默认 1 小时后
      rule: 'once',
      _new: true,
    })
  }
  refresh()
  positionPopover(anchorEl)
  if (!_wired) wirePopover()
  document.getElementById('reminderPopover').hidden = false
}

export function closeReminderPopover() {
  const p = document.getElementById('reminderPopover')
  if (p) p.hidden = true
  _todoId = null
  _draft = []
}

function positionPopover(anchorEl) {
  const p = document.getElementById('reminderPopover')
  const rect = anchorEl.getBoundingClientRect()
  // 默认在 anchor 下方；底部超界时翻到上方
  let top = rect.bottom + window.scrollY + 4
  const left = Math.min(rect.left + window.scrollX, window.innerWidth - 380)
  p.style.position = 'absolute'
  p.style.top = top + 'px'
  p.style.left = Math.max(8, left) + 'px'
  // 翻转
  requestAnimationFrame(() => {
    const pRect = p.getBoundingClientRect()
    if (pRect.bottom > window.innerHeight - 8) {
      p.style.top = (rect.top + window.scrollY - pRect.height - 4) + 'px'
    }
  })
}

function wirePopover() {
  const root = document.getElementById('reminderPopover')
  document.getElementById('rpAdd').addEventListener('click', () => {
    _draft.push({ firstAt: Date.now() + 60 * 60 * 1000, rule: 'once', _new: true })
    refresh()
  })
  document.getElementById('rpCancel').addEventListener('click', () => closeReminderPopover())
  document.getElementById('rpSave').addEventListener('click', save)
  root.addEventListener('click', (e) => {
    const del = e.target.closest('.rp-del')
    if (del) {
      const item = del.closest('.rp-item')
      const idx = +item.dataset.idx
      if (_draft[idx].id) _draft[idx]._deleted = true
      else _draft.splice(idx, 1)
      refresh()
    }
  })
  root.addEventListener('change', (e) => {
    const item = e.target.closest('.rp-item')
    if (!item) return
    const idx = +item.dataset.idx
    const dateEl = item.querySelector('.rp-date')
    const timeEl = item.querySelector('.rp-time')
    const ruleEl = item.querySelector('.rp-rule')
    _draft[idx].firstAt = combineDateTimeLocal(dateEl.value, timeEl.value)
    _draft[idx].rule = ruleEl.value
  })
  document.addEventListener('click', (e) => {
    if (root.hidden) return
    if (root.contains(e.target)) return
    if (e.target.closest('.t-reminder')) return  // 别立刻关
    closeReminderPopover()
  })
  document.addEventListener('keydown', (e) => {
    if (!root.hidden && e.key === 'Escape') closeReminderPopover()
  })
  _wired = true
}

async function save() {
  const tid = _todoId
  if (!tid) return
  for (const item of _draft) {
    if (item._deleted && item.id) {
      await removeReminder(tid, item.id)
    } else if (item._new) {
      await addReminder(tid, { firstAt: item.firstAt, rule: item.rule })
    } else if (item.id) {
      await updateReminder(tid, item.id, { firstAt: item.firstAt, rule: item.rule })
    }
  }
  closeReminderPopover()
  // 广播刷新（todos-view 监听 storage 变化）
}
```

- [ ] **Step 3: style.css 末尾追加**

```css
.reminder-popover {
  position: absolute;
  z-index: 9999;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
  padding: 16px;
  min-width: 360px;
  font-family: 'DM Sans', sans-serif;
}
.reminder-popover .rp-header {
  font-weight: 600;
  margin-bottom: 12px;
  color: #1f2937;
}
.reminder-popover .rp-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}
.reminder-popover .rp-item {
  display: grid;
  grid-template-columns: 1fr 90px 1.2fr 28px;
  gap: 6px;
  align-items: center;
}
.reminder-popover .rp-item input,
.reminder-popover .rp-item select {
  padding: 6px 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font: inherit;
}
.reminder-popover .rp-del {
  background: transparent;
  border: 0;
  cursor: pointer;
  opacity: 0.5;
  font-size: 16px;
}
.reminder-popover .rp-del:hover { opacity: 1; }
.reminder-popover .rp-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  border-top: 1px solid #e5e7eb;
  padding-top: 12px;
}
.reminder-popover .rp-spacer { flex: 1; }
.reminder-popover .rp-add {
  background: transparent;
  border: 1px dashed #d1d5db;
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
  color: #6b7280;
}
.reminder-popover .rp-add:hover { color: #4f46e5; border-color: #4f46e5; }
.reminder-popover .rp-cancel,
.reminder-popover .rp-save {
  padding: 6px 12px;
  border-radius: 6px;
  border: 0;
  cursor: pointer;
}
.reminder-popover .rp-cancel {
  background: #f3f4f6;
  color: #374151;
}
.reminder-popover .rp-save {
  background: #4f46e5;
  color: #fff;
  font-weight: 500;
}
```

- [ ] **Step 4: Commit（UI 在下个 task 接入 todos-view）**

```bash
git add extension/reminder-popover.js extension/index.html extension/style.css
git commit -m "feat(ui): reminder-popover.js — 多 reminder 编辑（date/time/rule + 增删）"
```

---

## Task 13: todos-view.js — 🔔 icon + reminder line + popover wire-up

**Files:**
- Modify: `extension/todos-view.js`
- Modify: `extension/style.css`

`renderTodoLi` 加 🔔 hover button（跟 ⭐ 🗑 🔗+ 同行）。底部多一行 "🔔 下次 XX · 每天"。

事件委托在 `app.js` —— 但因为现有逻辑都在 app.js 里，本 task 把 reminder 相关的点击委托加到 todos-view.js（保持模块内聚），或者也加到 app.js。**这里选 app.js**（跟 ⭐ 🗑 行为一致）。

- [ ] **Step 1: todos-view.js 顶部 import 区追加**

```js
import { formatReminderHuman } from './reminders.js'
```

- [ ] **Step 2: 改 renderTodoLi**

在 `delBtn` 定义后加：

```js
  const reminderBtn = !done
    ? `<button class="t-reminder" data-id="${t.id}" title="提醒" aria-label="提醒">🔔</button>`
    : ''
```

在 `bindingsHtml` 之前加：

```js
  const remindersHtml = (t.reminders && t.reminders.length > 0)
    ? renderReminderLine(t)
    : ''
```

把 li template 改为：

```js
  return `<li class="${done ? 'done' : ''}" data-id="${t.id}">
    ${checkboxBtn}
    <span class="t-text">${escapeHtml(t.text)}</span>
    ${rolloverBadge}
    ${addBindBtn}
    ${reminderBtn}
    ${pinBtn}
    ${delBtn}
    ${remindersHtml}
    ${bindingsHtml}
  </li>`
```

并在文件末尾加：

```js
function renderReminderLine(todo) {
  const r = todo.reminders[0]
  const count = todo.reminders.length
  const text = formatReminderHuman(r)
  const more = count > 1 ? `<span class="t-rem-count">×${count}</span>` : ''
  const snoozed = r.snoozedUntil ? ' t-rem-snoozed' : ''
  return `<div class="t-reminder-line${snoozed}" data-id="${todo.id}">🔔 ${escapeHtml(text)}${more}</div>`
}
```

- [ ] **Step 3: style.css 追加**

```css
.t-reminder {
  background: transparent;
  border: 0;
  cursor: pointer;
  opacity: 0;
  transition: opacity 120ms;
  padding: 2px 4px;
  font-size: 14px;
}
.todo-list li:hover .t-reminder { opacity: 0.7; }
.t-reminder:hover { opacity: 1; }
.t-reminder-line {
  flex-basis: 100%;
  font-size: 12px;
  color: #6b7280;
  margin-top: 2px;
  padding-left: 28px;
  cursor: pointer;
}
.t-reminder-line.t-rem-snoozed { color: #d97706; font-weight: 500; }
.t-reminder-line:hover { color: #4f46e5; }
.t-rem-count {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  background: #ede9fe;
  color: #4f46e5;
  border-radius: 8px;
  font-size: 10px;
}
```

- [ ] **Step 3: 在 app.js 找到现有的 todos 委托区（搜 `t-pin` 或 `t-delete`），在 listener switch 加分支**

(因为不知道精确的代码位置，先 grep。本 step 是要在 todos 点击委托里加 reminder 相关分支)

```bash
grep -n "t-pin\|t-delete\|t-add-bind" extension/app.js
```

在那段委托里追加：

```js
        const remBtn = e.target.closest('.t-reminder')
        if (remBtn) {
          e.stopPropagation()
          const todoId = remBtn.dataset.id
          const { openReminderPopover } = await import('./reminder-popover.js')
          await openReminderPopover(todoId, remBtn)
          return
        }
        const remLine = e.target.closest('.t-reminder-line')
        if (remLine) {
          e.stopPropagation()
          const todoId = remLine.dataset.id
          // 点击 reminder line 也开 popover（用 line 当 anchor）
          const { openReminderPopover } = await import('./reminder-popover.js')
          await openReminderPopover(todoId, remLine)
          return
        }
```

- [ ] **Step 4: 手动 smoke test**

```
1. reload extension
2. 打开新标签页 → Todos
3. 创建 "测试提醒"
4. hover 该 todo → 看到 🔔 icon（淡淡的）
5. 点 🔔 → 弹 reminder-popover，默认 1 小时后 + 不重复
6. 改时间为 1 分钟后 → 重复改 "每天" → 保存
7. todo 下方出现 "🔔 今天 HH:MM · 每天"
8. 等 1 分钟 → 系统通知弹出
9. 通知 ✅ → todo 仍在（重复型不归档）, 卡片下 reminder line 还在
10. 再 hover todo 点 🔔 → popover 显示已有 reminder（不是空白）
11. 点 + 添加提醒 → 多一行 → 保存 → 卡片显示 🔔 ×2
12. 删一个 → 保存 → 回到 ×1
```

- [ ] **Step 5: Commit**

```bash
git add extension/todos-view.js extension/app.js extension/style.css
git commit -m "feat(ui): 🔔 hover icon + 卡片底部 reminder 行 + popover 接入"
```

---

## Task 14: app.js — 处理 notification-clicked 消息

**Files:**
- Modify: `extension/app.js`

收到 `reminder-clicked` / `catchup-clicked` 消息时，切到 Todos 视图、滚到 todo、临时高亮。

- [ ] **Step 1: 在 app.js 找到现有的 chrome.runtime.onMessage 处理（搜 'tab-closed-while-bound'）**

```bash
grep -n "tab-closed-while-bound\|onMessage" extension/app.js
```

在该 listener 内（或新增一个）加：

```js
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || !msg.type) return
  if (msg.type === 'reminder-clicked') {
    // 切到 Todos
    const layoutRoot = document.getElementById('layout-root')
    if (layoutRoot && layoutRoot.dataset.visible === 'tabs') {
      const btn = document.querySelector('#toggleViewBtn span[data-target="todos"]')
      if (btn) btn.click()
    }
    // 滚到目标 todo
    setTimeout(() => {
      const li = document.querySelector(`li[data-id="${msg.todoId}"]`)
      if (li) {
        li.scrollIntoView({ behavior: 'smooth', block: 'center' })
        li.classList.add('t-flash')
        setTimeout(() => li.classList.remove('t-flash'), 2400)
      }
    }, 300)
  }
  if (msg.type === 'catchup-clicked') {
    const layoutRoot = document.getElementById('layout-root')
    if (layoutRoot && layoutRoot.dataset.visible === 'tabs') {
      const btn = document.querySelector('#toggleViewBtn span[data-target="todos"]')
      if (btn) btn.click()
    }
  }
})
```

注意：若现有已有 `chrome.runtime.onMessage.addListener`，加分支即可，不重复 add listener。

- [ ] **Step 2: style.css 加 t-flash**

```css
.todo-list li.t-flash {
  animation: t-flash-anim 2.4s ease;
}
@keyframes t-flash-anim {
  0%   { background: #fde68a; }
  100% { background: transparent; }
}
```

- [ ] **Step 3: 手动 smoke test**

```
1. 创建 "测试3 @1 分钟后" 然后切到别的窗口
2. 通知弹出后，点通知本体（不是按钮）
3. 切到新标签页，应自动 Todos 视图 + 该 todo 黄色高亮 2 秒
```

- [ ] **Step 4: Commit**

```bash
git add extension/app.js extension/style.css
git commit -m "feat(app): 点通知跳新标签页 → 切 Todos + 黄色高亮 2.4s"
```

---

## Task 15: README — reminder smoke test

**Files:**
- Modify: `README.md`

在现有 smoke test 列表后加新 section。

- [ ] **Step 1: 编辑 README.md，在"**多标签页同步**"那一段后加**

```markdown
**🔔 系统通知（新增 v1.1）**

> 重复规则当前支持 9 个预设（不重复 / 每天 / 工作日 / 每周X / 每两周X / 每月N / 每月最后一天 / 每年 M 月 D 日）；任意自定义 RRULE 子集 v1.2 提供。

- [ ] 首次启用 → Chrome 弹 macOS 通知授权 → 系统设置 → 通知 → Google Chrome 可见"允许"
- [ ] 输入框打 `测试 @1 分钟后` 回车 → 1 分钟后右上角弹横幅通知
- [ ] 通知点 ✅ 完成 → todo 划线进归档
- [ ] 通知点 😴 推迟 → 30 分钟后再弹一次
- [ ] 输入框打 `喝水 @9:00 ~每天`（取一个未来时间）→ 弹一次后明天同一时刻自动再排
- [ ] todo hover → 🔔 icon 出现 → 点击 → reminder popover 弹出
- [ ] popover 改时间 + 重复 → 保存 → 卡片底部出现"🔔 下次 XX · 每天"
- [ ] popover 点 + 添加提醒 → 多一行 → 保存 → 卡片显示"🔔 ×2"
- [ ] 设置面板"🔔 通知行为"切默认推迟 = 5 分钟 → 下次通知按钮文案变"😴 推迟 5 分钟"
- [ ] 关 Chrome 完全退出 → 5 分钟后再开 → 错过的提醒弹聚合通知 "🔔 你有 X 条错过的提醒"
- [ ] 点聚合通知 → 自动切 Todos 视图
```

- [ ] **Step 2: 同时把顶部"核心特性"列表加一条**

在 `- ✅ 100% 本地存储` 之前插入：

```markdown
- ✅ Mac 系统通知（任意时间点 + 重复规则 + 通知按钮 ✅完成 / 😴推迟）
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README +系统通知特性 +reminder smoke test"
```

---

## Task 16: 最终全量 smoke test

**Files:** 无文件改动，纯手动验证

跑一遍 README 里的 reminder smoke test 清单。

- [ ] **Step 1: chrome://extensions reload 一次**

- [ ] **Step 2: 按 README §"🔔 系统通知"一条条勾**

每条 FAIL 都得回到对应 task 修。

- [ ] **Step 3: 跑全量单测**

```bash
npm test
```

期望：所有测试 PASS（含原有 45+ 新加 ~80 = 125+ cases）。

- [ ] **Step 4: 看 service worker console 是否有未捕获错误**

```
chrome://extensions → Tab Out + Todo → "Service worker" 链接 → DevTools console
应无红色错误。alarms / notifications 调用正常打 log。
```

- [ ] **Step 5: 若全 PASS，bump version 并 commit**

`extension/manifest.json`:

```json
"version": "1.1.0",
```

```bash
git add extension/manifest.json
git commit -m "release: v1.1.0 — Mac 系统通知 + 时间提醒 + 重复规则"
```

---

## 实施小结

| Task | 文件 | 测试 |
|------|------|------|
| 1 | manifest.json | 手动 reload |
| 2 | reminders.js（时间） | 48 cases |
| 3 | reminders.js（重复） | 13 cases |
| 4 | reminders.js (nextOccurrence: once/daily/weekdays/weekly/biweekly) | 14 cases |
| 5 | reminders.js (nextOccurrence: monthly/yearly) | 9 cases |
| 6 | reminders.js (previousOccurrence) | 10 cases |
| 7 | reminders.js (formatReminderHuman) | 13 cases |
| 8 | input-parser.js | 3 cases |
| 9 | todos.js + reminders-storage.test.js | 8 cases |
| 10 | background.js | 手动 |
| 11 | settings.js + settings-panel.js + index.html | 手动 |
| 12 | reminder-popover.js + style.css | 手动 |
| 13 | todos-view.js + style.css + app.js | 手动 |
| 14 | app.js + style.css | 手动 |
| 15 | README.md | — |
| 16 | manifest.json (version bump) | 全量 smoke + 全测试 |

**累计：16 task · 14 commit · 约 118 自动化 case · ~12-15 手动验证项。**
