// extension/reminders.js
// 纯函数。不依赖 chrome / DOM / storage。

const WEEKDAY_MAP = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 }

/**
 * 给定本地时间各分量，返回该时刻的 timestamp。
 *
 * @param {number} y
 * @param {number} m  1-12
 * @param {number} d  1-31
 * @param {number} h  0-23
 * @param {number} min 0-59
 * @returns {number}
 */
function localTs(y, m, d, h, min) {
  return new Date(y, m - 1, d, h, min, 0).getTime()
}

/**
 * 把 12 小时制（含上午/下午/晚上）转成 24 小时。
 *
 * @param {'上午'|'下午'|'晚上'} period
 * @param {number} hour
 * @returns {number}
 */
function to24h(period, hour) {
  if (period === '上午') return hour === 12 ? 0 : hour
  if (period === '下午') return hour === 12 ? 12 : hour + 12
  if (period === '晚上') return hour < 6 ? hour + 12 : (hour === 12 ? 12 : hour + 12)
  return hour
}

/**
 * 把"今天 h:m"转 timestamp；若已 ≤ now，则顺延到明天。
 *
 * @param {number} now
 * @param {number} h
 * @param {number} m
 * @returns {number}
 */
function todayOrTomorrowAt(now, h, m) {
  const d = new Date(now)
  let t = localTs(d.getFullYear(), d.getMonth() + 1, d.getDate(), h, m)
  if (t <= now) t += 24 * 60 * 60 * 1000
  return t
}

/**
 * 解析时间子串 → { firstAt, matchLength } 或 null。
 * sub 是从 '@' 之后开始的字符串。
 *
 * 注意：这个解析器是一个有序匹配链。第一个匹配成功的就 return。
 *
 * @param {string} sub
 * @param {number} now
 * @returns {{ firstAt: number, matchLength: number } | null}
 */
