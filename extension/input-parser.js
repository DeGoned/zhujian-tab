import { parseReminderInline } from './reminders.js'

/**
 * 抽 @time ~repeat 再抽 #project。
 * 顺序：先 reminders 后 project，避免 #work@14:30 这种紧贴 case 互相吞字。
 *
 * @param {string} raw
 * @param {number} [now=Date.now()]
 * @returns {{ text: string, projectName: string | null, reminders: Array<{firstAt: number, rule: string}> }}
 */
export function parseTodoInput(raw, now = Date.now()) {
  // 1. 先抽 @ ~（reminders.js 已实现）
  const { cleanText: afterReminders, reminders } = parseReminderInline(raw, now)

  // 2. 再抽 # 项目（保留现有逻辑）
  const allMatches = [...afterReminders.matchAll(/#/g)]
  if (allMatches.length === 0) {
    return { text: afterReminders.trim(), projectName: null, reminders }
  }
  const lastMatch = allMatches[allMatches.length - 1]
  const lastHashIndex = lastMatch.index
  const isAtStart = lastHashIndex === 0
  const afterHash = afterReminders.substring(lastHashIndex + 1)
  let projectName, lastProjectEndIndex
  if (isAtStart) {
    const m = afterHash.match(/^(\S+)/)
    projectName = m ? m[1] : ''
    lastProjectEndIndex = lastHashIndex + 1 + (m ? m[0].length : 0)
  } else {
    const m = afterHash.match(/^([^#]*)/)
    projectName = m ? m[1].trim() : ''
    lastProjectEndIndex = lastHashIndex + 1 + (m ? m[0].length : 0)
  }
  let text = ''
  let lastIndex = 0
  for (let i = 0; i < allMatches.length; i++) {
    const hashIndex = allMatches[i].index
    if (hashIndex > lastIndex) text += afterReminders.substring(lastIndex, hashIndex) + ' '
    if (i === allMatches.length - 1) {
      lastIndex = lastProjectEndIndex
    } else {
      const afterThisHash = afterReminders.substring(hashIndex + 1)
      const wordMatch = afterThisHash.match(/^(\S+)/)
      lastIndex = hashIndex + 1 + (wordMatch ? wordMatch[0].length : 0)
    }
  }
  if (lastIndex < afterReminders.length) text += afterReminders.substring(lastIndex)
  text = text.replace(/\s+/g, ' ').trim()
  return { text, projectName: projectName || null, reminders }
}
