import { listTodos, listTodayTodos, createTodo } from './todos.js'
import { listProjects, searchProjects, createProject } from './projects.js'
import { parseTodoInput } from './input-parser.js'

const $ = (id) => document.getElementById(id)

export async function renderTodosView() {
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
  return `<li class="${done ? 'done' : ''}" data-id="${t.id}">${checkbox} ${escapeHtml(t.text)}</li>`
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
