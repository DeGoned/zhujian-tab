/**
 * 提取最后一个 #... （#后面的字符直到下一个 # 或 EOL）为项目名；
 * 如果 # 在字符串开头，只取紧跟的第一个单词；
 * 否则取到下一个 # 或 EOL。
 * 其余文本拼接为 todo text。
 *
 * @param {string} raw
 * @returns {{ text: string, projectName: string | null }}
 */
export function parseTodoInput(raw) {
  // Find all # positions and matches
  const allMatches = [...raw.matchAll(/#/g)]
  if (allMatches.length === 0) return { text: raw.trim(), projectName: null }

  // Get the last # match
  const lastMatch = allMatches[allMatches.length - 1]
  const lastHashIndex = lastMatch.index

  // Determine if this # is at the very beginning
  const isAtStart = lastHashIndex === 0

  // Find the end position for project name extraction (for the LAST #)
  const afterHash = raw.substring(lastHashIndex + 1)
  let projectName
  let lastProjectEndIndex

  if (isAtStart) {
    // At start: capture only the first word (\S+)
    const match = afterHash.match(/^(\S+)/)
    projectName = match ? match[1] : ''
    lastProjectEndIndex = lastHashIndex + 1 + (match ? match[0].length : 0)
  } else {
    // In middle/end: capture until next # or EOL
    const match = afterHash.match(/^([^#]*)/)
    projectName = match ? match[1].trim() : ''
    lastProjectEndIndex = lastHashIndex + 1 + (match ? match[0].length : 0)
  }

  // Remove ALL # and their project names, keep the rest
  let text = ''
  let lastIndex = 0

  for (let i = 0; i < allMatches.length; i++) {
    const hashIndex = allMatches[i].index

    // Add text before this #
    if (hashIndex > lastIndex) {
      text += raw.substring(lastIndex, hashIndex) + ' '
    }

    if (i === allMatches.length - 1) {
      // For the last #, skip only the projectName part
      lastIndex = lastProjectEndIndex
    } else {
      // For earlier #'s, we need to determine their scope
      // Since they're not the project, we only skip the # itself + the word
      const afterThisHash = raw.substring(hashIndex + 1)
      const wordMatch = afterThisHash.match(/^(\S+)/)
      lastIndex = hashIndex + 1 + (wordMatch ? wordMatch[0].length : 0)
    }
  }

  // Add any remaining text after processing all #'s
  if (lastIndex < raw.length) {
    text += raw.substring(lastIndex)
  }

  text = text.replace(/\s+/g, ' ').trim()

  return { text, projectName: projectName || null }
}
