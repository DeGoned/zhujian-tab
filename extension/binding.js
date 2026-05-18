import { getStorage, setStorage, KEYS } from './storage.js'
import { listTodos, createTodo, updateTodo } from './todos.js'

/**
 * 重建 url -> [todoId, ...] 反向索引（只索引 pending todos）。
 * 每次 todo 写入应调用一次。
 * @returns {Promise<object>}
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

/**
 * @param {string} url
 * @returns {Promise<object[]>} 绑了此 URL 的 pending todos
 */
export async function getTodosBoundToUrl(url) {
  const cache = await getStorage(KEYS.bindingsCache, {})
  const ids = cache[url] || []
  if (ids.length === 0) return []
  const todos = await listTodos()
  return todos.filter(t => ids.includes(t.id))
}

/**
 * @param {string} url
 * @returns {Promise<boolean>}
 */
export async function urlIsBound(url) {
  const cache = await getStorage(KEYS.bindingsCache, {})
  return Array.isArray(cache[url]) && cache[url].length > 0
}

/**
 * 绑定时记下 tab title。
 * @param {string} url
 * @param {string} title
 */
export async function rememberUrlTitle(url, title) {
  if (!title) return
  const titles = await getStorage(KEYS.urlTitles, {})
  titles[url] = title
  await setStorage(KEYS.urlTitles, titles)
}

/**
 * @param {string} url
 * @returns {Promise<string>} 缓存的 title，或 fallback 到 url
 */
export async function getUrlTitle(url) {
  const titles = await getStorage(KEYS.urlTitles, {})
  return titles[url] || url
}

// ===== Bind popover state (module-scoped) =====
let _popOutsideHandler = null

/**
 * 打开"从 tab 加到 todo"的 popover。
 * @param {string} url   待绑定的 tab URL
 * @param {string} title tab 标题（用于缓存）
 * @param {HTMLElement} anchorEl 触发按钮元素，决定位置
 */
export async function openBindPopover(url, title, anchorEl) {
  await rememberUrlTitle(url, title)
  const pop = document.getElementById('bindPopover')
  if (!pop) return

  // Position next to anchor
  const rect = anchorEl.getBoundingClientRect()
  pop.style.left = `${Math.min(rect.right + 8, window.innerWidth - 296)}px`
  pop.style.top = `${Math.max(8, rect.top)}px`
  pop.hidden = false

  // Reset state (in case popover was previously opened by Task 5.4 mode)
  const input = document.getElementById('bindPopInput')
  input.hidden = false
  input.value = ''
  input.placeholder = '新建 todo，回车保存（支持 #项目名）'
  document.querySelector('.bind-pop-divider').textContent = '或加到现有 todo'

  setTimeout(() => input.focus(), 0)

  // Enter on input → create new todo and bind
  input.onkeydown = async (e) => {
    if (e.key === 'Escape') return closeBindPopover()
    if (e.key !== 'Enter') return
    e.preventDefault()
    const raw = input.value.trim()
    if (!raw) return
    const { parseTodoInput } = await import('./input-parser.js')
    const { text, projectName } = parseTodoInput(raw)
    let projectId = null
    if (projectName) {
      const { searchProjects, createProject } = await import('./projects.js')
      const matches = await searchProjects(projectName)
      const exact = matches.find(p => p.name.toLowerCase() === projectName.toLowerCase())
      projectId = (exact ?? await createProject({ name: projectName })).id
    }
    if (!text) return
    await createTodo({ text, projectId, boundUrls: [url] })
    closeBindPopover()
    const { renderTodosView } = await import('./todos-view.js')
    await renderTodosView()
    const { showToast } = await import('./ui.js')
    showToast('已加到 todos')
  }

  // List existing pending todos for "or add to existing"
  const all = (await listTodos()).filter(t => t.status === 'pending')
  const listEl = document.getElementById('bindPopExisting')
  listEl.innerHTML = all.length === 0
    ? `<div class="empty">无现有待办</div>`
    : all.map(t => `<div class="item" data-id="${t.id}">${_escapeHtml(t.text)}</div>`).join('')
  listEl.onclick = async (e) => {
    const item = e.target.closest('.item')
    if (!item) return
    const t = all.find(x => x.id === item.dataset.id)
    if (!t) return
    if ((t.boundUrls || []).includes(url)) {
      const { showToast } = await import('./ui.js')
      showToast('已绑过')
      return closeBindPopover()
    }
    await updateTodo(t.id, { boundUrls: [...(t.boundUrls || []), url] })
    closeBindPopover()
    const { renderTodosView } = await import('./todos-view.js')
    await renderTodosView()
    const { showToast } = await import('./ui.js')
    showToast('已加绑')
  }

  // Close on outside click
  setTimeout(() => {
    if (_popOutsideHandler) document.removeEventListener('mousedown', _popOutsideHandler)
    _popOutsideHandler = (ev) => {
      if (pop.hidden) return
      if (!pop.contains(ev.target)) closeBindPopover()
    }
    document.addEventListener('mousedown', _popOutsideHandler, { once: true })
  }, 0)
}

