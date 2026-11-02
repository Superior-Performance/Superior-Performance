/**
 * Coach <-> athlete chat.
 *
 * One thread per athlete, shared with their coach — same shape on both
 * sides. Split out of firestore.js so the message window and the unread
 * bookkeeping sit together; nothing else in the data layer reads either.
 */
import {
  collection, doc, getDocs, setDoc, addDoc, query, orderBy, limit, onSnapshot,
  serverTimestamp, Timestamp,
} from 'firebase/firestore'
import { db } from './config'

// ── Chat ─────────────────────────────────────────────────────────────────────
// chats/{athleteUid}/messages/{messageId} — { text, senderUid, senderName,
// role: 'admin'|'athlete', createdAt }. One thread per athlete, shared with
// their coach — same shape on both sides. Previously lived in the Realtime
// Database; moved here so chat uses the same datastore, rules pattern, and
// ordering guarantees as everything else in the app instead of a second,
// separately-configured service.
export const sendChatMessage = (athleteUid, message) =>
  addDoc(collection(db, 'chats', athleteUid, 'messages'), {
    ...message,
    createdAt: serverTimestamp(),
  })

// A coach<->athlete thread runs for as long as the athlete trains here and is
// never trimmed, and an onSnapshot with no limit re-delivers the whole thing
// on every open AND on every reconnect — a laptop waking from sleep re-reads
// a year of messages. (The team chat room, since removed, capped itself the
// same way for the same reason.) Neither chat view paginates, so nothing
// below the newest screenful is ever looked at.
const CHAT_WINDOW = 200

// Newest-first from Firestore so the limit keeps the RECENT window rather
// than the oldest 200, reversed before handing back so callers still render
// oldest-to-newest the way a conversation reads.
export const subscribeChatMessages = (athleteUid, callback) =>
  onSnapshot(
    query(collection(db, 'chats', athleteUid, 'messages'), orderBy('createdAt', 'desc'), limit(CHAT_WINDOW)),
    (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse()),
  )

// One-time (non-subscribing) read of a thread — for the dashboard's roster
// scan, where dozens of live onSnapshot listeners would be wasteful. Real-time
// chat views should still use subscribeChatMessages above.
//
// `sinceMs`, when given, narrows to messages created after that time — the
// dashboard passes each athlete's chatReads.lastReadAt so an established
// thread with months of history only ever pulls back the handful of
// messages that might actually be unread, not the whole conversation. Safe
// to filter and order by the same field (createdAt) without a composite
// index.
export const getChatMessages = (athleteUid, sinceMs) =>
  getDocs(query(
    collection(db, 'chats', athleteUid, 'messages'),
    ...(sinceMs ? [where('createdAt', '>', Timestamp.fromMillis(sinceMs))] : []),
    orderBy('createdAt', 'desc'),
  ))

// chatReads/{athleteUid} — { lastReadAt } — when the coach last opened this
// athlete's conversation. Athlete-authored messages newer than this count as
// unread on the admin dashboard and Messages nav. Admin-only bookkeeping —
// the athlete side has no equivalent, their chat just shows full history.
export const getAllChatReads = () =>
  getDocs(collection(db, 'chatReads'))

export const markChatRead = (athleteUid) =>
  setDoc(doc(db, 'chatReads', athleteUid), { lastReadAt: serverTimestamp() }, { merge: true })
