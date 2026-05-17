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
