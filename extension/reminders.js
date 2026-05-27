// extension/reminders.js
// 纯函数。不依赖 chrome / DOM / storage。

const WEEKDAY_MAP = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 }
const WEEKDAY_ENGLISH = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAY_CHAR_TO_NUM = WEEKDAY_MAP  // alias for clarity

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

// 中文数字字典（含变体）
const CN_DIGIT = {
  '零': 0, '一': 1, '二': 2, '三': 3, '四': 4,
  '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
  '十': 10, '两': 2,
}

/**
 * 把中文 / 阿拉伯数字字符串（0-99）解析为 number，失败返回 null。
 * 支持：'3' '三' '10' '十' '十一' '二十' '二十三' '30' '四十五' '两'。
 *
 * @param {string} str
 * @returns {number | null}
 */
function parseCnNum(str) {
  if (str == null) return null
  if (/^\d+$/.test(str)) return parseInt(str, 10)
  if (str.length === 1) return CN_DIGIT[str] ?? null
  // 十X（10-19）
  if (str[0] === '十') {
    const tail = CN_DIGIT[str[1]]
    return (tail !== undefined && tail < 10) ? 10 + tail : null
  }
  // X十(Y)（20-99）
  const mm = str.match(/^([一二三四五六七八九两])十([一二三四五六七八九])?$/)
  if (mm) {
    const tens = CN_DIGIT[mm[1]] * 10
    const ones = mm[2] ? CN_DIGIT[mm[2]] : 0
    return tens + ones
  }
  return null
}

/**
 * 试匹配"时分"片段：HH:MM 或 (上午|下午|晚上)?N点M?(钟|整)?。
 * 接受中文与阿拉伯数字混合，分钟可用"半" = 30。
 *
 * @param {string} sub
 * @param {'上午'|'下午'|'晚上'|null} [defaultPeriod] 当用户没写上下午时的默认 period
 *   （例：日期前缀是"今晚"时传 '晚上'，让"今晚九点"识别为 21:00 而不是 9:00）
 *   HH:MM 格式是显式的，不受 defaultPeriod 影响。
 * @returns {{ h: number, m: number, matchLength: number } | null}
 */
function tryParseTimeOfDay(sub, defaultPeriod = null) {
  // 1) HH:MM（仅阿拉伯，显式时间不应用 defaultPeriod）
  let m = sub.match(/^(\d{1,2}):(\d{2})\b/)
  if (m) return { h: +m[1], m: +m[2], matchLength: m[0].length }

  // 2) (上午|下午|晚上)? + 数字(中/阿) + 点 + (数字(中/阿)|半)? + (钟|整)?
  m = sub.match(/^(上午|下午|晚上)?\s*(\d{1,2}|[零一二三四五六七八九十两]{1,3})\s*点\s*(\d{1,2}|[零一二三四五六七八九十两]{1,3}|半)?\s*[钟整]?/)
  if (m) {
    const hour = parseCnNum(m[2])
    if (hour === null) return null
    const period = m[1] || defaultPeriod
    const h24 = period ? to24h(period, hour) : hour
    let min = 0
    if (m[3] === '半') min = 30
    else if (m[3] != null) {
      const n = parseCnNum(m[3])
      if (n !== null) min = n
    }
    return { h: h24, m: min, matchLength: m[0].length }
  }
  return null
}

/**
 * 日期模式 match 后，接力消费可选的"空白 + 时分"。
 * 没匹配到时返回默认 {h:9, m:0, matchLength:0}（不吃任何字符）。
 *
 * @param {string} rest 日期 match 之后剩下的字符
 * @returns {{ h: number, m: number, matchLength: number }}
 */
