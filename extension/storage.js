// 薄封装 chrome.storage.local：v1 直接代理；v2 可切 chrome.storage.sync 只改这一处。
// 使用 ES module（index.html 用 type="module" 加载入口脚本）。

export async function getStorage(key, defaultValue) {
  const data = await chrome.storage.local.get(key)
  return data[key] !== undefined ? data[key] : defaultValue
}

export async function setStorage(key, value) {
  await chrome.storage.local.set({ [key]: value })
}

const _listeners = new Map() // key -> Set<callback>

export function onStorageChanged(key, callback) {
  if (!_listeners.has(key)) _listeners.set(key, new Set())
  _listeners.get(key).add(callback)
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return
  for (const [key, { newValue }] of Object.entries(changes)) {
    const set = _listeners.get(key)
    if (set) for (const cb of set) cb(newValue)
  }
})

// Storage keys 常量（避免拼写错误）
export const KEYS = {
  todos: 'taboutTodos',
  projects: 'taboutProjects',
  settings: 'taboutSettings',
  bindingsCache: 'taboutBindingsCache',
  urlTitles: 'taboutUrlTitles',
}
