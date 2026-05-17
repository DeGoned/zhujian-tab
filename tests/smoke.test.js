import { describe, it, expect } from 'vitest'

describe('test infra smoke', () => {
  it('vitest works', () => {
    expect(1 + 1).toBe(2)
  })
  it('chrome.storage mock works', async () => {
    await chrome.storage.local.set({ foo: 'bar' })
    const data = await chrome.storage.local.get('foo')
    expect(data.foo).toBe('bar')
  })
})