function consumeOptionalTime(rest) {
  const wsMatch = rest.match(/^\s+/)
  const wsLen = wsMatch ? wsMatch[0].length : 0
  const tod = tryParseTimeOfDay(rest.slice(wsLen))
  if (tod) return { h: tod.h, m: tod.m, matchLength: wsLen + tod.matchLength }
  return { h: 9, m: 0, matchLength: 0 }
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
  // 1. @YYYY-MM-DD [time]?
  let m = sub.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) {
    const consumed = m[0].length
    const t = consumeOptionalTime(sub.slice(consumed))
    return {
      firstAt: localTs(+m[1], +m[2], +m[3], t.h, t.m),
      matchLength: consumed + t.matchLength,
    }
  }

  // 2. @M/D [time]?
  m = sub.match(/^(\d{1,2})\/(\d{1,2})/)
  if (m) {
    const consumed = m[0].length
    const t = consumeOptionalTime(sub.slice(consumed))
    const d = new Date(now); const yr = d.getFullYear()
    let ts = localTs(yr, +m[1], +m[2], t.h, t.m)
    if (ts <= now) ts = localTs(yr + 1, +m[1], +m[2], t.h, t.m)
    return { firstAt: ts, matchLength: consumed + t.matchLength }
  }

  // 3. @M月D日 [time]?
  m = sub.match(/^(\d{1,2})月(\d{1,2})日/)
  if (m) {
    const consumed = m[0].length
    const t = consumeOptionalTime(sub.slice(consumed))
    const d = new Date(now); const yr = d.getFullYear()
    let ts = localTs(yr, +m[1], +m[2], t.h, t.m)
    if (ts <= now) ts = localTs(yr + 1, +m[1], +m[2], t.h, t.m)
    return { firstAt: ts, matchLength: consumed + t.matchLength }
  }

  // 4. @(明天|后天|大后天) [time]?
  m = sub.match(/^(明天|后天|大后天)/)
  if (m) {
    const offset = { '明天': 1, '后天': 2, '大后天': 3 }[m[1]]
    const d = new Date(now); d.setDate(d.getDate() + offset)
    const consumed = m[0].length
    const t = consumeOptionalTime(sub.slice(consumed))
    return {
      firstAt: localTs(d.getFullYear(), d.getMonth() + 1, d.getDate(), t.h, t.m),
      matchLength: consumed + t.matchLength,
    }
  }

  // 5. @(今天|今晚) [time]?  —— 今晚默认 20:00 且把 '晚上' 作为后续"X点"的默认 period
  m = sub.match(/^(今天|今晚)/)
  if (m) {
    const isYowan = m[1] === '今晚'
    const consumed = m[0].length
    const wsMatch = sub.slice(consumed).match(/^\s+/)
    const wsLen = wsMatch ? wsMatch[0].length : 0
    const tod = tryParseTimeOfDay(sub.slice(consumed + wsLen), isYowan ? '晚上' : null)
    const h = tod ? tod.h : (isYowan ? 20 : 9)
    const min = tod ? tod.m : 0
    const matchLen = consumed + (tod ? wsLen + tod.matchLength : 0)
    return { firstAt: todayOrTomorrowAt(now, h, min), matchLength: matchLen }
  }

  // 6. @(下下|下)?(周|星期)X [time]?
  m = sub.match(/^(下下|下)?(周|星期)([一二三四五六日天])/)
  if (m) {
    const targetDow = WEEKDAY_MAP[m[3]]
    const d = new Date(now)
    const today = d.getDay()
    let daysAhead
    if (m[1] === '下' || m[1] === '下下') {
      // 下/下下 → 锚定到下/下下周（ISO 周一开始）的目标星期
      const daysToThisMonday = today === 0 ? -6 : 1 - today
      const weekOffset = m[1] === '下下' ? 14 : 7
      const offsetInWeek = targetDow === 0 ? 6 : targetDow - 1
      daysAhead = daysToThisMonday + weekOffset + offsetInWeek
    } else {
      // 裸 @周X：严格未来，最近的下一次
      daysAhead = (targetDow - today + 7) % 7
      if (daysAhead === 0) daysAhead = 7
    }
    d.setDate(d.getDate() + daysAhead)
    const consumed = m[0].length
    const t = consumeOptionalTime(sub.slice(consumed))
    return {
      firstAt: localTs(d.getFullYear(), d.getMonth() + 1, d.getDate(), t.h, t.m),
      matchLength: consumed + t.matchLength,
    }
  }

  // 7. @N(小时|分钟|天)后 [time]?  —— 仅 '天' 接受时间后缀
  m = sub.match(/^(\d+)\s*(小时|分钟|天)后/)
  if (m) {
    const n = +m[1]; const unit = m[2]; const consumed = m[0].length
    if (unit === '天') {
      const d = new Date(now); d.setDate(d.getDate() + n)
      const t = consumeOptionalTime(sub.slice(consumed))
      return {
        firstAt: localTs(d.getFullYear(), d.getMonth() + 1, d.getDate(), t.h, t.m),
        matchLength: consumed + t.matchLength,
      }
    }
    const ms = unit === '小时' ? n * 3600_000 : n * 60_000
    return { firstAt: now + ms, matchLength: consumed }
  }

  // 8. @[standalone time-of-day]  —— HH:MM / N点M / 上午下午晚上+N点M
  const tod = tryParseTimeOfDay(sub)
  if (tod) {
    return { firstAt: todayOrTomorrowAt(now, tod.h, tod.m), matchLength: tod.matchLength }
  }

  return null
}

