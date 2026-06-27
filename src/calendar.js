// ============================================================================
// GOOGLE CALENDAR SYNC  —  optional, browser-only, free.
// ----------------------------------------------------------------------------
// Two-way bridge between the app's Agenda and the user's real Google Calendar:
//   • push: scheduled tasks become Calendar events (create/update/delete)
//   • pull: upcoming Calendar events show up in the Agenda panel
//
// Uses Google Identity Services (GIS) for OAuth straight from the browser and
// calls the Calendar REST API directly — NO backend, NO Cloud Functions, so it
// stays on Firebase's free Spark plan.
//
// GATED: everything here is dormant until VITE_GOOGLE_CLIENT_ID is set. With no
// client id, isCalendarConfigured is false and the UI simply hides the feature
// (the in-app Agenda keeps working). This mirrors the app's local/cloud gating.
//
// Setup (one-time, needs the owner's Google login) is documented in README.md.
// ============================================================================

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const SCOPE = 'https://www.googleapis.com/auth/calendar.events'
const GIS_SRC = 'https://accounts.google.com/gsi/client'
const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
const STORE_KEY = 'sb-gcal-token'

export const isCalendarConfigured = Boolean(CLIENT_ID)

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

let tokenClient = null
let token = null // { access_token, expiry }
const listeners = new Set()

// --- token persistence (access tokens are short-lived; we cache to avoid a
//     popup on every reload while the grant is still valid) -------------------
function loadToken() {
  if (token) return token
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) {
      const t = JSON.parse(raw)
      if (t && t.expiry > Date.now() + 30_000) token = t
    }
  } catch {
    /* ignore */
  }
  return token
}

function saveToken(t) {
  token = t
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(t))
  } catch {
    /* ignore */
  }
  emit()
}

function clearToken() {
  token = null
  try {
    localStorage.removeItem(STORE_KEY)
  } catch {
    /* ignore */
  }
  emit()
}

export function isConnected() {
  return Boolean(loadToken())
}

export function onCalendarState(cb) {
  listeners.add(cb)
  cb(isConnected())
  return () => listeners.delete(cb)
}
function emit() {
  const c = isConnected()
  listeners.forEach((fn) => fn(c))
}

// --- GIS bootstrap ----------------------------------------------------------
let gisPromise = null
function loadGis() {
  if (!isCalendarConfigured) return Promise.reject(new Error('Calendar not configured'))
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (gisPromise) return gisPromise
  gisPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = GIS_SRC
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Could not load Google sign-in.'))
    document.head.appendChild(s)
  })
  return gisPromise
}

async function getTokenClient() {
  await loadGis()
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: () => {}, // set per-request below
    })
  }
  return tokenClient
}

// Request an access token. interactive=true shows the consent/picker popup;
// interactive=false tries to refresh silently using the existing grant.
function requestToken(interactive) {
  return new Promise((resolve, reject) => {
    getTokenClient()
      .then((client) => {
        client.callback = (resp) => {
          if (resp.error) {
            reject(new Error(resp.error))
            return
          }
          saveToken({
            access_token: resp.access_token,
            expiry: Date.now() + (resp.expires_in ? resp.expires_in * 1000 : 3000_000),
          })
          resolve(token.access_token)
        }
        client.requestAccessToken({ prompt: interactive ? 'consent' : '' })
      })
      .catch(reject)
  })
}

/** Interactive connect (call from a button click). */
export async function connectCalendar() {
  return requestToken(true)
}

/** Sign out of calendar sync locally (revokes the cached token). */
export function disconnectCalendar() {
  const t = loadToken()
  if (t && window.google?.accounts?.oauth2) {
    try {
      window.google.accounts.oauth2.revoke(t.access_token, () => {})
    } catch {
      /* ignore */
    }
  }
  clearToken()
}

// Return a valid token, refreshing silently if needed. Throws if not connected.
async function ensureToken() {
  const t = loadToken()
  if (t && t.expiry > Date.now() + 30_000) return t.access_token
  // Try a silent refresh; if it fails, the caller surfaces a reconnect prompt.
  return requestToken(false)
}

async function call(method, url, body) {
  const access = await ensureToken()
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${access}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) {
    clearToken()
    throw new Error('Calendar session expired — reconnect.')
  }
  if (!res.ok && method !== 'DELETE') {
    throw new Error(`Calendar request failed (${res.status})`)
  }
  return method === 'DELETE' ? null : res.json()
}

// --- event mapping ----------------------------------------------------------
function eventBody(item) {
  const summary = item.text || 'Note'
  const start = new Date(item.dueAt)
  const body = { summary, source: { title: 'Second Brain' } }

  if (item.hasTime) {
    const end = new Date(start.getTime() + 30 * 60000)
    body.start = { dateTime: start.toISOString(), timeZone: tz }
    body.end = { dateTime: end.toISOString(), timeZone: tz }
  } else {
    const d = new Date(start)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const date = `${yyyy}-${mm}-${dd}`
    const next = new Date(d)
    next.setDate(next.getDate() + 1)
    const ndate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
    body.start = { date }
    body.end = { date: ndate }
  }

  if (item.recurrence) {
    const rule =
      item.recurrence === 'daily' ? 'RRULE:FREQ=DAILY' :
      item.recurrence === 'weekdays' ? 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' :
      'RRULE:FREQ=WEEKLY'
    body.recurrence = [rule]
  }
  return body
}

/**
 * Create or update the Calendar event for a scheduled item.
 * @returns {Promise<string|null>} the event id (store it back on the item).
 */
export async function pushEvent(item) {
  if (!isCalendarConfigured || !isConnected() || !item.dueAt) return null
  const body = eventBody(item)
  if (item.gcalEventId) {
    const r = await call('PUT', `${API}/${encodeURIComponent(item.gcalEventId)}`, body)
    return r?.id || item.gcalEventId
  }
  const r = await call('POST', API, body)
  return r?.id || null
}

/** Delete the Calendar event for an item (best-effort). */
export async function deleteEvent(eventId) {
  if (!isCalendarConfigured || !isConnected() || !eventId) return
  try {
    await call('DELETE', `${API}/${encodeURIComponent(eventId)}`)
  } catch {
    /* best effort */
  }
}

/**
 * Pull upcoming events from the primary calendar (for the Agenda panel).
 * @returns {Promise<Array<{id,title,start,hasTime,allDay}>>}
 */
export async function listUpcoming(days = 7) {
  if (!isCalendarConfigured || !isConnected()) return []
  const now = new Date()
  const max = new Date(now.getTime() + days * 86400000)
  const url =
    `${API}?singleEvents=true&orderBy=startTime` +
    `&timeMin=${encodeURIComponent(now.toISOString())}` +
    `&timeMax=${encodeURIComponent(max.toISOString())}&maxResults=50`
  try {
    const data = await call('GET', url)
    return (data.items || []).map((e) => {
      const hasTime = Boolean(e.start?.dateTime)
      const start = new Date(e.start?.dateTime || e.start?.date)
      return {
        id: e.id,
        title: e.summary || '(no title)',
        start: start.getTime(),
        hasTime,
        allDay: !hasTime,
        external: true,
      }
    })
  } catch {
    return []
  }
}
