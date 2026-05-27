// zhujian-tab extensions — static imports for service worker (MV3 module)
import { createTodo, listTodos, updateTodo, completeTodo, completeReminderCycle, snoozeReminder, updateReminder, addReminder } from './todos.js'
import { nextOccurrence, previousOccurrence } from './reminders.js'
import { searchProjects, createProject, listProjects } from './projects.js'
import { rememberUrlTitle } from './binding.js'
import { parseTodoInput } from './input-parser.js'
import { getSettings } from './settings.js'

/**
 * background.js — Service Worker for Badge Updates
 *
 * Chrome's "always-on" background script for Tab Out.
 * Its only job: keep the toolbar badge showing the current open tab count.
 *
 * Since we no longer have a server, we query chrome.tabs directly.
 * The badge counts real web tabs (skipping chrome:// and extension pages).
 *
 * Color coding gives a quick at-a-glance health signal:
 *   Green  (#3d7a4a) → 1–10 tabs  (focused, manageable)
 *   Amber  (#b8892e) → 11–20 tabs (getting busy)
 *   Red    (#b35a5a) → 21+ tabs   (time to cull!)
 */

// ─── Badge updater ────────────────────────────────────────────────────────────

/**
 * updateBadge()
 *
 * Counts open real-web tabs and updates the extension's toolbar badge.
 * "Real" tabs = not chrome://, not extension pages, not about:blank.
 */
async function updateBadge() {
  try {
    const tabs = await chrome.tabs.query({});

    // Only count actual web pages — skip browser internals and extension pages
    const count = tabs.filter(t => {
      const url = t.url || '';
      return (
        !url.startsWith('chrome://') &&
        !url.startsWith('chrome-extension://') &&
        !url.startsWith('about:') &&
        !url.startsWith('edge://') &&
        !url.startsWith('brave://')
      );
    }).length;

    // Don't show "0" — an empty badge is cleaner
    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });

    if (count === 0) return;

    // Pick badge color based on workload level
    let color;
    if (count <= 10) {
      color = '#3d7a4a'; // Green — you're in control
    } else if (count <= 20) {
      color = '#b8892e'; // Amber — things are piling up
    } else {
      color = '#b35a5a'; // Red — time to focus and close some tabs
    }

    await chrome.action.setBadgeBackgroundColor({ color });

  } catch {
    // If something goes wrong, clear the badge rather than show stale data
    chrome.action.setBadgeText({ text: '' });
  }
}

// ─── Event listeners ──────────────────────────────────────────────────────────

// Update badge when the extension is first installed
chrome.runtime.onInstalled.addListener(() => {
  updateBadge();
});

// Update badge when Chrome starts up
chrome.runtime.onStartup.addListener(() => {
  updateBadge();
});

// Update badge whenever a tab is opened
chrome.tabs.onCreated.addListener(() => {
  updateBadge();
});

// Update badge whenever a tab is closed — handled by the closure-detection
// listener below, which calls updateBadge() and also checks for bound todos.

// Update badge when a tab's URL changes (e.g. navigating to/from chrome://)
chrome.tabs.onUpdated.addListener((tabId, _changeInfo, tab) => {
  updateBadge();
  _rememberTab(tabId, tab);
});

// ─── Initial run ─────────────────────────────────────────────────────────────

// Run once immediately when the service worker first loads
updateBadge();

// ============================================================
// zhujian-tab — global hotkey capture flow
// ============================================================

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'open-capture') return
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab || !tab.id) return
    // Skip restricted URLs (chrome://, chrome-extension://, edge://, about:, etc.)
    if (!tab.url || /^(chrome|edge|about|chrome-extension|moz-extension|brave|opera|view-source):/i.test(tab.url)) {
      // Cannot inject into restricted page — user must be on a normal web page
      console.info('Tab Out: cannot inject into restricted page', tab.url)
      return
    }
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['content/capture-overlay.css'],
    })
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/capture-overlay.js'],
    })
  } catch (e) {
    console.warn('Tab Out: inject capture overlay failed', e)
  }
})

// ============================================================
// zhujian-tab — browser-native close detection + toast broadcast
// ============================================================

import { urlIsBound, getTodosBoundToUrl } from './binding.js'

// Cache last-known tab metadata so we can read it after onRemoved fires
const _tabMetaCache = new Map() // tabId -> { url, title }

function _rememberTab(tabId, tab) {
  if (!tab) return
  if (tab.url) _tabMetaCache.set(tabId, { url: tab.url, title: tab.title || '' })
}

// Best-effort initial seeding on extension startup
chrome.tabs.query({}, (tabs) => {
  for (const t of tabs || []) _rememberTab(t.id, t)
})

