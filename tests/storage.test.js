import { describe, it, expect, beforeEach } from 'vitest'
import { getStorage, setStorage, onStorageChanged, offStorageChanged } from '../extension/storage.js'

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

  it('returned unsubscribe function stops further callbacks', async () => {
    let count = 0
    const unsub = onStorageChanged('taboutTodos', () => { count += 1 })
    chrome.storage.onChanged.callListeners(
      { taboutTodos: { oldValue: undefined, newValue: [{ id: 'a' }] } },
      'local'
    )
    expect(count).toBe(1)
    unsub()
    chrome.storage.onChanged.callListeners(
      { taboutTodos: { oldValue: [{ id: 'a' }], newValue: [{ id: 'b' }] } },
      'local'
    )
    expect(count).toBe(1) // still 1 — listener was removed
  })

  it('offStorageChanged removes a registered callback', async () => {
    let count = 0
    const cb = () => { count += 1 }
    onStorageChanged('taboutTodos', cb)
    offStorageChanged('taboutTodos', cb)
    chrome.storage.onChanged.callListeners(
      { taboutTodos: { oldValue: undefined, newValue: [{ id: 'a' }] } },
      'local'
    )
    expect(count).toBe(0)
  })
})
