// ============================================================================
// WEB PUSH (client side) — optional, gated, free-tier friendly.
// ----------------------------------------------------------------------------
// Subscribes this device to standard Web Push (VAPID) so the scheduled Cloud
// Function can deliver task reminders even when the app is closed. Works on
// installed iOS PWAs (iOS 16.4+), Android, and desktop.
//
// GATED: dormant until VITE_VAPID_PUBLIC_KEY is set. With no key,
// isPushConfigured is false and the UI hides the feature — mirrors the
// local/cloud and calendar gating elsewhere in the app.
// ============================================================================

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY

export const pushSupported =
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window

export const isPushConfigured = Boolean(VAPID_PUBLIC) && pushSupported

// VAPID public keys are base64url; the PushManager wants a Uint8Array.
function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function notificationPermission() {
  return pushSupported ? Notification.permission : 'unsupported'
}

/**
 * Ask permission and subscribe this device. `saveSub(subJson)` persists it.
 * @returns {Promise<'granted'|'denied'|'unsupported'>}
 */
export async function enablePush(saveSub) {
  if (!isPushConfigured) return 'unsupported'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return perm
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    })
  }
  await saveSub(sub.toJSON())
  return 'granted'
}

/** Whether this device already has an active push subscription. */
export async function currentSubscription() {
  if (!isPushConfigured) return null
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return sub ? sub.toJSON() : null
  } catch {
    return null
  }
}

/** Unsubscribe this device locally. `removeSub(endpoint)` clears it server-side. */
export async function disablePush(removeSub) {
  if (!isPushConfigured) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    const endpoint = sub.endpoint
    await sub.unsubscribe().catch(() => {})
    await removeSub(endpoint)
  }
}