/**
 * 解析 `~xxx` → { rule, matchLength } 或 null。
 * sub 是从 '~' 之后开始的字符串。
 *
 * @param {string} sub
 * @returns {{ rule: string, matchLength: number } | null}
 */
function tryParseRepeatSub(sub) {
  // ~每天 / ~每日
  let m = sub.match(/^(每天|每日)/)
  if (m) return { rule: 'daily', matchLength: m[0].length }

  // ~工作日 / ~周一到周五
  m = sub.match(/^(工作日|周一到周五)/)
  if (m) return { rule: 'weekdays', matchLength: m[0].length }

  // ~每两周X
  m = sub.match(/^每两周([一二三四五六日天])/)
  if (m) {
    return { rule: `biweekly:${WEEKDAY_ENGLISH[WEEKDAY_CHAR_TO_NUM[m[1]]]}`, matchLength: m[0].length }
  }

  // ~每周XYZ（贪婪匹配连续中文星期数）
  m = sub.match(/^每周([一二三四五六日天]+)/)
  if (m) {
    const days = [...m[1]].map(ch => WEEKDAY_ENGLISH[WEEKDAY_CHAR_TO_NUM[ch]])
    return { rule: `weekly:${days.join(',')}`, matchLength: m[0].length }
  }

  // ~每月最后一天
  m = sub.match(/^每月最后一天/)
  if (m) return { rule: 'monthly:last', matchLength: m[0].length }

  // ~每月N号?
  m = sub.match(/^每月(\d{1,2})号?/)
  if (m) return { rule: `monthly:${+m[1]}`, matchLength: m[0].length }

  // ~每年M月D日?
  m = sub.match(/^每年(\d{1,2})月(\d{1,2})日?/)
  if (m) return { rule: `yearly:${+m[1]}-${+m[2]}`, matchLength: m[0].length }

  return null
}

/**
 * 解析输入文本，提取所有 @时间 子串和 ~重复 后缀。
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
    const ch = text[cursor]
    if (ch === '@') {
      const sub = text.slice(cursor + 1)
      const parsed = tryParseTimeSub(sub, now)
      if (parsed) {
        reminders.push({ firstAt: parsed.firstAt, rule: 'once' })
        cursor = cursor + 1 + parsed.matchLength
        continue
      }
      out += '@'; cursor++; continue
    }
    if (ch === '~') {
      const sub = text.slice(cursor + 1)
      const parsed = tryParseRepeatSub(sub)
      if (parsed && reminders.length > 0) {
        // 应用到最近的 reminder
        reminders[reminders.length - 1].rule = parsed.rule
        cursor = cursor + 1 + parsed.matchLength
        continue
      }
      out += '~'; cursor++; continue
    }
    out += ch; cursor++
  }
  return { cleanText: out.replace(/\s+/g, ' ').trim(), reminders }
}

const WEEKDAY_ENGLISH_TO_NUM = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

function extractHM(ts) {
  const d = new Date(ts)
  return { h: d.getHours(), m: d.getMinutes() }
}

function setHM(ts, h, m) {
  const d = new Date(ts); d.setHours(h, m, 0, 0); return d.getTime()
}

function startOfDay(ts) {
  const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime()
}

function addDays(ts, n) {
  const d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime()
}

/**
 * @param {string} rule
 * @param {number} firstAt
 * @param {number} now
 * @param {number|null} lastFiredAt
 * @returns {number|null}
 */
