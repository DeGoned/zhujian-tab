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
