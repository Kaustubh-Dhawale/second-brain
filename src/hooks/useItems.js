import { useEffect, useState } from 'react'
import { subscribeItems } from '../data/store.js'

// Live list of the signed-in user's items. `fromCache` lets the UI show an
// "offline" hint when data is being served from the local cache.
export function useItems(uid) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!uid) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    const unsub = subscribeItems(
      uid,
      (next) => {
        setItems(next)
        setLoading(false)
      },
      (err) => {
        setError(err)
        setLoading(false)
      }
    )
    return unsub
  }, [uid])

  return { items, loading, error }
}
