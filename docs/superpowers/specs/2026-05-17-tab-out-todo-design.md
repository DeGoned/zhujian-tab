# Tab Out + Todo — 设计文档

**Date:** 2026-05-17
**Status:** Design — ready for implementation planning
**Builds on:** [tab-out](https://github.com/zarazhangrui/tab-out) by Zara

---

## 1. 背景与目标

### 1.1 用户场景

用户是项目经理，日常同时跟进多个项目：协调人员、跟进任务进度、回复关键消息。

当前痛点：

- **捕获摩擦**：随手记的事都丢进 WeChat 自言自语群（"1234"列出来）。写下来主要是"清空脑子"，不是为了管理。
- **遗忘**：大多数时候忘了打开 WeChat 群回看，事情就漏了。
- **上下文丢失**：记事的地方和工作场所（浏览器各种文档 / 邮件 tab）割裂，做某件事时还要再翻找资料。
- **多项目混杂**：没有按项目结构化，事情一多就乱。

### 1.2 目标

在 [tab-out](https://github.com/zarazhangrui/tab-out)（一个把新标签页变成 tab 仪表盘的 Chrome 扩展）基础上，添加待办管理。让用户每次打开新标签页都同时看到 tabs 和 todos，不需要在多个 app 间切换。

**核心价值**：

1. **永不遗忘**：每开新标签页都被强制顶到眼前。
2. **极速捕获**：至少和 WeChat 自言自语一样快（一行一句、回车即存），最好更快（全局快捷键召唤）。
3. **深度上下文**：todo 可以绑定 1 个或多个 tab；关掉绑定 tab 时主动提醒；点 todo 上的链接图标直接跳回相关 tab。
4. **项目化管理**：todo 可以归属项目；今日 view 和项目 view 双向可见（重叠模型）。

### 1.3 非目标（v1 之外）

- 团队协作 / 分享
- 云同步 / 多设备（v2）
- 移动端
- 日历集成 / AI 建议
- 富文本笔记 / 子任务（v2）

---

## 2. 架构

### 2.1 形态

- 纯 Chrome MV3 扩展（**保留 tab-out 的设计约束**：无 server、无 npm、无 build step）
- 继承 tab-out 的 `chrome_url_overrides.newtab`，替换新标签页
- 数据 100% 本地：`chrome.storage.local`
- Background service worker 处理 tab 事件 + 全局快捷键

### 2.2 文件结构

在 tab-out 现有结构上演进。当前 `app.js` 已 52KB 单文件，再加 todo 逻辑会臃肿到 80KB+。在 v1 做 **轻度模块化**：

```
extension/
├── manifest.json              # 新增 commands、scripting/notifications/contextMenus 权限
├── background.js              # 既有 + 新增：command 监听、tab close 监听、capture 浮窗注入
├── index.html                 # 既有 + 增加 todos 区 + 布局模式容器
├── style.css                  # 既有 + 增加 todos / projects / modal / divider 样式
├── content/                   # 新增：注入到任意页面的脚本
│   └── capture-overlay.js     # 浮窗输入 UI（B 模式触发）
├── app.js                     # 入口 / orchestrator（瘦下来）
├── tabs.js                    # 从 app.js 拆出：tab 分组与渲染逻辑
├── todos.js                   # 新增：todo CRUD 与渲染
├── projects.js                # 新增：project CRUD 与渲染
├── binding.js                 # 新增：todo ↔ tab URL 绑定与状态
├── storage.js                 # 新增：chrome.storage 薄封装（v2 易切 sync）
├── ui.js                      # 新增：toast / modal / confetti / 音效（与 tabs 共享）
├── layout.js                  # 新增：3 种布局模式 + 隔离线拖拽
└── icons/                     # 既有
```

**不引入框架**（保持 tab-out 的"打开即用"承诺）。多个 `<script>` 标签按依赖顺序加载即可。

### 2.3 兼容性

- 必须保留 tab-out 现有全部功能（按 domain 分组、Saved for later、duplicate 检测、关闭动画/音效、homepage 卡片）。
- 现有 `chrome.storage.local` 数据（如 saved-for-later 列表）**原样保留**，与 todo 数据共存。新增 key 不冲突。
- 现有 manifest permissions（`tabs`, `activeTab`, `storage`）需要增量：
  - `commands` — 全局快捷键
  - `scripting` — 浮窗注入
  - `notifications` 或在新标签页内 toast — tab 关闭后兜底提示
  - 可选 `contextMenus` — 右键菜单（v2 才需要）

---

## 3. 数据模型

### 3.1 Schema

```ts
type Project = {
  id: string                              // uuid
  name: string
  color: 'purple' | 'orange' | 'green' | 'blue' | 'red'
  archived: boolean                       // 全部 todos 完成后自动 true
  createdAt: number                       // unix ms
  order: number                           // 显示顺序（v1 按 createdAt 升序，v2 拖拽改写）
}

type Todo = {
  id: string                              // uuid
  text: string
  status: 'pending' | 'done'
  projectId: string | null                // null = 无项目
  pinnedToday: boolean                    // 是否挂"今日" view
  boundUrls: string[]                     // 绑定的 tab URL（0/1/N），URL 用 normalize 后形式
  createdAt: number
  completedAt: number | null
  rolloverCount: number                   // 滚动天数，用于显示 +Nd 徽标
  lastRolloverDate: string | null         // 'YYYY-MM-DD'，避免一天多次滚动
  order: number                           // v1 创建顺序，v2 拖拽
  notes: string                           // v2 才显示 UI，v1 留空字段
}
```

### 3.2 "今日"是 view 不是分类

今日 view 的查询规则（重叠模型）：

```
todayView = todos.filter(t =>
  t.status === 'pending' && (
    t.pinnedToday === true                                  // 显式挂今日
    || (t.projectId === null && isToday(t.createdAt))       // 今日新建的无项目 todo
    || (t.projectId === null && t.rolloverCount > 0)        // 之前滚动来的无项目 todo
  )
) ∪ todos.filter(t =>
  t.status === 'done' && isToday(t.completedAt)             // 今天完成的（用于"历史"折叠区）
)
```

**关键约束**：项目 todo **必须** 显式 `pinnedToday=true` 才进今日；无项目 todo 自动进今日（除非用户手动从今日移走，v1 暂不支持移走）。

### 3.3 URL Normalize（绑定的稳定标识）

`boundUrls` 不能用 `chrome.tabs.id`（重启变），必须用 URL。但 URL 也有变体：
- `https://figma.com/file/abc?theme=dark#section` → fragment 和 query 大多无关
- 同一文档可能 `figma.com` 或 `www.figma.com`

**v1 策略**（保守，先不丢信息）：
- 默认：存 **完整 URL**（含 query、fragment）
- 匹配判定（计算 🟢/⚪）：与开放 tabs 的 URL **完整匹配**
- 后续可以做 fuzzy 匹配（v2）

### 3.4 Storage 布局

```
chrome.storage.local:
  taboutTodos: Todo[]
  taboutProjects: Project[]
  taboutSettings: {
    layoutMode: 'split-h' | 'split-v' | 'toggle'         // 默认 'toggle'
    toggleVisible: 'tabs' | 'todos'                       // 模式 3 当前显示，默认 'tabs'
    splitRatio: number                                    // 0–1，分区位置（默认 0.5）
    hotkeyEnabled: boolean                                // 默认 true
    soundEnabled: boolean                                 // 默认 true
  }
  taboutBindingsCache: { [url: string]: string[] }       // url -> todoIds 反向索引，每次写 todos 时重建
  taboutUrlTitles: { [url: string]: string }             // url -> title 快照，绑定时记录，tab 关闭后仍能显示名字
  // 现有 tab-out 数据（saved-for-later 等）保留不变
```

**反向索引**（`taboutBindingsCache`）：每次 todo 写入时重建。让 `chrome.tabs.onRemoved` 能在 O(1) 时间内判断"被关的 URL 有没有绑定"。

**标题缓存**（`taboutUrlTitles`）：绑定时记录当前 tab title，绑定显示行（§6.2）使用此缓存——即使 tab 关闭后也能显示名字而不是裸 URL。后续如果同 URL 用更新的 title 再次被绑定，覆盖更新。

### 3.5 数据迁移

首次启动检测：

- 旧数据（`taboutTodos`/`taboutProjects` 不存在）→ 初始化为空数组。
- 已有 tab-out 用户的 saved-for-later 数据原样保留，不动。

---

## 4. 布局系统

### 4.1 三种模式

| 模式 | 标识 | 描述 |
|---|---|---|
| 模式 1 | `split-h` | 左右分区，Tabs 左 / Todos 右；中间 6px 垂直隔离线 |
| 模式 2 | `split-v` | 上下分区，Tabs 上 / Todos 下；中间 6px 水平隔离线 |
| 模式 3 | `toggle` | 整页切换，右上角按钮 `Tabs ⇄ Todos`；同一时刻只显示一个 |

**默认值**：`toggle` 模式，`toggleVisible='tabs'`（接近原 tab-out 体感）。

### 4.2 隔离线行为（仅分区模式）

- 默认颜色：`#e5e5e5`（淡灰）
- Hover：变 `#8b5cf6`（紫，accent）+ cursor 改为 `col-resize` / `row-resize`
- 拖拽：实时改 `splitRatio` 并写入 storage
- 拖拽结束 200ms 后回落到淡灰
- 双击：重置为 0.5

### 4.3 模式切换 UI

- 整页切换按钮（右上角）：模式 3 下显示，单击切 `toggleVisible`
- 设置面板：齿轮图标（页脚右侧）→ 弹小 popover，选模式、切音效

### 4.4 边界

- 视口宽度 < 720px 时强制 `split-v`（左右分区在窄屏不可用）
- Saved for later 始终留在 Tabs 区域内（既不进 Todos，也不独立成第三块）

---

## 5. 捕获系统

### 5.1 模式 A — 顶部常驻输入框

- 位置：Todos view 顶部，永远可见
- placeholder：`输入待办，回车保存。打 # 选项目`
- 行为：
  - 回车 → 创建 todo，清空输入框
  - 文本中含 `#name` → 解析项目（fuzzy match 已有，匹配不到则新建）
  - 自动聚焦：在 Todos view 切入时聚焦到输入框（除非有其他 focus）

### 5.2 模式 B — 全局快捷键浮窗

- 触发：默认 `Cmd+Shift+Space`（macOS）/ `Ctrl+Shift+Space`（Windows/Linux）。在 manifest.json `commands` 段配置，Chrome 自动按平台映射
- 用户改键：通过 Chrome 原生 `chrome://extensions/shortcuts`，**v1 不做自定义 UI**
- 显示：当前页面注入半透明遮罩 + 中央浮窗（content script `capture-overlay.js`）
- 浮窗结构：
  - 单行输入框（自动 focus）
  - 复选框 `☑ 绑定当前 tab`（**默认勾选**；可取消）
  - 提示文字：`⏎ 保存  ·  Esc 取消`
- 提交：
  - Enter → 创建 todo（如勾选则 `boundUrls = [当前 tab URL]`，否则空）
  - Esc / 点遮罩 → 关闭浮窗
- 浮窗样式：与 tab-out 视觉一致（圆角、紫色 accent、阴影）

### 5.3 `#` 项目内联语法

- 用户在任一输入框打 `#`，下方弹下拉：
  - 已有项目按 fuzzy 匹配优先排序，颜色 chip 显示
  - 顶部：`↩ 新建项目 "<input>"`（仅当输入非空且不与已有同名）
- 上下方向键导航，回车选择，Esc 取消
- 选中后 `#name` 变为内联 chip（`<span class="proj-chip">XX 项目</span>`，不可编辑）
- 一个 todo 只能属于一个项目；再打 `#` 会替换前者
- **新建项目**：颜色按 5 色调色板（紫/橙/绿/蓝/红）轮转分配（按已有项目数 mod 5），用户事后可在项目卡 ⋯ 菜单改色

### 5.4 新建 todo 的"落点"规则

提交时根据是否含项目决定 view 归属：

| 输入 | projectId | pinnedToday | 出现在 |
|---|---|---|---|
| `催小李合同`（无 `#`） | null | false | **今日**（自动，因 `isToday(createdAt)` 命中） |
| `催小李合同 #合同流程` | 项目 id | false | **项目（合同流程）**，不在今日 |
| `催小李合同 #合同流程` 后用户点 ⭐ | 项目 id | true | **今日 + 项目** 都在 |

**默认设计选择**：项目 todo 不自动挂今日。理由——用户带 `#项目` 输入时，意图多是"记到项目里下次跟"，不是"今天就要做"。如要"今天就要做某项目里的事"，hover ⭐ 一次即可（一次点击成本，可接受）。

未来如发现这一步成为高频痛点（v2 用户反馈），可加输入语法 `#项目!`（带感叹号）= 新建并自动挂今日。

---

## 6. 绑定系统

### 6.1 三种绑定创建方式（v1）

1. **从 Tab 侧** — 每个 tab 卡片 hover 出现 `→ Todo` 紫色小按钮。点击弹出 popover：
   - 顶部输入框 — 打字直接新建 todo，回车保存（此 todo 自动绑定该 tab；`#` 可指定项目）
   - 下方列表 — 搜索 / 选择已有 todo 加绑
2. **从 Hotkey 浮窗** — 已述（§5.2），复选框 `☑ 绑定当前 tab` 默认勾上。
3. **从 Todo 侧** — todo 卡片 hover 出现 `🔗 +` 按钮。点击 → 弹出 popover 列出所有当前打开 tabs（含标题 + favicon）→ 多选 → 确认。

**不做**（v2 再说）：拖拽 / 右键菜单。

### 6.2 绑定显示

每个 todo 在文本下方按行列出 boundUrls：

```
☐ 跟进 XX 项目设计评审
  🟢 Figma · 设计稿 v3        [×]   ← hover 出现 × 解绑
  🟢 飞书 · 需求文档           [×]
  ⚪ Gmail · 设计师回复 (已关闭) [×]
```

- 🟢 = 该 URL 在某个开放 tab 中（点击 → `chrome.tabs.update` 跳转）
- ⚪ = 该 URL 不在任何开放 tab（点击 → `chrome.tabs.create` 重新打开）
- × hover 出现，点击 → 从 `boundUrls` 移除

**标题缓存**：boundUrl 第一次绑定时记下当时 tab title，后续显示用缓存值（即使 tab 关闭也有名字）—— 存储 key `taboutUrlTitles`，详见 §3.4。

### 6.3 关 Tab 提醒（重要限制）

用户选了"强提醒 modal"，但 Chrome 扩展 API 在不同关闭路径下能力不同。**v1 设计**：

| 关闭路径 | 行为 |
|---|---|
| 在 tab-out 新标签页内点 X | 完全控制 → 弹我们的 3 按钮 modal（阻塞，必须选） |
| 在 tab-out 内"Close all N tabs" | 同上，预先聚合所有受影响 todos，一次性 modal |
| 浏览器 tab bar 关闭 / `Cmd+W` | 无法真正阻塞。`chrome.tabs.onRemoved` 事件触发后：在所有打开的 tab-out 新标签页里弹一个 5 秒 auto-dismiss toast：`🔗 刚关闭的 tab 关联了 N 个未完成 todo · [↶ 撤销关闭] [✓ 标完成]`。`撤销关闭` 通过 `chrome.tabs.create({url})` 重开。 |
| 整个浏览器退出 | 不打扰（不可能） |

**Modal 设计**（路径 1、2）：

```
┌──────────────────────────────────────────┐
│   即将关闭的 tab 关联了未完成 todo：       │
│                                          │
│   ☐ 催小李合同                            │
│   ☐ 跟进 XX 项目设计评审  (此 todo 还绑了)│
│       🟢 飞书 · 需求文档                  │
│                                          │
│  [ ✓ 标完成 ]  [ 关 todo 不管 ]  [ 取消 ] │
└──────────────────────────────────────────┘
```

- "✓ 标完成"：把相关 todos 全部 `status='done'`，然后继续关 tab
- "关 todo 不管"：todos 保持 pending，但解除 boundUrls 中的这个 URL（再不打扰）
- "取消"：什么都不做，tab 不关
- 视觉：tab-out 同款风格（Newsreader 衬线标题、紫 accent、阴影）
- **触发条件**：被关 tab 的 URL ∈ 某个 pending todo 的 boundUrls

**对用户透明说明**：路径 3（从浏览器原生 UI 关闭）只能事后 toast，不能阻塞。这是 Chrome 扩展 API 的硬限制，必须接受。

---

## 7. 生命周期行为

### 7.1 勾选完成

触发：点 todo 左侧 `☐` checkbox → 立即 `status='done'`、`completedAt=Date.now()`。

视觉反馈（**重用 tab-out 的关 tab 动画**）：

1. checkbox 变 `☑`
2. 文本划线 + 渐变到 40% 透明
3. 播放 swoosh 音效（受 `soundEnabled` 控制）
4. confetti 粒子从 checkbox 处爆开
5. 1.5s 后：
   - 今日 view 的无项目 todo → 滑到"📁 历史"折叠区
   - 项目 view 的 todo → 留在原位（已划线状态）
6. 项目内全部 todo 完成 → 项目卡片缩放 + 滑到"📁 已结项目"折叠区

### 7.2 "今日" 过夜规则

**触发时机**：每次 tab-out 新标签页加载时检查（用户开新标签页频次很高，几乎不会错过；不需要 setInterval）。如果用户连续多天不开新标签页，下次开时一次性把 rollover 算到位。

**算法**：

```
for each todo where status === 'pending' and lastRolloverDate !== today:
  diffDays = daysBetween(lastRolloverDate ?? createdAt, today)
  if diffDays > 0:
    rolloverCount += diffDays
    lastRolloverDate = today
```

**显示**：

- `rolloverCount === 0` → 无徽标
- `rolloverCount >= 1` → `+Nd` 徽标（淡灰 chip，hover tooltip"已拖延 N 天"）
- `rolloverCount >= 7` → 徽标变琥珀色（更醒目，但仍不弹窗）

**不主动催**：徽标只是视觉提示，无 modal、无 notification。

### 7.3 项目归档

- 项目内所有 todos `status === 'done'` → 自动 `archived = true`
- 取消归档：点"📁 已结项目"折叠区某项目右侧的 ↺ 图标 → `archived = false`
- 归档项目：
  - 不出现在主项目列表
  - 不出现在 `#` 内联匹配
  - 数据完整保留

### 7.4 删除

- Todo 删除：hover todo → 右侧 🗑 → 二次确认 toast（5 秒可撤销）
- 项目删除：hover 项目卡 → ⋯ → "删除项目"
  - 若项目内有 todos：弹 modal 二选：把 todos 转无项目 / 一并删除
- 删除不可撤销（除二次确认窗口期）

### 7.5 编辑与重新归类

- **编辑 todo 文本**：双击 todo 文本进入 inline edit；回车保存，Esc 取消
- **改项目**：在编辑模式下重新写 `#项目名`，旧 chip 自动替换
- **移出项目（变无项目）**：编辑模式删掉 `#chip`
- **解除"今日"挂载**：今日 view 中的项目 todo hover → ⭐（实心）→ 点一下变 ☆（空心）→ `pinnedToday=false`，从今日消失
- **排序**：v1 内每个 section 按 `createdAt` 升序固定；已完成的下沉到底部。`order` 字段留给 v2 拖拽用。

---

## 8. 设置面板

齿轮图标在页脚右侧，点击弹 popover：

```
布局模式
  ◉ 整页切换 (默认)
  ◯ 左右分区
  ◯ 上下分区

声音
  ☑ 勾选完成 / 关 tab 时播放音效

快捷键
  捕获 todo: Cmd+Shift+Space
  → 在 chrome://extensions/shortcuts 修改

关于
  Tab Out + Todo v1.0.0
  Based on tab-out by Zara
```

不做：主题色、字体、首次启动 tour（v2）。

---

## 9. v1 范围（必做）

- [x] tab-out 全部既有功能保留可用
- [x] 文件结构按 §2.2 拆分
- [x] 3 种布局模式 + 默认 toggle + Tabs 优先
- [x] 隔离线 hover/拖拽/自动保存
- [x] Todo + Project schema + storage 抽象
- [x] 今日 + 项目 双 view + pinnedToday 重叠模型
- [x] 捕获 A（顶部输入框，含 `#` 内联）
- [x] 捕获 B（全局快捷键浮窗，`Cmd+Shift+Space` 默认）
- [x] 项目创建：按钮 + `#` 内联
- [x] 绑定：tab 卡按钮 / 浮窗复选 / todo +tab 按钮
- [x] 绑定状态显示 🟢⚪ + 跳转/重开
- [x] 关 tab 强提醒（tab-out UI 内 modal；浏览器原生关 → toast）
- [x] 勾选 confetti + 音效
- [x] 今日过夜 +Nd 徽标
- [x] 今日已完成进折叠"历史"
- [x] 项目自动归档 + 折叠"已结项目"
- [x] 最小设置面板

## 10. v2 范围（不做，留接口）

- 拖拽（todo 排序、tab 拖到 todo 加绑）
- 搜索（todo + 历史 + 已结项目）
- Todo 备注（schema 已留 `notes`，v1 不显示）
- 子任务
- `chrome.storage.sync` 跨设备同步（v1 storage 已抽象）
- omnibox `td` 捕获
- 设置面板增强（主题、字体、声音种类）
- onboarding tour
- 批量操作（多选）

---

## 11. 关键风险与已知约束

| 风险 | 说明 | v1 应对 |
|---|---|---|
| 浏览器原生关 tab 无法阻塞 | Chrome API 限制 | 退化为 5 秒 toast，明确告知用户 |
| `app.js` 增长到难以维护 | 现有已 52KB | §2.2 模块化拆分，新增逻辑严格分文件 |
| URL fuzzy 匹配复杂度 | 同 URL 多种变体 | v1 用完整 URL 精确匹配，v2 再考虑 normalize |
| 跨多个新标签页的状态同步 | 用户同时开多个新标签页 | 用 `chrome.storage.onChanged` 广播，所有新标签页同步刷新 |
| Service worker 休眠 | MV3 service worker 不常驻 | 关键状态（绑定缓存）写 storage，事件驱动不依赖内存 |
| 数据量增长 | 项目长期积累后 todo 多 | `chrome.storage.local` 配额 5MB+，单 todo ~200B，理论 25k 条；不是 v1 问题 |
| 时区 / 跨日界定 | "今日"的语义 | 用本机时区，日期字符串 `YYYY-MM-DD`，简单且符合预期 |

---

## 12. 验收

v1 上线，用户能够：

1. 打开新标签页看到 tabs + todos（默认 Tabs 全屏，按钮切到 Todos）
2. 用 `Cmd+Shift+Space` 在任意网页召唤捕获浮窗，30 秒内记 5 件事
3. 记下的事自动归到项目（用 `#` 内联或按钮创建项目）
4. 把工作 tab 一键挂到 todo 上，关 tab 时被强提醒
5. 当天勾完 todo 有 confetti 爽感
6. 第二天打开看到昨天没做完的事自动在今日，带 `+1d` 徽标
7. 项目全完后自动归档，列表保持清爽

**反向验证**：用户原本用 WeChat 自言自语群的工作流，能 100% 被此工具替代。
