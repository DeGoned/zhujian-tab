# Todo 提醒 + Mac 系统通知 — 设计文档

**Date:** 2026-05-26
**Status:** Design — ready for implementation planning
**Builds on:** [2026-05-17-tab-out-todo-design.md](./2026-05-17-tab-out-todo-design.md)

---

## 1. 背景与目标

### 1.1 痛点

v1.0.0 完成后，所有提醒（`showToast`、关 tab `showModal`、勾选 `confetti`）都依赖**新标签页在前台**才能被用户看到。

实际场景：
- 用户在 VS Code / 微信 / 别的浏览器窗口工作，绑定的 tab 在后台被关 → 右下角 toast 弹了，但用户看不到
- 用户在做某件事时希望"15:00 提醒我回邮件"—— 现在只能依赖记忆 / 闹钟 app
- 重复性事项（"每天喝水"、"每周一汇报"）—— 现在每天都要手动新建一条

### 1.2 目标

给每个 todo 加 0 ~ N 个**时间提醒**，到点弹 macOS 系统通知。突破"必须在新标签页前台"的限制。

**核心价值：**
1. **时间触发**：到点了主动找用户，不靠用户主动看
2. **系统级呈现**：走 macOS 原生通知中心（右上角横幅 / 通知列表 / 锁屏），跟微信、邮件一样的优先级
3. **重复支持**：覆盖"每天 / 工作日 / 每周 X / 每月 X / 每年 X" 5 大主流重复模式 + 自定义子集
4. **跟现有交互融合**：沿用 inline 语法（`#项目` 的兄弟 — `@时间` `~重复`）+ todo hover 出 🔔 控件双入口

### 1.3 非目标（明确不做）

- **位置提醒**（geofence）—— Mac 不太适合
- **跨设备同步提醒** —— v1 仍 100% 本地
- **跟系统日历集成**（导入 .ics / 双向同步）
- **AI 自动建议提醒时间**
- **完整 RFC 5545 RRULE**（用预设 + 自定义子集覆盖 95% 场景，剩下 5% 不做）
- **完整自然语言解析**（"明天下午茶后提醒我"这种 — 简单 pattern 已够）

---

## 2. 数据模型

### 2.1 Todo 扩展字段

```js
todo = {
  // ... 现有 v1 字段
  id, text, projectId, doneAt, pinnedToday, createdAt, rolloverCount,
  bindings, // [{ tabId, url, title, faviconUrl }]

  // 新增
  reminders: [Reminder]  // 默认 []
}
```

### 2.2 Reminder 对象

```js
Reminder = {
  id: string,              // 'rmd_' + nanoid(8) — 全局唯一，直接用作 alarm name
  firstAt: number,         // 首次触发的 timestamp (ms)
  rule: RuleString,        // 重复规则（见下）
  snoozedUntil: number | null,    // 推迟到的时间；非 null 时优先级高于 rule 计算
  lastFiredAt: number | null,     // 上次成功 fire 的时间（用于 catch-up dedup）
  lastCompletedAt: number | null, // 上次用户在通知里点 ✅ 完成的时间（用于"本周期是否已完成"判断）
  createdAt: number,
}
```

**Alarm name 约定**：`reminder.id` 全局唯一，直接当 `chrome.alarms.create(name, ...)` 的 name 用，不再拼 todoId。反向查 `loadReminderTarget(alarmName)` 时遍历所有 todo 的 reminders 找匹配（todos 通常不会多到性能问题；如有需要再加 `reminderIdToTodoId` 索引）。

### 2.3 Rule 字符串格式

文本字符串，便于存储、迁移、调试。**完整列表：**

| Rule | 含义 | 示例 firstAt |
|------|------|-------------|
| `once` | 不重复，只 fire 一次 | 任意时刻 |
| `daily` | 每天同一时刻 | 第一天的 15:00 |
| `weekdays` | 周一到周五同一时刻 | 第一个工作日 9:00 |
| `weekly:Mon` | 每周某一天（英文三字缩写：Mon/Tue/Wed/Thu/Fri/Sat/Sun） | 第一个周一 |
| `weekly:Mon,Wed,Fri` | 每周某几天（逗号分隔） | 第一个匹配日 |
| `biweekly:Mon` | 每两周某一天 | 第一个周一 |
| `monthly:15` | 每月某一日 | 当月或下月 15 日 |
| `monthly:last` | 每月最后一日 | 当月最后一日 |
| `yearly:5-21` | 每年 MM-DD | 当年或明年 5/21 |
| `custom:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH` | 自定义，子集 RRULE | — |

