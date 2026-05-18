/**
 * background.js — Service Worker for Badge Updates
 *
 * Chrome's "always-on" background script for Tab Out.
 * Its only job: keep the toolbar badge showing the current open tab count.
 *
 * Since we no longer have a server, we query chrome.tabs directly.
 * The badge counts real web tabs (skipping chrome:// and extension pages).
 *
 * Color coding gives a quick at-a-glance health signal:
 *   Green  (#3d7a4a) → 1–10 tabs  (focused, manageable)
 *   Amber  (#b8892e) → 11–20 tabs (getting busy)
 *   Red    (#b35a5a) → 21+ tabs   (time to cull!)
 */

// ─── Badge updater ────────────────────────────────────────────────────────────

/**
 * updateBadge()
 *
 * Counts open real-web tabs and updates the extension's toolbar badge.
 * "Real" tabs = not chrome://, not extension pages, not about:blank.
 */
async function updateBadge() {
  try {
    const tabs = await chrome.tabs.query({});

    // Only count actual web pages — skip browser internals and extension pages
    const count = tabs.filter(t => {
      const url = t.url || '';
      return (
        !url.startsWith('chrome://') &&
        !url.startsWith('chrome-extension://') &&
        !url.startsWith('about:') &&
        !url.startsWith('edge://') &&
        !url.startsWith('brave://')
      );
    }).length;

    // Don't show "0" — an empty badge is cleaner
    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });

    if (count === 0) return;

    // Pick badge color based on workload level
    let color;
    if (count <= 10) {
      color = '#3d7a4a'; // Green — you're in control
    } else if (count <= 20) {
      color = '#b8892e'; // Amber — things are piling up
    } else {
      color = '#b35a5a'; // Red — time to focus and close some tabs
    }

    await chrome.action.setBadgeBackgroundColor({ color });

  } catch {
    // If something goes wrong, clear the badge rather than show stale data
    chrome.action.setBadgeText({ text: '' });
  }
}

// ─── Event listeners ──────────────────────────────────────────────────────────

// Update badge when the extension is first installed
chrome.runtime.onInstalled.addListener(() => {
  updateBadge();
});

// Update badge when Chrome starts up
chrome.runtime.onStartup.addListener(() => {
  updateBadge();
});

// Update badge whenever a tab is opened
chrome.tabs.onCreated.addListener(() => {
  updateBadge();
});

// Update badge whenever a tab is closed
chrome.tabs.onRemoved.addListener(() => {
  updateBadge();
});

// Update badge when a tab's URL changes (e.g. navigating to/from chrome://)
chrome.tabs.onUpdated.addListener(() => {
  updateBadge();
});

// ─── Initial run ─────────────────────────────────────────────────────────────

// Run once immediately when the service worker first loads
updateBadge();

// ============================================================
// Tab Out + Todo — global hotkey capture flow
// ============================================================

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'open-capture') return
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab || !tab.id) return
    // Skip restricted URLs (chrome://, chrome-extension://, edge://, about:, etc.)
    if (!tab.url || /^(chrome|edge|about|chrome-extension|moz-extension|brave|opera|view-source):/i.test(tab.url)) {
      // Cannot inject into restricted page — user must be on a normal web page
      console.info('Tab Out: cannot inject into restricted page', tab.url)
      return
    }
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['content/capture-overlay.css'],
    })
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/capture-overlay.js'],
    })
  } catch (e) {
    console.warn('Tab Out: inject capture overlay failed', e)
  }
})

// Handle capture submissions from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'capture') return false
  ;(async () => {
    try {
      const [{ createTodo }, { searchProjects, createProject }, { rememberUrlTitle }, { parseTodoInput }] = await Promise.all([
        import(chrome.runtime.getURL('todos.js')),
        import(chrome.runtime.getURL('projects.js')),
        import(chrome.runtime.getURL('binding.js')),
        import(chrome.runtime.getURL('input-parser.js')),
      ])
      const { text, projectName } = parseTodoInput(msg.text || '')
      let projectId = null
      if (projectName) {
        const m = await searchProjects(projectName)
        const exact = m.find(p => p.name.toLowerCase() === projectName.toLowerCase())
        projectId = (exact ?? await createProject({ name: projectName })).id
      }
      if (!text) {
        sendResponse({ ok: false, reason: 'empty after parse' })
        return
      }
      if (msg.url) await rememberUrlTitle(msg.url, msg.title || '')
      await createTodo({
        text,
        projectId,
        boundUrls: msg.url ? [msg.url] : [],
      })
      sendResponse({ ok: true })
    } catch (e) {
      console.warn('Tab Out: capture handler failed', e)
      sendResponse({ ok: false, reason: String(e) })
    }
  })()
  return true  // async response
})
