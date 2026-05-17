import { vi } from 'vitest'

// jest-chrome needs a jest global. Provide vitest's vi as jest for compatibility.
globalThis.jest = {
  fn: vi.fn,
  mock: vi.mock,
  unmock: vi.unmock,
}

// Now import jest-chrome after jest global is set up
import { chrome } from 'jest-chrome'

// 暴露到全局，供模块代码使用
globalThis.chrome = chrome

// 每个测试前重置 chrome.storage 数据
beforeEach(() => {
  chrome.storage.local.clear()
  chrome.storage.local.get.mockImplementation((keys, callback) => {
    const data = chrome.storage.local._data || {}
    if (typeof callback === 'function') callback(data)
    return Promise.resolve(data)
  })
  chrome.storage.local.set.mockImplementation((items, callback) => {
    chrome.storage.local._data = { ...(chrome.storage.local._data || {}), ...items }
    if (typeof callback === 'function') callback()
    return Promise.resolve()
  })
  chrome.storage.local.clear.mockImplementation((callback) => {
    chrome.storage.local._data = {}
    if (typeof callback === 'function') callback()
    return Promise.resolve()
  })
})