**Custom 子集只支持：** `FREQ`（DAILY/WEEKLY/MONTHLY/YEARLY）、`INTERVAL`、`BYDAY`、`BYMONTHDAY`，**不支持** `BYSETPOS`、`BYWEEKNO`、`COUNT`、`UNTIL`、`BYHOUR`、`EXDATE`、时区。

### 2.4 重复 todo 完成语义（关键）

点 ☐ 完成 todo 时：

- 所有 reminders 全是 `once` 且 todo 已无 active reminder → 进归档（已有逻辑）
- 任一 reminder 是重复型 → todo **不进归档**，`doneAt` 不设。下次 fire 时把 todo 视为"未完成的新一轮"
- 具体实现：把"完成"动作绑到 reminder 而非 todo —— 每个 reminder 维护自己的 `lastCompletedAt`，UI 上 todo 的 ☑/☐ 反映"本周期是否已完成"

```js
Reminder = {
  // ... 上面的字段
  lastCompletedAt: number | null,  // 本周期的完成时间
}

// 判断 todo 是否"本周期已完成"：
function isCurrentCycleDone(todo) {
  if (!todo.reminders.length) return !!todo.doneAt;  // 无 reminder → 看 doneAt
  // 有 reminder 时：所有 reminder 都已完成本周期
  return todo.reminders.every(r => {
    const cycleStart = previousOccurrence(r.rule, r.firstAt, Date.now());
    return r.lastCompletedAt && r.lastCompletedAt >= cycleStart;
  });
}
```

### 2.5 数据迁移

旧 todo 没 `reminders` 字段。读取时默认补 `reminders: []`，**lazy migration** —— 不主动写回，只在 todo 被编辑时顺带写入。

---

## 3. Inline 解析

### 3.1 时间 pattern（`@` 前缀）

正则匹配，**优先级高的先匹配**：

| Pattern | 例子 | 解析为 |
|---------|------|--------|
| `@\d+-\d+-\d+ \d+:\d+` | `@2026-05-21 14:30` | 绝对日期时间 |
| `@\d+-\d+-\d+` | `@2026-05-21` | 当日 9:00（默认上午） |
| `@\d+/\d+ \d+:\d+` | `@5/21 14:30` | 今年/明年的 5/21 |
| `@\d+月\d+日( \d+:\d+)?` | `@5月21日 9:00` | 同上 |
| `@(明天|后天)( \d+:\d+)?` | `@明天 9:00` | 相对天数 + 时间 |
| `@(今天|今晚)( \d+:\d+)?` | `@今晚 20:00` | 今天某时 |
| `@(下?)(周|星期)[一二三四五六日天]( \d+:\d+)?` | `@下周一 9:00` | 最近匹配的星期 |
| `@(上午|下午|晚上)\d+点(\d+)?` | `@下午 3 点` / `@晚上 8 点 30` | 转 24h |
| `@\d+:\d+` | `@9:00` `@14:30` | 今天某时 |
| `@\d+点(\d+)?` | `@9 点` `@9 点 30` | 今天某时 |
| `@\d+(小时|分钟|天)后( \d+:\d+)?` | `@30 分钟后` `@3 天后 9:00` | 相对时间 |

**默认时间**：解析出日期但无时间 → 9:00。
**已过时间 fallback**：解析出"今天 X 点"但 X < now → 顺延到明天 X 点。

### 3.2 重复 pattern（`~` 前缀）

