import { useEffect, useState } from 'react'

// Shows online/offline. When offline, captures still work (local cache) and
// sync when the connection returns.
export default function SyncStatus() {
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  return (
    <span className={`sync ${online ? 'online' : 'offline'}`} title={
      online ? 'Online — syncing' : 'Offline — saved locally, will sync later'
    }>
      <span className="dot" />
      {online ? 'Synced' : 'Offline'}
    </span>
  )
}
