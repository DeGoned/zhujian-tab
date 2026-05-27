(function () {
  if (window.__taboutCaptureOpen) return
  window.__taboutCaptureOpen = true

  const overlay = document.createElement('div')
  overlay.id = 'tabout-capture-overlay'
  overlay.innerHTML = `
    <div id="tabout-capture-box" role="dialog" aria-label="Quick capture todo">
      <div class="tabout-label">Quick Capture · zhujian-tab</div>
      <input id="tabout-capture-input" type="text" placeholder="输入待办，#项目名 可选..." autocomplete="off" />
      <div id="tabout-capture-meta">
        <label>
          <input type="checkbox" id="tabout-bind-current" checked />
          <span>绑定当前 tab</span>
        </label>
        <span class="tabout-hint"><kbd>⏎</kbd> 保存 · <kbd>Esc</kbd> 取消</span>
      </div>
    </div>
  `
  document.documentElement.appendChild(overlay)

  const input = overlay.querySelector('#tabout-capture-input')
  const cb = overlay.querySelector('#tabout-bind-current')
  setTimeout(() => input.focus(), 0)

  function close() {
    overlay.remove()
    document.removeEventListener('keydown', onKey, true)
    window.__taboutCaptureOpen = false
  }

  function flashSuccess(text) {
    const el = document.createElement('div')
    el.id = 'tabout-capture-success'
    el.textContent = text
    document.documentElement.appendChild(el)
    setTimeout(() => el.remove(), 1800)
  }

  // Backdrop click → close
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close() })

  function onKey(e) {
    if (!document.documentElement.contains(overlay)) return
    if (e.key === 'Escape') {
      e.stopPropagation()
      e.preventDefault()
      close()
      return
    }
    if (e.key === 'Enter' && e.target === input) {
      e.stopPropagation()
      e.preventDefault()
      const text = input.value.trim()
      if (!text) return
      const bindCurrent = cb.checked
      // Disable input to prevent double-submit
      input.disabled = true
      chrome.runtime.sendMessage({
        type: 'capture',
        text,
        url: bindCurrent ? location.href : null,
        title: bindCurrent ? document.title : null,
      }, (resp) => {
        if (chrome.runtime.lastError) {
          console.warn('Tab Out capture failed:', chrome.runtime.lastError)
        }
        close()
        if (resp && resp.ok) flashSuccess('已加到 Tab Out')
      })
    }
  }
  document.addEventListener('keydown', onKey, true)
})()
