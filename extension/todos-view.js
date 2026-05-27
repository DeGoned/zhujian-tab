import { listTodos, listTodayTodos, createTodo, addReminder } from './todos.js'
import { listProjects, searchProjects, createProject } from './projects.js'
import { parseTodoInput } from './input-parser.js'
import { attachProjectDropdown } from './project-dropdown.js'
import { getStorage, KEYS } from './storage.js'
import { formatReminderHuman, nextOccurrence } from './reminders.js'
import { showToast } from './ui.js'

/**
 * 生成"已设提醒"toast 文案。
 * @param {Array<{firstAt: number, rule: string}>} reminders 创建/保存的 reminder 数组（非空）
 * @returns {string}
 */
function buildReminderToast(reminders) {
  // 找最早一条
  const sorted = [...reminders].sort((a, b) => a.firstAt - b.firstAt)
  const earliest = sorted[0]
  const when = formatReminderHuman(earliest, Date.now())
  if (reminders.length === 1) return `🔔 提醒已设置：${when}`
  return `🔔 已设 ${reminders.length} 条提醒，最早 ${when}`
}

const $ = (id) => document.getElementById(id)

// Pre-loaded per render: which URLs are currently open in a Chrome tab
let _openUrls = new Set()
// Pre-loaded per render: title cache (sync access during rendering)
let _urlTitlesCache = {}

async function refreshOpenUrls() {
  // chrome.tabs.query is async via callback; promisify
  _openUrls = await new Promise((resolve) => {
    try {
      chrome.tabs.query({}, (tabs) => {
        resolve(new Set((tabs || []).map(t => t.url).filter(Boolean)))
      })
    } catch (e) {
      resolve(new Set())
    }
  })
}

async function preloadUrlTitles() {
  _urlTitlesCache = await getStorage(KEYS.urlTitles, {})
}

function syncUrlTitle(url) {
  return _urlTitlesCache[url] || url
}

export async function renderTodosView() {
  await Promise.all([refreshOpenUrls(), preloadUrlTitles()])
  await renderToday()
  await renderProjects()
}

async function renderToday() {
  const { pending, done } = await listTodayTodos()
  $('todayCount').textContent = `· ${pending.length}`
  $('todayDoneCount').textContent = `(${done.length})`
  $('todayList').innerHTML = pending.map(t => renderTodoLi(t)).join('')
  $('todayDoneList').innerHTML = done.map(t => renderTodoLi(t, true)).join('')
}

async function renderProjects() {
  const projs = await listProjects()
  $('projectCount').textContent = `· ${projs.length}`
  const allTodos = await listTodos()
  $('projectsList').innerHTML = projs.map(p =>
    renderProjectCard(p, allTodos.filter(t => t.projectId === p.id))
  ).join('')
  const archived = (await listProjects({ includeArchived: true })).filter(p => p.archived)
  $('archivedCount').textContent = `(${archived.length})`
  $('archivedProjectsList').innerHTML = archived
    .map(p => `<div class="archived-proj" data-id="${p.id}">
  ${escapeHtml(p.name)}
  <button class="p-unarchive" data-id="${p.id}" title="取消归档">↺</button>
</div>`)
    .join('')
}