export function nextOccurrence(rule, firstAt, now, lastFiredAt = null) {
  // firstAt 还在未来 → 永远先用 firstAt
  if (firstAt > now) return firstAt

  if (rule === 'once') return null

  const { h, m } = extractHM(firstAt)

  if (rule === 'daily') {
    let candidate = setHM(now, h, m)
    if (candidate <= now) candidate = addDays(candidate, 1)
    return candidate
  }

  if (rule === 'weekdays') {
    let candidate = setHM(now, h, m)
    if (candidate <= now) candidate = addDays(candidate, 1)
    while (new Date(candidate).getDay() === 0 || new Date(candidate).getDay() === 6) {
      candidate = addDays(candidate, 1)
    }
    return candidate
  }

  if (rule.startsWith('weekly:')) {
    const dows = rule.slice(7).split(',').map(s => WEEKDAY_ENGLISH_TO_NUM[s])
    for (let i = 0; i < 8; i++) {
      const candidate = setHM(addDays(now, i), h, m)
      if (candidate <= now) continue
      if (dows.includes(new Date(candidate).getDay())) return candidate
    }
    return null  // unreachable for valid rule
  }

  if (rule.startsWith('biweekly:')) {
    const targetDow = WEEKDAY_ENGLISH_TO_NUM[rule.slice(9)]
    // 从 firstAt 算起，每 14 天的同一星期
    const firstDayStart = startOfDay(firstAt)
    for (let i = 0; i < 21; i++) {
      const candidate = setHM(addDays(now, i), h, m)
      if (candidate <= now) continue
      if (new Date(candidate).getDay() !== targetDow) continue
      const daysFromFirst = Math.round((startOfDay(candidate) - firstDayStart) / 86400_000)
      if (daysFromFirst % 14 === 0) return candidate
    }
    return null
  }

  if (rule.startsWith('monthly:')) {
    const dayPart = rule.slice(8)   // '15' or 'last'
    let yr = new Date(now).getFullYear()
    let mo = new Date(now).getMonth()  // 0-indexed
    for (let i = 0; i < 13; i++) {
      const targetMonth = (mo + i) % 12
      const targetYear = yr + Math.floor((mo + i) / 12)
      const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0).getDate()
      const dayNum = dayPart === 'last' ? lastDayOfMonth : Math.min(+dayPart, lastDayOfMonth)
      const candidate = localTs(targetYear, targetMonth + 1, dayNum, h, m)
      if (candidate > now) return candidate
    }
    return null
  }

  if (rule.startsWith('yearly:')) {
    const [mStr, dStr] = rule.slice(7).split('-')
    const monthNum = +mStr
    const dayNum = +dStr
    let yr = new Date(now).getFullYear()
    for (let i = 0; i < 4; i++) {
      const lastDayOfMonth = new Date(yr + i, monthNum, 0).getDate()
      const actualDay = Math.min(dayNum, lastDayOfMonth)
      const candidate = localTs(yr + i, monthNum, actualDay, h, m)
      if (candidate > now) return candidate
    }
    return null
  }

  return null
}

/**
 * 镜像 nextOccurrence — 返回 <= now 的最近一次应触发时间，或 null。
 */
