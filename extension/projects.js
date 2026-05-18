import { getStorage, setStorage, KEYS } from './storage.js'
import { listTodos } from './todos.js'

const PALETTE = ['purple', 'orange', 'green', 'blue', 'red']

function uid() {
  return 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

/**
 * @param {{ name: string, color?: string }} input
 * @returns {Promise<object>} 完整 project 对象
 */
export async function createProject({ name, color }) {
  const all = await getStorage(KEYS.projects, [])
  const now = Date.now()
  const proj = {
    id: uid(),
    name,
    color: color ?? PALETTE[all.length % PALETTE.length],
    archived: false,
    createdAt: now,
    order: now,
  }
  all.push(proj)
  await setStorage(KEYS.projects, all)
  return proj
}

/**
 * @param {{ includeArchived?: boolean }} opts
 * @returns {Promise<object[]>} projects 列表
 */
export async function listProjects({ includeArchived = false } = {}) {
  const all = await getStorage(KEYS.projects, [])
  return includeArchived ? all : all.filter(p => !p.archived)
}

/**
 * @param {string} id project id
 * @param {object} patch partial update
 * @returns {Promise<object>} updated project
 */
export async function updateProject(id, patch) {
  const all = await getStorage(KEYS.projects, [])
  const idx = all.findIndex(p => p.id === id)
  if (idx === -1) throw new Error(`project ${id} not found`)
  all[idx] = { ...all[idx], ...patch }
  await setStorage(KEYS.projects, all)
  return all[idx]
}

/**
 * @param {string} id project id
 */
export async function deleteProject(id) {
  const all = await getStorage(KEYS.projects, [])
  await setStorage(KEYS.projects, all.filter(p => p.id !== id))
}

/**
 * 如果项目有 todos 且全部 done，自动归档。
 * @param {string} id project id
 * @returns {Promise<boolean>} 本次是否真正发生了归档（用于触发庆祝动画）
 */
export async function archiveIfAllDone(id) {
  const todos = await listTodos()
  const projTodos = todos.filter(t => t.projectId === id)
  if (projTodos.length === 0) return false
  if (!projTodos.every(t => t.status === 'done')) return false

  const all = await getStorage(KEYS.projects, [])
  const proj = all.find(p => p.id === id)
  if (!proj || proj.archived) return false

  await updateProject(id, { archived: true })
  return true
}

/**
 * Fuzzy 搜索项目
 * @param {string} query 搜索关键词
 * @param {{ includeArchived?: boolean }} opts
 * @returns {Promise<object[]>} 匹配的 projects
 */
export async function searchProjects(query, { includeArchived = false } = {}) {
  const all = await listProjects({ includeArchived })
  const q = query.toLowerCase()
  return all
    .map(p => ({ p, score: p.name.toLowerCase().indexOf(q) }))
    .filter(x => x.score >= 0)
    .sort((a, b) => a.score - b.score)
    .map(x => x.p)
}