| Pattern | Rule |
|---------|------|
| `~每天` `~每日` | `daily` |
| `~工作日` `~周一到周五` | `weekdays` |
| `~每周[一二三四五六日天]` | `weekly:Mon` |
| `~每周[一二三四五六日天][一二三四五六日天]+` | `weekly:Mon,Wed,Fri` |
| `~每两周[一二三四五六日天]` | `biweekly:Mon` |
| `~每月\d+号?` | `monthly:15` |
| `~每月最后一天` | `monthly:last` |
| `~每年\d+月\d+日?` | `yearly:5-21` |

### 3.3 组合 + 抽取

输入框完整 pattern：`<text> [#project] [@time] [~repeat]`

```
回邮件 #work @下午 3 点 ~每周一三五
→ text="回邮件", projectId=work, reminder={firstAt: 周一 15:00, rule: 'weekly:Mon,Wed,Fri'}
```

**抽取规则**：识别成功的部分从 text 里删掉，识别不出的整段保留在 text。多个 `@` `~` 会被解析为多个 reminders（一个 todo 多 reminder）。

### 3.4 解析失败兜底

任何识别不出的 `@xxx` `~xxx` **不报错**、不进 reminder，原样保留在 text 里。用户后续可以双击编辑改、或点 🔔 用 UI 加。

---

## 4. UI 入口

### 4.1 入口 A：Inline 输入

沿用现有顶部输入框（在 todos 视图 + 全局快捷键浮窗里），无需 UI 改动，仅在 parser 里加 `@` `~` 识别。

### 4.2 入口 B：🔔 hover 控件

跟现有 `⭐` `🗑` `🔗+` 同一列。todo hover 出现，点击弹 popover：

```
┌─ 设置提醒 ──────────────────┐
│ ┌─ Reminder 1 ─────────┐    │
│ │ 📅 [2026-05-26 ▾]    │    │  ← native <input type="date">
│ │ 🕘 [15:00     ▾]     │    │  ← native <input type="time">
│ │ 🔁 [不重复       ▾]  │    │  ← <select>
│ │   • 不重复            │    │
│ │   • 每天              │    │
│ │   • 工作日（周一~五）  │    │
│ │   • 每周（周一）      │    │
│ │   • 每 2 周（周一）   │    │
│ │   • 每月（15 号）     │    │
│ │   • 每年（5 月 21 日）│    │
│ │   • 自定义...        │    │  ← 展开自定义面板
│ │              [🗑]    │    │  ← 删除此 reminder
│ └────────────────────┘    │
│                            │
│ [+ 添加另一个提醒]          │  ← 多 reminder
│                            │
│        [取消]   [保存]      │
└────────────────────────────┘
```

**「自定义...」展开：**

```
频率：[每 N (Days/Weeks/Months/Years) ▾]
[1] (Day|Week|Month|Year)s

[周次模式（仅 Weekly）]
[一] [二] [三] [四] [五] [六] [日]
```

Apple Reminders 等同 UI。

### 4.3 Todo 卡片显示

有 reminder 时，todo 文本下方多一行小字（灰色）：

- 1 个 reminder：`🔔 下次 周一 15:00 · 每周一三五`
- N 个 reminder：`🔔 ×3 下次 周一 15:00`，hover 展开 popover 看全部
- 推迟中：`🔔 推迟到 16:30`（高亮色）
- 已过期未触发（Chrome 没在跑）：`🔔 错过 周一 15:00`（琥珀色 + 点击补处理）

### 4.4 设置面板新增

在右下齿轮"⚙️ 设置 → 关于"上方加一段：

```
🔔 通知行为

[ ] 完成 todo 时通知确认（默认关）
默认推迟时长：[30 分钟 ▾]  ← 5/15/30/60 可选

📝 系统通知须知（点击展开）
  • Chrome 必须在运行才能弹通知
  • macOS 系统设置 → 通知 → Google Chrome 须允许
  • 勿扰模式下系统会强制静音
  • 错过的提醒会在 Chrome 下次启动时聚合通知
```

---

## 5. 通知行为

### 5.1 通知 payload

