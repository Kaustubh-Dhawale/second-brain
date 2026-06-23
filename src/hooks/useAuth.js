import { useEffect, useState } from 'react'
import { isFirebaseConfigured } from '../firebase.js'
import { onAuth } from '../auth.js'

// Tracks the current Firebase user. `loading` is true until the first auth
// state resolves, so the app can avoid flashing the sign-in screen.
export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(isFirebaseConfigured)

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false)
      return
    }
    const unsub = onAuth((u) => {
      setUser(u)
      setLoading(false)
    })
    return unsub
  }, [])

  return { user, loading }
}
