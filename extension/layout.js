import { getSettings, updateSettings } from './settings.js'
import { renderTodosView } from './todos-view.js'

/**
 * Apply the current settings.layoutMode to the DOM.
 * Shows/hides tabs-pane, todos-pane, toggle button, divider.
 * Re-renders Todos view when it becomes visible.
 */
export async function applyLayout() {
  const s = await getSettings()
  const root = document.getElementById('layout-root')
  const tabs = document.getElementById('tabs-pane')
  const todos = document.getElementById('todos-pane')
  const divider = document.getElementById('layout-divider')
  const toggleBtn = document.getElementById('toggleViewBtn')
  if (!root) return

  root.className = `layout-mode-${s.layoutMode}`
  root.dataset.visible = s.toggleVisible

  if (s.layoutMode === 'toggle') {
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
    // Task 4.3 will implement the split geometry; for now no-op
  }
  if (s.toggleVisible === 'todos') await renderTodosView()
}

/** Wire click handler on the toggle button (only meaningful in toggle mode). */
export function wireToggleBtn() {
  const btn = document.getElementById('toggleViewBtn')
  if (!btn) return
  btn.addEventListener('click', async () => {
    const s = await getSettings()
    if (s.layoutMode !== 'toggle') return  // toggle btn only acts in toggle mode
    const next = s.toggleVisible === 'tabs' ? 'todos' : 'tabs'
    await updateSettings({ toggleVisible: next })
    await applyLayout()
  })
}
