/**
 * Firebase Realtime Database — chat messages
 *
 * Path: chats/{conversationId}/messages/{pushId}
 * conversationId = athleteUid (one thread per athlete with admin)
 */
import { ref, push, onValue, serverTimestamp, set } from 'firebase/database'
import { rtdb } from './config'

export const sendMessage = (athleteUid, message) =>
  push(ref(rtdb, `chats/${athleteUid}/messages`), {
    ...message,
    timestamp: serverTimestamp(),
  })

// Reads the whole thread and sorts/trims on the client rather than asking
// the database to order + limit — a combined orderByChild('timestamp') +
// limitToLast query (the previous approach) can silently drop or delay
// entries whose serverTimestamp placeholder hasn't resolved yet relative to
// the rest of the indexed window. A thread this size (capped at `limit`)
// doesn't need the query to do the work; reading it plainly and sorting
// locally is simpler and isn't going anywhere subtle.
export const subscribeChat = (athleteUid, callback, limit = 100) => {
  const messagesRef = ref(rtdb, `chats/${athleteUid}/messages`)
  return onValue(messagesRef, (snap) => {
    const msgs = []
    snap.forEach((child) => msgs.push({ id: child.key, ...child.val() }))
    msgs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
    callback(msgs.slice(-limit))
  })
}

export const markChatRead = (athleteUid, uid) =>
  set(ref(rtdb, `chats/${athleteUid}/readBy/${uid}`), Date.now())
