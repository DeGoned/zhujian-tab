import { searchProjects } from './projects.js'

let _state = null  // { input, dropdownEl, query, items, selectedIdx }

/**
 * 挂载下拉到 input。当用户输入 `#...`，自动弹下拉。
 * 选中后，input 末尾的 `#xxx` 被替换为 `#<selected.name> `（带尾空格便于继续输入）。
 *
 * @param {HTMLInputElement} input
 */
export function attachProjectDropdown(input) {
  input.addEventListener('input', () => maybeOpen(input))
  input.addEventListener('keydown', (e) => onKey(e, input))
  input.addEventListener('blur', () => setTimeout(close, 200))  // 延迟便于点击
}

async function maybeOpen(input) {
  // 找 caret 前最后一个 # 到 caret 之间的文本作为 query
  const caret = input.selectionStart
  const before = input.value.slice(0, caret)
  const m = before.match(/#([^#\s]*)$/)
  if (!m) return close()
  const query = m[1]
  const items = await searchProjects(query)
  open(input, query, items)
}

function open(input, query, items) {
  if (!_state) {
    const el = document.createElement('div')
    el.className = 'proj-dropdown'
    document.body.appendChild(el)
    _state = { input, dropdownEl: el, query, items, selectedIdx: 0 }
  } else {
    _state.input = input
    _state.query = query
    _state.items = items
  }
  const rect = input.getBoundingClientRect()
  _state.dropdownEl.style.left = `${rect.left}px`
  _state.dropdownEl.style.top = `${rect.bottom + 4}px`
  _state.dropdownEl.style.width = `${rect.width}px`
  if (_state.selectedIdx >= items.length + (showNewSelectable() ? 1 : 0)) _state.selectedIdx = 0
  render()
}

function render() {
  if (!_state) return
  const { items, query, selectedIdx } = _state
  const showNew = query.length > 0 && !items.find(p => p.name.toLowerCase() === query.toLowerCase())
  const rows = []
  if (showNew) {
    rows.push(`<div class="pd-item pd-new ${selectedIdx === 0 ? 'sel' : ''}" data-idx="0">↩ 新建项目 "<strong>${escape(query)}</strong>"</div>`)
  }
  items.forEach((p, i) => {
    const idx = (showNew ? 1 : 0) + i
    rows.push(`<div class="pd-item ${idx === selectedIdx ? 'sel' : ''}" data-idx="${idx}" data-name="${escape(p.name)}">
      <span class="pd-color pd-${p.color}"></span>${escape(p.name)}
    </div>`)
  })
  _state.dropdownEl.innerHTML = rows.join('') || `<div class="pd-empty">无匹配，回车新建</div>`
  _state.dropdownEl.querySelectorAll('.pd-item').forEach(el => {
    el.addEventListener('mousedown', (e) => {
      e.preventDefault()
      _state.selectedIdx = parseInt(el.dataset.idx)
      commit()
    })
  })
}

function onKey(e, input) {
  if (!_state) return
  const total = _state.items.length + (showNewSelectable() ? 1 : 0)
  if (total === 0) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    _state.selectedIdx = (_state.selectedIdx + 1) % total
    render()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    _state.selectedIdx = (_state.selectedIdx - 1 + total) % total
    render()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    e.stopPropagation()  // 阻止外层 Enter 创建 todo
    commit()
  } else if (e.key === 'Escape') {
    close()
  }
}

function showNewSelectable() {
  return _state && _state.query.length > 0 &&
    !_state.items.find(p => p.name.toLowerCase() === _state.query.toLowerCase())
}

function commit() {
  if (!_state) return
  const { input, items, selectedIdx, query } = _state
  const showNew = showNewSelectable()
  let pickedName
  if (showNew && selectedIdx === 0) {
    pickedName = query
  } else {
    const i = showNew ? selectedIdx - 1 : selectedIdx
    pickedName = items[i]?.name || query
  }
  // 替换 input 中末尾 #xxx 为 #pickedName + 空格
  const caret = input.selectionStart
  const before = input.value.slice(0, caret)
  const after = input.value.slice(caret)
  const newBefore = before.replace(/#[^#\s]*$/, `#${pickedName} `)
  input.value = newBefore + after
  input.selectionStart = input.selectionEnd = newBefore.length
  close()
}

function close() {
  if (!_state) return
  _state.dropdownEl.remove()
  _state = null
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))
}
