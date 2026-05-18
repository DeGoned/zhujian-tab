import { getSettings, updateSettings } from './settings.js'
import { setSoundEnabled } from './ui.js'
import { applyLayout } from './layout.js'

/**
 * Initialize the gear button + popover. Idempotent.
 */
export function wireSettingsPanel() {
  const btn = document.getElementById('settingsBtn')
  const panel = document.getElementById('settingsPanel')
  if (!btn || !panel) return

  btn.addEventListener('click', async (e) => {
    e.stopPropagation()
    panel.hidden = !panel.hidden
    if (!panel.hidden) await refreshPanelState()
  })

  // Click outside closes
  document.addEventListener('click', (e) => {
    if (panel.hidden) return
    if (panel.contains(e.target) || btn.contains(e.target)) return
    panel.hidden = true
  })

  // Layout mode change → save + apply
  panel.querySelectorAll('input[name="layoutMode"]').forEach(r => {
    r.addEventListener('change', async () => {
      if (!r.checked) return
      await updateSettings({ layoutMode: r.value })
      await applyLayout()
    })
  })

  // Sound checkbox
  const cbSound = document.getElementById('cbSound')
  if (cbSound) {
    cbSound.addEventListener('change', async (e) => {
      await updateSettings({ soundEnabled: e.target.checked })
      setSoundEnabled(e.target.checked)
    })
  }
}

async function refreshPanelState() {
  const s = await getSettings()
  document.querySelectorAll('input[name="layoutMode"]').forEach(r => {
    r.checked = r.value === s.layoutMode
  })
  const cb = document.getElementById('cbSound')
  if (cb) cb.checked = s.soundEnabled
}
