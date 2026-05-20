# Tab Out + Todo

Tab Out（by [Zara](https://github.com/zarazhangrui/tab-out)）的 fork，在原 tab 管理功能基础上扩展待办管理：深度绑定 tab、今日 + 项目双 view、全局快捷键捕获。

替换浏览器新标签页，每次开新标签都同时看到 tabs 和 todos。

## 核心特性

- ✅ 保留 tab-out 全部功能（按 domain 分组、Saved for later、duplicate 检测、关闭动画）
- ✅ 顶部输入框 + 全局快捷键 `Cmd/Ctrl+Shift+Space` 双通道捕获
- ✅ Todo 可绑定 0/1/N 个 tab（双向操作 + 模糊搜索）
- ✅ 关 tab 时强提醒 modal（3 选项：标完成 / 仅关 tab / 取消）
- ✅ 浏览器原生关 tab 兜底 toast（10s 堆叠，3 种行为可配置）
- ✅ 三种布局模式（整页切换 / 左右 / 上下分区，可拖拽分隔线）
- ✅ 今日 + 项目双 view，重叠模型（`pinnedToday`）
- ✅ `#项目名` 内联语法 + 项目颜色调色板
- ✅ 勾选完成 confetti + swoosh + 整项目完成时再爆一次大 confetti
- ✅ 今日过夜规则：未完成自动滚动 + `+Nd` 徽标
- ✅ 双击编辑、⭐pin/取消挂今日、🗑 删除 + 5s 撤销
- ✅ 跨多个新标签页实时同步
- ✅ 100% 本地存储（`chrome.storage.local`）

## 安装

1. 克隆此 repo
2. 打开 `chrome://extensions`（或 `edge://extensions`），开启 Developer mode
3. Load unpacked → 选择 `extension/` 目录

**不需要** npm、node、构建步骤。

## 开发

```bash
npm install        # 仅开发期依赖（vitest + jest-chrome）
npm test           # 跑单测（45 个）
npm run test:watch # 监听模式
```

代码改完后，到 `chrome://extensions` 点 reload。

## 完整 smoke test 清单（v1.0.0 验收）

按顺序操作，每步都应正常：

**布局与基础**
- [ ] 打开新标签页 → 默认 Tabs 视图，原 tab-out 行为完整（domain 分组、saved-for-later、关 tab 动画）
- [ ] 右上角 "Tabs · Todos" 按钮点一下 → 切到 Todos
- [ ] 右下角齿轮 → 设置面板弹出：布局模式 / 声音 / 浏览器原生关 tab 行为 / 快捷键提示 / 关于
- [ ] 切到左右分区 → 中间有灰色竖线，hover 变紫，拖动改比例，双击复位
- [ ] 切到上下分区 → 中间横线同理
- [ ] 切回整页切换 → 恢复

**Todo 创建**
- [ ] Todos 视图输入框打 `测试 #demo` 回车 → 项目"demo"出现，含"测试"
- [ ] 输入 `无项目事` 回车 → 今日列表多一条
- [ ] 点 `+ 新建项目` → prompt 输入名字 → 项目卡新建

**Tab 绑定**
- [ ] 在 Tabs 视图 hover 任一 tab 卡 → "→ Todo" 紫色按钮出现
- [ ] 点 "→ Todo" → popover：顶部输入框 + 下方现有 todos 列表（支持模糊搜索）
- [ ] 输入"读这个"回车 → Todos 多一条带 🟢 绑定 + toast "已加到 todos"
- [ ] popover 点空白外侧 → 关闭
- [ ] 切到 Todos，hover 某 todo → "🔗 +" 出现
- [ ] 点 "🔗 +" → popover 列出所有开放 tabs（带搜索框）
- [ ] 输入关键词过滤 → 列表实时缩减
- [ ] 点选一条 → todo 多一条 🟢 + toast "已加绑"
- [ ] todo 上点 🟢 标题 → 跳转到对应 tab
- [ ] hover 绑定行右侧 × → 解绑

**全局快捷键**
- [ ] 在任意普通网页按 Cmd+Shift+Space → 浮窗出现，默认勾"绑定当前 tab"
- [ ] 输入"远程提醒 #demo"回车 → 浮窗关闭 → 新标签页 Todos demo 项目下多一条带 🟢
- [ ] 在新标签页按同样快捷键 → 自动切到 Todos 并 focus 输入框

**关 tab 提醒**
- [ ] 关一个绑了未完成 todo 的 tab（在 Tabs 视图点 X）→ modal 弹出 "该 tab 已关联 todo，想如何处理？" 三按钮
- [ ] 点 "✓ 标完成" → todo 划线，tab 关闭
- [ ] 重做绑定，点 "仅关闭 tab" → todo 保留，URL 解绑
- [ ] 浏览器原生 Cmd+W 关绑过的 tab → 新标签页右下角 toast，10s 倒计时 + 撤销/标完成按钮
- [ ] 设置面板切"自动移除绑定" → 关 tab 时 todo 上的 URL chip 自动消失
- [ ] 设置切"1:1 时自动完成" → 关唯一绑定的 tab 时，todo 自动划线 + toast"已自动完成"

**编辑 / 删除 / pin**
- [ ] 双击 todo 文本 → 变成 input → 改文本 + 改 `#项目` → 回车保存
- [ ] hover 项目内 todo → ☆ 出现 → 点变 ⭐ → 今日列表立刻多一条
- [ ] 点 ⭐ → 变 ☆，今日少一条
- [ ] hover todo → 🗑 出现 → 点 → todo 消失 + 底部居中 toast "已删除... ↶ 撤销" 5s
- [ ] 点撤销 → todo 恢复

**完成 / 归档**
- [ ] 点 todo 左侧 ☐ 区域（leftmost 30px）→ confetti + swoosh + 划线下沉到 📁 历史
- [ ] 把项目内最后一条 todo 勾完 → 项目卡再爆一次大 confetti → 卡片滑入 📁 已结项目
- [ ] 展开 📁 已结项目 → 点项目右侧 ↺ → 项目恢复到主项目区

**项目删除**
- [ ] hover 项目卡右上角 ⋯ → 点 → modal 三选 "把 todos 改为无项目，删项目" / "一并删 todos" / "取消"
- [ ] 选"把 todos 改为无项目" → 项目消失，todos 重新出现在无项目里
- [ ] 选"一并删 todos" → 项目和 todos 一起消失

**今日过夜（需要等到第二天再测）**
- [ ] 今天创建一条无项目 todo，明天打开 → 仍在今日，旁边有 `+1d` 徽标
- [ ] 拖到 7 天以上 → 徽标变琥珀色

**多标签页同步**
- [ ] 开两个新标签页 A、B，A 输入一条 todo → B 自动出现（无需 reload）
- [ ] A 关一个绑过的 tab → B 也弹 toast（去重，只弹一次）

## 文档

- 设计：`docs/superpowers/specs/2026-05-17-tab-out-todo-design.md`
- 实现计划：`docs/superpowers/plans/2026-05-17-tab-out-todo.md`
- 推文：`docs/twitter-thread.md`

## License

继承 tab-out 的 MIT。

## 致谢

感谢 [Zara](https://github.com/zarazhangrui)（@zarazhangrui）开源的 [tab-out](https://github.com/zarazhangrui/tab-out)，这是一切的起点。