function renderTodoLi(t, done = false) {
  const checkboxBtn = `<button class="t-check ${done ? 't-check-done' : ''}" data-id="${t.id}" aria-label="${done ? '取消完成' : '完成'}" title="${done ? '取消完成（v1 不支持）' : '完成'}"></button>`
  const addBindBtn = !done
    ? `<button class="t-add-bind" data-id="${t.id}" title="加 tab" aria-label="加 tab">🔗 +</button>`
    : ''
  const pinBtn = !done
    ? `<button class="t-pin" data-id="${t.id}" data-pinned="${t.pinnedToday ? 'true' : 'false'}" title="${t.pinnedToday ? '取消挂今日' : '挂今日'}">${t.pinnedToday ? '⭐' : '☆'}</button>`
    : ''
  const delBtn = !done
    ? `<button class="t-delete" data-id="${t.id}" title="删除">🗑</button>`
    : ''
  const reminderBtn = !done
    ? `<button class="t-reminder" data-id="${t.id}" title="提醒" aria-label="提醒">🔔</button>`
    : ''
  const bindingsHtml = (t.boundUrls && t.boundUrls.length > 0)
    ? `<ul class="bindings">${
        t.boundUrls.map(url => {
          const open = _openUrls.has(url)
          const dot = open ? '🟢' : '⚪'
          const title = syncUrlTitle(url)
          const cls = open ? 'b-open' : 'b-closed'
          return `<li class="${cls}" data-url="${escapeAttr(url)}">
            <span class="b-dot">${dot}</span>
            <span class="b-title" title="${escapeAttr(url)}">${escapeHtml(title)}</span>
            <button class="b-unbind" title="解绑" aria-label="解绑">×</button>
          </li>`
        }).join('')
      }</ul>`
    : ''
  const remindersHtml = (t.reminders && t.reminders.length > 0)
    ? renderReminderLine(t)
    : ''
  const rolloverBadge = (!done && t.rolloverCount && t.rolloverCount > 0)
    ? `<span class="rollover-badge ${t.rolloverCount >= 7 ? 'amber' : ''}" title="已拖延 ${t.rolloverCount} 天">+${t.rolloverCount}d</span>`
    : ''
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
}

function renderReminderLine(todo) {
  const r = todo.reminders[0]
  const count = todo.reminders.length
  // 计算下次实际触发时间（snoozedUntil > nextOccurrence > firstAt fallback）
  const nextAt = r.snoozedUntil ?? nextOccurrence(r.rule, r.firstAt, Date.now(), r.lastFiredAt) ?? r.firstAt
  const text = formatReminderHuman({ ...r, firstAt: nextAt }, Date.now())
  const more = count > 1 ? `<span class="t-rem-count">×${count}</span>` : ''
  const snoozed = r.snoozedUntil ? ' t-rem-snoozed' : ''
  return `<div class="t-reminder-line${snoozed}" data-id="${todo.id}">🔔 ${escapeHtml(text)}${more}</div>`
}

function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))
}