```js
chrome.notifications.create(reminder.id, {  // notification id = reminder.id = alarm name，三者对齐
  type: 'basic',
  iconUrl: 'icons/icon128.png',
  title: todo.text.slice(0, 50),                   // 截断
  message: formatContext(todo),                     // '#work · 现在 15:00'
  contextMessage: 'Tab Out + Todo',
  buttons: [
    { title: '✅ 完成' },
    { title: '😴 推迟 30 分钟' }                    // 时长从设置读
  ],
  priority: 1,                                      // 0-2，默认 0
  requireInteraction: false,                        // true 会一直挂着直到用户处理
})
```

### 5.2 用户操作 → 行为

| 操作 | 行为 |
|------|------|
| 点击通知本体 | `chrome.tabs.create({url: 'chrome://newtab', active: true})` + via storage event 通知 newtab "highlight todoId" |
| 点 ✅ 完成 | `reminder.lastCompletedAt = now`；一次性 + 无其他 active reminder → todo 进归档；重复型 → 等下次自动重启 |
| 点 😴 推迟 | `reminder.snoozedUntil = now + 30min`；重建 alarm；30 分钟后再 fire 一次（不影响下个正常周期） |
| 通知超时被自动关 | 无操作，下次正常周期再 fire；catch-up 不补 |

### 5.3 已完成 todo 的提醒

一次性提醒 fire 前先检查 todo 是否已被手动完成。已完成 → skip 不弹；重复型在新周期始终弹。

---

## 6. 实现机制：chrome.alarms + service worker

### 6.1 MV3 SW 唤醒约束

Chrome MV3 service worker 30 秒空闲就被释放。唯一可靠的定时唤醒机制是 **`chrome.alarms`** —— alarm fire 时 SW 自动复活、handler 跑完后又被释放。

**关键原则**：handler 里不能依赖任何内存状态。所有状态必须从 `chrome.storage` 读 + 写回。

### 6.2 调度策略

每个 reminder 对应一个 alarm，name 是 reminder.id：

```js
async function scheduleReminder(todoId, reminder) {
  const nextAt = reminder.snoozedUntil ?? nextOccurrence(reminder.rule, reminder.firstAt, Date.now(), reminder.lastFiredAt);
  if (nextAt) {
    await chrome.alarms.create(reminder.id, { when: nextAt });
  }
}
```

**触发**：

```js
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith('rmd_')) return;
  const { todo, reminder } = await loadReminderTarget(alarm.name);
  if (!todo || !reminder) {
    await chrome.alarms.clear(alarm.name);
    return;
  }
  await fireReminder(todo, reminder);    // 弹通知 + 更新 lastFiredAt + 清 snoozedUntil
  await scheduleReminder(todo.id, reminder);  // 排下一次
});
```

### 6.3 alarm 生命周期

| Todo / Reminder 事件 | Alarm 动作 |
|---------------------|------------|
| 新建 reminder | `alarms.create(reminder.id, { when })` |
| 编辑 reminder（时间 / 规则改） | `alarms.clear(id)` + `alarms.create(id, ...)` |
| 删除 reminder | `alarms.clear(id)` |
| 删除 todo | 遍历 reminders 全 clear |
| 完成 todo（一次性） | `alarms.clear(id)` |
| 完成 todo（重复） | 不动 alarm；下次正常 fire 时如果通过完成检查则 skip 那次 |
| 推迟 | `alarms.clear` + `alarms.create(id, { when: snoozedUntil })` |
| Chrome 启动 | 见 §7 catch-up |

### 6.4 `nextOccurrence(rule, firstAt, now, lastFiredAt)` 算法

纯函数，输入 rule + 参考时间，输出**下一次 `> now` 的触发时间**。覆盖所有 rule 类型。

伪代码：

```js
function nextOccurrence(rule, firstAt, now, lastFiredAt) {
  const baseTime = extractTimeOfDay(firstAt);  // {h, m}
  switch (rule) {
    case 'once':
      return firstAt > now ? firstAt : null;
    case 'daily':
      return nextDailyAt(baseTime, now);
    case 'weekdays':
      return nextWeekdayAt(baseTime, now);
    case 'weekly:Mon,Wed,Fri':
      return nextWeeklyAt(['Mon','Wed','Fri'], baseTime, now);
    case 'biweekly:Mon':
      return nextBiweeklyAt('Mon', baseTime, firstAt, now);
    case 'monthly:15':
      return nextMonthlyAt(15, baseTime, now);
    case 'monthly:last':
      return nextMonthlyLastAt(baseTime, now);
    case 'yearly:5-21':
      return nextYearlyAt(5, 21, baseTime, now);
    case 'custom:...':
      return nextCustomAt(parseCustom(rule), firstAt, now);
  }
}
```

