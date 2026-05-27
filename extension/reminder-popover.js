// extension/reminder-popover.js
import { listTodos, addReminder, updateReminder, removeReminder } from './todos.js'
import { formatReminderHuman } from './reminders.js'
import { showToast } from './ui.js'

let _todoId = null
let _draft = []  // [{id?, firstAt, rule, _new?, _deleted?}]
let _wired = false

const REPEAT_OPTIONS = [
  { value: 'once',       label: '不重复' },
  { value: 'daily',      label: '每天' },
  { value: 'weekdays',   label: '工作日（周一~五）' },
  { value: 'weekly:Mon', label: '每周一' },
  { value: 'weekly:Tue', label: '每周二' },
  { value: 'weekly:Wed', label: '每周三' },
  { value: 'weekly:Thu', label: '每周四' },
  { value: 'weekly:Fri', label: '每周五' },
  { value: 'weekly:Sat', label: '每周六' },
  { value: 'weekly:Sun', label: '每周日' },
  { value: 'biweekly:Mon', label: '每两周一' },
  { value: 'monthly:1',  label: '每月 1 号' },
  { value: 'monthly:15', label: '每月 15 号' },
  { value: 'monthly:last', label: '每月最后一天' },
]

function fmtForInputDate(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtForInputTime(ts) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function combineDateTimeLocal(dateStr, timeStr) {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, mi] = timeStr.split(':').map(Number)
  return new Date(y, mo - 1, d, h, mi, 0).getTime()
}

function renderItem(idx, item) {
  const opts = REPEAT_OPTIONS
    .map(o => `<option value="${o.value}" ${o.value === item.rule ? 'selected' : ''}>${o.label}</option>`)
    .join('')
  return `<div class="rp-item" data-idx="${idx}" ${item._deleted ? 'hidden' : ''}>
    <input type="date" class="rp-date" value="${fmtForInputDate(item.firstAt)}">
    <input type="time" class="rp-time" value="${fmtForInputTime(item.firstAt)}">
    <select class="rp-rule">${opts}</select>
    <button class="rp-del" title="删除">🗑</button>
  </div>`
}

function refresh() {
  const root = document.getElementById('rpList')
  root.innerHTML = _draft.map((it, i) => renderItem(i, it)).join('')
}

export async function openReminderPopover(todoId, anchorEl) {
  const all = await listTodos()
  const todo = all.find(t => t.id === todoId)
  if (!todo) return
  _todoId = todoId
  _draft = (todo.reminders || []).map(r => ({ ...r }))
  if (_draft.length === 0) {
    _draft.push({
      firstAt: Date.now() + 60 * 60 * 1000,  // 默认 1 小时后
      rule: 'once',
      _new: true,
    })
  }
  refresh()
  // 必须先 unhide 才能用 offsetWidth/Height 实测定位（hidden 元素这俩返回 0）
  const p = document.getElementById('reminderPopover')
  p.style.visibility = 'hidden'   // 测量期不闪
  p.hidden = false
  positionPopover(anchorEl)
  p.style.visibility = ''
  if (!_wired) wirePopover()
}

export function closeReminderPopover() {
  const p = document.getElementById('reminderPopover')
  if (p) p.hidden = true
  _todoId = null
  _draft = []
}

function positionPopover(anchorEl) {
  const p = document.getElementById('reminderPopover')
  const rect = anchorEl.getBoundingClientRect()
  p.style.position = 'absolute'

  // 先临时放置以便测量实际尺寸（前提：caller 已 unhide）
  p.style.top = '0px'
  p.style.left = '0px'
  const popW = p.offsetWidth
  const popH = p.offsetHeight

  // 默认 anchor 下方 + anchor 左对齐
  let top = rect.bottom + window.scrollY + 4
  let left = rect.left + window.scrollX

  // 右边超界：从右侧 8px 边距倒推
  if (left + popW > window.innerWidth - 8) {
    left = window.innerWidth - popW - 8
  }
  // 左边超界
  if (left < 8) left = 8
  // 下边超界：翻到 anchor 上方
  if (top + popH > window.innerHeight + window.scrollY - 8) {
    top = rect.top + window.scrollY - popH - 4
  }
  // 上边也超界（极少见，整个 anchor 太大）：钉在视口顶部
  if (top < window.scrollY + 8) top = window.scrollY + 8

  p.style.top = top + 'px'
  p.style.left = left + 'px'
}

function wirePopover() {
  const root = document.getElementById('reminderPopover')
  document.getElementById('rpAdd').addEventListener('click', () => {
    _draft.push({ firstAt: Date.now() + 60 * 60 * 1000, rule: 'once', _new: true })
    refresh()
  })
  document.getElementById('rpCancel').addEventListener('click', () => closeReminderPopover())
  document.getElementById('rpSave').addEventListener('click', save)
  root.addEventListener('click', (e) => {
    const del = e.target.closest('.rp-del')
    if (del) {
      const item = del.closest('.rp-item')
      const idx = +item.dataset.idx
      if (_draft[idx].id) _draft[idx]._deleted = true
      else _draft.splice(idx, 1)
      refresh()
    }
  })
  root.addEventListener('change', (e) => {
    const item = e.target.closest('.rp-item')
    if (!item) return
    const idx = +item.dataset.idx
    const dateEl = item.querySelector('.rp-date')
    const timeEl = item.querySelector('.rp-time')
    const ruleEl = item.querySelector('.rp-rule')
    _draft[idx].firstAt = combineDateTimeLocal(dateEl.value, timeEl.value)
    _draft[idx].rule = ruleEl.value
  })
  document.addEventListener('click', (e) => {
    if (root.hidden) return
    if (root.contains(e.target)) return
    if (e.target.closest('.t-reminder')) return  // 别立刻关
    closeReminderPopover()
  })
  document.addEventListener('keydown', (e) => {
    if (!root.hidden && e.key === 'Escape') closeReminderPopover()
  })
  _wired = true
}

async function save() {
  const tid = _todoId
  if (!tid) return
  // 累计本次保存后还活着的 reminder（用于 toast）
  const alive = []
  let anyChange = false
  for (const item of _draft) {
    if (item._deleted && item.id) {
      await removeReminder(tid, item.id)
      anyChange = true
    } else if (item._new) {
      const r = await addReminder(tid, { firstAt: item.firstAt, rule: item.rule })
      alive.push(r)
      anyChange = true
    } else if (item.id) {
      // 已有 reminder — 比较是否真改了
      const orig = (await listTodos()).find(t => t.id === tid)?.reminders?.find(r => r.id === item.id)
      const changed = !orig || orig.firstAt !== item.firstAt || orig.rule !== item.rule
      if (changed) {
        const r = await updateReminder(tid, item.id, { firstAt: item.firstAt, rule: item.rule })
        if (r) alive.push(r)
        anyChange = true
      } else if (orig) {
        alive.push(orig)
      }
    }
  }
  closeReminderPopover()
  // toast 反馈
  if (anyChange) {
    if (alive.length === 0) {
      showToast('🔔 已清除全部提醒')
    } else {
      const sorted = [...alive].sort((a, b) => a.firstAt - b.firstAt)
      const earliest = sorted[0]
      const when = formatReminderHuman(earliest, Date.now())
      showToast(alive.length === 1 ? `🔔 提醒已设置：${when}` : `🔔 ${alive.length} 条提醒，最早 ${when}`)
    }
  }
}
