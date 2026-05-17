# Tab Out + Todo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 zara 的 tab-out Chrome 扩展基础上扩展，加入待办管理（深度绑定 tab、今日/项目双 view、全局快捷键捕获、tab-out 风格 confetti），让项目经理在新标签页一次性管理 tabs + todos。

**Architecture:** 纯 Chrome MV3 扩展，无 server / 无 build。在原 tab-out 单文件 `app.js`（52KB）基础上做轻度模块化（storage / ui / tabs / todos / projects / binding / layout 分文件），共存于一个新标签页。数据全本地 `chrome.storage.local`，背景 service worker 处理 tab 事件与全局快捷键，content script 注入捕获浮窗。

**Tech Stack:**
- Chrome Manifest V3
- Vanilla JS（ES modules，多 `<script>` 顺序加载，无打包工具）
- Vitest + jsdom + jest-chrome（**仅开发期**单测；生产 extension 无 npm 依赖）
- CSS 转换 + 自定义粒子 confetti（沿用 tab-out 实现）
- Web Audio API（沿用 tab-out 合成音）

**Spec:** `docs/superpowers/specs/2026-05-17-tab-out-todo-design.md`

**Workspace:** 项目根目录 `/Users/alec/project/workspace/my/to-do/`。原 tab-out 源码在 `./tab-out/`（read-only 参考），我们的工作副本在 `./extension/`。

---

## 阶段概览

| Phase | 主题 | 任务数 |
|---|---|---|
| 0 | 工作区与测试环境搭建 | 4 |
| 1 | Storage 抽象 + UI utility 抽取 | 4 |
| 2 | Todo + Project 数据模型与 CRUD | 5 |
| 3 | 顶部捕获输入框 + `#` 内联项目（含下拉自动完成） | 5 |
| 4 | 布局系统（3 模式 + 隔离线） | 5 |
| 5 | Tab 绑定（创建 / 显示 / 解绑） | 5 |
| 6 | 全局快捷键浮窗（捕获 B） | 4 |
| 7 | 关 tab 强提醒（modal + toast） | 4 |
| 8 | 生命周期（confetti、过夜、归档） | 5 |
| 9 | 编辑 / 删除 / ⭐ / 设置 / 收尾 | 5 |

**约 46 个 task**，每个 task 2–5 步、2–5 分钟可完成。每个 task 结尾都 commit。

---

# Phase 0 · 工作区与测试环境

### Task 0.1: 复制 tab-out 源码到工作目录

**Files:**
- Create: `extension/` (从 `tab-out/extension/` 复制全部内容)

- [ ] **Step 1: 复制源码**

```bash
cp -r tab-out/extension/ ./extension
ls -la extension/
```

Expected: 列出 `app.js`, `background.js`, `index.html`, `manifest.json`, `style.css`, `icons/`。

- [ ] **Step 2: 验证 Chrome 能加载**

```bash
echo "Extension path: $(cd extension && pwd)"
```

打开 `chrome://extensions`，开启 Developer mode → Load unpacked → 选择 `extension/` 目录。**手动验证**：新开一个 tab，应该看到原 tab-out 的 dashboard（greeting + tabs 分组）。如能正常打开，说明源码完整。

- [ ] **Step 3: Commit**

```bash
git add extension/
git commit -m "chore: 复制 tab-out 源码到工作目录作为 fork 起点"
```

---

### Task 0.2: 初始化 npm + vitest 开发环境

**Files:**
- Create: `package.json`
- Create: `vitest.config.js`
- Create: `tests/setup.js`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "tab-out-todo",
  "version": "0.1.0",
  "private": true,
  "description": "Tab Out + Todo Chrome extension (dev-only npm; extension itself has zero runtime deps)",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^1.6.0",
    "jsdom": "^24.0.0",
    "jest-chrome": "^0.8.0"
  }
}
```

- [ ] **Step 2: 安装依赖**

```bash
npm install
```

Expected: `node_modules/` 出现，`package-lock.json` 生成。已经在 `.gitignore` 里排除 `node_modules`。

- [ ] **Step 3: 创建 vitest.config.js**

```js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    globals: true,
    include: ['tests/**/*.test.js'],
  },
})
```

- [ ] **Step 4: 创建 tests/setup.js（mock chrome.*）**

```js
import { chrome } from 'jest-chrome'

// 暴露到全局，供模块代码使用
globalThis.chrome = chrome

// 每个测试前重置 chrome.storage 数据
beforeEach(() => {
  chrome.storage.local.clear()
  chrome.storage.local.get.mockImplementation((keys, callback) => {
    const data = chrome.storage.local._data || {}
    if (typeof callback === 'function') callback(data)
    return Promise.resolve(data)
  })
  chrome.storage.local.set.mockImplementation((items, callback) => {
    chrome.storage.local._data = { ...(chrome.storage.local._data || {}), ...items }
    if (typeof callback === 'function') callback()
    return Promise.resolve()
  })
  chrome.storage.local.clear.mockImplementation((callback) => {
    chrome.storage.local._data = {}
    if (typeof callback === 'function') callback()
    return Promise.resolve()
  })
})
```

- [ ] **Step 5: 验证测试框架**

创建 `tests/smoke.test.js`：

```js
import { describe, it, expect } from 'vitest'

describe('test infra smoke', () => {
  it('vitest works', () => {
    expect(1 + 1).toBe(2)
  })
  it('chrome.storage mock works', async () => {
    await chrome.storage.local.set({ foo: 'bar' })
    const data = await chrome.storage.local.get('foo')
    expect(data.foo).toBe('bar')
  })
})
```

Run: `npm test`
Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.js tests/setup.js tests/smoke.test.js
git commit -m "chore: 接入 vitest + jest-chrome 单测环境（dev-only）"
```

---

### Task 0.3: 在 manifest.json 标记 fork

**Files:**
- Modify: `extension/manifest.json`

- [ ] **Step 1: 编辑 name/description**

把 `extension/manifest.json` 改为：

```json
{
  "manifest_version": 3,
  "name": "Tab Out + Todo",
  "version": "0.1.0",
  "description": "Tab Out 基础上扩展待办管理：深度绑定 tab、今日/项目双 view、全局快捷键捕获。",
  "permissions": ["tabs", "activeTab", "storage"],
  "chrome_url_overrides": { "newtab": "index.html" },
  "background": { "service_worker": "background.js" },
  "action": {
    "default_title": "Tab Out + Todo",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

权限后续 task 再加（保持每次增量最小）。

- [ ] **Step 2: Chrome 重新加载 extension，确认 name 已变为 "Tab Out + Todo"**

到 `chrome://extensions` → 点 reload 图标。

- [ ] **Step 3: Commit**

```bash
git add extension/manifest.json
git commit -m "chore: 修改 manifest name 为 'Tab Out + Todo' v0.1.0"
```

---

### Task 0.4: 加 lint / 测试 runner 提示文件

**Files:**
- Create: `README.md`（项目根，简短）

- [ ] **Step 1: 写 README.md**

```markdown
# Tab Out + Todo

Tab Out（by [Zara](https://github.com/zarazhangrui/tab-out)）的 fork，扩展待办管理能力。

## 安装（end user）

1. 克隆此 repo
2. 打开 `chrome://extensions`，开启 Developer mode
3. Load unpacked → 选择 `extension/` 目录

**不需要** npm、node、构建步骤。

## 开发

```bash
npm install        # 仅开发期依赖（测试框架）
npm test           # 跑单测
npm run test:watch # 监听模式
```

代码改完后，到 `chrome://extensions` 点 reload。

## 文档

- 设计：`docs/superpowers/specs/2026-05-17-tab-out-todo-design.md`
- 实现计划：`docs/superpowers/plans/2026-05-17-tab-out-todo.md`

## License

继承 tab-out 的 MIT。
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: 加项目根 README"
```

---

# Phase 1 · Storage 抽象 + UI utility 抽取

> 目的：在动 todo 之前，把 storage 抽出独立模块（便于 v2 切 sync），并把 tab-out 既有的 toast / confetti / sound 抽到 ui.js 供 todos 共用。**这阶段不改任何用户可见行为**，纯重构。

### Task 1.1: 创建 storage.js（薄封装）

**Files:**
- Create: `extension/storage.js`
- Test: `tests/storage.test.js`

- [ ] **Step 1: 先写测试 (RED)**

`tests/storage.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { getStorage, setStorage, onStorageChanged } from '../extension/storage.js'

