import { getStorage, setStorage, KEYS } from './storage.js'

export const DEFAULT_SETTINGS = {
  layoutMode: 'toggle',     // 'split-h' | 'split-v' | 'toggle'
  toggleVisible: 'tabs',    // 'tabs' | 'todos'
  splitRatio: 0.5,
  soundEnabled: true,
  hotkeyEnabled: true,
  nativeCloseAction: 'keep', // 'remove-binding' | 'keep' | 'smart-complete'
  notifyOnComplete: false,    // 完成 todo 时是否再弹一条通知确认
  defaultSnoozeMin: 30,       // 系统通知"😴 推迟"按钮的分钟数（5/15/30/60）
}

export async function getSettings() {
  const s = await getStorage(KEYS.settings, {})
  return { ...DEFAULT_SETTINGS, ...s }
}

export async function updateSettings(patch) {
  const cur = await getSettings()
  await setStorage(KEYS.settings, { ...cur, ...patch })
}
