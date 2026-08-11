/**
 * Firebase Realtime Database — chat messages
 *
 * Path: chats/{conversationId}/messages/{pushId}
 * conversationId = athleteUid (one thread per athlete with admin)
 */
import {
  ref, push, onValue, off, serverTimestamp, query,
  orderByChild, limitToLast, set,
} from 'firebase/database'
import { rtdb } from './config'

export const sendMessage = (athleteUid, message) =>
  push(ref(rtdb, `chats/${athleteUid}/messages`), {
    ...message,
    timestamp: serverTimestamp(),
  })

export const subscribeChat = (athleteUid, callback, limit = 100) => {
  const q = query(
    ref(rtdb, `chats/${athleteUid}/messages`),
    orderByChild('timestamp'),
    limitToLast(limit),
  )
  onValue(q, (snap) => {
    const msgs = []
    snap.forEach((child) => msgs.push({ id: child.key, ...child.val() }))
    callback(msgs)
  })
  return () => off(q)
}

export const markChatRead = (athleteUid, uid) =>
  set(ref(rtdb, `chats/${athleteUid}/readBy/${uid}`), Date.now())
