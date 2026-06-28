// ============================================================================
// REMINDER SENDER  —  runs on a schedule via GitHub Actions (free, no Blaze).
// ----------------------------------------------------------------------------
// One-shot script: find open, scheduled items whose lead-time or due-time has
// arrived and send a Web Push to that user's devices. De-duplicated via the
// top-level `reminders` collection so each reminder fires at most once.
//
// Index-free: enumerates users that have a push subscription, then reads each
// user's own items subcollection (auto-indexed) — no manual Firestore indexes.
//
// Env: FIREBASE_SERVICE_ACCOUNT (JSON), VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
//      VAPID_SUBJECT. Free Web Push (VAPID) — works on installed iOS PWAs.
// ============================================================================
import admin from 'firebase-admin'
import webpush from 'web-push'

// Skip cleanly until setup is complete (so scheduled runs stay green, not red).
if (!process.env.FIREBASE_SERVICE_ACCOUNT || !process.env.VAPID_PRIVATE_KEY) {
  console.log('Reminder secrets not set yet — skipping (setup incomplete).')
  process.exit(0)
}

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:kaustubhdhawale03@gmail.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

const MINUTE = 60 * 1000
const DEFAULT_LEAD_MIN = 15
const LOOKAHEAD = 6 * 60 * MINUTE // pre-reminders up to 6h out
const GRACE = 30 * MINUTE // catch up to 30 min late, then give up

const markerId = (uid, itemId, kind, dueAt) => `${uid}__${itemId}__${kind}__${dueAt}`

function relTime(ms) {
  if (ms <= MINUTE) return 'now'
  const m = Math.round(ms / MINUTE)
  if (m < 60) return `in ${m} min`
  const h = Math.round(m / 60)
  return `in ${h} hr${h > 1 ? 's' : ''}`
}

async function main() {
  const now = Date.now()
  const lo = now - GRACE
  const hi = now + LOOKAHEAD

  // Users that have at least one push subscription.
  const subsSnap = await db.collectionGroup('pushSubs').get()
  const uids = [...new Set(subsSnap.docs.map((d) => d.ref.parent.parent.id))]
  if (!uids.length) {
    console.log('No push subscriptions — nothing to do.')
    return
  }

  let sent = 0

  for (const uid of uids) {
    let lead = DEFAULT_LEAD_MIN
    try {
      const u = await db.doc(`users/${uid}`).get()
      const v = u.exists ? u.data().remindLeadMin : null
      if (typeof v === 'number' && v >= 0) lead = v
    } catch (e) {
      /* default */
    }

    const subs = subsSnap.docs
      .filter((d) => d.ref.parent.parent.id === uid)
      .map((d) => ({ id: d.id, ...d.data() }))

    const itemsSnap = await db
      .collection(`users/${uid}/items`)
      .where('dueAt', '>=', lo)
      .where('dueAt', '<=', hi)
      .get()

    for (const doc of itemsSnap.docs) {
      const item = doc.data()
      if (item.done || !item.dueAt) continue
      const dueAt = item.dueAt
      const preAt = dueAt - lead * MINUTE

      const fires = []
      if (lead > 0 && now >= preAt && now <= preAt + GRACE && now < dueAt - MINUTE) fires.push('pre')
      if (now >= dueAt && now <= dueAt + GRACE) fires.push('due')

      for (const kind of fires) {
        const ref = db.collection('reminders').doc(markerId(uid, doc.id, kind, dueAt))
        try {
          await ref.create({ uid, itemId: doc.id, kind, dueAt, sentAt: now })
        } catch (e) {
          continue // already sent
        }

        const body = kind === 'due' ? 'Due now' : `Due ${relTime(dueAt - now)}`
        const payload = JSON.stringify({
          title: (item.text || 'Reminder').slice(0, 80),
          body,
          tag: `${doc.id}-${kind}`,
          url: '/?view=today',
        })

        await Promise.all(
          subs.map(async (s) => {
            try {
              await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload)
              sent++
            } catch (err) {
              const code = err && err.statusCode
              if (code === 404 || code === 410) {
                await db.doc(`users/${uid}/pushSubs/${s.id}`).delete().catch(() => {})
              } else {
                console.warn('push failed', code, err && err.message)
              }
            }
          })
        )
      }
    }
  }

  console.log(`Done — sent ${sent} reminder push(es).`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
