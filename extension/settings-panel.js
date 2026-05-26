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

  // nativeCloseAction radio buttons
  document.querySelectorAll('input[name="nativeCloseAction"]').forEach(r => {
    r.addEventListener('change', async () => {
      if (!r.checked) return
      await updateSettings({ nativeCloseAction: r.value })
    })
  })

  // 通知行为：完成确认
  const cbNotify = document.getElementById('cbNotifyOnComplete')
  if (cbNotify) {
    cbNotify.addEventListener('change', async (e) => {
      await updateSettings({ notifyOnComplete: e.target.checked })
    })
  }
  // 通知行为：默认推迟时长
  const selSnooze = document.getElementById('selSnoozeMin')
  if (selSnooze) {
    selSnooze.addEventListener('change', async (e) => {
      await updateSettings({ defaultSnoozeMin: +e.target.value })
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
  document.querySelectorAll('input[name="nativeCloseAction"]').forEach(r => {
    r.checked = r.value === s.nativeCloseAction
  })
  const cbN = document.getElementById('cbNotifyOnComplete')
  if (cbN) cbN.checked = !!s.notifyOnComplete
  const selS = document.getElementById('selSnoozeMin')
  if (selS) selS.value = String(s.defaultSnoozeMin || 30)
}
