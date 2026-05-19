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

function _wireOutsideClick() {
  if (_popOutsideHandler) return  // already wired
  _popOutsideHandler = (ev) => {
    const pop = document.getElementById('bindPopover')
    if (!pop || pop.hidden) return
    if (pop.contains(ev.target)) return
    closeBindPopover()
  }
  document.addEventListener('mousedown', _popOutsideHandler)
}

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

  // Position popover next to anchor, clamped to viewport
  const anchorRect = anchorEl.getBoundingClientRect()
  pop.hidden = false  // must un-hide before measuring
  // Initial position next to anchor
  pop.style.left = `${Math.min(anchorRect.right + 8, window.innerWidth - 296)}px`
  pop.style.top = `${Math.max(8, anchorRect.top)}px`
  // Force layout to measure popover height
  const popRect = pop.getBoundingClientRect()
  const popH = popRect.height || 320  // fallback estimate
  const maxTop = window.innerHeight - popH - 8
  if (popRect.top > maxTop) {
    pop.style.top = `${Math.max(8, maxTop)}px`
  }

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

  // List existing pending todos for "or add to existing" — filterable as user types
  const all = (await listTodos()).filter(t => t.status === 'pending')
  const listEl = document.getElementById('bindPopExisting')

  function renderExistingList(filter = '') {
    const f = filter.trim().toLowerCase()
    const matched = f ? all.filter(t => (t.text || '').toLowerCase().includes(f)) : all
    listEl.innerHTML = matched.length === 0
      ? `<div class="empty">${f ? '无匹配 todo（回车将新建）' : '无现有待办'}</div>`
      : matched.map(t => `<div class="item" data-id="${t.id}">${_escapeHtml(t.text)}</div>`).join('')
  }
  renderExistingList()  // initial full list

  // Filter as user types
  input.oninput = (e) => renderExistingList(e.target.value)

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
  setTimeout(() => _wireOutsideClick(), 0)
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

  // Position popover next to anchor, clamped to viewport
  const anchorRect = anchorEl.getBoundingClientRect()
  pop.hidden = false  // must un-hide before measuring
  // Initial position next to anchor
  pop.style.left = `${Math.min(anchorRect.right + 8, window.innerWidth - 296)}px`
  pop.style.top = `${Math.max(8, anchorRect.top)}px`
  // Force layout to measure popover height
  const popRect = pop.getBoundingClientRect()
  const popH = popRect.height || 320  // fallback estimate
  const maxTop = window.innerHeight - popH - 8
  if (popRect.top > maxTop) {
    pop.style.top = `${Math.max(8, maxTop)}px`
  }

  // Search mode: input visible, repurposed as search box
  const input = document.getElementById('bindPopInput')
  input.hidden = false
  input.value = ''
  input.placeholder = '搜索 tab（标题或 URL）...'
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

  function renderList(filter = '') {
    const f = filter.toLowerCase()
    const filtered = candidates.filter(t => {
      if (!f) return true
      return (t.title || '').toLowerCase().includes(f) || (t.url || '').toLowerCase().includes(f)
    })
    listEl.innerHTML = filtered.length === 0
      ? `<div class="empty">${f ? '没有匹配的 tab' : '没有可绑的 tab'}</div>`
      : filtered.map(t => {
          const title = (t.title || t.url).trim()
          return `<div class="item" data-url="${escapeAttr(t.url)}" data-title="${escapeAttr(title)}">${_escapeHtml(title)}</div>`
        }).join('')
  }
  renderList()  // initial render

  // Wire input handlers for search mode (overrides any create-mode handlers)
  input.onkeydown = (e) => {
    if (e.key === 'Escape') return closeBindPopover()
    // Enter has no effect in search mode; selection is by clicking item
  }
  input.oninput = (e) => renderList(e.target.value)
  setTimeout(() => input.focus(), 0)

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

  // Close on outside click
  setTimeout(() => _wireOutsideClick(), 0)
}

function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))
}

function _escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))
}

/**
 * Guarded single-tab close. If the URL is bound to incomplete todos, shows a modal
 * asking the user how to handle. Otherwise closes immediately.
 *
 * @param {number} tabId
 * @param {string} url
 * @param {Function} doClose  callback that actually removes the tab
 * @returns {Promise<boolean>}  true if close happened, false if user cancelled
 */
