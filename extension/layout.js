import { getSettings, updateSettings } from './settings.js'
import { renderTodosView } from './todos-view.js'

/**
 * Apply current settings.layoutMode to DOM.
 */
export async function applyLayout() {
  const s = await getSettings()
  const root = document.getElementById('layout-root')
  const tabs = document.getElementById('tabs-pane')
  const todos = document.getElementById('todos-pane')
  const divider = document.getElementById('layout-divider')
  const toggleBtn = document.getElementById('toggleViewBtn')
  if (!root) return

  // Narrow-screen override: split-h doesn't work well below 720px → force split-v
  let effectiveMode = s.layoutMode
  if (effectiveMode === 'split-h' && window.innerWidth < 720) {
    effectiveMode = 'split-v'
  }

  root.className = `layout-mode-${effectiveMode}`
  root.dataset.visible = s.toggleVisible

  if (effectiveMode === 'toggle') {
    if (tabs) tabs.hidden = s.toggleVisible !== 'tabs'
    if (todos) todos.hidden = s.toggleVisible !== 'todos'
    if (divider) divider.hidden = true
    if (toggleBtn) {
      toggleBtn.hidden = false
      toggleBtn.querySelectorAll('span[data-target]').forEach(el =>
        el.classList.toggle('active', el.dataset.target === s.toggleVisible)
      )
    }
  } else {
    // split-h / split-v
    if (tabs) tabs.hidden = false
    if (todos) todos.hidden = false
    if (divider) divider.hidden = false
    if (toggleBtn) toggleBtn.hidden = true
    applySplit(effectiveMode, s.splitRatio)
  }
  if (s.toggleVisible === 'todos' || effectiveMode !== 'toggle') await renderTodosView()
}

function applySplit(mode, ratio) {
  const root = document.getElementById('layout-root')
  if (!root) return
  const pct = `${Math.round(ratio * 1000) / 10}%`
  if (mode === 'split-h') {
    root.style.setProperty('--split-left', pct)
    root.style.removeProperty('--split-top')
  } else if (mode === 'split-v') {
    root.style.setProperty('--split-top', pct)
    root.style.removeProperty('--split-left')
  }
}

/** Toggle button (idempotent — only one click handler registered). */
export function wireToggleBtn() {
  const btn = document.getElementById('toggleViewBtn')
  if (!btn) return
  btn.addEventListener('click', async () => {
    const s = await getSettings()
    if (s.layoutMode !== 'toggle') return
    const next = s.toggleVisible === 'tabs' ? 'todos' : 'tabs'
    await updateSettings({ toggleVisible: next })
    await applyLayout()
  })
}

/** Divider drag (only wires once; safe to call multiple times). */
let _dividerWired = false
export function wireDivider() {
  if (_dividerWired) return
  _dividerWired = true
  const divider = document.getElementById('layout-divider')
  const root = document.getElementById('layout-root')
  if (!divider || !root) return

  let dragging = false
  let currentMode = null

  divider.addEventListener('mousedown', (e) => {
    if (root.classList.contains('layout-mode-split-h')) currentMode = 'h'
    else if (root.classList.contains('layout-mode-split-v')) currentMode = 'v'
    else return  // not in a split mode, ignore
    dragging = true
    divider.classList.add('dragging')
    e.preventDefault()
  })

  document.addEventListener('mousemove', (e) => {
    if (!dragging || !currentMode) return
    let ratio
    if (currentMode === 'h') ratio = e.clientX / window.innerWidth
    else ratio = e.clientY / window.innerHeight
    ratio = Math.max(0.15, Math.min(0.85, ratio))
    if (currentMode === 'h') root.style.setProperty('--split-left', `${ratio * 100}%`)
    else root.style.setProperty('--split-top', `${ratio * 100}%`)
    root.dataset.lastRatio = String(ratio)
  })

  document.addEventListener('mouseup', async () => {
    if (!dragging) return
    dragging = false
    divider.classList.remove('dragging')
    const ratio = parseFloat(root.dataset.lastRatio || '0.5')
    await updateSettings({ splitRatio: ratio })
  })

  divider.addEventListener('dblclick', async () => {
    await updateSettings({ splitRatio: 0.5 })
    await applyLayout()
  })
}

let _resizeTimer = null
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer)
  _resizeTimer = setTimeout(() => { applyLayout() }, 200)
})