**边界 case 必须有单测**：DST（macOS Chrome 用本地时区）、跨月（1 月 31 日 + monthly → 3 月 3 日还是 2 月 28 日？取 28 日）、闰年（2 月 29 日 + yearly → 非闰年取 2/28）。

---

## 7. Catch-up（错过提醒补救）

### 7.1 触发时机

```js
chrome.runtime.onStartup.addListener(catchupMissed);
chrome.runtime.onInstalled.addListener(catchupMissed);
```

### 7.2 算法

```js
async function catchupMissed() {
  const todos = await loadAllTodos();
  const missed = [];
  const DEDUP_WINDOW_MS = 60_000;  // 1 分钟内的不算"错过"
  const MAX_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;  // 只看过去 7 天

  for (const todo of todos) {
    for (const r of todo.reminders) {
      const lastShouldHaveFired = previousOccurrence(r.rule, r.firstAt, Date.now() - DEDUP_WINDOW_MS);
      if (!lastShouldHaveFired) continue;
      if (lastShouldHaveFired < Date.now() - MAX_LOOKBACK_MS) continue;
      if (r.lastFiredAt && r.lastFiredAt >= lastShouldHaveFired) continue;
      missed.push({ todo, reminder: r, missedAt: lastShouldHaveFired });
    }
    // 同时为所有 reminder 重新排 alarm（启动时 alarm 可能丢）
    for (const r of todo.reminders) {
      await scheduleReminder(todo.id, r);
    }
  }

  if (missed.length === 0) return;
  await chrome.notifications.create('catchup_' + Date.now(), {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: `🔔 你有 ${missed.length} 条错过的提醒`,
    message: missed.slice(0, 3).map(m => m.todo.text).join('；') + (missed.length > 3 ? '...' : ''),
    priority: 1,
  });
  // 点击聚合通知 → 跳新标签页 + Todos 视图顶部高亮 missed todoIds
}
```

### 7.3 `previousOccurrence`

与 `nextOccurrence` 对称的反向算法：输入 rule + now，输出**上一次 `<= now` 应该触发的时间**。同样需要完整单测。

---

## 8. manifest.json 变更

```diff
   "permissions": [
     "tabs",
     "activeTab",
     "storage",
-    "scripting"
+    "scripting",
+    "alarms",
+    "notifications"
   ],
```

无需 `host_permissions` 调整，通知不需要额外 host。

---

## 9. 文件结构演进

新增 / 改动：

```
extension/
├── manifest.json              # +alarms +notifications
├── background.js              # +alarm.onAlarm listener +onStartup catchup +notification.onButtonClicked
├── reminders.js               # 新文件：parseReminderInline / nextOccurrence / previousOccurrence
├── reminder-popover.js        # 新文件：🔔 popover UI
├── todos-view.js              # +reminder 行渲染 +🔔 hover icon
├── input-parser.js            # 既有？把 #project 解析也归到这里，加 @time ~repeat
├── style.css                  # +reminder 行样式 +popover 样式
└── (旧的不变)
```

**reminders.js 公开 API：**

```js
export function parseReminderInline(text) → { cleanText, reminders[] }
export function nextOccurrence(rule, firstAt, now, lastFiredAt?) → number | null
export function previousOccurrence(rule, firstAt, now) → number | null
export function formatReminderHuman(reminder, now) → string  // '下次 周一 15:00 · 每周一三五'
export function parseCustomRule(ruleStr) → CustomRuleObj
export function serializeCustomRule(obj) → string
```

---

## 10. 测试策略

### 10.1 单元测试

