import { listTodos, listTodayTodos, createTodo } from './todos.js'
import { listProjects, searchProjects, createProject } from './projects.js'
import { parseTodoInput } from './input-parser.js'
import { attachProjectDropdown } from './project-dropdown.js'
import { getStorage, KEYS } from './storage.js'

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
    .map(p => `<div class="archived-proj" data-id="${p.id}">${escapeHtml(p.name)}</div>`)
    .join('')
}

function renderTodoLi(t, done = false) {
  const checkbox = done ? '☑' : '☐'
  const addBindBtn = !done
    ? `<button class="t-add-bind" data-id="${t.id}" title="加 tab" aria-label="加 tab">🔗 +</button>`
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
  return `<li class="${done ? 'done' : ''}" data-id="${t.id}">
    <span class="t-text">${checkbox} ${escapeHtml(t.text)}</span>
    ${addBindBtn}
    ${bindingsHtml}
  </li>`
}

function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))
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

export function wireTodosInput() {
  const input = document.getElementById('todos-input')
  if (!input) return
  attachProjectDropdown(input)
  input.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return
    if (e.defaultPrevented) return  // 下拉已处理（选了一项），跳过提交
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
  })
}
