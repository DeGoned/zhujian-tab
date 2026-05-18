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