- **`parseReminderInline`**：每种 pattern × 多个 case × 边界（无空格、混合中英文、半角全角）→ 约 80 cases
- **`nextOccurrence`**：每种 rule × 边界（DST、跨月、闰年、月底）→ 约 60 cases
- **`previousOccurrence`**：同上对称 → 约 60 cases
- **`formatReminderHuman`**：每种 rule 输出 → 约 15 cases

### 10.2 集成测试（jest-chrome）

- alarm.onAlarm fire → notification.create 被调用、todo.reminder.lastFiredAt 更新
- notification button 0 点击 → todo 完成 / reminder.lastCompletedAt 更新
- notification button 1 点击 → snoozedUntil 设置 + alarm 重建
- onStartup → catchupMissed 弹聚合通知
- todo 删除 → 所有 alarm clear

### 10.3 手动 smoke test（加到 README）

按时序操作，每步都应正常：

- [ ] 首次启用 → Chrome 弹 macOS 通知授权 → 系统设置里能看到 Chrome 在"允许通知"列表
- [ ] 输入框打 `测试 @1 分钟后` 回车 → 1 分钟后右上角弹横幅通知
- [ ] 通知点 ✅ 完成 → todo 划线进归档
- [ ] 输入框打 `测试 @1 分钟后` → 1 分钟后通知点 😴 推迟 → 30 分钟后再弹
- [ ] 输入框打 `喝水 @下一分钟 ~每天` → 弹一次，明天同一时刻再弹
- [ ] todo hover 🔔 → popover 弹出 → 改时间 + 加重复 → 保存 → 卡片下方显示"下次 X"
- [ ] todo hover 🔔 → 点 "+ 添加另一个提醒" → 加第 2 个 → 卡片显示 "🔔 ×2"
- [ ] 关 Chrome（quit）→ 设一个 5 分钟后的提醒 → 不会弹（已知限制）
- [ ] Chrome 后台运行（无窗口）→ 提醒能弹
- [ ] 设一个明天 9:00 提醒 → 今晚电脑关机睡觉 → 明天 10:00 开机 → 弹聚合"你有 1 条错过的提醒"
- [ ] 设置面板切换"默认推迟时长" → 通知按钮文案跟着变

---

## 11. 已知限制（透明告知用户）

设置面板"通知行为"折叠区列出：

1. **Chrome 必须在运行**才能弹通知（后台进程在即可，无窗口也行）。完全 Quit Chrome 后提醒不会触发。
2. **macOS 系统设置 → 通知 → Google Chrome 必须允许**，否则代码不报错但通知不显示。
3. **macOS 勿扰 / 专注模式下静音**（系统强制，扩展不可控）。
4. **错过的提醒**（Mac 关机 / Chrome quit 时段）会在 Chrome 下次启动时聚合通知，**最多回溯 7 天**。
5. **chrome.alarms 不保证准时**：MV3 alarm 最小延迟约 30 秒，且系统繁忙时可能延后 1-2 分钟。
6. **chrome.notifications 最多 2 个按钮**（系统限制），所以"✅ 完成 / 😴 推迟"二选二，没有"⏭ 跳过下次"按钮。

---

## 12. 未来扩展（v2+ 不做）

- Geofence / 位置提醒
- 跨设备同步（云端 reminders）
- 自然语言 NLP 解析
- 完整 RRULE（BYSETPOS、COUNT、UNTIL）
- 系统日历双向同步
- 提醒声音自定义 / 提醒优先级（高/中/低）
- 通知聚合策略（30 分钟内多个通知合并）

---

## 13. 实施清单（概要）

按依赖顺序，详细 step-by-step 留给实施计划文档：

1. manifest.json：+alarms +notifications
2. reminders.js：parseReminderInline + nextOccurrence + previousOccurrence + formatReminderHuman 实现 + 全套单测
3. todos.js / todos-view.js：todo schema 扩展 reminders[]，hover 🔔 icon，卡片底部行
4. reminder-popover.js：popover UI（date/time/select + 多 reminder 编辑）
5. background.js：alarm.onAlarm + notification.onButtonClicked + onStartup catchup
6. 设置面板：通知行为段落 + 默认推迟时长
7. 数据迁移：lazy reminders: []
8. README：smoke test 清单更新
