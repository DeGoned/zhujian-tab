import { describe, it, expect, beforeEach } from 'vitest'
import { getStorage, setStorage, onStorageChanged } from '../extension/storage.js'

describe('storage abstraction', () => {
  beforeEach(async () => {
    await chrome.storage.local.clear()
  })

  it('reads default when key not set', async () => {
    const val = await getStorage('taboutTodos', [])
    expect(val).toEqual([])
  })

  it('writes and reads back', async () => {
    await setStorage('taboutTodos', [{ id: '1', text: 'hi' }])
    const val = await getStorage('taboutTodos', [])
    expect(val).toEqual([{ id: '1', text: 'hi' }])
  })

  it('triggers onStorageChanged when written', async () => {
    let received = null
    onStorageChanged('taboutTodos', (newVal) => { received = newVal })
    // jest-chrome 模拟 onChanged 需要手动触发
    chrome.storage.onChanged.callListeners(
      { taboutTodos: { oldValue: undefined, newValue: [{ id: 'a' }] } },
      'local'
    )
    expect(received).toEqual([{ id: 'a' }])
  })
})
