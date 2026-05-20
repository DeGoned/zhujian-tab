// ui.js — toast / confetti / sound utilities
// 从 app.js 抽取，被 tabs.js 和 todos.js 共用。
// Phase 1.2: 函数体与 app.js 一致；Phase 1.3 会让 app.js 改用此处版本，并加 setSoundEnabled 控制。

// === Sound control ===
let _soundEnabled = true

/**
 * @param {boolean} enabled
 * @returns {void}
 */
export function setSoundEnabled(enabled) { _soundEnabled = Boolean(enabled) }

/**
 * @returns {boolean}
 */
export function getSoundEnabled() { return _soundEnabled }

/**
 * playCloseSound()
 *
 * Plays a clean "swoosh" sound when tabs are closed.
 * Built entirely with the Web Audio API — no sound files needed.
 * A filtered noise sweep that descends in pitch, like air moving.
 *
 * @returns {void}
 */
export function playCloseSound() {
  if (!_soundEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const t = ctx.currentTime;

    // Swoosh: shaped white noise through a sweeping bandpass filter
    const duration = 0.25;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Generate noise with a natural envelope (quick attack, smooth decay)
    for (let i = 0; i < data.length; i++) {
      const pos = i / data.length;
      // Envelope: ramps up fast in first 10%, then fades out smoothly
      const env = pos < 0.1 ? pos / 0.1 : Math.pow(1 - (pos - 0.1) / 0.9, 1.5);
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Bandpass filter sweeps from high to low — creates the "swoosh" character
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2.0;
    filter.frequency.setValueAtTime(4000, t);
    filter.frequency.exponentialRampToValueAtTime(400, t + duration);

    // Volume
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(t);

    setTimeout(() => ctx.close(), 500);
  } catch {
    // Audio not supported — fail silently
  }
}

// Alias so future code can use the generic name
export { playCloseSound as playSwoosh }

/**
 * shootConfetti(x, y)
 *
 * Shoots a burst of colorful confetti particles from the given screen
 * coordinates (typically the center of a card being closed).
 * Pure CSS + JS, no libraries.
 *
 * @param {number} x - Horizontal pixel coordinate
 * @param {number} y - Vertical pixel coordinate
 * @returns {void}
 */
export function shootConfetti(x, y) {
  const colors = [
    '#c8713a', // amber
    '#e8a070', // amber light
    '#5a7a62', // sage
    '#8aaa92', // sage light
    '#5a6b7a', // slate
    '#8a9baa', // slate light
    '#d4b896', // warm paper
    '#b35a5a', // rose
  ];

  const particleCount = 17;

  for (let i = 0; i < particleCount; i++) {
    const el = document.createElement('div');

    const isCircle = Math.random() > 0.5;
    const size = 5 + Math.random() * 6; // 5–11px
    const color = colors[Math.floor(Math.random() * colors.length)];

    el.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      border-radius: ${isCircle ? '50%' : '2px'};
      pointer-events: none;
      z-index: 9999;
      transform: translate(-50%, -50%);
      opacity: 1;
    `;
    document.body.appendChild(el);

    // Physics: random angle and speed for the outward burst
    const angle   = Math.random() * Math.PI * 2;
    const speed   = 60 + Math.random() * 120;
    const vx      = Math.cos(angle) * speed;
    const vy      = Math.sin(angle) * speed - 80; // bias upward
    const gravity = 200;

    const startTime = performance.now();
    const duration  = 700 + Math.random() * 200; // 700–900ms

    function frame(now) {
      const elapsed  = (now - startTime) / 1000;
      const progress = elapsed / (duration / 1000);

      if (progress >= 1) { el.remove(); return; }

      const px = vx * elapsed;
      const py = vy * elapsed + 0.5 * gravity * elapsed * elapsed;
      const opacity = progress < 0.5 ? 1 : 1 - (progress - 0.5) * 2;
      const rotate  = elapsed * 200 * (isCircle ? 0 : 1);

      el.style.transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px)) rotate(${rotate}deg)`;
      el.style.opacity = opacity;

      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }
}

// Alias for generic name
export { shootConfetti as burstConfetti }

/**
 * showToast(message)
 *
 * Brief pop-up notification at the bottom of the screen.
 *
 * @param {string} message
 * @returns {void}
 */
export function showToast(message) {
  const toast = document.getElementById('toast');
  document.getElementById('toastText').textContent = message;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 2500);
}

/**
 * Show a modal dialog. Returns a Promise that resolves to the clicked button's value,
 * or 'cancel' if user pressed Esc / clicked backdrop.
 *
 * @param {object} opts
 * @param {string} opts.title          Modal title (renders in serif h2)
 * @param {string} opts.bodyHtml       HTML for body. Inner content trusted (caller responsible for escaping user-provided text).
 * @param {Array<{label: string, kind: 'primary'|'secondary'|'ghost', value: string}>} opts.buttons
 * @param {boolean} [opts.dismissable=true] If true, Esc and backdrop click resolve to 'cancel'. If false, only buttons close it.
 * @returns {Promise<string>} value of the clicked button, or 'cancel'
 */
export function showModal({ title, bodyHtml, buttons, dismissable = true }) {
  return new Promise(resolve => {
    const bg = document.createElement('div')
    bg.className = 'tabout-modal-bg'
    bg.innerHTML = `
      <div class="tabout-modal" role="dialog" aria-modal="true" aria-label="${escapeAttr(title)}">
        <h2>${escapeHtml(title)}</h2>
        <div class="modal-body">${bodyHtml || ''}</div>
        <div class="actions">
          ${buttons.map(b => `<button class="btn-${b.kind}" data-value="${escapeAttr(b.value)}">${escapeHtml(b.label)}</button>`).join('')}
        </div>
      </div>
    `
    document.body.appendChild(bg)

    function done(value) {
      document.removeEventListener('keydown', onKey, true)
      bg.remove()
      resolve(value)
    }

    bg.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-value]')
      if (btn) {
        done(btn.dataset.value)
        return
      }
      if (dismissable && e.target === bg) {
        done('cancel')
      }
    })

    function onKey(e) {
      if (e.key === 'Escape' && dismissable) {
        e.stopPropagation()
        done('cancel')
      }
    }
    document.addEventListener('keydown', onKey, true)
  })
}

/**
 * 显示一个底部居中、N 秒可撤销的 toast。
 * @param {string} text
 * @param {() => Promise<void>} onUndo  用户点撤销时调用
 * @param {number} durationMs 默认 5000
 */
export function showUndoToast(text, onUndo, durationMs = 5000) {
  const el = document.createElement('div')
  el.className = 'undo-toast'
  el.innerHTML = `
    <span class="undo-text"></span>
    <button type="button" class="undo-btn">↶ 撤销</button>
  `
  el.querySelector('.undo-text').textContent = text
  document.body.appendChild(el)

  let restored = false
  let dismissTimer = null

  function dismiss() {
    if (!el.parentNode) return
    el.classList.add('out')
    setTimeout(() => el.remove(), 240)
  }

  el.querySelector('.undo-btn').addEventListener('click', async () => {
    if (restored) return
    restored = true
    clearTimeout(dismissTimer)
    try { await onUndo() } catch (_) {}
    el.remove()
  })

  dismissTimer = setTimeout(() => { if (!restored) dismiss() }, durationMs)
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))
}
function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))
}
