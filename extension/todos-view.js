import { listTodos, listTodayTodos, createTodo } from './todos.js'
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
    const text = input.value.trim()
    if (!text) return
    await createTodo({ text })  // 无 # 解析，纯文本（Task 3.3 加 #）
    input.value = ''
    await renderTodosView()
    input.focus()
  })
}
