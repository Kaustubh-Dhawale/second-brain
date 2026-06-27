// ============================================================================
// NATURAL-LANGUAGE DATE PARSER  —  the brain behind "type-to-schedule".
// ----------------------------------------------------------------------------
// Pure, dependency-free, offline. Given free text, it finds a date/time phrase
// ("Friday 3pm", "tomorrow", "every weekday 9am", "in 2 days") and returns:
//
//   parseSchedule(text, now?) =>
//     { dueAt, hasTime, recurrence, match:{index,length,text}, label } | null
//
//   dueAt       epoch millis of the (next) occurrence
//   hasTime     true if a specific clock time was given
//   recurrence  'daily' | 'weekdays' | 'weekly' | null
//   match       where the phrase sits in the original text (for highlighting)
//   label       human chip text, e.g. "Fri, Jun 28 · 3:00 PM"
//
// Returns null when no date phrase is present (so the note stays a plain note).
// Kept deliberately small and readable — tune the word lists below.
// ============================================================================

const WEEKDAYS = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const startOfDay = (d) => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

// Build a span object covering [start, end) in the source string.
const span = (text, start, end) => ({
  index: start,
  length: end - start,
  text: text.slice(start, end),
})

// Merge two spans (or pass through when one is null).
function mergeSpan(text, a, b) {
  if (!a) return b
  if (!b) return a
  const start = Math.min(a.index, b.index)
  const end = Math.max(a.index + a.length, b.index + b.length)
  return span(text, start, end)
}