export function previousOccurrence(rule, firstAt, now) {
  if (firstAt > now) return null

  if (rule === 'once') return firstAt

  const { h, m } = extractHM(firstAt)

  if (rule === 'daily') {
    let candidate = setHM(now, h, m)
    if (candidate > now) candidate = addDays(candidate, -1)
    return candidate < firstAt ? null : candidate
  }

  if (rule === 'weekdays') {
    let candidate = setHM(now, h, m)
    if (candidate > now) candidate = addDays(candidate, -1)
    while (new Date(candidate).getDay() === 0 || new Date(candidate).getDay() === 6) {
      candidate = addDays(candidate, -1)
    }
    return candidate < firstAt ? null : candidate
  }

  if (rule.startsWith('weekly:')) {
    const dows = rule.slice(7).split(',').map(s => WEEKDAY_ENGLISH_TO_NUM[s])
    for (let i = 0; i < 8; i++) {
      const candidate = setHM(addDays(now, -i), h, m)
      if (candidate > now) continue
      if (dows.includes(new Date(candidate).getDay())) {
        return candidate < firstAt ? null : candidate
      }
    }
    return null
  }

  if (rule.startsWith('biweekly:')) {
    const targetDow = WEEKDAY_ENGLISH_TO_NUM[rule.slice(9)]
    const firstDayStart = startOfDay(firstAt)
    for (let i = 0; i < 21; i++) {
      const candidate = setHM(addDays(now, -i), h, m)
      if (candidate > now) continue
      if (new Date(candidate).getDay() !== targetDow) continue
      const daysFromFirst = Math.round((startOfDay(candidate) - firstDayStart) / 86400_000)
      if (daysFromFirst >= 0 && daysFromFirst % 14 === 0) return candidate
    }
    return null
  }

  if (rule.startsWith('monthly:')) {
    const dayPart = rule.slice(8)
    let yr = new Date(now).getFullYear()
    let mo = new Date(now).getMonth()
    for (let i = 0; i < 13; i++) {
      const targetMonth = (((mo - i) % 12) + 12) % 12
      const targetYear = yr + Math.floor((mo - i) / 12)
      const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0).getDate()
      const dayNum = dayPart === 'last' ? lastDayOfMonth : Math.min(+dayPart, lastDayOfMonth)
      const candidate = localTs(targetYear, targetMonth + 1, dayNum, h, m)
      if (candidate <= now) return candidate < firstAt ? null : candidate
    }
    return null
  }

  if (rule.startsWith('yearly:')) {
    const [mStr, dStr] = rule.slice(7).split('-')
    const monthNum = +mStr
    const dayNum = +dStr
    let yr = new Date(now).getFullYear()
    for (let i = 0; i < 4; i++) {
      const lastDayOfMonth = new Date(yr - i, monthNum, 0).getDate()
      const actualDay = Math.min(dayNum, lastDayOfMonth)
      const candidate = localTs(yr - i, monthNum, actualDay, h, m)
      if (candidate <= now) return candidate < firstAt ? null : candidate
    }
    return null
  }

  return null
}

const ZH_WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']
const ZH_WEEKDAY_FROM_ENG = { Sun: '日', Mon: '一', Tue: '二', Wed: '三', Thu: '四', Fri: '五', Sat: '六' }

function sameYmd(ts1, ts2) {
  const d1 = new Date(ts1), d2 = new Date(ts2)
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate()
}

function formatTime(ts) {
  const d = new Date(ts)
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatDate(ts, now) {
  const d = new Date(ts)
  if (sameYmd(ts, now)) return `今天 ${formatTime(ts)}`
  if (sameYmd(ts, now + 86400_000)) return `明天 ${formatTime(ts)}`
  const daysAhead = Math.round((startOfDay(ts) - startOfDay(now)) / 86400_000)
  if (daysAhead > 0 && daysAhead < 7) {
    return `周${ZH_WEEKDAY[d.getDay()]} ${formatTime(ts)}`
  }
  return `${d.getMonth() + 1}/${d.getDate()} ${formatTime(ts)}`
}

function formatRule(rule) {
  if (rule === 'once') return ''
  if (rule === 'daily') return '每天'
  if (rule === 'weekdays') return '工作日'
  if (rule.startsWith('weekly:')) {
    const days = rule.slice(7).split(',').map(d => ZH_WEEKDAY_FROM_ENG[d]).join('')
    return `每周${days}`
  }
  if (rule.startsWith('biweekly:')) {
    return `每两周${ZH_WEEKDAY_FROM_ENG[rule.slice(9)]}`
  }
  if (rule.startsWith('monthly:')) {
    const part = rule.slice(8)
    return part === 'last' ? '每月最后一天' : `每月 ${part} 号`
  }
  if (rule.startsWith('yearly:')) {
    const [m, d] = rule.slice(7).split('-')
    return `每年 ${m} 月 ${d} 日`
  }
  return ''
}

/**
 * @param {{firstAt: number, rule: string, snoozedUntil?: number|null}} reminder
 * @param {number} [now=Date.now()]
 * @returns {string}
 */
export function formatReminderHuman(reminder, now = Date.now()) {
  let datePart
  if (reminder.snoozedUntil) {
    datePart = `推迟到 ${formatTime(reminder.snoozedUntil)}`
  } else {
    datePart = formatDate(reminder.firstAt, now)
  }
  const rulePart = formatRule(reminder.rule)
  return rulePart ? `${datePart} · ${rulePart}` : datePart
}