describe('storage abstraction', () => {
  beforeEach(async () => {
    await chrome.storage.local.clear()
  })

  it('reads default when key not set', async () => {
    const val = await getStorage('taboutTodos', [])
    expect(val).toEqual([])
  })

  it('writes and reads back', async () => {
    await setStorage('taboutTodos', [{ id: '1', text: 'hi' }])
    const val = await getStorage('taboutTodos', [])
    expect(val).toEqual([{ id: '1', text: 'hi' }])
  })

  it('triggers onStorageChanged when written', async () => {
    let received = null
    onStorageChanged('taboutTodos', (newVal) => { received = newVal })
    // jest-chrome 模拟 onChanged 需要手动触发
    chrome.storage.onChanged.callListeners(
      { taboutTodos: { oldValue: undefined, newValue: [{ id: 'a' }] } },
      'local'
    )
    expect(received).toEqual([{ id: 'a' }])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: 3 tests FAIL with `Cannot find module '../extension/storage.js'`.

- [ ] **Step 3: 写最小实现**

`extension/storage.js`:

```js
// 薄封装 chrome.storage.local：v1 直接代理；v2 可切 chrome.storage.sync 只改这一处。
// 使用 ES module（index.html 用 type="module" 加载入口脚本）。

export async function getStorage(key, defaultValue) {
  const data = await chrome.storage.local.get(key)
  return data[key] !== undefined ? data[key] : defaultValue
}

export async function setStorage(key, value) {
  await chrome.storage.local.set({ [key]: value })
}

const _listeners = new Map() // key -> Set<callback>

export function onStorageChanged(key, callback) {
  if (!_listeners.has(key)) _listeners.set(key, new Set())
  _listeners.get(key).add(callback)
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return
  for (const [key, { newValue }] of Object.entries(changes)) {
    const set = _listeners.get(key)
    if (set) for (const cb of set) cb(newValue)
  }
})

// Storage keys 常量（避免拼写错误）
export const KEYS = {
  todos: 'taboutTodos',
  projects: 'taboutProjects',
  settings: 'taboutSettings',
  bindingsCache: 'taboutBindingsCache',
  urlTitles: 'taboutUrlTitles',
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/storage.js tests/storage.test.js
git commit -m "feat: 加 storage.js 抽象层（含 getStorage/setStorage/onStorageChanged）"
```

---

### Task 1.2: 从 app.js 抽取 confetti / sound / toast 到 ui.js

**Files:**
- Create: `extension/ui.js`
- Modify: `extension/app.js`（保留向后兼容）

- [ ] **Step 1: 在 app.js 定位三个函数的精确行号**

```bash
grep -n "^function \(showToast\|burstConfetti\|playSwoosh\)\|^const \(showToast\|burstConfetti\|playSwoosh\)" extension/app.js
```

记录每个函数的起始行和结束行（用大括号配对找）。如：

```bash
awk '/^function showToast/,/^}$/' extension/app.js   # 打印 showToast 完整定义
awk '/^function burstConfetti/,/^}$/' extension/app.js
awk '/^function playSwoosh/,/^}$/' extension/app.js
```

把三段输出**完整保存到剪贴板**，下个 step 粘贴到 ui.js。

> 如果 tab-out 当前用的是箭头函数（`const showToast = (...) => ...`）或嵌套定义，调整 awk 范围。原 tab-out 源码在 `tab-out/extension/app.js`，可对照参考。

- [ ] **Step 2: 创建 extension/ui.js，原样粘贴三个函数体**

`extension/ui.js`:

```js
// UI 工具：toast、confetti、音效。从 app.js 提取，被 tabs 和 todos 共用。

// === showToast: 从 app.js 整段复制（保持原逻辑） ===
// 粘贴 Step 1 找到的 showToast 完整代码
// 末尾加：export { showToast }

// === burstConfetti: 从 app.js 整段复制 ===
// 粘贴 Step 1 找到的 burstConfetti 完整代码
// 末尾加：export { burstConfetti }

// === playSwoosh: 从 app.js 整段复制 ===
// 粘贴 Step 1 找到的 playSwoosh 完整代码
// 改为：let _soundEnabled = true
//      function playSwoosh() {
//        if (!_soundEnabled) return
//        ...原实现
//      }
// 末尾加：export { playSwoosh }

// === 音效开关（新增）===
let _soundEnabled = true
export function setSoundEnabled(v) { _soundEnabled = v }
export function getSoundEnabled() { return _soundEnabled }
```

**重要**：保持函数实现**逐字符一致**，只在 playSwoosh 顶部加 `if (!_soundEnabled) return` 一行。其他改动放到后面 task 做。

> **注意**：本 step 创建 ui.js 并填入函数体；app.js 暂时**保留**原函数。下个 step 才会引用 ui.js 的版本。这样保证每一步都可独立 reload。

- [ ] **Step 3: 在 index.html 引入 ui.js（在 app.js 之前）**

把 `extension/index.html` 底部的：

```html
<script src="app.js"></script>
```

改为：

```html
<script type="module" src="ui.js"></script>
<script type="module" src="app.js"></script>
```

> 注意：原 app.js 不是 module。把它升级为 module 在下一个 task 处理（保持本 task 增量最小，只先加 ui.js）。

实际上为避免立刻升级 app.js 模块化，**改为不在 html 中加载 ui.js**，而是先让它存在但暂未使用。下一 task 把 app.js 升级 module 并改用 ui.js 的函数。

回退本 step 对 index.html 的修改，**只保留新建 ui.js 文件**。

- [ ] **Step 4: 手动 smoke test**

reload extension，新开 tab：tab-out 应一切正常（关 tab 时仍 swoosh + confetti、toast 仍工作）。本 step 没改运行时行为，只是添加了一个未被引用的 ui.js。

- [ ] **Step 5: Commit**

```bash
git add extension/ui.js
git commit -m "refactor: 抽取 confetti/swoosh/toast 工具到 ui.js（暂未引用）"
```

---

### Task 1.3: 把 app.js 升级为 ES module 并改用 ui.js

**Files:**
- Modify: `extension/app.js`（顶部添加 import；删除原 confetti/sound/toast 函数）
- Modify: `extension/index.html`（`<script type="module">`）

- [ ] **Step 1: 修改 index.html**

把：
```html
<script src="app.js"></script>
```

改为：
```html
<script type="module" src="app.js"></script>
```

- [ ] **Step 2: 在 app.js 顶部添加 import**

```js
import { showToast, burstConfetti, playSwoosh } from './ui.js'
```

- [ ] **Step 3: 删除 app.js 中原 confetti / playSwoosh / showToast 实现**

确保所有调用点使用 import 的版本。原函数定义删除（如果有名字冲突）或注释掉以做对比，最终删干净。

- [ ] **Step 4: 手动 smoke test**

reload extension。关 tab：必须仍有 swoosh + confetti + toast。

- [ ] **Step 5: Commit**

```bash
git add extension/app.js extension/index.html
git commit -m "refactor: app.js 升级 ES module，引用 ui.js 中的 confetti/swoosh/toast"
```

---

### Task 1.4: 创建 layout 容器 + Tabs/Todos 分区骨架（仍只显示 Tabs）

**Files:**
- Modify: `extension/index.html`
- Modify: `extension/style.css`

- [ ] **Step 1: 在 index.html 包裹 layout 容器**

把 `<body>` 内 `<div class="container">…</div>` 包到一个新结构里：

```html
<body>
  <div id="layout-root" class="layout-mode-toggle" data-visible="tabs">
    <!-- TABS 区 -->
    <div id="tabs-pane" class="pane">
      <div class="container">
        <!-- 原 tab-out 内容（greeting、dashboard-columns、footer 等）保持不变 -->
        ...
      </div>
    </div>

    <!-- TODOS 区（v0 占位） -->
    <div id="todos-pane" class="pane" hidden>
      <div class="container">
        <p class="placeholder">Todos coming soon.</p>
      </div>
    </div>

    <!-- 隔离线（仅分区模式显示，先建好 DOM） -->
    <div id="layout-divider" hidden></div>
  </div>
  …
</body>
```

- [ ] **Step 2: style.css 加最小布局规则**

```css
#layout-root.layout-mode-toggle .pane[hidden] { display: none; }
#layout-root.layout-mode-toggle .pane:not([hidden]) { display: block; }

.placeholder {
  padding: 60px 20px;
  text-align: center;
  color: var(--muted, #999);
  font-size: 14px;
}
```

- [ ] **Step 3: 手动 smoke test**

reload。新开 tab 仍显示 tabs（todos-pane 因 `data-visible="tabs"` 隐藏）。改 DOM `data-visible="todos"` 应该看见 "Todos coming soon."。

- [ ] **Step 4: Commit**

```bash
git add extension/index.html extension/style.css
git commit -m "feat: 加 layout 容器骨架（toggle 模式，默认 Tabs 可见，Todos 占位）"
```

---

# Phase 2 · Todo + Project 数据模型与 CRUD

### Task 2.1: 定义类型 + 构造函数 + 基础 CRUD（todos.js）

**Files:**
- Create: `extension/todos.js`
- Test: `tests/todos.test.js`

- [ ] **Step 1: 写测试**

`tests/todos.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { createTodo, listTodos, updateTodo, deleteTodo, completeTodo } from '../extension/todos.js'

beforeEach(async () => { await chrome.storage.local.clear() })

describe('todo CRUD', () => {
  it('create then list', async () => {
    const t = await createTodo({ text: '催小李合同' })
    expect(t.text).toBe('催小李合同')
    expect(t.status).toBe('pending')
    expect(t.pinnedToday).toBe(false)
    expect(t.boundUrls).toEqual([])
    expect(t.projectId).toBe(null)
    expect(t.rolloverCount).toBe(0)

    const all = await listTodos()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe(t.id)
  })

  it('create with projectId and boundUrls', async () => {
    const t = await createTodo({ text: '评审', projectId: 'p1', boundUrls: ['https://x.com'] })
    expect(t.projectId).toBe('p1')
    expect(t.boundUrls).toEqual(['https://x.com'])
  })

  it('update text', async () => {
    const t = await createTodo({ text: 'old' })
    await updateTodo(t.id, { text: 'new' })
    const all = await listTodos()
    expect(all[0].text).toBe('new')
  })

  it('complete sets status and completedAt', async () => {
    const t = await createTodo({ text: 'x' })
    await completeTodo(t.id)
    const all = await listTodos()
    expect(all[0].status).toBe('done')
    expect(all[0].completedAt).toBeTypeOf('number')
  })

  it('delete removes the todo', async () => {
    const t = await createTodo({ text: 'x' })
    await deleteTodo(t.id)
    const all = await listTodos()
    expect(all).toEqual([])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test`
Expected: 5 tests FAIL（module 不存在）。

- [ ] **Step 3: 写实现**

`extension/todos.js`:

```js
import { getStorage, setStorage, KEYS } from './storage.js'

function uid() {
  return 't_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

function todayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * @param {object} input
 * @returns {Promise<object>} 完整 todo 对象
 */
export async function createTodo(input) {
  const now = Date.now()
  const todo = {
    id: uid(),
    text: input.text ?? '',
    status: 'pending',
    projectId: input.projectId ?? null,
    pinnedToday: input.pinnedToday ?? false,
    boundUrls: input.boundUrls ?? [],
    createdAt: now,
    completedAt: null,
    rolloverCount: 0,
    lastRolloverDate: todayStr(),
    order: now, // v1 用 createdAt 作 order
    notes: '',
  }
  const all = await listTodos()
  all.push(todo)
  await setStorage(KEYS.todos, all)
  return todo
}

export async function listTodos() {
  return await getStorage(KEYS.todos, [])
}

export async function updateTodo(id, patch) {
  const all = await listTodos()
  const idx = all.findIndex(t => t.id === id)
  if (idx === -1) throw new Error(`todo ${id} not found`)
  all[idx] = { ...all[idx], ...patch }
  await setStorage(KEYS.todos, all)
  return all[idx]
}

export async function completeTodo(id) {
  return await updateTodo(id, { status: 'done', completedAt: Date.now() })
}

export async function deleteTodo(id) {
  const all = await listTodos()
  await setStorage(KEYS.todos, all.filter(t => t.id !== id))
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm test`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/todos.js tests/todos.test.js
git commit -m "feat: 加 todos.js 基础 CRUD（createTodo/listTodos/updateTodo/completeTodo/deleteTodo）"
```

---

### Task 2.2: Project CRUD（projects.js）

**Files:**
- Create: `extension/projects.js`
- Test: `tests/projects.test.js`

- [ ] **Step 1: 写测试**

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { createProject, listProjects, updateProject, deleteProject, archiveIfAllDone } from '../extension/projects.js'
import { createTodo, completeTodo } from '../extension/todos.js'

beforeEach(async () => { await chrome.storage.local.clear() })

describe('project CRUD', () => {
  it('create assigns a color from rotating palette', async () => {
    const p1 = await createProject({ name: 'A' })
    const p2 = await createProject({ name: 'B' })
    const p3 = await createProject({ name: 'C' })
    expect(p1.color).toBe('purple')
    expect(p2.color).toBe('orange')
    expect(p3.color).toBe('green')
  })

  it('createProject with explicit color', async () => {
    const p = await createProject({ name: 'X', color: 'red' })
    expect(p.color).toBe('red')
  })

  it('list returns all non-archived by default', async () => {
    const a = await createProject({ name: 'A' })
    const b = await createProject({ name: 'B' })
    await updateProject(b.id, { archived: true })
    const list = await listProjects()
    expect(list.map(p => p.id)).toEqual([a.id])
  })

  it('list with includeArchived returns all', async () => {
    const a = await createProject({ name: 'A' })
    const b = await createProject({ name: 'B' })
    await updateProject(b.id, { archived: true })
    const list = await listProjects({ includeArchived: true })
    expect(list).toHaveLength(2)
  })

  it('archiveIfAllDone archives when all todos in project are done; returns boolean', async () => {
    const p = await createProject({ name: 'X' })
    const t1 = await createTodo({ text: 'a', projectId: p.id })
    const t2 = await createTodo({ text: 'b', projectId: p.id })
    await completeTodo(t1.id)
    const r1 = await archiveIfAllDone(p.id)
    expect(r1).toBe(false)
    let list = await listProjects({ includeArchived: true })
    expect(list.find(x => x.id === p.id).archived).toBe(false)

    await completeTodo(t2.id)
    const r2 = await archiveIfAllDone(p.id)
    expect(r2).toBe(true)
    list = await listProjects({ includeArchived: true })
    expect(list.find(x => x.id === p.id).archived).toBe(true)

    // 已归档不重复归档
    const r3 = await archiveIfAllDone(p.id)
    expect(r3).toBe(false)
  })

  it('archiveIfAllDone returns false for a project with no todos', async () => {
    const p = await createProject({ name: 'X' })
    const r = await archiveIfAllDone(p.id)
    expect(r).toBe(false)
    const list = await listProjects()
    expect(list.find(x => x.id === p.id).archived).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试 — 期望 FAIL**

- [ ] **Step 3: 写实现**

`extension/projects.js`:

```js
import { getStorage, setStorage, KEYS } from './storage.js'
import { listTodos } from './todos.js'

const PALETTE = ['purple', 'orange', 'green', 'blue', 'red']

function uid() {
  return 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export async function createProject({ name, color }) {
  const all = await getStorage(KEYS.projects, [])
  const now = Date.now()
  const proj = {
    id: uid(),
    name,
    color: color ?? PALETTE[all.length % PALETTE.length],
    archived: false,
    createdAt: now,
    order: now,
  }
  all.push(proj)
  await setStorage(KEYS.projects, all)
  return proj
}

export async function listProjects({ includeArchived = false } = {}) {
  const all = await getStorage(KEYS.projects, [])
  return includeArchived ? all : all.filter(p => !p.archived)
}

export async function updateProject(id, patch) {
  const all = await getStorage(KEYS.projects, [])
  const idx = all.findIndex(p => p.id === id)
  if (idx === -1) throw new Error(`project ${id} not found`)
  all[idx] = { ...all[idx], ...patch }
  await setStorage(KEYS.projects, all)
  return all[idx]
}

export async function deleteProject(id) {
  const all = await getStorage(KEYS.projects, [])
  await setStorage(KEYS.projects, all.filter(p => p.id !== id))
}

/**
 * 如果项目有 todos 且全部 done，自动归档。
 * @returns {Promise<boolean>} 本次是否真正发生了归档（用于触发庆祝动画）
 */
export async function archiveIfAllDone(id) {
  const todos = await listTodos()
  const projTodos = todos.filter(t => t.projectId === id)
  if (projTodos.length === 0) return false
  if (!projTodos.every(t => t.status === 'done')) return false

  const all = await getStorage(KEYS.projects, [])
  const proj = all.find(p => p.id === id)
  if (!proj || proj.archived) return false  // 已经归档过，不重复触发

  await updateProject(id, { archived: true })
  return true
}

/** Fuzzy 匹配（用于 # 内联） */
export async function searchProjects(query, { includeArchived = false } = {}) {
  const all = await listProjects({ includeArchived })
  const q = query.toLowerCase()
  return all
    .map(p => ({ p, score: p.name.toLowerCase().includes(q) ? p.name.toLowerCase().indexOf(q) : -1 }))
    .filter(x => x.score >= 0)
    .sort((a, b) => a.score - b.score)
    .map(x => x.p)
}
```

- [ ] **Step 4: 跑测试 — 期望 PASS**

- [ ] **Step 5: Commit**

```bash
git add extension/projects.js tests/projects.test.js
git commit -m "feat: 加 projects.js（CRUD + 5 色轮转 + archiveIfAllDone + fuzzy 搜索）"
```

---

### Task 2.3: "今日 view" 聚合查询（todos.js 扩展）

**Files:**
- Modify: `extension/todos.js`
- Modify: `tests/todos.test.js`

- [ ] **Step 1: 加测试**

追加到 `tests/todos.test.js`:

```js
import { listTodayTodos, pinTodayTodo, unpinTodayTodo } from '../extension/todos.js'

describe('today view aggregation', () => {
  it('includes unpinned no-project todos created today', async () => {
    await createTodo({ text: 'a' })
    const today = await listTodayTodos()
    expect(today.pending.map(t => t.text)).toContain('a')
  })

  it('excludes project todos unless pinnedToday', async () => {
    await createTodo({ text: 'p-task', projectId: 'p1' })
    let today = await listTodayTodos()
    expect(today.pending.find(t => t.text === 'p-task')).toBeUndefined()

    const all = await listTodos()
    await pinTodayTodo(all[0].id)
    today = await listTodayTodos()
    expect(today.pending.find(t => t.text === 'p-task')).toBeDefined()
  })

  it('completed today are in done bucket', async () => {
    const t = await createTodo({ text: 'x' })
    await completeTodo(t.id)
    const today = await listTodayTodos()
    expect(today.done.map(t => t.text)).toContain('x')
    expect(today.pending.find(t => t.text === 'x')).toBeUndefined()
  })

  it('unpin removes from today', async () => {
    const t = await createTodo({ text: 'p', projectId: 'p1' })
    await pinTodayTodo(t.id)
    await unpinTodayTodo(t.id)
    const today = await listTodayTodos()
    expect(today.pending.find(x => x.text === 'p')).toBeUndefined()
  })
})
```

- [ ] **Step 2: 跑测试 — FAIL**

- [ ] **Step 3: 加实现**

追加到 `extension/todos.js`:

```js
function isToday(ts) {
  if (!ts) return false
  const d = new Date(ts)
  return todayStr() === `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

/**
 * 返回今日 view：{ pending, done }
 * pending: pinnedToday OR (无项目 且 是今日新建 / rolloverCount>0)
 * done: 今日 completedAt
 */
export async function listTodayTodos() {
  const all = await listTodos()
  const pending = all.filter(t =>
    t.status === 'pending' && (
      t.pinnedToday === true ||
      (t.projectId === null && isToday(t.createdAt)) ||
      (t.projectId === null && t.rolloverCount > 0)
    )
  ).sort((a, b) => a.createdAt - b.createdAt)
  const done = all.filter(t =>
    t.status === 'done' && isToday(t.completedAt)
  ).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
  return { pending, done }
}

export async function pinTodayTodo(id) {
  return await updateTodo(id, { pinnedToday: true })
}

export async function unpinTodayTodo(id) {
  return await updateTodo(id, { pinnedToday: false })
}
```

- [ ] **Step 4: 跑测试 — PASS**

- [ ] **Step 5: Commit**

```bash
git add extension/todos.js tests/todos.test.js
git commit -m "feat: 加 listTodayTodos 聚合查询 + pinTodayTodo/unpinTodayTodo（重叠模型）"
```

---

### Task 2.4: Settings 默认值与读写

**Files:**
- Create: `extension/settings.js`
- Test: `tests/settings.test.js`

- [ ] **Step 1: 写测试**

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { getSettings, updateSettings, DEFAULT_SETTINGS } from '../extension/settings.js'

beforeEach(async () => { await chrome.storage.local.clear() })

describe('settings', () => {
  it('returns defaults when unset', async () => {
    const s = await getSettings()
    expect(s).toEqual(DEFAULT_SETTINGS)
    expect(s.layoutMode).toBe('toggle')
    expect(s.toggleVisible).toBe('tabs')
    expect(s.splitRatio).toBe(0.5)
    expect(s.soundEnabled).toBe(true)
    expect(s.hotkeyEnabled).toBe(true)
  })

  it('merges with defaults on partial set', async () => {
    await updateSettings({ layoutMode: 'split-h' })
    const s = await getSettings()
    expect(s.layoutMode).toBe('split-h')
    expect(s.toggleVisible).toBe('tabs') // 其他保留默认
  })
})
```

- [ ] **Step 2: 跑测试 — FAIL**

- [ ] **Step 3: 实现**

`extension/settings.js`:

```js
import { getStorage, setStorage, KEYS } from './storage.js'

export const DEFAULT_SETTINGS = {
  layoutMode: 'toggle',     // 'split-h' | 'split-v' | 'toggle'
  toggleVisible: 'tabs',    // 'tabs' | 'todos'
  splitRatio: 0.5,
  soundEnabled: true,
  hotkeyEnabled: true,
}

export async function getSettings() {
  const s = await getStorage(KEYS.settings, {})
  return { ...DEFAULT_SETTINGS, ...s }
}

export async function updateSettings(patch) {
  const cur = await getSettings()
  await setStorage(KEYS.settings, { ...cur, ...patch })
}
```

- [ ] **Step 4: 跑测试 — PASS**

- [ ] **Step 5: Commit**

```bash
git add extension/settings.js tests/settings.test.js
git commit -m "feat: 加 settings.js（默认值 + 读写合并）"
```

---

### Task 2.5: 在 app.js 启动时初始化 todos / projects / settings

**Files:**
- Modify: `extension/app.js`

- [ ] **Step 1: 在 app.js 顶部加 import 和初始化**

在已有 import 后加：

```js
import { listTodos } from './todos.js'
import { listProjects } from './projects.js'
import { getSettings } from './settings.js'
import { setSoundEnabled } from './ui.js'

async function initStateBeforeRender() {
  const s = await getSettings()
  setSoundEnabled(s.soundEnabled)
  // 后续 Phase 3+ 用到 todos/projects
}

// 在原 app.js 既有的 DOMContentLoaded / init 入口里调用 initStateBeforeRender()
```

定位 app.js 既有的初始化入口（通常是 `document.addEventListener('DOMContentLoaded', …)` 或顶层 IIFE），在它内部 await 调用 `initStateBeforeRender()`。

- [ ] **Step 2: 手动 smoke test**

reload。打开 DevTools console 看无报错。tab-out 行为应一切正常。

- [ ] **Step 3: Commit**

```bash
git add extension/app.js
git commit -m "feat: app.js 启动时加载 settings，应用 soundEnabled 到 ui.js"
```

---

# Phase 3 · 顶部捕获输入框 + `#` 内联项目

### Task 3.1: 渲染 Todos pane 骨架（空状态 + 顶部输入框）

**Files:**
- Modify: `extension/index.html`
- Modify: `extension/style.css`
- Create: `extension/todos-view.js`

- [ ] **Step 1: 在 index.html 的 todos-pane 内填充骨架**

替换原占位的 `<p class="placeholder">Todos coming soon.</p>`，改为：

```html
<div id="todos-pane" class="pane" hidden>
  <div class="container">
    <header class="todos-header">
      <h1>Todos</h1>
      <div class="todos-input-wrap">
        <input id="todos-input" type="text" placeholder="输入待办，回车保存。打 # 选项目" autocomplete="off" />
      </div>
    </header>
    <div class="todos-body">
      <section class="today-col">
        <h2>今日 <span class="count" id="todayCount"></span></h2>
        <ul id="todayList" class="todo-list"></ul>
        <details class="history-fold">
          <summary>📁 历史 <span id="todayDoneCount"></span></summary>
          <ul id="todayDoneList" class="todo-list"></ul>
        </details>
      </section>
      <section class="projects-col">
        <h2>项目 <span class="count" id="projectCount"></span>
          <button class="btn-new-project" id="btnNewProject">+ 新建项目</button>
        </h2>
        <div id="projectsList"></div>
        <details class="archive-fold">
          <summary>📁 已结项目 <span id="archivedCount"></span></summary>
          <div id="archivedProjectsList"></div>
        </details>
      </section>
    </div>
  </div>
</div>
```

- [ ] **Step 2: style.css 添加最小样式**

```css
#todos-pane .container { padding: 24px; }
.todos-header h1 { font-family: 'Newsreader', serif; font-weight: 400; }
.todos-input-wrap { margin-top: 12px; }
#todos-input {
  width: 100%; padding: 10px 14px; font-size: 14px;
  border: 2px solid #8b5cf6; border-radius: 6px; outline: none;
  font-family: 'DM Sans', sans-serif;
}
.todos-body { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 20px; }
.todo-list { list-style: none; padding: 0; margin: 0; }
.todo-list li {
  padding: 8px 10px; border: 1px solid #e5e5e5; border-radius: 4px;
  margin-bottom: 6px; background: white; font-size: 13px;
}
.todo-list li.done { opacity: 0.45; text-decoration: line-through; }
.history-fold, .archive-fold { margin-top: 12px; font-size: 12px; opacity: 0.75; }
.history-fold summary, .archive-fold summary { cursor: pointer; }
.btn-new-project {
  font-size: 11px; padding: 2px 10px; border: 1px solid #ddd; background: white;
  border-radius: 10px; cursor: pointer; margin-left: 8px;
}
```

- [ ] **Step 3: 创建 todos-view.js（渲染逻辑骨架）**

```js
import { listTodos, listTodayTodos } from './todos.js'
import { listProjects } from './projects.js'

const $ = (id) => document.getElementById(id)

export async function renderTodosView() {
  await renderToday()
  await renderProjects()
}

async function renderToday() {
  const { pending, done } = await listTodayTodos()
  $('todayCount').textContent = `· ${pending.length}`
  $('todayDoneCount').textContent = `(${done.length})`
  $('todayList').innerHTML = pending.map(renderTodoLi).join('')
  $('todayDoneList').innerHTML = done.map(t => renderTodoLi(t, true)).join('')
}

async function renderProjects() {
  const projs = await listProjects()
  $('projectCount').textContent = `· ${projs.length}`
  const allTodos = await listTodos()
  $('projectsList').innerHTML = projs.map(p => renderProjectCard(p, allTodos.filter(t => t.projectId === p.id))).join('')
  // archived
  const archived = await listProjects({ includeArchived: true })
  const arr = archived.filter(p => p.archived)
  $('archivedCount').textContent = `(${arr.length})`
  $('archivedProjectsList').innerHTML = arr.map(p => `<div class="archived-proj">${escapeHtml(p.name)}</div>`).join('')
}

function renderTodoLi(t, done = false) {
  return `<li class="${done ? 'done' : ''}" data-id="${t.id}">${done ? '☑' : '☐'} ${escapeHtml(t.text)}</li>`
}

function renderProjectCard(p, todos) {
  const pending = todos.filter(t => t.status === 'pending')
  const completed = todos.filter(t => t.status === 'done')
  return `
    <div class="project-card" data-id="${p.id}" data-color="${p.color}">
      <div class="project-name">${escapeHtml(p.name)}</div>
      <ul class="todo-list">
        ${pending.map(t => renderTodoLi(t)).join('')}
        ${completed.map(t => renderTodoLi(t, true)).join('')}
      </ul>
    </div>
  `
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))
}
```

- [ ] **Step 4: app.js 引入并在 toggle 切到 todos 时调用**

在 app.js 加：

```js
import { renderTodosView } from './todos-view.js'
```

把 toggle 切到 todos 时（暂未做 toggle UI，先手动调）：测试方式——在 console 跑 `document.querySelector('#layout-root').dataset.visible='todos'; document.querySelector('#tabs-pane').hidden=true; document.querySelector('#todos-pane').hidden=false`，然后 `await renderTodosView()`。

但更简单：在 `initStateBeforeRender()` 后直接调用 `renderTodosView()` 一次（即使 todos-pane 当前 hidden，DOM 也会填充好，方便后续测试）。

- [ ] **Step 5: 手动 smoke test**

reload。在 console 把 #layout-root dataset 改 todos 并切 hidden，应看到 Todos 区有 "今日 · 0"、"项目 · 0"、"+ 新建项目" 按钮、两个空折叠区。

- [ ] **Step 6: Commit**

```bash
git add extension/index.html extension/style.css extension/todos-view.js extension/app.js
git commit -m "feat: 渲染 Todos pane 骨架（输入框 + 今日/项目两栏 + 折叠区）"
```

---

### Task 3.2: 顶部输入框回车创建无项目 todo

**Files:**
- Modify: `extension/todos-view.js`
- Modify: `extension/app.js`

- [ ] **Step 1: 在 todos-view.js 加事件绑定**

```js
import { createTodo } from './todos.js'

export function wireTodosInput() {
  const input = document.getElementById('todos-input')
  if (!input) return
  input.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return
    const text = input.value.trim()
    if (!text) return
    await createTodo({ text })  // 暂时不解析 # — Task 3.3
    input.value = ''
    await renderTodosView()
    input.focus()
  })
}
```

- [ ] **Step 2: app.js 启动时调用 wireTodosInput**

```js
import { renderTodosView, wireTodosInput } from './todos-view.js'

// initStateBeforeRender() 后
wireTodosInput()
await renderTodosView()
```

- [ ] **Step 3: 手动 smoke test**

reload。切到 Todos pane（暂用 console），focus 输入框，打 "测试"，回车。应看到"今日 · 1" 出现一条。再打 "再来一个" 回车，列表增加一条。

- [ ] **Step 4: Commit**

```bash
git add extension/todos-view.js extension/app.js
git commit -m "feat: 顶部输入框回车创建无项目 todo + 自动重渲染"
```

---

### Task 3.3: 输入框解析 `#项目名` 内联语法

**Files:**
- Create: `extension/input-parser.js`
- Test: `tests/input-parser.test.js`
- Modify: `extension/todos-view.js`

- [ ] **Step 1: 写测试**

`tests/input-parser.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { parseTodoInput } from '../extension/input-parser.js'

describe('parseTodoInput', () => {
  it('text only', () => {
    expect(parseTodoInput('催小李合同')).toEqual({ text: '催小李合同', projectName: null })
  })
  it('text + # at end', () => {
    expect(parseTodoInput('催小李合同 #合同流程')).toEqual({ text: '催小李合同', projectName: '合同流程' })
  })
  it('# in middle uses last as project', () => {
    expect(parseTodoInput('开会 #XX 项目')).toEqual({ text: '开会', projectName: 'XX 项目' })
  })
  it('# at start', () => {
    expect(parseTodoInput('#项目 任务文本')).toEqual({ text: '任务文本', projectName: '项目' })
  })
  it('multiple # — last wins', () => {
    expect(parseTodoInput('do #a then #b')).toEqual({ text: 'do then', projectName: 'b' })
  })
  it('empty text after parsing returns empty', () => {
    expect(parseTodoInput('#proj')).toEqual({ text: '', projectName: 'proj' })
  })
})
```

- [ ] **Step 2: 跑测试 — FAIL**

- [ ] **Step 3: 实现**

`extension/input-parser.js`:

```js
/**
 * 提取最后一个 #word（word 直到下一个 # 或 EOL，trim 后非空）为项目名；
 * 其余文本拼接为 todo text。
 *
 * @param {string} raw
 * @returns {{ text: string, projectName: string | null }}
 */
export function parseTodoInput(raw) {
  const matches = [...raw.matchAll(/#([^#]+)/g)]
  if (matches.length === 0) return { text: raw.trim(), projectName: null }
  const last = matches[matches.length - 1]
  const projectName = last[1].trim()
  // 移除所有 #...，把残余拼回
  const text = raw.replace(/#[^#]+/g, ' ').replace(/\s+/g, ' ').trim()
  return { text, projectName: projectName || null }
}
```

- [ ] **Step 4: 跑测试 — PASS**

- [ ] **Step 5: todos-view.js 接入解析逻辑**

修改 `wireTodosInput()`：

```js
import { parseTodoInput } from './input-parser.js'
import { searchProjects, createProject } from './projects.js'

export function wireTodosInput() {
  const input = document.getElementById('todos-input')
  if (!input) return
  input.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return
    const raw = input.value
    if (!raw.trim()) return
    const { text, projectName } = parseTodoInput(raw)
    let projectId = null
    if (projectName) {
      const matches = await searchProjects(projectName)
      const exact = matches.find(p => p.name.toLowerCase() === projectName.toLowerCase())
      const p = exact ?? await createProject({ name: projectName })
      projectId = p.id
    }
    if (!text) return  // 只有 # 没有文本时不创建（用户多半在打字中途）
    await createTodo({ text, projectId })
    input.value = ''
    await renderTodosView()
    input.focus()
  })
}
```

- [ ] **Step 6: 手动 smoke test**

reload。切到 Todos pane。
- 打 "测试 #合同流程" 回车 → 项目区出现"合同流程"卡片，里面有"测试"
- 再打 "提醒 #合同流程" 回车 → 同卡片内多一条
- 打 "新事项" 回车 → 今日列表多一条

- [ ] **Step 7: Commit**

```bash
git add extension/input-parser.js tests/input-parser.test.js extension/todos-view.js
git commit -m "feat: 顶部输入框解析 #项目名 内联语法（自动创建或匹配项目）"
```

---

### Task 3.4: `+ 新建项目` 按钮 → 简单 prompt 创建项目

**Files:**
- Modify: `extension/todos-view.js`

- [ ] **Step 1: 绑定按钮**

加到 todos-view.js：

```js
export function wireProjectControls() {
  const btn = document.getElementById('btnNewProject')
  if (!btn) return
  btn.addEventListener('click', async () => {
    const name = (prompt('新项目名：') || '').trim()
    if (!name) return
    const matches = await searchProjects(name)
    if (matches.find(p => p.name.toLowerCase() === name.toLowerCase())) {
      alert(`项目"${name}"已存在`)
      return
    }
    await createProject({ name })
    await renderTodosView()
  })
}
```

(v1 用 `prompt`/`alert` — 简单但够用；v2 再换成漂亮 modal。)

- [ ] **Step 2: app.js 启动调用 wireProjectControls**

```js
import { renderTodosView, wireTodosInput, wireProjectControls } from './todos-view.js'
// ...
wireProjectControls()
```

- [ ] **Step 3: 手动 smoke test**

切到 Todos pane → 点 "+ 新建项目" → 输 "招聘" → 项目区多一张"招聘"卡。

- [ ] **Step 4: Commit**

```bash
git add extension/todos-view.js extension/app.js
git commit -m "feat: + 新建项目 按钮（prompt 简版，v2 换 modal）"
```

---

### Task 3.5: `#` 输入时弹下拉（fuzzy 匹配 + 键盘导航）

**Files:**
- Create: `extension/project-dropdown.js`
- Modify: `extension/todos-view.js`
- Modify: `extension/style.css`

> Spec §5.3 要求：用户在任一输入框打 `#` 时，下方弹下拉显示匹配项目，上下箭头导航、回车选择、Esc 取消、顶部 "↩ 新建项目"。

- [ ] **Step 1: 创建 project-dropdown.js**

```js
import { searchProjects, listProjects } from './projects.js'

let _state = null  // { input, dropdownEl, query, items, selectedIdx, onPick }

/**
 * 挂载下拉到 input。当用户输入 `#...`，自动弹下拉。
 * 选中后，input 末尾的 `#xxx` 被替换为 `#<selected.name> `（带尾空格便于继续输入）。
 */
export function attachProjectDropdown(input) {
  input.addEventListener('input', () => maybeOpen(input))
  input.addEventListener('keydown', (e) => onKey(e, input))
  input.addEventListener('blur', () => setTimeout(close, 200))  // 延迟便于点击
}

async function maybeOpen(input) {
  // 找 caret 前最后一个 # 到 caret 之间的文本作为 query
  const caret = input.selectionStart
  const before = input.value.slice(0, caret)
  const m = before.match(/#([^#\s]*)$/)
  if (!m) return close()
  const query = m[1]
  const items = await searchProjects(query)
  open(input, query, items)
}

async function open(input, query, items) {
  if (!_state) {
    const el = document.createElement('div')
    el.className = 'proj-dropdown'
    document.body.appendChild(el)
    _state = { input, dropdownEl: el, query, items, selectedIdx: 0 }
  }
  const rect = input.getBoundingClientRect()
  _state.dropdownEl.style.left = `${rect.left}px`
  _state.dropdownEl.style.top = `${rect.bottom + 4}px`
  _state.dropdownEl.style.width = `${rect.width}px`
  _state.query = query
  _state.items = items
  if (_state.selectedIdx >= items.length + 1) _state.selectedIdx = 0
  render()
}

function render() {
  if (!_state) return
  const { items, query, selectedIdx } = _state
  const showNew = query.length > 0 && !items.find(p => p.name.toLowerCase() === query.toLowerCase())
  const rows = []
  if (showNew) {
    rows.push(`<div class="pd-item pd-new ${selectedIdx === 0 ? 'sel' : ''}" data-idx="0">↩ 新建项目 "<strong>${escape(query)}</strong>"</div>`)
  }
  items.forEach((p, i) => {
    const idx = (showNew ? 1 : 0) + i
    rows.push(`<div class="pd-item ${idx === selectedIdx ? 'sel' : ''}" data-idx="${idx}" data-name="${escape(p.name)}">
      <span class="pd-color pd-${p.color}"></span>${escape(p.name)}
    </div>`)
  })
  _state.dropdownEl.innerHTML = rows.join('') || `<div class="pd-empty">无匹配，回车新建</div>`
  _state.dropdownEl.querySelectorAll('.pd-item').forEach(el => {
    el.addEventListener('mousedown', (e) => {
      e.preventDefault()
      _state.selectedIdx = parseInt(el.dataset.idx)
      commit()
    })
  })
}

function onKey(e, input) {
  if (!_state) return
  const total = _state.items.length + (showNewSelectable() ? 1 : 0)
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    _state.selectedIdx = (_state.selectedIdx + 1) % total
    render()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    _state.selectedIdx = (_state.selectedIdx - 1 + total) % total
    render()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    e.stopPropagation()  // 阻止外层 Enter 创建 todo
    commit()
  } else if (e.key === 'Escape') {
    close()
  }
}

function showNewSelectable() {
  return _state && _state.query.length > 0 &&
    !_state.items.find(p => p.name.toLowerCase() === _state.query.toLowerCase())
}

async function commit() {
  if (!_state) return
  const { input, items, selectedIdx, query } = _state
  const showNew = showNewSelectable()
  let pickedName
  if (showNew && selectedIdx === 0) {
    pickedName = query
  } else {
    const i = showNew ? selectedIdx - 1 : selectedIdx
    pickedName = items[i]?.name || query
  }
  // 替换 input 中末尾 #xxx 为 #pickedName + 空格
  const caret = input.selectionStart
  const before = input.value.slice(0, caret)
  const after = input.value.slice(caret)
  const newBefore = before.replace(/#[^#\s]*$/, `#${pickedName} `)
  input.value = newBefore + after
  input.selectionStart = input.selectionEnd = newBefore.length
  close()
}

function close() {
  if (!_state) return
  _state.dropdownEl.remove()
  _state = null
}

function escape(s) { return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])) }
```

- [ ] **Step 2: style.css**

```css
.proj-dropdown {
  position: fixed; z-index: 400; background: white; border: 1px solid #ddd;
  border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-height: 240px; overflow-y: auto;
  padding: 4px 0; font-size: 12px;
}
.pd-item { padding: 6px 10px; cursor: pointer; display: flex; align-items: center; gap: 8px; }
.pd-item.sel { background: rgba(139,92,246,0.1); }
.pd-item:hover { background: #f5f5f5; }
.pd-item.sel:hover { background: rgba(139,92,246,0.15); }
.pd-new { color: #8b5cf6; }
.pd-empty { padding: 8px 10px; color: #999; font-size: 11px; }
.pd-color { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
.pd-color.pd-purple { background: #8b5cf6; }
.pd-color.pd-orange { background: #f59e0b; }
.pd-color.pd-green { background: #10b981; }
.pd-color.pd-blue { background: #3b82f6; }
.pd-color.pd-red { background: #ef4444; }
```

- [ ] **Step 3: todos-view.js 接入**

修改 wireTodosInput()：

```js
import { attachProjectDropdown } from './project-dropdown.js'

export function wireTodosInput() {
  const input = document.getElementById('todos-input')
  if (!input) return
  attachProjectDropdown(input)
  input.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return
    if (e.defaultPrevented) return  // 下拉已处理
    // ...原有逻辑（提交 todo）
  })
}
```

> 注：dropdown 的 Enter 已 `e.preventDefault() + e.stopPropagation()`，外层 keydown 通过 defaultPrevented 判断跳过。但 stopPropagation 已阻止冒泡到 document，所以 input keydown 也跳过——OK。

- [ ] **Step 4: 手动 smoke test**

- 先创建 3 个项目（A, AAA, B）
- 在 Todos 顶部输入框打 "todo #" → 下拉应出现 3 项（按 fuzzy）+ 无新建项（query 为空）
- 接着输 "A" 变 "todo #A" → 下拉过滤为 A 和 AAA + "↩ 新建项目 'A'" 不出现（A 已存在）
- 输 "Z" 变 "todo #Z" → 下拉只显示 "↩ 新建项目 'Z'"
- ↓ ↑ 切高亮，回车 → input 末尾变成 `#Z `，下拉消失
- 继续按下 Enter（外层 keydown）→ 提交 todo

- [ ] **Step 5: Commit**

```bash
git add extension/project-dropdown.js extension/todos-view.js extension/style.css
git commit -m "feat: # 输入时弹下拉（fuzzy 匹配 + ↑↓ 导航 + 回车新建/选）"
```

---

# Phase 4 · 布局系统

### Task 4.1: 创建 layout.js + Toggle 模式切换按钮

**Files:**
- Create: `extension/layout.js`
- Modify: `extension/index.html`（加 toggle 按钮）
- Modify: `extension/style.css`

- [ ] **Step 1: 在 index.html `<body>` 顶部加 toggle 按钮**

```html
<button id="toggleViewBtn" class="toggle-view-btn" hidden>
  <span data-target="tabs" class="active">Tabs</span>
  <span class="sep">·</span>
  <span data-target="todos">Todos</span>
</button>
```

- [ ] **Step 2: style.css**

```css
.toggle-view-btn {
  position: fixed; top: 16px; right: 16px; z-index: 100;
  background: #111; color: white; border: none; border-radius: 14px;
  padding: 6px 14px; font-size: 12px; font-family: 'DM Sans', sans-serif;
  cursor: pointer; display: flex; align-items: center; gap: 6px;
}
.toggle-view-btn .active { font-weight: 600; }
.toggle-view-btn .sep { opacity: 0.4; }
.toggle-view-btn span:not(.sep) { padding: 2px 6px; border-radius: 8px; }
```

- [ ] **Step 3: 实现 extension/layout.js**

```js
import { getSettings, updateSettings } from './settings.js'
import { renderTodosView } from './todos-view.js'

export async function applyLayout() {
  const s = await getSettings()
  const root = document.getElementById('layout-root')
  const tabs = document.getElementById('tabs-pane')
  const todos = document.getElementById('todos-pane')
  const divider = document.getElementById('layout-divider')
  const toggleBtn = document.getElementById('toggleViewBtn')

  root.className = `layout-mode-${s.layoutMode}`
  root.dataset.visible = s.toggleVisible

  if (s.layoutMode === 'toggle') {
    tabs.hidden = s.toggleVisible !== 'tabs'
    todos.hidden = s.toggleVisible !== 'todos'
    divider.hidden = true
    toggleBtn.hidden = false
    toggleBtn.querySelectorAll('span[data-target]').forEach(el =>
      el.classList.toggle('active', el.dataset.target === s.toggleVisible)
    )
  } else {
    tabs.hidden = false
    todos.hidden = false
    divider.hidden = false
    toggleBtn.hidden = true
    applySplit(s.layoutMode, s.splitRatio)
  }
  if (s.toggleVisible === 'todos') await renderTodosView()
}

function applySplit(mode, ratio) {
  // 留待 Task 4.3 实现具体几何
}

export function wireToggleBtn() {
  const btn = document.getElementById('toggleViewBtn')
  if (!btn) return
  btn.addEventListener('click', async () => {
    const s = await getSettings()
    const next = s.toggleVisible === 'tabs' ? 'todos' : 'tabs'
    await updateSettings({ toggleVisible: next })
    await applyLayout()
  })
}
```

- [ ] **Step 4: app.js 启动调用**

```js
import { applyLayout, wireToggleBtn } from './layout.js'
// 在 initStateBeforeRender 后
wireToggleBtn()
await applyLayout()
```

- [ ] **Step 5: 手动 smoke test**

reload。右上角看到 "Tabs · Todos" 按钮，Tabs 高亮。点一下应切到 Todos 视图（看到输入框 + 两栏）；再点切回 Tabs。

- [ ] **Step 6: Commit**

```bash
git add extension/layout.js extension/index.html extension/style.css extension/app.js
git commit -m "feat: Toggle 布局模式 + 右上角切换按钮（默认 Tabs）"
```

---

### Task 4.2: 设置面板（齿轮 popover）

**Files:**
- Modify: `extension/index.html`
- Modify: `extension/style.css`
- Create: `extension/settings-panel.js`
- Modify: `extension/app.js`

- [ ] **Step 1: index.html footer 加齿轮**

在 `<footer>` 内（last-refresh 旁边）加：

```html
<button id="settingsBtn" class="settings-btn" title="设置">⚙</button>
<div id="settingsPanel" class="settings-panel" hidden>
  <h3>布局模式</h3>
  <label><input type="radio" name="layoutMode" value="toggle"> 整页切换（默认）</label>
  <label><input type="radio" name="layoutMode" value="split-h"> 左右分区</label>
  <label><input type="radio" name="layoutMode" value="split-v"> 上下分区</label>

  <h3>声音</h3>
  <label><input type="checkbox" id="cbSound"> 勾选完成 / 关 tab 时播放音效</label>

  <h3>快捷键</h3>
  <p class="hint">捕获 todo: <kbd>Cmd+Shift+Space</kbd><br>→ 在 <a href="chrome://extensions/shortcuts" target="_blank">chrome://extensions/shortcuts</a> 修改</p>

  <h3>关于</h3>
  <p class="hint">Tab Out + Todo v0.1.0<br>Based on tab-out by Zara</p>
</div>
```

- [ ] **Step 2: style.css**

```css
.settings-btn { background: none; border: none; font-size: 18px; cursor: pointer; opacity: 0.5; }
.settings-btn:hover { opacity: 1; }
.settings-panel {
  position: fixed; right: 20px; bottom: 60px; width: 280px; z-index: 200;
  background: white; border: 1px solid #ddd; border-radius: 8px;
  padding: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  font-size: 13px;
}
.settings-panel h3 { margin: 12px 0 6px; font-size: 12px; opacity: 0.65; text-transform: uppercase; letter-spacing: 0.05em; }
.settings-panel h3:first-child { margin-top: 0; }
.settings-panel label { display: block; padding: 3px 0; cursor: pointer; }
.settings-panel .hint { font-size: 11px; opacity: 0.7; margin: 4px 0; }
.settings-panel kbd { background: #f0f0f0; padding: 1px 6px; border-radius: 3px; font-family: monospace; font-size: 11px; }
```

- [ ] **Step 3: 实现 settings-panel.js**

```js
import { getSettings, updateSettings } from './settings.js'
import { setSoundEnabled } from './ui.js'
import { applyLayout } from './layout.js'

export async function wireSettingsPanel() {
  const btn = document.getElementById('settingsBtn')
  const panel = document.getElementById('settingsPanel')
  if (!btn || !panel) return

  btn.addEventListener('click', () => { panel.hidden = !panel.hidden; if (!panel.hidden) refresh() })
  document.addEventListener('click', (e) => {
    if (panel.hidden) return
    if (panel.contains(e.target) || btn.contains(e.target)) return
    panel.hidden = true
  })

  async function refresh() {
    const s = await getSettings()
    panel.querySelectorAll('input[name="layoutMode"]').forEach(r => r.checked = (r.value === s.layoutMode))
    document.getElementById('cbSound').checked = s.soundEnabled
  }

  panel.querySelectorAll('input[name="layoutMode"]').forEach(r => {
    r.addEventListener('change', async () => {
      await updateSettings({ layoutMode: r.value })
      await applyLayout()
    })
  })
  document.getElementById('cbSound').addEventListener('change', async (e) => {
    await updateSettings({ soundEnabled: e.target.checked })
    setSoundEnabled(e.target.checked)
  })
}
```

- [ ] **Step 4: app.js 接入**

```js
import { wireSettingsPanel } from './settings-panel.js'
// ...
wireSettingsPanel()
```

- [ ] **Step 5: 手动 smoke test**

reload。footer 右侧应有齿轮，点开 popover 显示三个布局选项 + 音效复选 + 快捷键提示。换成"左右分区"应让 Tabs/Todos 两栏同时显示（隔离线还没拖拽功能，下个 task 做）。

- [ ] **Step 6: Commit**

```bash
git add extension/index.html extension/style.css extension/settings-panel.js extension/app.js
git commit -m "feat: 加齿轮设置面板（布局模式 / 音效 / 快捷键提示）"
```

---

### Task 4.3: 分区模式 + 可拖拽隔离线

**Files:**
- Modify: `extension/layout.js`
- Modify: `extension/style.css`

- [ ] **Step 1: style.css 加分区模式样式**

```css
/* 左右分区 */
#layout-root.layout-mode-split-h {
  display: grid;
  grid-template-columns: var(--split-left, 50%) 6px 1fr;
  min-height: 100vh;
}
#layout-root.layout-mode-split-h #layout-divider {
  background: #e5e5e5; cursor: col-resize; transition: background 0.15s;
}
#layout-root.layout-mode-split-h #layout-divider:hover,
#layout-root.layout-mode-split-h #layout-divider.dragging { background: #8b5cf6; }

/* 上下分区 */
#layout-root.layout-mode-split-v {
  display: grid;
  grid-template-rows: var(--split-top, 50%) 6px 1fr;
  min-height: 100vh;
}
#layout-root.layout-mode-split-v #layout-divider {
  background: #e5e5e5; cursor: row-resize; transition: background 0.15s;
}
#layout-root.layout-mode-split-v #layout-divider:hover,
#layout-root.layout-mode-split-v #layout-divider.dragging { background: #8b5cf6; }
```

- [ ] **Step 2: layout.js 实现 applySplit + 拖拽**

替换 `applySplit` 和加 `wireDivider`：

```js
function applySplit(mode, ratio) {
  const root = document.getElementById('layout-root')
  if (mode === 'split-h') {
    root.style.setProperty('--split-left', `${ratio * 100}%`)
  } else if (mode === 'split-v') {
    root.style.setProperty('--split-top', `${ratio * 100}%`)
  }
}

export function wireDivider() {
  const divider = document.getElementById('layout-divider')
  const root = document.getElementById('layout-root')
  if (!divider) return

  let dragging = false

  divider.addEventListener('mousedown', (e) => {
    dragging = true
    divider.classList.add('dragging')
    e.preventDefault()
  })

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return
    const mode = root.className.includes('split-h') ? 'h' : (root.className.includes('split-v') ? 'v' : null)
    if (!mode) return
    let ratio
    if (mode === 'h') {
      ratio = e.clientX / window.innerWidth
    } else {
      ratio = e.clientY / window.innerHeight
    }
    ratio = Math.max(0.15, Math.min(0.85, ratio))
    if (mode === 'h') root.style.setProperty('--split-left', `${ratio * 100}%`)
    else root.style.setProperty('--split-top', `${ratio * 100}%`)
    root.dataset.lastRatio = ratio
  })

  document.addEventListener('mouseup', async () => {
    if (!dragging) return
    dragging = false
    divider.classList.remove('dragging')
    const ratio = parseFloat(root.dataset.lastRatio || '0.5')
    await updateSettings({ splitRatio: ratio })
  })

  divider.addEventListener('dblclick', async () => {
    await updateSettings({ splitRatio: 0.5 })
    await applyLayout()
  })
}
```

- [ ] **Step 3: app.js 接入**

```js
import { applyLayout, wireToggleBtn, wireDivider } from './layout.js'
// 在 applyLayout() 之前
wireDivider()
```

- [ ] **Step 4: 手动 smoke test**

reload。设置→左右分区。
- 隔离线默认淡灰；hover 变紫
- 按住拖动：左右栏比例变化
- 松手：换 mode 切回再切到分区，比例保留
- 双击：回到 50/50
- 切到上下分区：同理但纵向

- [ ] **Step 5: Commit**

```bash
git add extension/layout.js extension/style.css extension/app.js
git commit -m "feat: 分区模式可拖拽隔离线（hover 高亮 / 比例自动保存 / 双击复位）"
```

---

### Task 4.4: 窄屏强制 split-v（响应式）

**Files:**
- Modify: `extension/layout.js`

- [ ] **Step 1: 修改 applyLayout 增加窄屏检测**

在 `applyLayout` 内：

```js
// 窄屏（<720px）强制 split-v，避免左右分区太挤
if (s.layoutMode === 'split-h' && window.innerWidth < 720) {
  root.className = 'layout-mode-split-v'
}
```

加 resize 监听重新 apply：

```js
window.addEventListener('resize', () => { applyLayout() })
```

> 注意：resize 触发频繁，加 debounce：

```js
let _resizeT
window.addEventListener('resize', () => {
  clearTimeout(_resizeT)
  _resizeT = setTimeout(() => applyLayout(), 200)
})
```

- [ ] **Step 2: 手动 smoke test**

设置→左右分区。Chrome 拉窄到 <720px，应自动变上下分区（DOM mode class 切换）。拉回宽，又变回左右。

- [ ] **Step 3: Commit**

```bash
git add extension/layout.js
git commit -m "feat: 窄屏（<720px）自动从 split-h 退化为 split-v"
```

---

### Task 4.5: 跨标签页状态同步（chrome.storage.onChanged 广播）

**Files:**
- Modify: `extension/app.js`

- [ ] **Step 1: 监听 storage 变化重新渲染**

```js
import { onStorageChanged, KEYS } from './storage.js'

// 在 init 中加
onStorageChanged(KEYS.todos, async () => { await renderTodosView() })
onStorageChanged(KEYS.projects, async () => { await renderTodosView() })
onStorageChanged(KEYS.settings, async () => { await applyLayout() })
```

- [ ] **Step 2: 手动 smoke test**

打开两个新标签页 A 和 B（都是 tab-out）。在 A 切到 Todos，输入 "abc" 回车。切到 B 也切 Todos。**应该自动出现 "abc"**（无需 reload）。

- [ ] **Step 3: Commit**

```bash
git add extension/app.js
git commit -m "feat: storage 变化广播 — 跨多个新标签页自动同步 todos/projects/settings"
```

---

# Phase 5 · Tab 绑定（创建 / 显示 / 解绑）

### Task 5.1: 绑定数据层（binding.js）+ 反向索引重建

**Files:**
- Create: `extension/binding.js`
- Test: `tests/binding.test.js`

- [ ] **Step 1: 写测试**

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { rebuildBindingsCache, getTodosBoundToUrl, urlIsBound } from '../extension/binding.js'
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
})
```

- [ ] **Step 2: FAIL**

- [ ] **Step 3: 实现**

`extension/binding.js`:

```js
import { getStorage, setStorage, KEYS } from './storage.js'
import { listTodos } from './todos.js'

/**
 * 重建 url -> [todoId, ...] 反向索引（只索引 pending todos）。
 * 每次 todo 写入应调用一次。
 */
export async function rebuildBindingsCache() {
  const todos = await listTodos()
  const cache = {}
  for (const t of todos) {
    if (t.status !== 'pending') continue
    for (const url of t.boundUrls || []) {
      if (!cache[url]) cache[url] = []
      cache[url].push(t.id)
    }
  }
  await setStorage(KEYS.bindingsCache, cache)
  return cache
}

export async function getTodosBoundToUrl(url) {
  const cache = await getStorage(KEYS.bindingsCache, {})
  const ids = cache[url] || []
  const todos = await listTodos()
  return todos.filter(t => ids.includes(t.id))
}

export async function urlIsBound(url) {
  const cache = await getStorage(KEYS.bindingsCache, {})
  return Array.isArray(cache[url]) && cache[url].length > 0
}

/** 记下 URL 标题，绑定时调用 */
export async function rememberUrlTitle(url, title) {
  if (!title) return
  const titles = await getStorage(KEYS.urlTitles, {})
  titles[url] = title
  await setStorage(KEYS.urlTitles, titles)
}

export async function getUrlTitle(url) {
  const titles = await getStorage(KEYS.urlTitles, {})
  return titles[url] || url
}
```

- [ ] **Step 4: PASS**

- [ ] **Step 5: 在 todos.js 写入时自动 rebuild**

修改 `extension/todos.js`，import 并在 createTodo / updateTodo / completeTodo / deleteTodo 末尾调用：

```js
import { rebuildBindingsCache } from './binding.js'

// 每个写入函数末尾：
await rebuildBindingsCache()
```

(注意循环 import：binding.js 也 import todos.js 的 listTodos。这是 OK 的 ES module 循环——但要确保 listTodos 不在 module top-level 调用。这里只在函数内调用，安全。)

- [ ] **Step 6: Commit**

```bash
git add extension/binding.js tests/binding.test.js extension/todos.js
git commit -m "feat: binding.js 反向索引 + url 标题缓存（写入 todos 时自动重建）"
```

---

### Task 5.2: Todo 渲染时显示 boundUrls + 🟢/⚪ 状态

**Files:**
- Modify: `extension/todos-view.js`
- Modify: `extension/style.css`

- [ ] **Step 1: 获取当前开放 tabs 的 URL 集合**

加到 todos-view.js：

```js
import { getUrlTitle } from './binding.js'

async function getOpenUrls() {
  return new Promise(resolve => {
    chrome.tabs.query({}, (tabs) => {
      resolve(new Set(tabs.map(t => t.url)))
    })
  })
}

// 让 renderTodosView 顶部一次性获取
let _openUrls = new Set()
async function refreshOpenUrls() {
  _openUrls = await getOpenUrls()
}

// 改 renderTodosView 第一行：
export async function renderTodosView() {
  await refreshOpenUrls()
  await renderToday()
  await renderProjects()
}
```

- [ ] **Step 2: renderTodoLi 增强：显示 boundUrls**

修改 `renderTodoLi`：

```js
async function renderTodoLi(t, done = false) {
  const checkbox = done ? '☑' : '☐'
  const bindingsHtml = (t.boundUrls && t.boundUrls.length > 0)
    ? `<ul class="bindings">${
        t.boundUrls.map(url => {
          const open = _openUrls.has(url)
          const dot = open ? '🟢' : '⚪'
          return `<li data-url="${escapeHtml(url)}">${dot} <span class="b-title">${escapeHtml(syncUrlTitle(url))}</span> <button class="b-unbind" title="解绑">×</button></li>`
        }).join('')
      }</ul>`
    : ''
  return `<li class="${done ? 'done' : ''}" data-id="${t.id}">${checkbox} ${escapeHtml(t.text)}${bindingsHtml}</li>`
}

// 把 getUrlTitle 转成同步：渲染前预加载
let _urlTitlesCache = {}
async function preloadUrlTitles() {
  const { getStorage, KEYS } = await import('./storage.js')
  _urlTitlesCache = await getStorage(KEYS.urlTitles, {})
}
function syncUrlTitle(url) { return _urlTitlesCache[url] || url }

// renderTodosView 顶部追加：
await preloadUrlTitles()
```

> 注：renderTodoLi 现在是 async 的，会破坏 `.map(...).join('')`。改用 `await Promise.all(...)` 或先全部预加载。简化：让 renderTodoLi 仍同步，所有数据预先准备。上面的代码已经这么做了。

- [ ] **Step 3: style.css**

```css
.bindings { list-style: none; padding: 0 0 0 22px; margin: 4px 0 0; }
.bindings li {
  font-size: 11px; padding: 2px 0; display: flex; align-items: center; gap: 6px;
}
.bindings .b-title {
  flex: 1; text-decoration: underline; text-decoration-style: dotted;
  text-decoration-color: #bbb; cursor: pointer;
}
.bindings .b-unbind {
  background: none; border: none; opacity: 0; cursor: pointer; font-size: 14px;
}
.bindings li:hover .b-unbind { opacity: 0.5; }
.bindings .b-unbind:hover { opacity: 1 !important; }
```

- [ ] **Step 4: 绑定点击事件（用事件代理）**

在 `wireTodosView()`（新加，统一绑事件）：

```js
export function wireTodosView() {
  document.addEventListener('click', async (e) => {
    // 点击 binding 标题 → 跳转 / 重开
    if (e.target.classList.contains('b-title')) {
      const url = e.target.closest('li[data-url]').dataset.url
      chrome.tabs.query({ url }, (tabs) => {
        if (tabs.length > 0) chrome.tabs.update(tabs[0].id, { active: true })
        else chrome.tabs.create({ url })
      })
      return
    }
    // 解绑
    if (e.target.classList.contains('b-unbind')) {
      const li = e.target.closest('li[data-url]')
      const url = li.dataset.url
      const todoLi = li.closest('li[data-id]')
      const todoId = todoLi.dataset.id
      const { updateTodo, listTodos } = await import('./todos.js')
      const all = await listTodos()
      const t = all.find(x => x.id === todoId)
      if (!t) return
      await updateTodo(todoId, { boundUrls: t.boundUrls.filter(u => u !== url) })
      await renderTodosView()
      return
    }
  })
}
```

记得在 app.js 调用 `wireTodosView()`。

- [ ] **Step 5: 手动 smoke test**

console 测试：
```js
const { createTodo } = await import('./todos.js')
await createTodo({ text: '测试绑定', boundUrls: ['https://github.com'] })
```
切到 Todos：应显示一条 todo 下方有 `🟢 https://github.com ×`（如果你当前有 github 打开）。点标题应跳转；hover 出现 × 点击解绑。

- [ ] **Step 6: Commit**

```bash
git add extension/todos-view.js extension/style.css extension/app.js
git commit -m "feat: todo 渲染显示 boundUrls + 🟢⚪ 状态 + 点击跳转 + × 解绑"
```

---

### Task 5.3: Tab 卡片 "→ Todo" 按钮（path 1 绑定）

**Files:**
- Modify: `extension/tabs.js`（或 app.js 中的 tab 渲染处）
- Modify: `extension/style.css`

> **前置**：tab-out 既有的 tab 卡片渲染在 app.js 内（如 `renderMission` / `renderTabCard`）。需要在每个 tab 卡内加 hover 按钮。

- [ ] **Step 1: 定位 tab 卡渲染**

```bash
grep -n "tab-card\|renderTab\|class=\"tab\"" extension/app.js | head
```

记下 tab card 的 className（推测是 `.tab` 或 `.mission-tab`）。

- [ ] **Step 2: 在卡片模板里加按钮**

找到 tab card 模板，**追加**：

```html
<button class="to-todo-btn" data-url="${url}" data-title="${escapeHtml(title)}" title="加到 todo">→ Todo</button>
```

- [ ] **Step 3: style.css**

```css
.to-todo-btn {
  display: none; position: absolute; right: 28px; top: 50%; transform: translateY(-50%);
  background: #8b5cf6; color: white; border: none; border-radius: 12px;
  padding: 2px 10px; font-size: 11px; cursor: pointer;
}
.tab-card:hover .to-todo-btn,
[class*="tab"]:hover .to-todo-btn { display: inline-block; }
```

(具体 selector 看 tab-out 实际 class。)

- [ ] **Step 4: 加 popover：点击 → 弹小卡（输入新 todo / 选已有）**

在 index.html `<body>` 末尾加：

```html
<div id="bindPopover" class="bind-popover" hidden>
  <input id="bindPopInput" placeholder="新建 todo 并绑定此 tab，回车保存" />
  <div class="bind-pop-divider">或加到现有 todo</div>
  <div id="bindPopExisting" class="bind-pop-list"></div>
</div>
```

CSS：

```css
.bind-popover {
  position: absolute; z-index: 300; width: 260px; background: white;
  border: 1px solid #ddd; border-radius: 8px; padding: 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
}
.bind-popover input { width: 100%; padding: 6px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; }
.bind-pop-divider { margin: 10px 0 4px; font-size: 10px; opacity: 0.5; text-transform: uppercase; }
.bind-pop-list { max-height: 200px; overflow-y: auto; }
.bind-pop-list .item { padding: 6px 8px; cursor: pointer; font-size: 12px; border-radius: 4px; }
.bind-pop-list .item:hover { background: #f5f5f5; }
```

- [ ] **Step 5: 实现 popover 逻辑**

在 binding.js 加：

```js
import { createTodo, updateTodo, listTodos } from './todos.js'

export async function openBindPopover(url, title, anchorEl) {
  await rememberUrlTitle(url, title)
  const pop = document.getElementById('bindPopover')
  const rect = anchorEl.getBoundingClientRect()
  pop.style.left = `${rect.right + 8}px`
  pop.style.top = `${rect.top}px`
  pop.hidden = false

  const input = document.getElementById('bindPopInput')
  input.value = ''; input.focus()
  input.onkeydown = async (e) => {
    if (e.key === 'Escape') return closeBindPopover()
    if (e.key === 'Enter') {
      const text = input.value.trim()
      if (!text) return
      const { parseTodoInput } = await import('./input-parser.js')
      const { text: cleanText, projectName } = parseTodoInput(text)
      let projectId = null
      if (projectName) {
        const { searchProjects, createProject } = await import('./projects.js')
        const matches = await searchProjects(projectName)
        const exact = matches.find(p => p.name.toLowerCase() === projectName.toLowerCase())
        projectId = (exact ?? await createProject({ name: projectName })).id
      }
      await createTodo({ text: cleanText, projectId, boundUrls: [url] })
      closeBindPopover()
      const { renderTodosView } = await import('./todos-view.js')
      await renderTodosView()
      const { showToast } = await import('./ui.js')
      showToast('已加到 todos')
    }
  }

  // 列出 pending todos 供选择加绑
  const all = (await listTodos()).filter(t => t.status === 'pending')
  const listEl = document.getElementById('bindPopExisting')
  listEl.innerHTML = all.map(t => `<div class="item" data-id="${t.id}">${t.text}</div>`).join('')
  listEl.onclick = async (e) => {
    const item = e.target.closest('.item')
    if (!item) return
    const t = all.find(x => x.id === item.dataset.id)
    if (t.boundUrls.includes(url)) {
      const { showToast } = await import('./ui.js')
      showToast('已绑过')
      return closeBindPopover()
    }
    await updateTodo(t.id, { boundUrls: [...t.boundUrls, url] })
    closeBindPopover()
    const { renderTodosView } = await import('./todos-view.js')
    await renderTodosView()
  }

  // 点外面关闭
  setTimeout(() => {
    document.addEventListener('mousedown', _outside, { once: true })
  }, 0)
}

function _outside(e) {
  const pop = document.getElementById('bindPopover')
  if (pop.hidden) return
  if (!pop.contains(e.target)) closeBindPopover()
}

export function closeBindPopover() {
  const pop = document.getElementById('bindPopover')
  pop.hidden = true
}
```

- [ ] **Step 6: 在 app.js / tabs 渲染处绑事件**

```js
import { openBindPopover } from './binding.js'

document.addEventListener('click', (e) => {
  if (e.target.classList.contains('to-todo-btn')) {
    e.stopPropagation()
    const btn = e.target
    openBindPopover(btn.dataset.url, btn.dataset.title, btn)
  }
})
```

- [ ] **Step 7: 手动 smoke test**

reload。在 Tabs 视图 hover 某个 tab 卡 → 出现紫色 "→ Todo"。点 → popover 出现，输入"测试绑定"回车 → toast"已加到 todos"。切到 Todos：今日（或对应项目）多一条 todo，下方 🟢 + 该 tab 标题。

- [ ] **Step 8: Commit**

```bash
git add extension/app.js extension/binding.js extension/index.html extension/style.css
git commit -m "feat: Tab 卡 hover → Todo 按钮 + popover（新建或加到现有 todo）"
```

---

### Task 5.4: Todo 上 "🔗 +" 按钮（从已开 tabs 选择加绑）

**Files:**
- Modify: `extension/todos-view.js`
- Modify: `extension/style.css`
- Modify: `extension/binding.js`

- [ ] **Step 1: renderTodoLi 加按钮**

修改 `renderTodoLi`：

```js
const addBindBtn = !done ? `<button class="t-add-bind" data-id="${t.id}" title="加 tab">🔗 +</button>` : ''
// 拼到 todo li 内（checkbox 后、文本前 / 或末尾，自选）
return `<li class="${done ? 'done' : ''}" data-id="${t.id}">${checkbox} ${escapeHtml(t.text)} ${addBindBtn}${bindingsHtml}</li>`
```

- [ ] **Step 2: 加 popover：列出当前所有 open tabs**

binding.js 新增：

```js
export async function openAddTabPopover(todoId, anchorEl) {
  const pop = document.getElementById('bindPopover')
  pop.hidden = false
  const rect = anchorEl.getBoundingClientRect()
  pop.style.left = `${rect.right + 8}px`
  pop.style.top = `${rect.top}px`

  document.getElementById('bindPopInput').hidden = true
  document.querySelector('.bind-pop-divider').textContent = '从已打开 tab 中选'

  const tabs = await new Promise(r => chrome.tabs.query({}, r))
  const todo = (await listTodos()).find(t => t.id === todoId)
  const listEl = document.getElementById('bindPopExisting')
  listEl.innerHTML = tabs
    .filter(t => !todo.boundUrls.includes(t.url))
    .map(t => `<div class="item" data-url="${t.url}" data-title="${escapeAttr(t.title)}">${escapeHtml(t.title)}</div>`)
    .join('')

  listEl.onclick = async (e) => {
    const item = e.target.closest('.item')
    if (!item) return
    const url = item.dataset.url
    await rememberUrlTitle(url, item.dataset.title)
    await updateTodo(todoId, { boundUrls: [...todo.boundUrls, url] })
    closeBindPopover()
    const { renderTodosView } = await import('./todos-view.js')
    await renderTodosView()
  }

  setTimeout(() => document.addEventListener('mousedown', _outside, { once: true }), 0)
}

function escapeAttr(s) { return String(s).replace(/"/g, '&quot;') }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])) }
```

> 注：openBindPopover 之前隐藏了 input，需要恢复。建议把 openBindPopover 末尾加 `document.getElementById('bindPopInput').hidden = false`。

- [ ] **Step 3: style.css**

```css
.t-add-bind {
  opacity: 0; background: none; border: 1px dashed #ccc; border-radius: 10px;
  padding: 0 6px; font-size: 10px; cursor: pointer; color: #8b5cf6;
}
.todo-list li:hover .t-add-bind { opacity: 1; }
```

- [ ] **Step 4: 事件绑定**

在 wireTodosView() 内加：

```js
if (e.target.classList.contains('t-add-bind')) {
  e.stopPropagation()
  const { openAddTabPopover } = await import('./binding.js')
  openAddTabPopover(e.target.dataset.id, e.target)
}
```

- [ ] **Step 5: 手动 smoke test**

切到 Todos，hover 任一 pending todo → 右侧出现紫色虚线"🔗 +"。点 → popover 列出所有当前打开 tabs。点一个 → todo 多一行绑定 🟢。

- [ ] **Step 6: Commit**

```bash
git add extension/todos-view.js extension/style.css extension/binding.js
git commit -m "feat: todo hover '🔗 +' 按钮 — 从已开 tabs 选择加绑"
```

---

### Task 5.5: tabs.js 拆分（轻量重构，可选但推荐）

**Files:**
- Create: `extension/tabs.js`
- Modify: `extension/app.js`

> **目的**：app.js 仍臃肿；把 tab 渲染相关的函数迁出。这是 cleanup，不改行为。

- [ ] **Step 1: 标识 app.js 中 tab 渲染相关函数**

```bash
grep -n "function " extension/app.js | head -40
```

找出 tab grouping / rendering / homepages / saved-for-later 相关函数（如 `renderMissions`, `groupByDomain`, `renderSavedList` 等）。

- [ ] **Step 2: 把它们 cut 到 tabs.js 并 export**

```js
// extension/tabs.js
import { showToast, burstConfetti, playSwoosh } from './ui.js'

export function groupByDomain(tabs) { /* ... */ }
export function renderMissions(/* ... */) { /* ... */ }
// 等等
```

确保 import 关系正确：tabs.js 引用 ui.js / chrome.* API。

- [ ] **Step 3: app.js 改为 import 并调用**

```js
import { renderMissions, groupByDomain } from './tabs.js'
```

- [ ] **Step 4: 手动 smoke test**

reload。tab-out 视图（domain 分组、homepages、duplicate badge、saved for later、关 tab 动画）一切正常。

- [ ] **Step 5: Commit**

```bash
git add extension/tabs.js extension/app.js
git commit -m "refactor: 把 tab 渲染相关代码从 app.js 抽到 tabs.js"
```

---

# Phase 6 · 全局快捷键浮窗（捕获 B）

### Task 6.1: manifest.json 注册 command

**Files:**
- Modify: `extension/manifest.json`

- [ ] **Step 1: 加 commands 段 + scripting 权限**

```json
{
  "manifest_version": 3,
  "name": "Tab Out + Todo",
  "version": "0.1.0",
  "description": "...",
  "permissions": ["tabs", "activeTab", "storage", "scripting"],
  "host_permissions": ["<all_urls>"],
  "chrome_url_overrides": { "newtab": "index.html" },
  "background": { "service_worker": "background.js" },
  "commands": {
    "open-capture": {
      "suggested_key": {
        "default": "Ctrl+Shift+Space",
        "mac": "Command+Shift+Space"
      },
      "description": "打开 todo 捕获浮窗"
    }
  },
  "action": { /* ... */ },
  "icons": { /* ... */ }
}
```

- [ ] **Step 2: 在 chrome://extensions 重新加载，确认 shortcut 已注册**

到 `chrome://extensions/shortcuts`，应看到 "Tab Out + Todo" 下 "open-capture: Command+Shift+Space"。

- [ ] **Step 3: Commit**

```bash
git add extension/manifest.json
git commit -m "feat: manifest 注册全局快捷键 open-capture（默认 Cmd/Ctrl+Shift+Space）"
```

---

### Task 6.2: background.js 监听 command 并注入 overlay

**Files:**
- Modify: `extension/background.js`
- Create: `extension/content/capture-overlay.js`
- Create: `extension/content/capture-overlay.css`

- [ ] **Step 1: 创建 overlay 样式**

`extension/content/capture-overlay.css`:

```css
#tabout-capture-overlay {
  position: fixed; inset: 0; z-index: 2147483647;
  background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;
  font-family: -apple-system, sans-serif;
}
#tabout-capture-box {
  background: white; border-radius: 12px; padding: 20px;
  width: 480px; max-width: 90%; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
}
#tabout-capture-box .label {
  font-size: 10px; opacity: 0.5; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;
}
#tabout-capture-input {
  width: 100%; border: none; border-bottom: 2px solid #8b5cf6; padding: 6px 0;
  font-size: 18px; outline: none;
}
#tabout-capture-meta {
  display: flex; justify-content: space-between; align-items: center; margin-top: 14px; font-size: 12px;
}
#tabout-capture-meta label { cursor: pointer; }
#tabout-capture-meta .hint { opacity: 0.5; }
```

- [ ] **Step 2: 创建 overlay JS**

`extension/content/capture-overlay.js`:

```js
(function () {
  if (window.__taboutCaptureOpen) return
  window.__taboutCaptureOpen = true

  const overlay = document.createElement('div')
  overlay.id = 'tabout-capture-overlay'
  overlay.innerHTML = `
    <div id="tabout-capture-box">
      <div class="label">Quick Capture</div>
      <input id="tabout-capture-input" placeholder="输入待办，#项目名 可选" />
      <div id="tabout-capture-meta">
        <label><input type="checkbox" id="tabout-bind-current" checked /> 绑定当前 tab</label>
        <span class="hint">⏎ 保存 · Esc 取消</span>
      </div>
    </div>
  `
  document.body.appendChild(overlay)

  const input = overlay.querySelector('#tabout-capture-input')
  const cb = overlay.querySelector('#tabout-bind-current')
  setTimeout(() => input.focus(), 0)

  function close() {
    overlay.remove()
    window.__taboutCaptureOpen = false
  }

  overlay.addEventListener('click', (e) => { if (e.target === overlay) close() })
  document.addEventListener('keydown', function onKey(e) {
    if (!document.body.contains(overlay)) {
      document.removeEventListener('keydown', onKey); return
    }
    if (e.key === 'Escape') { e.stopPropagation(); close(); return }
    if (e.key === 'Enter' && e.target === input) {
      const text = input.value.trim()
      if (!text) return
      const bindCurrent = cb.checked
      // 发消息给 background，让它在扩展 context 里写 storage（content script 也能 chrome.storage，但保持一处入口）
      chrome.runtime.sendMessage({
        type: 'capture',
        text,
        url: bindCurrent ? location.href : null,
        title: bindCurrent ? document.title : null,
      }, () => { close() })
    }
  }, true)
})()
```

- [ ] **Step 3: 修改 background.js**

在 background.js 末尾追加：

```js
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'open-capture') return
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab || !tab.id) return
  // 在新标签页里也能用——但 new tab page 是 chrome-extension://，injection 受限
  // 优先注入到普通页面；new tab page 自己有顶部输入框，不必走 overlay
  if (tab.url && tab.url.startsWith('chrome-extension://')) return
  try {
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['content/capture-overlay.css'],
    })
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/capture-overlay.js'],
    })
  } catch (e) {
    console.warn('inject capture overlay failed', e)
  }
})

// 处理 content script 提交的 capture
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'capture') return
  ;(async () => {
    // 动态 import 模块（background.js 是 ES module，需 manifest 标记）
    const { createTodo } = await import('./todos.js')
    const { searchProjects, createProject } = await import('./projects.js')
    const { rememberUrlTitle } = await import('./binding.js')
    const { parseTodoInput } = await import('./input-parser.js')

    const { text, projectName } = parseTodoInput(msg.text)
    let projectId = null
    if (projectName) {
      const m = await searchProjects(projectName)
      const exact = m.find(p => p.name.toLowerCase() === projectName.toLowerCase())
      projectId = (exact ?? await createProject({ name: projectName })).id
    }
    if (msg.url) await rememberUrlTitle(msg.url, msg.title || '')
    await createTodo({
      text,
      projectId,
      boundUrls: msg.url ? [msg.url] : [],
    })
    sendResponse({ ok: true })
  })()
  return true // async
})
```

修改 `extension/manifest.json` 让 background 支持 ES module：

```json
"background": { "service_worker": "background.js", "type": "module" }
```

- [ ] **Step 4: 验证 background 能 import**

reload extension。打开 `chrome://extensions` → "Service worker" 状态应该正常；如失败看 errors。

- [ ] **Step 5: 手动 smoke test**

打开任意普通网页（例如 github.com）。按 `Cmd+Shift+Space`：
- 中央出现紫色边浮窗
- 输入框已聚焦
- 勾选 "绑定当前 tab" 默认勾上
- 输入"催小李 #合同流程" 回车 → 浮窗消失
- 新开 tab → Todos pane → 项目"合同流程"下有"催小李"，绑定 🟢 github.com（标题缓存）

Esc 测试：再按 hotkey → 输入半截 → Esc → 浮窗消失，啥都没创建。

> **已知限制**：在 chrome-extension:// 页面（新标签页本身）、chrome:// 页面，content script 不能注入。background 已 skip 这类。用户在 new tab page 直接用顶部输入框即可。

- [ ] **Step 6: Commit**

```bash
git add extension/background.js extension/content/ extension/manifest.json
git commit -m "feat: 全局快捷键浮窗（content script 注入 + bg 处理 capture 消息）"
```

---

### Task 6.3: 浮窗里的 `#` 内联匹配（自动完成）

> **MVP 简化**：v1 浮窗里 `#` 在 input 文本里能解析（已有 `parseTodoInput`），但**不做下拉自动完成**（多一个 UI 复杂度）。用户打完整 # 名字回车即可，匹配在 background 处理。
>
> v2 再做下拉。本 task 仅文档化此决策。

- [ ] **Step 1: 在 spec 范围里确认这是 v1**

无代码改动。检查 design doc §5.3 描述的下拉在浮窗里**不**是必须，仅顶部输入框需要（顶部已实现解析；下拉留 v2）。

- [ ] **Step 2: Commit（可跳过）**

跳过 commit，进入 Task 6.4。

---

### Task 6.4: 在 new tab page 也能响应 hotkey（统一行为）

**Files:**
- Modify: `extension/app.js`

- [ ] **Step 1: 在 app.js 监听同样快捷键**

new tab page 上不需要 overlay，直接 focus 顶部输入框：

```js
document.addEventListener('keydown', (e) => {
  // Cmd+Shift+Space (Mac) / Ctrl+Shift+Space (Win/Linux)
  const isHotkey = (e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'Space'
  if (!isHotkey) return
  e.preventDefault()
  // 先切到 Todos pane，再 focus 输入框
  ;(async () => {
    const { updateSettings } = await import('./settings.js')
    await updateSettings({ toggleVisible: 'todos' })
    const { applyLayout } = await import('./layout.js')
    await applyLayout()
    document.getElementById('todos-input')?.focus()
  })()
})
```

- [ ] **Step 2: 手动 smoke test**

在 new tab page（Tabs 视图）按 hotkey → 应自动切到 Todos 并 focus 输入框。

- [ ] **Step 3: Commit**

```bash
git add extension/app.js
git commit -m "feat: 在 new tab page 内同样的快捷键 → 切 Todos + focus 输入框"
```

---

# Phase 7 · 关 Tab 强提醒（modal + toast）

### Task 7.1: Modal 组件（在 ui.js 中）

**Files:**
- Modify: `extension/ui.js`
- Modify: `extension/style.css`

- [ ] **Step 1: 加 modal HTML + CSS**

style.css：

```css
.tabout-modal-bg {
  position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.45);
  display: flex; align-items: center; justify-content: center;
}
.tabout-modal {
  background: white; border-radius: 12px; padding: 24px 28px;
  width: 480px; max-width: 90vw; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  font-family: 'DM Sans', sans-serif;
}
.tabout-modal h2 {
  font-family: 'Newsreader', serif; font-weight: 400; margin: 0 0 12px;
  font-size: 22px;
}
.tabout-modal ul { list-style: none; padding: 0; margin: 0 0 18px; }
.tabout-modal ul li { padding: 6px 0; font-size: 14px; }
.tabout-modal .actions { display: flex; gap: 8px; justify-content: flex-end; }
.tabout-modal button {
  font-family: 'DM Sans', sans-serif; padding: 8px 16px; border-radius: 6px;
  cursor: pointer; font-size: 13px;
}
.tabout-modal .btn-primary { background: #8b5cf6; color: white; border: none; }
.tabout-modal .btn-secondary { background: white; border: 1px solid #ddd; color: #333; }
.tabout-modal .btn-ghost { background: none; border: none; color: #666; }
```

- [ ] **Step 2: 在 ui.js 加 showModal**

```js
/**
 * 通用 modal。
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.bodyHtml
 * @param {{label, kind, value}[]} opts.buttons   // kind: 'primary' | 'secondary' | 'ghost'
 * @returns {Promise<string>} 选择按钮的 value
 */
export function showModal({ title, bodyHtml, buttons }) {
  return new Promise(resolve => {
    const bg = document.createElement('div')
    bg.className = 'tabout-modal-bg'
    bg.innerHTML = `
      <div class="tabout-modal" role="dialog" aria-modal="true">
        <h2>${title}</h2>
        ${bodyHtml}
        <div class="actions">
          ${buttons.map(b => `<button class="btn-${b.kind}" data-value="${b.value}">${b.label}</button>`).join('')}
        </div>
      </div>
    `
    document.body.appendChild(bg)
    bg.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-value]')
      if (btn) {
        const v = btn.dataset.value
        bg.remove()
        resolve(v)
      }
    })
    // ESC 关掉视为 'cancel'
    document.addEventListener('keydown', function k(e) {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', k)
        bg.remove(); resolve('cancel')
      }
    })
  })
}
```

- [ ] **Step 3: 在 console 烟测**

```js
const { showModal } = await import('./ui.js')
const v = await showModal({ title: 'test', bodyHtml: '<p>body</p>', buttons: [{label:'OK', kind:'primary', value:'ok'}, {label:'Cancel', kind:'ghost', value:'cancel'}] })
console.log(v)
```

- [ ] **Step 4: Commit**

```bash
git add extension/ui.js extension/style.css
git commit -m "feat: ui.js showModal 通用组件（tab-out 风格）"
```

---

### Task 7.2: Tab 卡片内 X 关闭 → 检查绑定 → 弹 modal

**Files:**
- Modify: `extension/app.js`（或 tabs.js，定位"关 tab"的现有处理）

- [ ] **Step 1: 定位 tab-out 现有的关 tab 处理**

```bash
grep -n "chrome.tabs.remove\|close.*tab\|onClick.*close" extension/app.js | head
```

记下函数名（如 `closeTab(tabId)`）。

- [ ] **Step 2: 包一层 guard**

把现有 close 逻辑拆成 `_doCloseTabRaw(tabId)`（原行为）和 `closeTabWithGuard(tabId, url)`：

```js
import { urlIsBound, getTodosBoundToUrl } from './binding.js'
import { completeTodo, updateTodo } from './todos.js'
import { showModal } from './ui.js'

export async function closeTabWithGuard(tabId, url) {
  if (await urlIsBound(url)) {
    const todos = await getTodosBoundToUrl(url)
    const bodyHtml = `
      <p style="margin: 0 0 10px; opacity: 0.7;">即将关闭的 tab 关联了未完成 todo：</p>
      <ul>${todos.map(t => `<li>☐ ${escapeHtml(t.text)}</li>`).join('')}</ul>
    `
    const choice = await showModal({
      title: '先处理这件事？',
      bodyHtml,
      buttons: [
        { label: '✓ 标完成', kind: 'primary', value: 'done' },
        { label: '关 todo 不管', kind: 'secondary', value: 'ignore' },
        { label: '取消', kind: 'ghost', value: 'cancel' },
      ],
    })
    if (choice === 'cancel') return
    if (choice === 'done') {
      for (const t of todos) await completeTodo(t.id)
    } else if (choice === 'ignore') {
      for (const t of todos) {
        await updateTodo(t.id, { boundUrls: t.boundUrls.filter(u => u !== url) })
      }
    }
  }
  _doCloseTabRaw(tabId)
}
```

把 tab-out 原 close 入口（点 X、Close all N tabs）改为调用 `closeTabWithGuard(tab.id, tab.url)`。

- [ ] **Step 3: Close all N tabs 聚合**

定位"Close all N tabs"的实现。包一层：

```js
export async function closeAllTabsInGroupWithGuard(tabs) {
  const bound = []
  for (const t of tabs) {
    if (await urlIsBound(t.url)) bound.push(t)
  }
  if (bound.length === 0) {
    tabs.forEach(t => _doCloseTabRaw(t.id))
    return
  }
  // 聚合：一次性 modal 列出所有 bound urls 的 todos
  const todoMap = new Map()
  for (const tab of bound) {
    const ts = await getTodosBoundToUrl(tab.url)
    ts.forEach(t => todoMap.set(t.id, t))
  }
  const todos = [...todoMap.values()]
  const bodyHtml = `
    <p style="margin: 0 0 10px; opacity: 0.7;">这一组里有 ${bound.length} 个 tab 关联未完成 todo：</p>
    <ul>${todos.map(t => `<li>☐ ${escapeHtml(t.text)}</li>`).join('')}</ul>
  `
  const choice = await showModal({
    title: '先处理这些 todo？',
    bodyHtml,
    buttons: [
      { label: `✓ 全部标完成（${todos.length}）`, kind: 'primary', value: 'done' },
      { label: '关 todo 不管', kind: 'secondary', value: 'ignore' },
      { label: '取消', kind: 'ghost', value: 'cancel' },
    ],
  })
  if (choice === 'cancel') return
  if (choice === 'done') for (const t of todos) await completeTodo(t.id)
  else if (choice === 'ignore') {
    const urlsToRemove = bound.map(t => t.url)
    for (const t of todos) {
      await updateTodo(t.id, { boundUrls: t.boundUrls.filter(u => !urlsToRemove.includes(u)) })
    }
  }
  tabs.forEach(t => _doCloseTabRaw(t.id))
}
```

- [ ] **Step 4: 手动 smoke test**

- 找一个 todo，绑了 github.com（在 Tabs 视图找到 github 卡 → "→ Todo" 加绑）
- 在 Tabs 视图点 github 卡的 X → 应弹 modal 列出该 todo
- 点"✓ 标完成" → modal 消失，github tab 关闭，todo 已划线
- 重做一次绑定，点 X → modal → 点"关 todo 不管" → tab 关闭，todo 仍 pending 但 boundUrls 已移除 github
- 重做一次，点"取消" → tab 不关，啥都不变

- [ ] **Step 5: Commit**

```bash
git add extension/app.js extension/binding.js
git commit -m "feat: 关 tab 强提醒 modal（3 按钮：标完成 / 关 todo 不管 / 取消）+ Close all 聚合版"
```

---

### Task 7.3: 浏览器原生关 tab → 兜底 toast

**Files:**
- Modify: `extension/background.js`

- [ ] **Step 1: bg 监听 onRemoved + 广播 toast**

在 background.js 加：

```js
const _recentlyClosed = new Map() // tabId -> { url, ts }

// 缓存 tab 信息（onRemoved 时 tab 已经没了）
chrome.tabs.onUpdated.addListener((tabId, _info, tab) => {
  if (tab.url) _recentlyClosed.set(tabId, { url: tab.url, title: tab.title || '' })
})

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const meta = _recentlyClosed.get(tabId)
  _recentlyClosed.delete(tabId)
  if (!meta) return

  const { urlIsBound, getTodosBoundToUrl } = await import('./binding.js')
  if (!(await urlIsBound(meta.url))) return

  const todos = await getTodosBoundToUrl(meta.url)

  // 广播给所有打开的 new tab pages
  const allTabs = await chrome.tabs.query({})
  for (const t of allTabs) {
    if (t.url && t.url.includes('index.html')) {  // new tab page
      chrome.tabs.sendMessage(t.id, {
        type: 'tab-closed-while-bound',
        url: meta.url,
        title: meta.title,
        todos,
      }).catch(() => {})
    }
  }
})
```

- [ ] **Step 2: new tab page 接收消息 → 显示 toast**

在 app.js 加：

```js
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'tab-closed-while-bound') {
    showClosureToast(msg.url, msg.title, msg.todos)
  }
})

function showClosureToast(url, title, todos) {
  // 创建 toast DOM（不复用 #toast 因为这个要有按钮）
  const el = document.createElement('div')
  el.className = 'closure-toast'
  el.innerHTML = `
    <div class="ct-text">🔗 刚关闭的 tab 关联 ${todos.length} 个 todo</div>
    <button data-action="reopen">↶ 撤销关闭</button>
    <button data-action="mark-done">✓ 全部标完成</button>
  `
  document.body.appendChild(el)

  let dismissed = false
  function dismiss() { if (!dismissed) { dismissed = true; el.classList.add('out'); setTimeout(() => el.remove(), 300) } }

  el.addEventListener('click', async (e) => {
    const action = e.target.dataset.action
    if (action === 'reopen') {
      chrome.tabs.create({ url, active: true })
    } else if (action === 'mark-done') {
      const { completeTodo } = await import('./todos.js')
      for (const t of todos) await completeTodo(t.id)
      const { renderTodosView } = await import('./todos-view.js')
      await renderTodosView()
    }
    dismiss()
  })

  // 5 秒自动消失
  setTimeout(dismiss, 5000)
}
```

CSS：

```css
.closure-toast {
  position: fixed; bottom: 24px; right: 24px; z-index: 500;
  background: #1a1a1a; color: white; padding: 14px 18px; border-radius: 10px;
  display: flex; gap: 12px; align-items: center; font-size: 13px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.25);
  animation: ct-in 0.25s ease-out;
}
.closure-toast.out { animation: ct-out 0.3s ease-in forwards; }
.closure-toast button {
  background: rgba(139,92,246,0.2); color: white; border: 1px solid #8b5cf6;
  border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 12px;
}
.closure-toast button:hover { background: #8b5cf6; }
@keyframes ct-in { from { transform: translateY(20px); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes ct-out { to { transform: translateY(20px); opacity: 0 } }
```

- [ ] **Step 3: 手动 smoke test**

- 创建一个绑 github.com 的 todo
- **打开 new tab page**（必须打开，toast 才显示）
- 从浏览器 tab bar 关闭 github tab（或 Cmd+W）
- new tab page 右下角应出现 toast，5 秒消失。期间点 "撤销关闭" 应重开 github tab；点 "全部标完成" 应让 todo 划线

- [ ] **Step 4: Commit**

```bash
git add extension/background.js extension/app.js extension/style.css
git commit -m "feat: 浏览器原生关 tab 兜底 — 5 秒 auto-dismiss toast（撤销 / 标完成）"
```

---

### Task 7.4: 单元测试 — guard 逻辑

**Files:**
- Test: `tests/close-guard.test.js`

- [ ] **Step 1: 写测试覆盖核心判定**

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { createTodo, completeTodo } from '../extension/todos.js'
import { urlIsBound, getTodosBoundToUrl } from '../extension/binding.js'

beforeEach(async () => { await chrome.storage.local.clear() })

describe('close-tab guard logic', () => {
  it('urlIsBound returns true for pending todo', async () => {
    await createTodo({ text: 't', boundUrls: ['https://a.com'] })
    expect(await urlIsBound('https://a.com')).toBe(true)
  })

  it('urlIsBound returns false after todo completed', async () => {
    const t = await createTodo({ text: 't', boundUrls: ['https://a.com'] })
    await completeTodo(t.id)
    expect(await urlIsBound('https://a.com')).toBe(false)
  })

  it('multiple todos for same URL', async () => {
    await createTodo({ text: 't1', boundUrls: ['https://a.com'] })
    await createTodo({ text: 't2', boundUrls: ['https://a.com'] })
    const ts = await getTodosBoundToUrl('https://a.com')
    expect(ts).toHaveLength(2)
  })
})
```

- [ ] **Step 2: 跑测试 — 应 PASS（之前实现已支持）**

Run: `npm test`

- [ ] **Step 3: Commit**

```bash
git add tests/close-guard.test.js
git commit -m "test: 关 tab guard 逻辑单测（urlIsBound / getTodosBoundToUrl）"
```

---

# Phase 8 · 生命周期（confetti、过夜、归档）

### Task 8.1: 勾选 ☑ → 调用 completeTodo + confetti 复用

**Files:**
- Modify: `extension/todos-view.js`

- [ ] **Step 1: 加 click 事件（已经在 wireTodosView 内）**

```js
if (e.target.matches('.todo-list li')) {
  // 点 checkbox 区域（li 开头的 ☐）
  const li = e.target
  const id = li.dataset.id
  if (li.classList.contains('done')) return
  // 计算点击位置，只在前 30px 视为勾选
  const rect = li.getBoundingClientRect()
  if (e.clientX - rect.left > 30) return  // 点别处不勾

  ;(async () => {
    const { completeTodo, listTodos } = await import('./todos.js')
    const { burstConfetti, playSwoosh } = await import('./ui.js')
    const { archiveIfAllDone } = await import('./projects.js')

    burstConfetti(li, { count: 28 })
    playSwoosh()
    await completeTodo(id)
    // 触发自动归档（如果是项目 todo）
    const all = await listTodos()
    const t = all.find(x => x.id === id)
    if (t?.projectId) await archiveIfAllDone(t.projectId)
    setTimeout(() => renderTodosView(), 600)  // 等 confetti 飞一会儿
  })()
}
```

- [ ] **Step 2: 手动 smoke test**

切 Todos，点某个 todo 的 ☐ 区域 → confetti 粒子从 li 飞出 + swoosh 音 + 0.6s 后该 todo 划线下沉。

- [ ] **Step 3: Commit**

```bash
git add extension/todos-view.js
git commit -m "feat: 勾选 ☑ 触发 confetti + 音效 + 自动归档"
```

---

### Task 8.2: 过夜规则 — 页面加载时计算 rolloverCount

**Files:**
- Modify: `extension/todos.js`
- Test: `tests/rollover.test.js`

- [ ] **Step 1: 写测试**

`tests/rollover.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { createTodo, listTodos, runDailyRollover } from '../extension/todos.js'
import { getStorage, setStorage, KEYS } from '../extension/storage.js'

beforeEach(async () => { await chrome.storage.local.clear() })

describe('runDailyRollover', () => {
  it('no rollover when lastRolloverDate === today', async () => {
    await createTodo({ text: 'a' })
    await runDailyRollover()
    const all = await listTodos()
    expect(all[0].rolloverCount).toBe(0)
  })

  it('rolls over by diff days', async () => {
    await createTodo({ text: 'a' })
    const all = await listTodos()
    all[0].lastRolloverDate = '2026-05-10' // 假设今天是 2026-05-17 → 7 天前
    await setStorage(KEYS.todos, all)

    // 注意：测试基于今天日期；我们 mock 让 rollover 计算今天与 lastRollover 差
    await runDailyRollover()
    const after = await listTodos()
    // 因为今天对 vitest 是 dynamic，无法硬编码。改为：
    // 验证 rolloverCount > 0 且 lastRolloverDate 已更新到今天
    expect(after[0].rolloverCount).toBeGreaterThan(0)
    const today = new Date().toISOString().slice(0, 10)
    expect(after[0].lastRolloverDate).toBe(today)
  })

  it('does not roll over done todos', async () => {
    const t = await createTodo({ text: 'a' })
    const { completeTodo } = await import('../extension/todos.js')
    await completeTodo(t.id)
    const all = await listTodos()
    all[0].lastRolloverDate = '2026-01-01'
    await setStorage(KEYS.todos, all)

    await runDailyRollover()
    const after = await listTodos()
    expect(after[0].rolloverCount).toBe(0)
  })
})
```

- [ ] **Step 2: 实现 runDailyRollover**

加到 `extension/todos.js`:

```js
function daysBetween(fromYmd, toYmd) {
  const a = new Date(fromYmd + 'T00:00:00')
  const b = new Date(toYmd + 'T00:00:00')
  return Math.round((b - a) / (1000 * 60 * 60 * 24))
}

export async function runDailyRollover() {
  const today = todayStr()
  const all = await listTodos()
  let changed = false
  for (const t of all) {
    if (t.status !== 'pending') continue
    const last = t.lastRolloverDate || new Date(t.createdAt).toISOString().slice(0, 10)
    if (last === today) continue
    const diff = daysBetween(last, today)
    if (diff > 0) {
      t.rolloverCount = (t.rolloverCount || 0) + diff
      t.lastRolloverDate = today
      changed = true
    }
  }
  if (changed) await setStorage(KEYS.todos, all)
  return changed
}
```

- [ ] **Step 3: 跑测试 — PASS**

Run: `npm test`

- [ ] **Step 4: app.js 启动调用 runDailyRollover**

```js
import { runDailyRollover } from './todos.js'

// 在 initStateBeforeRender 内最前面
await runDailyRollover()
```

- [ ] **Step 5: renderTodoLi 显示 +Nd 徽标**

修改 renderTodoLi：

```js
const badge = t.rolloverCount > 0
  ? `<span class="rollover-badge ${t.rolloverCount >= 7 ? 'amber' : ''}" title="已拖延 ${t.rolloverCount} 天">+${t.rolloverCount}d</span>`
  : ''
return `<li class="${done ? 'done' : ''}" data-id="${t.id}">${checkbox} ${escapeHtml(t.text)} ${badge} ${addBindBtn}${bindingsHtml}</li>`
```

style.css：

```css
.rollover-badge {
  display: inline-block; padding: 1px 6px; font-size: 10px; opacity: 0.7;
  background: #f0f0f0; border-radius: 8px; margin-left: 4px;
}
.rollover-badge.amber { background: #fef3c7; color: #92400e; opacity: 1; }
```

- [ ] **Step 6: 手动 smoke test（伪造时间）**

console:
```js
const { listTodos } = await import('./todos.js')
const { setStorage, KEYS } = await import('./storage.js')
const all = await listTodos()
all[0].lastRolloverDate = '2026-05-10'
await setStorage(KEYS.todos, all)
location.reload()
```
新页面应在该 todo 旁显示 `+7d` 琥珀色徽标。

- [ ] **Step 7: Commit**

```bash
git add extension/todos.js tests/rollover.test.js extension/todos-view.js extension/style.css extension/app.js
git commit -m "feat: 今日过夜 — runDailyRollover 算天数差 + +Nd 徽标（>=7 琥珀）"
```

---

### Task 8.3: 历史折叠区行为 + 已结项目折叠区

**Files:**
- Modify: `extension/todos-view.js`

> 渲染骨架早已包含 `<details>` 折叠区（Task 3.1）。本 task 完善：让已完成的项目 todo 留在卡内并下沉、整项目完成后卡片滑入"已结项目"。

- [ ] **Step 1: renderProjectCard 内排序：pending 在前、done 在后划线**

(已在 Task 3.1 实现。本 step 检查无误。)

- [ ] **Step 2: 整项目完成后 archiveIfAllDone 已经处理，渲染时已显示在折叠区（Task 3.1）**

确认 Task 3.1 的 `renderProjects()` 已渲染 archived list。如未，补：

```js
const archivedProjs = (await listProjects({ includeArchived: true })).filter(p => p.archived)
document.getElementById('archivedCount').textContent = `(${archivedProjs.length})`
document.getElementById('archivedProjectsList').innerHTML = archivedProjs
  .map(p => `<div class="archived-proj" data-id="${p.id}">${escapeHtml(p.name)} <button data-action="unarchive">↺</button></div>`).join('')
```

- [ ] **Step 3: 项目卡完成滑动动画**

在 renderTodosView 完成后，如果某项目刚刚被归档，加 animation class。可选实现：

简化版（v1 满足"自动归档"已足够，动画在 v2）：跳过 animation，仅依靠重渲染让项目从主列表消失、出现在折叠区。

- [ ] **Step 4: 取消归档**

事件代理：

```js
if (e.target.dataset?.action === 'unarchive') {
  const id = e.target.closest('[data-id]').dataset.id
  const { updateProject } = await import('./projects.js')
  await updateProject(id, { archived: false })
  await renderTodosView()
}
```

- [ ] **Step 5: 手动 smoke test**

- 创建项目"招聘"，加 2 个 todos
- 把 2 个都勾掉
- "招聘"应从主项目区消失，出现在"📁 已结项目 (1)"折叠区，展开看到 名字 + ↺
- 点 ↺ → 项目回到主区

- [ ] **Step 6: Commit**

```bash
git add extension/todos-view.js
git commit -m "feat: 已结项目折叠区 + ↺ 取消归档"
```

---

### Task 8.4: 今日"📁 历史"折叠区只显示当天 done

> Task 2.3 的 `listTodayTodos` 已经按 `isToday(completedAt)` 过滤。Task 3.1 的渲染已经放进 `<details>`。本 task 只是验证 + 视觉打磨。

**Files:**
- 无新文件

- [ ] **Step 1: 手动 smoke test**

- 创建 3 个无项目 todo
- 勾完 1 个 → 今日列表少 1，折叠区 "📁 历史 (1)" 展开看到那条
- 第二天打开（伪造：把那条 completedAt 改成昨天，reload）→ 它从今日历史消失（不再算今天 done）

伪造：
```js
const { listTodos } = await import('./todos.js')
const { setStorage, KEYS } = await import('./storage.js')
const all = await listTodos()
const done = all.find(t => t.status === 'done')
done.completedAt = Date.now() - 86400000 * 2
await setStorage(KEYS.todos, all)
location.reload()
```

- [ ] **Step 2: 如果验证通过，跳过 commit**

否则修复后 commit："fix: 历史折叠区按 completedAt 过滤"

---

### Task 8.5: 跨标签页同步 closure-toast（避免一次多次弹）

**Files:**
- Modify: `extension/app.js`

> **问题**：当用户开了 N 个 new tab page，bg 给所有 page 发 `tab-closed-while-bound`，结果 toast 弹 N 个。需要去重。

- [ ] **Step 1: 加 dedup key**

bg 发消息时附带 `closureId`（unique）；app.js 收到后用 storage 记一笔，先到先 toast，后到的看到记录就跳过。

bg 修改：

```js
chrome.tabs.onRemoved.addListener(async (tabId) => {
  // ...
  const closureId = `${tabId}-${Date.now()}`
  for (const t of allTabs) {
    chrome.tabs.sendMessage(t.id, { type: 'tab-closed-while-bound', closureId, url: meta.url, title: meta.title, todos })
  }
})
```

app.js 修改：

```js
const _shownClosures = new Set()
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'tab-closed-while-bound') return
  if (_shownClosures.has(msg.closureId)) return
  _shownClosures.add(msg.closureId)
  // 用 storage 让其他 new tab pages 知道
  chrome.storage.local.get('taboutShownClosures', (data) => {
    const shown = data.taboutShownClosures || []
    if (shown.includes(msg.closureId)) return
    chrome.storage.local.set({ taboutShownClosures: [...shown, msg.closureId].slice(-50) })
    showClosureToast(msg.url, msg.title, msg.todos)
  })
})
```

(这是近似去重；race condition 可能仍多弹 1 次，可接受。)

- [ ] **Step 2: 手动 smoke test**

开 3 个 new tab page。关一个绑 github 的 tab → toast 只在 1 个 new tab page 弹（最先收到的）。

- [ ] **Step 3: Commit**

```bash
git add extension/background.js extension/app.js
git commit -m "fix: closure toast 跨多 new tab pages 去重（closureId + storage）"
```

---

# Phase 9 · 编辑 / 删除 / ⭐ / 设置收尾

### Task 9.1: 双击 todo 文本 inline edit

**Files:**
- Modify: `extension/todos-view.js`

- [ ] **Step 1: 事件代理（在 wireTodosView 内）**

```js
document.addEventListener('dblclick', (e) => {
  const li = e.target.closest('.todo-list li')
  if (!li || li.classList.contains('done')) return
  if (e.target.closest('.bindings') || e.target.closest('button')) return
  startInlineEdit(li)
})

function startInlineEdit(li) {
  const id = li.dataset.id
  // 取出原 text（li.textContent 含 checkbox 等噪音，从 data 直接读）
  ;(async () => {
    const { listTodos, updateTodo } = await import('./todos.js')
    const all = await listTodos()
    const t = all.find(x => x.id === id)
    if (!t) return

    // 重建 raw 字符串（text + #project 如有）
    const { listProjects } = await import('./projects.js')
    const projs = await listProjects({ includeArchived: true })
    const proj = projs.find(p => p.id === t.projectId)
    const raw = proj ? `${t.text} #${proj.name}` : t.text

    const input = document.createElement('input')
    input.type = 'text'
    input.value = raw
    input.className = 'inline-edit'
    li.innerHTML = '☐ '  // 重置内容
    li.appendChild(input)
    input.focus()
    input.select()

    async function commit() {
      const newRaw = input.value.trim()
      if (!newRaw) {
        await renderTodosView(); return
      }
      const { parseTodoInput } = await import('./input-parser.js')
      const { text: newText, projectName } = parseTodoInput(newRaw)
      let newProjectId = null
      if (projectName) {
        const { searchProjects, createProject } = await import('./projects.js')
        const matches = await searchProjects(projectName)
        const exact = matches.find(p => p.name.toLowerCase() === projectName.toLowerCase())
        newProjectId = (exact ?? await createProject({ name: projectName })).id
      }
      await updateTodo(id, { text: newText, projectId: newProjectId })
      await renderTodosView()
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit() }
      if (e.key === 'Escape') renderTodosView()
    })
    input.addEventListener('blur', commit)
  })()
}
```

CSS：

```css
.inline-edit {
  border: 1px solid #8b5cf6; border-radius: 4px; padding: 2px 6px;
  font-size: 13px; width: 70%;
}
```

- [ ] **Step 2: 手动 smoke test**

双击某 todo 文本 → 变成 input，光标在内。改文本，回车 → 保存。再双击改 `#项目名` → 项目归属变化。

- [ ] **Step 3: Commit**

```bash
git add extension/todos-view.js extension/style.css
git commit -m "feat: 双击 todo 文本 inline edit（改文本 + 改项目）"
```

---

### Task 9.2: ⭐ pin/unpin today

**Files:**
- Modify: `extension/todos-view.js`
- Modify: `extension/style.css`

- [ ] **Step 1: 项目 todo 上加 ⭐ 按钮**

修改 renderTodoLi 区分项目 todo：

```js
function renderTodoLi(t, done = false, inProjectCard = false) {
  // ...
  const pinBtn = (!done && inProjectCard) || (!done && t.projectId && !inProjectCard)
    ? `<button class="t-pin" data-id="${t.id}" data-pinned="${t.pinnedToday ? 'true' : 'false'}" title="${t.pinnedToday ? '取消今日' : '挂今日'}">${t.pinnedToday ? '⭐' : '☆'}</button>`
    : ''
  // ...
}
```

调用：在 renderProjectCard 里传 inProjectCard=true。今日 view 里出现的项目 todo 也显示 ⭐（因为 pinnedToday=true）。

- [ ] **Step 2: 事件**

```js
if (e.target.classList.contains('t-pin')) {
  e.stopPropagation()
  const id = e.target.dataset.id
  const pinned = e.target.dataset.pinned === 'true'
  const { pinTodayTodo, unpinTodayTodo } = await import('./todos.js')
  if (pinned) await unpinTodayTodo(id)
  else await pinTodayTodo(id)
  await renderTodosView()
}
```

- [ ] **Step 3: CSS**

```css
.t-pin {
  background: none; border: none; cursor: pointer; opacity: 0.4; font-size: 14px;
}
.t-pin:hover { opacity: 1; }
.t-pin[data-pinned="true"] { opacity: 1; }
```

- [ ] **Step 4: 手动 smoke test**

- 在项目里创建 todo "评审" → 项目卡内看到 ☆
- 点 ☆ → 变 ⭐，"今日"列表多出该条
- 点 ⭐ → 变 ☆，"今日"少一条；项目卡内仍在

- [ ] **Step 5: Commit**

```bash
git add extension/todos-view.js extension/style.css
git commit -m "feat: ⭐/☆ 按钮挂/取消挂今日（重叠模型 UI 入口）"
```

---

### Task 9.3: 删除 todo / 删除项目（含确认 + 撤销 toast）

**Files:**
- Modify: `extension/todos-view.js`
- Modify: `extension/style.css`

- [ ] **Step 1: todo hover 出现 🗑 + 5 秒撤销**

renderTodoLi 末尾加：

```js
const delBtn = !done ? `<button class="t-delete" data-id="${t.id}" title="删除">🗑</button>` : ''
```

事件：

```js
if (e.target.classList.contains('t-delete')) {
  e.stopPropagation()
  const id = e.target.dataset.id
  const { deleteTodo, createTodo, listTodos } = await import('./todos.js')
  const all = await listTodos()
  const snapshot = all.find(t => t.id === id)
  if (!snapshot) return
  await deleteTodo(id)
  await renderTodosView()
  showUndoToast(`已删除"${snapshot.text}"`, async () => {
    // 恢复（用相同 id）
    const stored = await getStorage(KEYS.todos, [])
    stored.push(snapshot)
    await setStorage(KEYS.todos, stored)
    await renderTodosView()
  }, 5000)
}
```

showUndoToast 在 ui.js 加：

```js
export function showUndoToast(text, onUndo, duration = 5000) {
  const el = document.createElement('div')
  el.className = 'undo-toast'
  el.innerHTML = `<span>${text}</span><button>↶ 撤销</button>`
  document.body.appendChild(el)
  let restored = false
  el.querySelector('button').addEventListener('click', async () => {
    restored = true; await onUndo(); el.remove()
  })
  setTimeout(() => { if (!restored) el.classList.add('out'); setTimeout(() => el.remove(), 300) }, duration)
}
```

CSS：

```css
.t-delete {
  background: none; border: none; opacity: 0; cursor: pointer; font-size: 13px;
  margin-left: 6px;
}
.todo-list li:hover .t-delete { opacity: 0.45; }
.t-delete:hover { opacity: 1; }
.undo-toast {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 600;
  background: #1a1a1a; color: white; padding: 10px 16px; border-radius: 8px;
  display: flex; gap: 12px; font-size: 12px;
}
.undo-toast button { background: none; border: 1px solid #888; color: white; padding: 2px 10px; border-radius: 4px; cursor: pointer; }
.undo-toast.out { opacity: 0; transition: opacity 0.3s; }
```

- [ ] **Step 2: 项目 ⋯ 菜单 → 删除项目（带 todos 处理）**

项目卡上加 ⋯ 按钮 + 简单 menu：

```js
// 在 renderProjectCard 顶部加：
<button class="p-menu" data-id="${p.id}" title="…">⋯</button>
```

事件：

```js
if (e.target.classList.contains('p-menu')) {
  e.stopPropagation()
  const id = e.target.dataset.id
  const proj = (await listProjects({ includeArchived: true })).find(p => p.id === id)
  const { listTodos, updateTodo, deleteTodo } = await import('./todos.js')
  const all = await listTodos()
  const projTodos = all.filter(t => t.projectId === id)

  const choice = await showModal({
    title: `删除项目"${proj.name}"？`,
    bodyHtml: projTodos.length === 0
      ? `<p>项目内无 todos，可直接删除。</p>`
      : `<p>项目内有 ${projTodos.length} 个 todos。</p>`,
    buttons: projTodos.length === 0
      ? [{ label: '删除', kind: 'primary', value: 'del' }, { label: '取消', kind: 'ghost', value: 'cancel' }]
      : [
          { label: '把 todos 改为无项目，删项目', kind: 'primary', value: 'keep' },
          { label: '一并删 todos', kind: 'secondary', value: 'all' },
          { label: '取消', kind: 'ghost', value: 'cancel' },
        ],
  })
  if (choice === 'cancel') return
  if (choice === 'keep') for (const t of projTodos) await updateTodo(t.id, { projectId: null })
  if (choice === 'all') for (const t of projTodos) await deleteTodo(t.id)
  const { deleteProject } = await import('./projects.js')
  await deleteProject(id)
  await renderTodosView()
}
```

CSS：

```css
.p-menu { opacity: 0.3; background: none; border: none; cursor: pointer; font-size: 16px; float: right; }
.project-card:hover .p-menu { opacity: 1; }
```

- [ ] **Step 3: 手动 smoke test**

- todo: hover → 🗑 → 点 → toast 5 秒可撤销
- 项目: hover → ⋯ → modal 三选 / 二选

- [ ] **Step 4: Commit**

```bash
git add extension/todos-view.js extension/ui.js extension/style.css
git commit -m "feat: 删除 todo (5s 撤销) + 删除项目 (modal 三选)"
```

---

### Task 9.4: 自动归档动画 + closeAllTabs 时 confetti 复用

**Files:**
- Modify: `extension/todos-view.js`
- Modify: `extension/style.css`

- [ ] **Step 1: 项目归档时 confetti（区分于 todo 勾选）**

修改 renderTodosView 在重渲染前检测：

```js
// 在 renderTodosView 顶部
const prevArchivedIds = new Set((await listProjects({ includeArchived: true })).filter(p => p.archived).map(p => p.id))

// 渲染后比较新归档的
// 但这要在 archiveIfAllDone 完成后立刻知道——不如直接在 completeTodo 流程中加 confetti
```

直接利用 Task 2.2 中 `archiveIfAllDone` 已返回 boolean 的特性：在 Task 8.1 的勾选 handler 加一段。

修改 Task 8.1 那段勾选 handler：

```js
// 把这两行：
//   const all = await listTodos()
//   const t = all.find(x => x.id === id)
//   if (t?.projectId) await archiveIfAllDone(t.projectId)
// 改为：
const all = await listTodos()
const t = all.find(x => x.id === id)
let justArchived = false
if (t?.projectId) {
  justArchived = await archiveIfAllDone(t.projectId)
}
if (justArchived) {
  // 整项目完成的庆祝 confetti（比单 todo 更大）
  setTimeout(() => {
    const card = document.querySelector(`.project-card[data-id="${t.projectId}"]`)
    if (card) burstConfetti(card, { count: 80 })
  }, 200)
}
setTimeout(() => renderTodosView(), 600)
```

（无需改 projects.js，Task 2.2 已是 boolean 返回。）

- [ ] **Step 2: 手动 smoke test**

把项目 X 内最后一条 todo 勾掉 → 看到该 todo 的 confetti 后，整个项目卡也爆一次 confetti，然后滑入归档区。

- [ ] **Step 3: Commit**

```bash
git add extension/todos-view.js
git commit -m "feat: 项目自动归档时额外 confetti（成就感）"
```

---

### Task 9.5: 端到端 smoke 测试 + README 收尾

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 写完整 smoke test 步骤到 README**

追加到 README.md 末尾：

```markdown
## v1 验收清单（端到端 smoke test）

按顺序操作，每步都应正常：

1. 打开新标签页 → 默认 Tabs 视图，原 tab-out 行为完整（domain 分组、saved-for-later、关 tab 动画）
2. 点右上角 "Tabs · Todos" → 切到 Todos
3. 输入框打 "试试 #demo" 回车 → 项目"demo"出现，含"试试"
4. 输入 "无项目事" 回车 → 今日列表多一条
5. 在 Tabs 视图 hover 某 tab → "→ Todo" 按钮出现 → 点 → popover 新建"读这个" → Todos 多一条带 🟢 绑定
6. 在另一个网页按 `Cmd+Shift+Space` → 浮窗出现 → 打"远程提醒" + 勾"绑定当前 tab" → 回车 → Todos 多一条带 🟢
7. 关掉刚才绑过的网页 tab → new tab page 右下角出现 5 秒 toast → 点 ↶ 应重开
8. 切到 Todos → 双击某 todo → 改名 → 回车保存
9. ⭐ 把项目里某 todo 挂今日 → 今日列表多一条 → 再点 ☆ 取消
10. 勾掉一个 todo → swoosh + confetti
11. 勾掉某项目里所有 todos → 项目卡 confetti → 滑入"已结项目"折叠区
12. 设置面板：换布局模式（左右 / 上下 / 整页）→ 隔离线可拖、双击复位
13. 设置面板：关音效 → 再勾完一个 todo 无声音

如全部通过，v1 完成。
```

- [ ] **Step 2: 把 manifest version 升到 1.0.0**

```json
"version": "1.0.0"
```

- [ ] **Step 3: 手动跑一遍 smoke list**

确认没遗漏 / 没 regression。

- [ ] **Step 4: Final commit**

```bash
git add README.md extension/manifest.json
git commit -m "release: v1.0.0 — Tab Out + Todo MVP feature-complete"
git tag v1.0.0
```

---

# Self-Review（执行计划完成后做）

按 writing-plans 要求，在所有 task 完成后做一次自检：

- [ ] Spec 覆盖：把 spec §3–§8 每个章节扫一遍，对照 plan 找对应 task；列任何缺失
- [ ] 占位符扫描：搜索 `TODO`, `TBD`, `// ...`，确认实现完整
- [ ] 类型一致性：所有 storage key 与 §3.4 一致（`taboutTodos`, `taboutProjects`, `taboutSettings`, `taboutBindingsCache`, `taboutUrlTitles`）
- [ ] 函数命名一致：plan 各 task 间引用的函数名是否对得上
- [ ] 验收：跑一遍 Task 9.5 的 smoke list

---

# Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-17-tab-out-todo.md`.

两种执行方式（向 plan 引用方回答）：

1. **Subagent-Driven（推荐）** — 每个 task 派一个 fresh subagent，主线在 task 之间 review，迭代快
2. **Inline Execution** — 在当前会话内执行，batch 推进 + checkpoint

Which approach?