// ---- time parsing ----------------------------------------------------------
// Matches "3pm", "3:30 pm", "at 9am", "15:00", "noon", "midnight".
function findTime(text) {
  // noon / midnight
  const word = /\b(noon|midday|midnight)\b/i.exec(text)
  if (word) {
    const h = /midnight/i.test(word[1]) ? 0 : 12
    return { h, m: 0, span: span(text, word.index, word.index + word[0].length) }
  }
  // 12-hour with am/pm (the most common)
  let re = /\b(?:at\s*|@\s*)?(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?\b/i
  let m = re.exec(text)
  if (m) {
    let h = parseInt(m[1], 10) % 12
    if (/p/i.test(m[3])) h += 12
    const min = m[2] ? parseInt(m[2], 10) : 0
    return { h, m: min, span: span(text, m.index, m.index + m[0].length) }
  }
  // 24-hour "15:00" / "at 9:30"
  re = /\b(?:at\s*|@\s*)(\d{1,2}):(\d{2})\b/
  m = re.exec(text)
  if (m) {
    return { h: parseInt(m[1], 10), m: parseInt(m[2], 10), span: span(text, m.index, m.index + m[0].length) }
  }
  return null
}

// ---- recurrence parsing ----------------------------------------------------
function findRecurrence(text) {
  // every weekday / weekdays
  let m = /\b(every\s+weekday|on\s+weekdays|weekdays)\b/i.exec(text)
  if (m) return { recurrence: 'weekdays', weekday: null, span: span(text, m.index, m.index + m[0].length) }

  // every <weekday>  (e.g. "every monday")
  m = /\bevery\s+(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)\b/i.exec(text)
  if (m) {
    const key = m[1].toLowerCase()
    return { recurrence: 'weekly', weekday: WEEKDAYS[key], span: span(text, m.index, m.index + m[0].length) }
  }

  // every week / weekly
  m = /\b(every\s+week|weekly)\b/i.exec(text)
  if (m) return { recurrence: 'weekly', weekday: null, span: span(text, m.index, m.index + m[0].length) }

  // every day / daily
  m = /\b(every\s*day|everyday|daily)\b/i.exec(text)
  if (m) return { recurrence: 'daily', weekday: null, span: span(text, m.index, m.index + m[0].length) }

  return null
}

// ---- day parsing -----------------------------------------------------------
// Returns { date:Date(startOfDay), span } for the day part, or null.
function findDay(text, now) {
  // today / tonight
  let m = /\b(today|tonight)\b/i.exec(text)
  if (m) return { date: startOfDay(now), span: span(text, m.index, m.index + m[0].length) }

  // tomorrow
  m = /\b(tomorrow|tmrw|tmw|tomo)\b/i.exec(text)
  if (m) {
    const d = startOfDay(now)
    d.setDate(d.getDate() + 1)
    return { date: d, span: span(text, m.index, m.index + m[0].length) }
  }

  // in N day(s)/week(s)
  m = /\bin\s+(\d{1,3})\s+(day|days|week|weeks)\b/i.exec(text)
  if (m) {
    const n = parseInt(m[1], 10)
    const d = startOfDay(now)
    d.setDate(d.getDate() + (/week/i.test(m[2]) ? n * 7 : n))
    return { date: d, span: span(text, m.index, m.index + m[0].length) }
  }

  // next week
  m = /\bnext\s+week\b/i.exec(text)
  if (m) {
    const d = startOfDay(now)
    d.setDate(d.getDate() + 7)
    return { date: d, span: span(text, m.index, m.index + m[0].length) }
  }

  // (next) weekday name → the upcoming occurrence
  m = /\b(next\s+)?(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)\b/i.exec(text)
  if (m) {
    const target = WEEKDAYS[m[2].toLowerCase()]
    const d = startOfDay(now)
    let delta = (target - d.getDay() + 7) % 7
    if (delta === 0) delta = 7 // "monday" on a monday means next monday
    if (m[1]) delta = ((target - d.getDay() + 7) % 7) || 7 // "next monday"
    d.setDate(d.getDate() + delta)
    return { date: d, span: span(text, m.index, m.index + m[0].length) }
  }

  return null
}

// Format the chip label from the resolved date.
function makeLabel({ date, hasTime, h, m, recurrence, weekday }, now) {
  const timePart = hasTime ? formatTime(h, m) : null

  if (recurrence === 'daily') return timePart ? `Every day · ${timePart}` : 'Every day'
  if (recurrence === 'weekdays') return timePart ? `Every weekday · ${timePart}` : 'Every weekday'
  if (recurrence === 'weekly') {
    const name = weekday != null ? `Every ${fullDay(weekday)}` : 'Every week'
    return timePart ? `${name} · ${timePart}` : name
  }

  const today = startOfDay(now)
  const diffDays = Math.round((startOfDay(date) - today) / 86400000)
  let dayPart
  if (diffDays === 0) dayPart = 'Today'
  else if (diffDays === 1) dayPart = 'Tomorrow'
  else if (diffDays > 1 && diffDays < 7) dayPart = DAY_NAMES[date.getDay()]
  else dayPart = `${DAY_NAMES[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`

  return timePart ? `${dayPart} · ${timePart}` : dayPart
}

function formatTime(h, m) {
  const ampm = h < 12 ? 'AM' : 'PM'
  let hr = h % 12
  if (hr === 0) hr = 12
  return m === 0 ? `${hr}:00 ${ampm}` : `${hr}:${String(m).padStart(2, '0')} ${ampm}`
}

const fullDay = (i) => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][i]

/**
 * Parse a natural-language schedule out of free text.
 * @param {string} text
 * @param {number} [now] epoch millis (defaults to Date.now())
 * @returns {null | {dueAt:number, hasTime:boolean, recurrence:string|null, match:{index:number,length:number,text:string}, label:string}}
 */
