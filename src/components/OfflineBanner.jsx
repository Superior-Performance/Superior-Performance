import { useEffect, useState } from 'react'
import { waitForPendingWrites } from 'firebase/firestore'
import { WifiOff, CheckCircle2 } from 'lucide-react'
import { db } from '../firebase/config'

/**
 * A slim strip that says what the phone is doing when signal drops.
 *
 * Check-ins ticked offline are saved on the phone and sent later (see the
 * local cache in firebase/config). Without a visible cue an athlete would
 * assume a tap did not register and tap again, which un-ticks it. When the
 * signal returns it waits for the queued writes to actually reach the server
 * before saying so, rather than claiming "synced" on the network event alone.
 */
export default function OfflineBanner() {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [synced, setSynced] = useState(false)

  useEffect(() => {
    let timer
    const goOffline = () => { setOnline(false); setSynced(false) }
    const goOnline = () => {
      setOnline(true)
      waitForPendingWrites(db)
        .then(() => { setSynced(true); timer = setTimeout(() => setSynced(false), 3000) })
        .catch(() => {})
    }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
      clearTimeout(timer)
    }
  }, [])

  if (online && !synced) return null
  const Icon = online ? CheckCircle2 : WifiOff
  return (
    <div
      role="status"
      className={`flex items-center gap-2 px-4 py-2 text-xs font-medium ${
        online ? 'bg-sp-green-500/15 text-sp-green-500' : 'bg-amber-500/15 text-amber-400'
      }`}
    >
      <Icon size={14} className="flex-shrink-0" />
      {online
        ? 'Back online — everything is synced.'
        : "You're offline. Check-ins save on this phone and sync when you're back."}
    </div>
  )
}