function renderProjectCard(p, todos) {
  const pending = todos.filter(t => t.status === 'pending')
  const completed = todos.filter(t => t.status === 'done')
  return `
    <div class="project-card" data-id="${p.id}" data-color="${p.color}">
      <button class="p-menu" data-id="${p.id}" title="删除项目" aria-label="删除项目">🗑</button>
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

export function wireTodosInput() {
  const input = document.getElementById('todos-input')
  if (!input) return
  attachProjectDropdown(input)
  input.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return
    if (e.defaultPrevented) return  // 下拉已处理（选了一项），跳过提交
    const raw = input.value
    if (!raw.trim()) return
    const { text, projectName, reminders } = parseTodoInput(raw)
    let projectId = null
    if (projectName) {
      const matches = await searchProjects(projectName)
      const exact = matches.find(p => p.name.toLowerCase() === projectName.toLowerCase())
      const p = exact ?? await createProject({ name: projectName })
      projectId = p.id
    }
    if (!text) return  // 只有 # 没有文本时不创建（用户多半在打字中途）
    const todo = await createTodo({ text, projectId })
    // Wire 通过 inline @time ~repeat 解析出的 reminders → 真正建 alarm
    if (reminders && reminders.length > 0) {
      for (const r of reminders) {
        await addReminder(todo.id, { firstAt: r.firstAt, rule: r.rule })
      }
      showToast(buildReminderToast(reminders))
    }
    input.value = ''
    await renderTodosView()
    input.focus()
  })
}

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

/**
 * Wire up event delegation for todo list actions:
 * - Click .b-title  → jump to existing tab or open new
 * - Click .b-unbind → remove URL from todo's boundUrls
 *
 * Must be called once after DOM is ready.
 */
export function wireTodosView() {
  document.addEventListener('click', async (e) => {
    // Click on the real checkbox button to complete a pending todo
    if (e.target.classList.contains('t-check') && !e.target.classList.contains('t-check-done')) {
      e.stopPropagation()
      const li = e.target.closest('li[data-id]')
      if (!li) return
      const id = li.dataset.id
      ;(async () => {
        const { completeTodo, listTodos } = await import('./todos.js')
        const { burstConfetti, playSwoosh } = await import('./ui.js')
        const { archiveIfAllDone } = await import('./projects.js')

        const beforeAll = await listTodos()
        const target = beforeAll.find(x => x.id === id)
        if (!target || target.status !== 'pending') return

        // Visual feedback from the checkbox button's center
        const rect = e.target.getBoundingClientRect()
        for (let i = 0; i < 28; i++) burstConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2)
        playSwoosh()

        await completeTodo(id)

        let justArchived = false
        if (target.projectId) justArchived = await archiveIfAllDone(target.projectId)
        if (justArchived) {
          setTimeout(() => {
            const card = document.querySelector(`.project-card[data-id="${target.projectId}"]`)
            if (card) {
              const r = card.getBoundingClientRect()
              for (let i = 0; i < 80; i++) burstConfetti(r.left + r.width / 2, r.top + r.height / 2)
            }
          }, 250)
        }
        setTimeout(() => renderTodosView(), 600)
      })()
      return
    }

    // Jump-to-tab on .b-title click
    if (e.target.classList.contains('b-title')) {
      const li = e.target.closest('li[data-url]')
      if (!li) return
      const url = li.dataset.url
      try {
        chrome.tabs.query({ url }, (tabs) => {
          if (tabs && tabs.length > 0) {
            chrome.tabs.update(tabs[0].id, { active: true })
            if (tabs[0].windowId) chrome.windows.update(tabs[0].windowId, { focused: true })
          } else {
            chrome.tabs.create({ url })
          }
        })
      } catch (_) {}
      return
    }
    // + tab button on todo
    if (e.target.classList.contains('t-add-bind')) {
      e.stopPropagation()
      const id = e.target.dataset.id
      const { openAddTabPopover } = await import('./binding.js')
      openAddTabPopover(id, e.target)
      return
    }
    // Unbind on .b-unbind click
    if (e.target.classList.contains('b-unbind')) {
      const liUrl = e.target.closest('li[data-url]')
      const liTodo = e.target.closest('li[data-id]')
      if (!liUrl || !liTodo) return
      const url = liUrl.dataset.url
      const todoId = liTodo.dataset.id
      const { updateTodo, listTodos } = await import('./todos.js')
      const all = await listTodos()
      const t = all.find(x => x.id === todoId)
      if (!t) return
      await updateTodo(todoId, { boundUrls: (t.boundUrls || []).filter(u => u !== url) })
      await renderTodosView()
      return
    }

    // Phase 9.2: Pin / unpin today
    if (e.target.classList.contains('t-pin')) {
      e.stopPropagation()
      const id = e.target.dataset.id
      const pinned = e.target.dataset.pinned === 'true'
      const { pinTodayTodo, unpinTodayTodo } = await import('./todos.js')
      if (pinned) await unpinTodayTodo(id)
      else await pinTodayTodo(id)
      await renderTodosView()
      return
    }

    // Phase 9.3: Delete todo (soft delete + 5s undo)
    if (e.target.classList.contains('t-delete')) {
      e.stopPropagation()
      const id = e.target.dataset.id
      const { deleteTodo, listTodos } = await import('./todos.js')
      const { getStorage, setStorage, KEYS } = await import('./storage.js')
      const beforeAll = await listTodos()
      const snapshot = beforeAll.find(t => t.id === id)
      if (!snapshot) return
      await deleteTodo(id)
      await renderTodosView()
      const { showUndoToast } = await import('./ui.js')
      showUndoToast(`已删除"${snapshot.text}"`, async () => {
        const stored = await getStorage(KEYS.todos, [])
        stored.push(snapshot)
        await setStorage(KEYS.todos, stored)
        await renderTodosView()
      }, 5000)
      return
    }

    // Reminder icon → open popover
    if (e.target.classList.contains('t-reminder')) {
      e.stopPropagation()
      const id = e.target.dataset.id
      const { openReminderPopover } = await import('./reminder-popover.js')
      await openReminderPopover(id, e.target)
      return
    }
    // Click reminder line below todo → also opens popover (line is the anchor)
    if (e.target.closest('.t-reminder-line')) {
      e.stopPropagation()
      const line = e.target.closest('.t-reminder-line')
      const id = line.dataset.id
      const { openReminderPopover } = await import('./reminder-popover.js')
      await openReminderPopover(id, line)
      return
    }

    // Unarchive project
    if (e.target.classList.contains('p-unarchive')) {
      e.stopPropagation()
      const id = e.target.dataset.id
      const { updateProject } = await import('./projects.js')
      await updateProject(id, { archived: false })
      await renderTodosView()
      return
    }

    // Project ⋯ menu → delete dialog
    if (e.target.classList.contains('p-menu')) {
      e.stopPropagation()
      const id = e.target.dataset.id
      const { listProjects, deleteProject } = await import('./projects.js')
      const { listTodos, updateTodo, deleteTodo } = await import('./todos.js')
      const { showModal } = await import('./ui.js')
      const allProj = await listProjects({ includeArchived: true })
      const proj = allProj.find(p => p.id === id)
      if (!proj) return
      const all = await listTodos()
      const projTodos = all.filter(t => t.projectId === id)
      const buttons = projTodos.length === 0
        ? [{ label: '删除', kind: 'primary', value: 'del' }, { label: '取消', kind: 'ghost', value: 'cancel' }]
        : [
            { label: '把 todos 改为无项目，删项目', kind: 'primary', value: 'keep' },
            { label: '一并删 todos', kind: 'secondary', value: 'all' },
            { label: '取消', kind: 'ghost', value: 'cancel' },
          ]
      const bodyHtml = projTodos.length === 0
        ? `<p>项目内无 todos，可直接删除。</p>`
        : `<p>项目内有 ${projTodos.length} 个 todos。</p>`
      const choice = await showModal({
        title: `删除项目"${proj.name}"？`,
        bodyHtml,
        buttons,
      })
      if (choice === 'cancel') return
      if (choice === 'keep') for (const t of projTodos) await updateTodo(t.id, { projectId: null })
      if (choice === 'all') for (const t of projTodos) await deleteTodo(t.id)
      await deleteProject(id)
      await renderTodosView()
      return
    }
  })

  // Phase 9.1: Double-click on todo text → inline edit
  document.addEventListener('dblclick', async (e) => {
    const textEl = e.target.closest('.t-text')
    if (!textEl) return
    const li = textEl.closest('li[data-id]')
    if (!li || li.classList.contains('done')) return
    startInlineEdit(li)
  })
}

async function startInlineEdit(li) {
  const id = li.dataset.id
  const { listTodos, updateTodo } = await import('./todos.js')
  const { listProjects, searchProjects, createProject } = await import('./projects.js')
  const all = await listTodos()
  const t = all.find(x => x.id === id)
  if (!t) return

  // Rebuild raw input string: text + #projectname if any
  const allProjs = await listProjects({ includeArchived: true })
  const proj = allProjs.find(p => p.id === t.projectId)
  const raw = proj ? `${t.text} #${proj.name}` : t.text

  // Replace li content with input
  const input = document.createElement('input')
  input.type = 'text'
  input.value = raw
  input.className = 'inline-edit'
  li.innerHTML = ''
  li.appendChild(input)
  input.focus()
  input.select()

  let committed = false
  async function commit() {
    if (committed) return
    committed = true
    const newRaw = input.value.trim()
    if (!newRaw) {
      // Empty → cancel (don't delete; just re-render)
      await renderTodosView()
      return
    }
    const { parseTodoInput } = await import('./input-parser.js')
    const { text: newText, projectName } = parseTodoInput(newRaw)
    let newProjectId = null
    if (projectName) {
      const matches = await searchProjects(projectName)
      const exact = matches.find(p => p.name.toLowerCase() === projectName.toLowerCase())
      newProjectId = (exact ?? await createProject({ name: projectName })).id
    }
    await updateTodo(id, { text: newText || t.text, projectId: newProjectId })
    await renderTodosView()
  }

  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); commit() }
    if (ev.key === 'Escape') { ev.preventDefault(); committed = true; renderTodosView() }
  })
  input.addEventListener('blur', commit)
}
