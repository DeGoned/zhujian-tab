import { getStorage, setStorage, KEYS } from './storage.js'
import { listTodos } from './todos.js'

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