export async function closeTabWithGuard(tabId, url, doClose) {
  if (!url || !(await urlIsBound(url))) {
    doClose()
    return true
  }
  const todos = await getTodosBoundToUrl(url)
  if (todos.length === 0) {
    doClose()
    return true
  }
  const { showModal, showToast } = await import('./ui.js')
  const bodyHtml = `
    <p class="muted" style="margin: 0 0 8px;">即将关闭的 tab 关联了以下未完成 todo：</p>
    <ul>${todos.map(t => `<li>☐ ${_escapeHtml(t.text)}</li>`).join('')}</ul>
    <p class="muted" style="margin-top: 12px;">先标完成？还是把绑定移除直接关？</p>
  `
  const choice = await showModal({
    title: '该 tab 已关联 todo，想如何处理？',
    bodyHtml,
    buttons: [
      { label: `✓ 全部标完成（${todos.length}）`, kind: 'primary', value: 'done' },
      { label: '仅关闭 tab', kind: 'secondary', value: 'ignore' },
      { label: '取消', kind: 'ghost', value: 'cancel' },
    ],
  })
  if (choice === 'cancel') return false
  const { completeTodo } = await import('./todos.js')
  if (choice === 'done') {
    for (const t of todos) await completeTodo(t.id)
    showToast(`已标完成 ${todos.length} 个 todo`)
  } else if (choice === 'ignore') {
    for (const t of todos) {
      await updateTodo(t.id, { boundUrls: (t.boundUrls || []).filter(u => u !== url) })
    }
    showToast('已解除绑定')
  }
  doClose()
  return true
}

/**
 * Guarded close-all for a group of tabs (e.g. all tabs of a domain).
 * Aggregates all bound-todo info into ONE modal so user isn't spammed.
 *
 * @param {Array<{id: number, url: string}>} tabsToClose
 * @param {Function} doCloseAll  callback that actually removes the tabs
 * @returns {Promise<boolean>}
 */
export async function closeAllTabsWithGuard(tabsToClose, doCloseAll) {
  const boundTabs = []
  for (const t of tabsToClose) {
    if (t.url && await urlIsBound(t.url)) boundTabs.push(t)
  }
  if (boundTabs.length === 0) {
    doCloseAll()
    return true
  }
  // Aggregate todos affected (dedupe by id)
  const todoMap = new Map()
  for (const t of boundTabs) {
    const ts = await getTodosBoundToUrl(t.url)
    for (const todo of ts) todoMap.set(todo.id, todo)
  }
  const todos = [...todoMap.values()]
  if (todos.length === 0) {
    doCloseAll()
    return true
  }
  const { showModal, showToast } = await import('./ui.js')
  const bodyHtml = `
    <p class="muted" style="margin: 0 0 8px;">这一组里有 <strong>${boundTabs.length}</strong> 个 tab 关联未完成 todo：</p>
    <ul>${todos.map(t => `<li>☐ ${_escapeHtml(t.text)}</li>`).join('')}</ul>
  `
  const choice = await showModal({
    title: '这些 tab 已关联 todo，想如何处理？',
    bodyHtml,
    buttons: [
      { label: `✓ 全部标完成（${todos.length}）`, kind: 'primary', value: 'done' },
      { label: '仅关闭 tab', kind: 'secondary', value: 'ignore' },
      { label: '取消', kind: 'ghost', value: 'cancel' },
    ],
  })
  if (choice === 'cancel') return false
  const { completeTodo } = await import('./todos.js')
  const urlsToRemove = new Set(boundTabs.map(t => t.url))
  if (choice === 'done') {
    for (const t of todos) await completeTodo(t.id)
    showToast(`已标完成 ${todos.length} 个 todo`)
  } else if (choice === 'ignore') {
    for (const t of todos) {
      await updateTodo(t.id, {
        boundUrls: (t.boundUrls || []).filter(u => !urlsToRemove.has(u))
      })
    }
    showToast('已解除绑定')
  }
  doCloseAll()
  return true
}