chrome.tabs.onRemoved.addListener(async (tabId, _removeInfo) => {
  updateBadge()
  const meta = _tabMetaCache.get(tabId)
  _tabMetaCache.delete(tabId)
  if (!meta || !meta.url) return
  // Don't bother if URL isn't bound to any pending todo
  if (!(await urlIsBound(meta.url))) return
  const todos = await getTodosBoundToUrl(meta.url)
  if (todos.length === 0) return

  // Apply the configured nativeCloseAction
  const settings = await getSettings()
  const action = settings.nativeCloseAction || 'keep'

  let actionTaken = null  // 'removed' | 'completed' | null
  const completedTodoIds = []

  if (action === 'remove-binding') {
    // Remove this URL from each bound todo's boundUrls
    for (const t of todos) {
      const newBound = (t.boundUrls || []).filter(u => u !== meta.url)
      await updateTodo(t.id, { boundUrls: newBound })
    }
    actionTaken = 'removed'
  } else if (action === 'smart-complete') {
    // For each bound todo: if this is its only URL AND no other pending todo has this URL → complete it
    const allTodos = await listTodos()
    for (const t of todos) {
      const todoHasOnlyThisUrl = (t.boundUrls || []).length === 1 && t.boundUrls[0] === meta.url
      const otherTodosWithUrl = allTodos.filter(other =>
        other.id !== t.id &&
        other.status === 'pending' &&
        (other.boundUrls || []).includes(meta.url)
      )
      if (todoHasOnlyThisUrl && otherTodosWithUrl.length === 0) {
        await completeTodo(t.id)
        completedTodoIds.push(t.id)
      }
    }
    if (completedTodoIds.length > 0) actionTaken = 'completed'
  }
  // 'keep' = no action, just broadcast toast (existing behavior)

  // Broadcast a single closureId to all open new tab pages.
  // The dedupe mechanism in app.js ensures only one page shows the toast.
  const closureId = `close-${tabId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const payload = {
    type: 'tab-closed-while-bound',
    closureId,
    url: meta.url,
    title: meta.title,
    todoIds: todos.map(t => t.id),
    todoTexts: todos.map(t => t.text),
    actionTaken,
    completedTodoIds,
  }
  // chrome.runtime.sendMessage broadcasts to ALL extension contexts
  // (new tab pages, popup, options page) — they receive via chrome.runtime.onMessage.
  // Previously used chrome.tabs.sendMessage which only delivers to content scripts.
  try {
    await chrome.runtime.sendMessage(payload)
  } catch (e) {
    // Fine if no listeners are present (e.g. no new tab page open).
  }
})

// Handle capture submissions from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'capture') return false
  ;(async () => {
    try {
      const { text, projectName, reminders } = parseTodoInput(msg.text || '')
      let projectId = null
      if (projectName) {
        const m = await searchProjects(projectName)
        const exact = m.find(p => p.name.toLowerCase() === projectName.toLowerCase())
        projectId = (exact ?? await createProject({ name: projectName })).id
      }
      if (!text) {
        sendResponse({ ok: false, reason: 'empty after parse' })
        return
      }
      if (msg.url) await rememberUrlTitle(msg.url, msg.title || '')
      const todo = await createTodo({
        text,
        projectId,
        boundUrls: msg.url ? [msg.url] : [],
      })
      // Wire inline reminders（capture overlay 通过全局快捷键也走这条路）
      if (reminders && reminders.length > 0) {
        for (const r of reminders) {
          await addReminder(todo.id, { firstAt: r.firstAt, rule: r.rule })
        }
      }
      sendResponse({ ok: true, reminderCount: reminders.length })
    } catch (e) {
      console.warn('Tab Out: capture handler failed', e)
      sendResponse({ ok: false, reason: String(e) })
    }
  })()
  return true  // async response
})

// ============================================================
// Reminders — alarm fires + notifications
// ============================================================

const MAX_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000
const DEDUP_WINDOW_MS = 60_000

/**
 * 找到 alarm.name (= reminder.id) 对应的 todo + reminder。
 */
async function findReminderTarget(reminderId) {
  const all = await listTodos()
  for (const t of all) {
    const r = (t.reminders || []).find(x => x.id === reminderId)
    if (r) return { todo: t, reminder: r }
  }
  return null
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith('rmd_')) return
  const target = await findReminderTarget(alarm.name)
  if (!target) {
    await chrome.alarms.clear(alarm.name).catch(() => {})
    return
  }
  const { todo, reminder } = target

  // skip 已完成的一次性 reminder
  if (todo.status === 'done' && reminder.rule === 'once') {
    await chrome.alarms.clear(alarm.name).catch(() => {})
    return
  }

  const settings = await getSettings()
  const snoozeMin = settings.defaultSnoozeMin || 30

  // 第二行优先显示项目名（有项目时），无项目时 fallback 到扩展名
  let subtitle = 'zhujian-tab'
  if (todo.projectId) {
    try {
      const projects = await listProjects({ includeArchived: true })
      const proj = projects.find(p => p.id === todo.projectId)
      if (proj && proj.name) subtitle = proj.name
    } catch (_) { /* fallback to 'zhujian-tab' on read error */ }
  }

  // 弹通知
  try {
    chrome.notifications.create(reminder.id, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: todo.text.slice(0, 50) || '提醒',
      message: '',
      contextMessage: subtitle,
      buttons: [
        { title: '✅ 完成' },
        { title: `😴 推迟 ${snoozeMin} 分钟` },
      ],
      priority: 1,
      requireInteraction: false,
    })
  } catch (e) {
    console.warn('notifications.create failed', e)
  }

  // 更新 lastFiredAt + 清 snoozedUntil + 排下次
  const now = Date.now()
  await updateReminder(todo.id, reminder.id, { lastFiredAt: now, snoozedUntil: null })
  // updateReminder 会重新 scheduleAlarm；因为 snoozedUntil 已清，nextOccurrence 走 rule 算
})

chrome.notifications.onButtonClicked.addListener(async (notifId, btnIdx) => {
  if (!notifId.startsWith('rmd_')) return
  const target = await findReminderTarget(notifId)
  if (!target) return
  const { todo, reminder } = target
  const settings = await getSettings()
  const snoozeMin = settings.defaultSnoozeMin || 30

  if (btnIdx === 0) {
    await completeReminderCycle(todo.id, reminder.id)
  } else if (btnIdx === 1) {
    await snoozeReminder(todo.id, reminder.id, Date.now() + snoozeMin * 60_000)
  }
  chrome.notifications.clear(notifId)
})

chrome.notifications.onClicked.addListener(async (notifId) => {
  if (!notifId.startsWith('rmd_') && !notifId.startsWith('catchup_')) return
  chrome.notifications.clear(notifId)
  // 打开新标签页 → 等 app.js listener 注册 → 广播 highlight
  await chrome.tabs.create({ url: 'chrome://newtab', active: true })
  setTimeout(async () => {
    try {
      if (notifId.startsWith('rmd_')) {
        const target = await findReminderTarget(notifId)
        if (target) {
          await chrome.runtime.sendMessage({
            type: 'reminder-clicked',
            todoId: target.todo.id,
            reminderId: target.reminder.id,
          })
        }
      } else if (notifId.startsWith('catchup_')) {
        await chrome.runtime.sendMessage({ type: 'catchup-clicked' })
      }
    } catch (e) {
      // 没有 listener 时 sendMessage 会 reject，吞掉
    }
  }, 500)
})

/**
 * 启动时跑：找过去 7 天内"应该 fire 但没 fire"的 reminders，聚合一条通知；
 * 同时重建所有 reminders 的 alarm（alarm 在 chrome restart 后可能丢）。
 */
async function catchupMissed() {
  const todos = await listTodos()
  const now = Date.now()
  const missed = []
  for (const t of todos) {
    for (const r of (t.reminders || [])) {
      // 重建 alarm
      const next = r.snoozedUntil ?? nextOccurrence(r.rule, r.firstAt, now, r.lastFiredAt)
      if (next) {
        await chrome.alarms.clear(r.id).catch(() => {})
        await chrome.alarms.create(r.id, { when: next }).catch(() => {})
      }
      // 算上一次应触发
      const prev = previousOccurrence(r.rule, r.firstAt, now - DEDUP_WINDOW_MS)
      if (!prev) continue
      if (prev < now - MAX_LOOKBACK_MS) continue
      if (r.lastFiredAt && r.lastFiredAt >= prev) continue
      if (t.status === 'done' && r.rule === 'once') continue
      missed.push({ todo: t, reminder: r })
    }
  }
  if (missed.length === 0) return
  const titles = missed.slice(0, 3).map(m => m.todo.text).join('；')
  try {
    chrome.notifications.create('catchup_' + Date.now(), {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: `🔔 你有 ${missed.length} 条错过的提醒`,
      message: titles + (missed.length > 3 ? '...' : ''),
      contextMessage: 'zhujian-tab',
      priority: 1,
    })
  } catch (e) {
    console.warn('catchup notification failed', e)
  }
}

chrome.runtime.onStartup.addListener(catchupMissed)
chrome.runtime.onInstalled.addListener(catchupMissed)