function tryParseTimeSub(sub, now) {
  // 1. @YYYY-MM-DD HH:MM
  let m = sub.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})\b/)
  if (m) {
    return { firstAt: localTs(+m[1], +m[2], +m[3], +m[4], +m[5]), matchLength: m[0].length }
  }
  // 2. @YYYY-MM-DD
  m = sub.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\b/)
  if (m) return { firstAt: localTs(+m[1], +m[2], +m[3], 9, 0), matchLength: m[0].length }

  // 3. @M/D HH:MM / @M/D
  m = sub.match(/^(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?\b/)
  if (m) {
    const d = new Date(now)
    let yr = d.getFullYear()
    let ts = localTs(yr, +m[1], +m[2], m[3] ? +m[3] : 9, m[4] ? +m[4] : 0)
    if (ts <= now) ts = localTs(yr + 1, +m[1], +m[2], m[3] ? +m[3] : 9, m[4] ? +m[4] : 0)
    return { firstAt: ts, matchLength: m[0].length }
  }

  // 4. @M月D日 HH:MM?
  m = sub.match(/^(\d{1,2})月(\d{1,2})日(?:\s+(\d{1,2}):(\d{2}))?/)
  if (m) {
    const d = new Date(now)
    let yr = d.getFullYear()
    let ts = localTs(yr, +m[1], +m[2], m[3] ? +m[3] : 9, m[4] ? +m[4] : 0)
    if (ts <= now) ts = localTs(yr + 1, +m[1], +m[2], m[3] ? +m[3] : 9, m[4] ? +m[4] : 0)
    return { firstAt: ts, matchLength: m[0].length }
  }

  // 5. @(明天|后天|大后天) HH:MM?
  m = sub.match(/^(明天|后天|大后天)(?:\s+(\d{1,2}):(\d{2}))?/)
  if (m) {
    const offset = { '明天': 1, '后天': 2, '大后天': 3 }[m[1]]
    const d = new Date(now); d.setDate(d.getDate() + offset)
    return {
      firstAt: localTs(d.getFullYear(), d.getMonth() + 1, d.getDate(), m[2] ? +m[2] : 9, m[3] ? +m[3] : 0),
      matchLength: m[0].length,
    }
  }

  // 6. @(今天|今晚) HH:MM?
  m = sub.match(/^(今天|今晚)(?:\s+(\d{1,2}):(\d{2}))?/)
  if (m) {
    const defaultHour = m[1] === '今晚' ? 20 : 9
    const h = m[2] ? +m[2] : defaultHour
    const min = m[3] ? +m[3] : 0
    return { firstAt: todayOrTomorrowAt(now, h, min), matchLength: m[0].length }
  }

  // 7. @(下|下下)?(周|星期)X HH:MM?
  m = sub.match(/^(下下|下)?(周|星期)([一二三四五六日天])(?:\s+(\d{1,2}):(\d{2}))?/)
  if (m) {
    const targetDow = WEEKDAY_MAP[m[3]]
    const d = new Date(now)
    const today = d.getDay()
    let daysAhead
    if (m[1] === '下' || m[1] === '下下') {
      // 下/下下 → 锚定到下/下下周（ISO 周一开始）的目标星期
      // 本周一相对今天的偏移：周日(0)按 -6，否则 1-today
      const daysToThisMonday = today === 0 ? -6 : 1 - today
      const weekOffset = m[1] === '下下' ? 14 : 7
      // 目标 dow 在 Mon-Sun 排序中的位置（Mon=0 ... Sun=6）
      const offsetInWeek = targetDow === 0 ? 6 : targetDow - 1
      daysAhead = daysToThisMonday + weekOffset + offsetInWeek
    } else {
      // 裸 @周X：严格未来，最近的下一次
      daysAhead = (targetDow - today + 7) % 7
      if (daysAhead === 0) daysAhead = 7
    }
    d.setDate(d.getDate() + daysAhead)
    return {
      firstAt: localTs(d.getFullYear(), d.getMonth() + 1, d.getDate(), m[4] ? +m[4] : 9, m[5] ? +m[5] : 0),
      matchLength: m[0].length,
    }
  }

  // 8. @(上午|下午|晚上)N 点 M?
  m = sub.match(/^(上午|下午|晚上)\s*(\d{1,2})\s*点\s*(\d{1,2})?/)
  if (m) {
    const h = to24h(m[1], +m[2])
    const min = m[3] ? +m[3] : 0
    return { firstAt: todayOrTomorrowAt(now, h, min), matchLength: m[0].length }
  }

  // 9. @N(小时|分钟|天)后 HH:MM?
  m = sub.match(/^(\d+)\s*(小时|分钟|天)后(?:\s+(\d{1,2}):(\d{2}))?/)
  if (m) {
    const n = +m[1]
    const unit = m[2]
    if (unit === '天') {
      const d = new Date(now); d.setDate(d.getDate() + n)
      return {
        firstAt: localTs(d.getFullYear(), d.getMonth() + 1, d.getDate(), m[3] ? +m[3] : 9, m[4] ? +m[4] : 0),
        matchLength: m[0].length,
      }
    }
    const ms = unit === '小时' ? n * 3600_000 : n * 60_000
    return { firstAt: now + ms, matchLength: m[0].length }
  }

  // 10. @HH:MM
  m = sub.match(/^(\d{1,2}):(\d{2})\b/)
  if (m) return { firstAt: todayOrTomorrowAt(now, +m[1], +m[2]), matchLength: m[0].length }

  // 11. @N 点 M?
  m = sub.match(/^(\d{1,2})\s*点\s*(\d{1,2})?/)
  if (m) return { firstAt: todayOrTomorrowAt(now, +m[1], m[2] ? +m[2] : 0), matchLength: m[0].length }

  return null
}

/**
 * 解析输入文本，提取所有 @时间 子串。
 *
 * @param {string} text
 * @param {number} [now=Date.now()]
 * @returns {{ cleanText: string, reminders: Array<{firstAt: number, rule: string}> }}
 */
export function parseReminderInline(text, now = Date.now()) {
  const reminders = []
  let cursor = 0
  let out = ''
  while (cursor < text.length) {
    const atIdx = text.indexOf('@', cursor)
    if (atIdx === -1) {
      out += text.slice(cursor)
      break
    }
    out += text.slice(cursor, atIdx)
    const sub = text.slice(atIdx + 1)
    const parsed = tryParseTimeSub(sub, now)
    if (parsed) {
      reminders.push({ firstAt: parsed.firstAt, rule: 'once' })
      cursor = atIdx + 1 + parsed.matchLength
    } else {
      out += '@'
      cursor = atIdx + 1
    }
  }
  return { cleanText: out.replace(/\s+/g, ' ').trim(), reminders }
}
