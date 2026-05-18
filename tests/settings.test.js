import { describe, it, expect, beforeEach } from 'vitest'
import { getSettings, updateSettings, DEFAULT_SETTINGS } from '../extension/settings.js'

beforeEach(async () => { await chrome.storage.local.clear() })

describe('settings', () => {
  it('returns defaults when unset', async () => {
    const s = await getSettings()
    expect(s).toEqual(DEFAULT_SETTINGS)
    expect(s.layoutMode).toBe('toggle')
    expect(s.toggleVisible).toBe('tabs')
    expect(s.splitRatio).toBe(0.5)
    expect(s.soundEnabled).toBe(true)
    expect(s.hotkeyEnabled).toBe(true)
  })

  it('merges with defaults on partial set', async () => {
    await updateSettings({ layoutMode: 'split-h' })
    const s = await getSettings()
    expect(s.layoutMode).toBe('split-h')
    expect(s.toggleVisible).toBe('tabs') // 其他保留默认
  })
})