export function closeBindPopover() {
  const pop = document.getElementById('bindPopover')
  if (pop) pop.hidden = true
  if (_popOutsideHandler) {
    document.removeEventListener('mousedown', _popOutsideHandler)
    _popOutsideHandler = null
  }
}

/**
 * 打开"给 todo 加 tab"的 popover。
 * 列出当前所有打开的 tabs，排除已经绑过的，点击即添加。
 * @param {string} todoId
 * @param {HTMLElement} anchorEl
 */
export async function openAddTabPopover(todoId, anchorEl) {
  const pop = document.getElementById('bindPopover')
  if (!pop) return

  const rect = anchorEl.getBoundingClientRect()
  pop.style.left = `${Math.min(rect.right + 8, window.innerWidth - 296)}px`
  pop.style.top = `${Math.max(8, rect.top)}px`
  pop.hidden = false

  // Different mode: hide input, change divider text
  const input = document.getElementById('bindPopInput')
  input.hidden = true
  input.value = ''
  document.querySelector('.bind-pop-divider').textContent = '从已打开 tab 中选'

  // Fetch open tabs
  const tabs = await new Promise(resolve => {
    try { chrome.tabs.query({}, (ts) => resolve(ts || [])) } catch { resolve([]) }
  })

  const all = await listTodos()
  const todo = all.find(t => t.id === todoId)
  if (!todo) return closeBindPopover()
  const already = new Set(todo.boundUrls || [])

  const candidates = tabs.filter(t => t.url && !already.has(t.url))
  const listEl = document.getElementById('bindPopExisting')
  listEl.innerHTML = candidates.length === 0
    ? `<div class="empty">没有可绑的 tab</div>`
    : candidates.map(t => {
        const title = (t.title || t.url).trim()
        return `<div class="item" data-url="${escapeAttr(t.url)}" data-title="${escapeAttr(title)}">${_escapeHtml(title)}</div>`
      }).join('')

  listEl.onclick = async (e) => {
    const item = e.target.closest('.item')
    if (!item) return
    const url = item.dataset.url
    const title = item.dataset.title || url
    await rememberUrlTitle(url, title)
    await updateTodo(todoId, { boundUrls: [...(todo.boundUrls || []), url] })
    closeBindPopover()
    const { renderTodosView } = await import('./todos-view.js')
    await renderTodosView()
    const { showToast } = await import('./ui.js')
    showToast('已加绑')
  }

  setTimeout(() => {
    if (_popOutsideHandler) document.removeEventListener('mousedown', _popOutsideHandler)
    _popOutsideHandler = (ev) => {
      if (pop.hidden) return
      if (!pop.contains(ev.target)) closeBindPopover()
    }
    document.addEventListener('mousedown', _popOutsideHandler, { once: true })
  }, 0)
}

function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))
}

function _escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))
}
