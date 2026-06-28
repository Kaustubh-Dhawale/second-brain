// ============================================================================
// SCHEDULED REMINDER SENDER  (Firebase Functions v2 + Cloud Scheduler)
// ----------------------------------------------------------------------------
// Runs every minute. Finds open, scheduled items whose lead-time or due-time
// has just arrived and sends a Web Push notification to that user's devices.
//
//   • "Both" reminders: a heads-up at (dueAt - leadMinutes) and one at dueAt.
//   • De-duplicated via the top-level `reminders` collection, so each reminder
//     fires at most once — even if a run is retried or delayed.
//   • Dead/expired subscriptions (HTTP 404/410) are pruned automatically.
//
// Secrets (set once, see README): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.
// Free Web Push (VAPID) — no FCM, works on installed iOS PWAs (16.4+).
// ============================================================================
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { defineSecret } = require('firebase-functions/params')
const { logger } = require('firebase-functions')
const admin = require('firebase-admin')
const webpush = require('web-push')

admin.initializeApp()
const db = admin.firestore()

const VAPID_PUBLIC = defineSecret('VAPID_PUBLIC_KEY')
const VAPID_PRIVATE = defineSecret('VAPID_PRIVATE_KEY')
const CONTACT = 'mailto:kaustubhdhawale03@gmail.com'

const MINUTE = 60 * 1000
const DEFAULT_LEAD_MIN = 15
const LOOKAHEAD = 6 * 60 * MINUTE // pre-reminders up to 6h out
const GRACE = 30 * MINUTE // don't fire a reminder more than 30 min late

// One immutable marker per (item, kind, dueAt) so we never resend.
function markerId(uid, itemId, kind, dueAt) {
  return `${uid}__${itemId}__${kind}__${dueAt}`
}

function relTime(deltaMs) {
  if (deltaMs <= MINUTE) return 'now'
  const mins = Math.round(deltaMs / MINUTE)
  if (mins < 60) return `in ${mins} min`
  const hrs = Math.round(mins / 60)
  return `in ${hrs} hr${hrs > 1 ? 's' : ''}`
}

exports.sendReminders = onSchedule(
  {
    schedule: 'every 1 minutes',
    timeZone: 'Etc/UTC',
    secrets: [VAPID_PUBLIC, VAPID_PRIVATE],
    region: 'us-central1',
    memory: '256MiB',
  },
  async () => {
    webpush.setVapidDetails(CONTACT, VAPID_PUBLIC.value(), VAPID_PRIVATE.value())

    const now = Date.now()
    const lo = now - GRACE
    const hi = now + LOOKAHEAD

    // All open, scheduled items whose due-time sits in the active window.
    const snap = await db
      .collectionGroup('items')
      .where('done', '==', false)
      .where('dueAt', '>=', lo)
      .where('dueAt', '<=', hi)
      .get()

    if (snap.empty) return

    const settingsCache = new Map()
    const subsCache = new Map()

    const getLead = async (uid) => {
      if (settingsCache.has(uid)) return settingsCache.get(uid)
      let lead = DEFAULT_LEAD_MIN
      try {
        const u = await db.doc(`users/${uid}`).get()
        const v = u.exists ? u.data().remindLeadMin : null
        if (typeof v === 'number' && v >= 0) lead = v
      } catch (e) {
        /* default */
      }
      settingsCache.set(uid, lead)
      return lead
    }

    const getSubs = async (uid) => {
      if (subsCache.has(uid)) return subsCache.get(uid)
      const s = await db.collection(`users/${uid}/pushSubs`).get()
      const subs = s.docs.map((d) => ({ id: d.id, ...d.data() }))
      subsCache.set(uid, subs)
      return subs
    }

    let sent = 0

    for (const doc of snap.docs) {
      const item = doc.data()
      const uid = doc.ref.parent.parent && doc.ref.parent.parent.id
      if (!uid || !item.dueAt) continue

      const leadMin = await getLead(uid)
      const dueAt = item.dueAt
      const preAt = dueAt - leadMin * MINUTE

      // Decide which reminder (if any) is due right now.
      const fires = []
      if (leadMin > 0 && now >= preAt && now <= preAt + GRACE && now < dueAt - MINUTE) {
        fires.push({ kind: 'pre', at: preAt })
      }
      if (now >= dueAt && now <= dueAt + GRACE) {
        fires.push({ kind: 'due', at: dueAt })
      }
      if (!fires.length) continue

      const subs = await getSubs(uid)
      if (!subs.length) continue

      for (const fire of fires) {
        const id = markerId(uid, doc.id, fire.kind, dueAt)
        const markerRef = db.collection('reminders').doc(id)

        // Atomically claim this reminder; skip if already sent.
        try {
          await markerRef.create({ uid, itemId: doc.id, kind: fire.kind, dueAt, sentAt: now })
        } catch (e) {
          continue // already exists → already sent
        }

        const when = fire.kind === 'due' ? 'now' : relTime(dueAt - now)
        const payload = JSON.stringify({
          title: item.text ? item.text.slice(0, 80) : 'Reminder',
          body: fire.kind === 'due' ? 'Due now' : `Due ${when}`,
          tag: `${doc.id}-${fire.kind}`,
          url: '/?view=today',
        })

        await Promise.all(
          subs.map(async (sub) => {
            try {
              await webpush.sendNotification(sub, payload)
              sent++
            } catch (err) {
              const code = err && err.statusCode
              if (code === 404 || code === 410) {
                // Subscription is gone — prune it.
                await db.doc(`users/${uid}/pushSubs/${sub.id}`).delete().catch(() => {})
              } else {
                logger.warn('push failed', { uid, code, msg: err && err.message })
              }
            }
          })
        )
      }
    }

    if (sent) logger.info(`Sent ${sent} reminder push(es).`)
  }
)