export function parseSchedule(text, now = Date.now()) {
  if (!text || !text.trim()) return null

  const time = findTime(text)
  const recur = findRecurrence(text)
  const day = recur ? null : findDay(text, now)

  // Nothing date-like at all → plain note.
  if (!time && !recur && !day) return null

  // A lone time with no day/recurrence: treat as today (or tomorrow if past).
  let date
  let weekday = null
  let recurrence = null

  if (recur) {
    recurrence = recur.recurrence
    weekday = recur.weekday
    date = nextRecurrenceDate(recur, time, now)
  } else if (day) {
    date = new Date(day.date)
  } else {
    date = startOfDay(now)
  }

  const hasTime = Boolean(time)
  if (time) {
    date.setHours(time.h, time.m, 0, 0)
  } else {
    date.setHours(9, 0, 0, 0) // sensible default anchor for all-day items
  }

  // A bare time earlier than now today → roll to tomorrow.
  if (time && !recur && !day && date.getTime() < now) {
    date.setDate(date.getDate() + 1)
  }

  // Build the highlight span by merging whichever parts were present.
  let match = null
  if (recur) match = mergeSpan(text, match, recur.span)
  if (day) match = mergeSpan(text, match, day.span)
  if (time) match = mergeSpan(text, match, time.span)
  match = absorbConnectors(text, match)

  const label = makeLabel(
    { date, hasTime, h: time?.h ?? 9, m: time?.m ?? 0, recurrence, weekday },
    now
  )

  return { dueAt: date.getTime(), hasTime, recurrence, match, label }
}

// Compute the first fire date for a recurrence (used for ordering in the agenda).
function nextRecurrenceDate(recur, time, now) {
  const d = startOfDay(now)
  const h = time ? time.h : 9
  const m = time ? time.m : 0
  if (recur.recurrence === 'weekly' && recur.weekday != null) {
    let delta = (recur.weekday - d.getDay() + 7) % 7
    d.setHours(h, m, 0, 0)
    if (delta === 0 && d.getTime() < now) delta = 7
    d.setDate(d.getDate() + delta)
    return d
  }
  if (recur.recurrence === 'weekdays') {
    d.setHours(h, m, 0, 0)
    // advance to today if it's a weekday & time is still ahead, else next weekday
    while (d.getDay() === 0 || d.getDay() === 6 || d.getTime() < now) {
      d.setDate(d.getDate() + 1)
      d.setHours(h, m, 0, 0)
    }
    return d
  }
  // daily / weekly-no-day
  d.setHours(h, m, 0, 0)
  if (d.getTime() < now) d.setDate(d.getDate() + (recur.recurrence === 'weekly' ? 7 : 1))
  return d
}

// Pull a leading connector word ("by", "on", "due", "@") into the match so the
// whole phrase highlights as one ("...deck by Friday 3pm").
function absorbConnectors(text, match) {
  if (!match) return match
  let start = match.index
  // look back over whitespace + a connector word
  const before = text.slice(0, start)
  const m = /\b(by|on|due|at|@)\s*$/i.exec(before)
  if (m) start = m.index
  return span(text, start, match.index + match.length)
}

/**
 * Remove the matched date phrase from text and tidy up, leaving a clean title.
 * "Email Sarah the deck by Friday 3pm" -> "Email Sarah the deck"
 */
export function stripSchedule(text, match) {
  if (!match) return (text || '').trim()
  const before = text.slice(0, match.index)
  const after = text.slice(match.index + match.length)
  return `${before}${after}`
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/[\s,–-]+$/g, '')
    .trim()
}

/** Short tag for a stored schedule (used on rows + agenda). */
export function scheduleTag(dueAt, hasTime, recurrence) {
  if (!dueAt) return ''
  const d = new Date(dueAt)
  const now = new Date()
  if (recurrence) {
    const base =
      recurrence === 'daily' ? 'Daily' :
      recurrence === 'weekdays' ? 'Weekdays' :
      'Weekly'
    return hasTime ? `${base} · ${formatTime(d.getHours(), d.getMinutes())}` : base
  }
  if (hasTime) return formatTime(d.getHours(), d.getMinutes())
  const diff = Math.round((startOfDay(d) - startOfDay(now)) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff > 1 && diff < 7) return DAY_NAMES[d.getDay()]
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

export { formatTime }
