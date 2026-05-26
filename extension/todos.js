import { getStorage, setStorage, KEYS } from './storage.js'
import { rebuildBindingsCache } from './binding.js'
import { nextOccurrence } from './reminders.js'

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
    reminders: input.reminders ?? [],
  }
  const all = await listTodos()
  all.push(todo)
  await setStorage(KEYS.todos, all)
  await rebuildBindingsCache()
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
  await rebuildBindingsCache()
  return all[idx]
}

export async function completeTodo(id) {
  return await updateTodo(id, { status: 'done', completedAt: Date.now() })
}

export async function deleteTodo(id) {
  const all = await listTodos()
  await setStorage(KEYS.todos, all.filter(t => t.id !== id))
  await rebuildBindingsCache()
}

function isToday(ts) {
  if (!ts) return false
  const d = new Date(ts)
  return todayStr() === `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function daysBetween(fromYmd, toYmd) {
  if (!fromYmd) return 0
  const [fy, fm, fd] = fromYmd.split('-').map(Number)
  const [ty, tm, td] = toYmd.split('-').map(Number)
  const from = new Date(fy, fm - 1, fd)
  const to = new Date(ty, tm - 1, td)
  return Math.round((to - from) / (1000 * 60 * 60 * 24))
}

/**
 * Increment rolloverCount on pending todos whose lastRolloverDate is before today.
 * Call once at page load. Idempotent within the same day.
 *
 * @returns {Promise<boolean>} true if any todo was updated
 */
export async function runDailyRollover() {
  const today = todayStr()
  const all = await listTodos()
  let changed = false
  for (const t of all) {
    if (t.status !== 'pending') continue
    if (!t.lastRolloverDate) {
      // Legacy todo without rollover tracking — initialize to today
      t.lastRolloverDate = today
      changed = true
      continue
    }
    if (t.lastRolloverDate === today) continue
    const diff = daysBetween(t.lastRolloverDate, today)
    if (diff > 0) {
      t.rolloverCount = (t.rolloverCount || 0) + diff
      t.lastRolloverDate = today
      changed = true
    }
  }
  if (changed) await setStorage(KEYS.todos, all)
  return changed
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

function ridFor() {
  return 'rmd_' + Math.random().toString(36).slice(2, 10)
}

/**
 * 排定（或重排）某 reminder 的 alarm。snoozedUntil 优先。
 */
async function scheduleAlarm(reminder, now = Date.now()) {
  await chrome.alarms.clear(reminder.id)
  const when = reminder.snoozedUntil ?? nextOccurrence(reminder.rule, reminder.firstAt, now, reminder.lastFiredAt)
  if (when) await chrome.alarms.create(reminder.id, { when })
}

export async function addReminder(todoId, partial) {
  const reminder = {
    id: ridFor(),
    firstAt: partial.firstAt,
    rule: partial.rule || 'once',
    snoozedUntil: null,
    lastFiredAt: null,
    lastCompletedAt: null,
    createdAt: Date.now(),
  }
  const all = await listTodos()
  const idx = all.findIndex(t => t.id === todoId)
  if (idx === -1) throw new Error(`todo ${todoId} not found`)
  all[idx] = { ...all[idx], reminders: [...(all[idx].reminders || []), reminder] }
  await setStorage(KEYS.todos, all)
  await scheduleAlarm(reminder)
  return reminder
}

export async function updateReminder(todoId, reminderId, patch) {
  const all = await listTodos()
  const idx = all.findIndex(t => t.id === todoId)
  if (idx === -1) throw new Error(`todo ${todoId} not found`)
  const reminders = (all[idx].reminders || []).map(r =>
    r.id === reminderId ? { ...r, ...patch } : r
  )
  all[idx] = { ...all[idx], reminders }
  await setStorage(KEYS.todos, all)
  const updated = reminders.find(r => r.id === reminderId)
  if (updated) await scheduleAlarm(updated)
  return updated
}

export async function removeReminder(todoId, reminderId) {
  const all = await listTodos()
  const idx = all.findIndex(t => t.id === todoId)
  if (idx === -1) return
  all[idx] = {
    ...all[idx],
    reminders: (all[idx].reminders || []).filter(r => r.id !== reminderId),
  }
  await setStorage(KEYS.todos, all)
  await chrome.alarms.clear(reminderId)
}

export async function snoozeReminder(todoId, reminderId, untilTs) {
  return await updateReminder(todoId, reminderId, { snoozedUntil: untilTs })
}

export async function completeReminderCycle(todoId, reminderId, now = Date.now()) {
  const all = await listTodos()
  const idx = all.findIndex(t => t.id === todoId)
  if (idx === -1) return
  const reminder = (all[idx].reminders || []).find(r => r.id === reminderId)
  if (!reminder) return

  const patchedReminder = { ...reminder, lastCompletedAt: now, snoozedUntil: null }
  const reminders = all[idx].reminders.map(r => r.id === reminderId ? patchedReminder : r)

  // 一次性 reminder 完成且 todo 没其他活跃 reminder → todo 也完成
  const isOnce = reminder.rule === 'once'
  const otherActive = reminders.some(r => r.id !== reminderId && r.rule !== 'once')
  if (isOnce && !otherActive) {
    all[idx] = { ...all[idx], reminders, status: 'done', completedAt: now }
    await setStorage(KEYS.todos, all)
    await chrome.alarms.clear(reminderId)
    return
  }

  all[idx] = { ...all[idx], reminders }
  await setStorage(KEYS.todos, all)
  if (isOnce) {
    await chrome.alarms.clear(reminderId)
  } else {
    await scheduleAlarm(patchedReminder, now)
  }
}
