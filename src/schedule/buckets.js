// Group scheduled items into human time buckets for the stream + agenda panel.
// Pure helpers, no UI.

const startOfDay = (d) => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

const dayDiff = (ts, now) =>
  Math.round((startOfDay(ts) - startOfDay(now)) / 86400000)

// Bucket key for an item, given its dueAt (or null) and the current time.
export function bucketOf(dueAt, now = Date.now()) {
  if (!dueAt) return 'someday'
  const diff = dayDiff(dueAt, now)
  if (diff < 0) return 'overdue'
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff <= 7) return 'week'
  return 'later'
}

export const BUCKET_ORDER = ['overdue', 'today', 'tomorrow', 'week', 'later', 'someday']

export const BUCKET_LABEL = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  week: 'This week',
  later: 'Later',
  someday: 'No date',
}

/**
 * Split a list of items into ordered buckets.
 * @param {Array} items
 * @param {object} [opts]
 * @param {boolean} [opts.scheduledOnly] drop items with no dueAt
 * @param {number} [opts.now]
 * @returns {Array<{key:string,label:string,items:Array}>}
 */
export function groupByBucket(items, { scheduledOnly = false, now = Date.now() } = {}) {
  const map = {}
  for (const it of items) {
    if (scheduledOnly && !it.dueAt) continue
    const key = bucketOf(it.dueAt, now)
    ;(map[key] ||= []).push(it)
  }
  // Within a bucket: scheduled items by time, then unscheduled by recency.
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => {
      if (a.dueAt && b.dueAt) return a.dueAt - b.dueAt
      if (a.dueAt) return -1
      if (b.dueAt) return 1
      return (b.createdAt || 0) - (a.createdAt || 0)
    })
  }
  return BUCKET_ORDER.filter((k) => map[k] && map[k].length).map((k) => ({
    key: k,
    label: BUCKET_LABEL[k],
    items: map[k],
  }))
}

// Advance a recurring due date to its next occurrence (used when a recurring
// task is ticked off — it re-opens at the next slot instead of disappearing).
export function nextOccurrence(dueAt, recurrence) {
  if (!dueAt || !recurrence) return null
  const d = new Date(dueAt)
  if (recurrence === 'weekly') {
    d.setDate(d.getDate() + 7)
  } else if (recurrence === 'weekdays') {
    do {
      d.setDate(d.getDate() + 1)
    } while (d.getDay() === 0 || d.getDay() === 6)
  } else {
    // daily
    d.setDate(d.getDate() + 1)
  }
  return d.getTime()
}
