/**
 * What the unattended team-chat agent is allowed to read out of production.
 *
 * fs-read.mjs authenticates with a project-owner token, so Firestore's own
 * security rules do not apply to it — the rules protect athletes from each
 * other, not from this script. That makes "don't dump personal details" in the
 * agent prompt the only thing standing between an athlete's injury history and
 * an AI session transcript, a laptop log file, and a staff-room message that
 * the rules make permanently undeletable. A sentence in a prompt is not a
 * control; this file is.
 *
 * The rule of thumb: the agent exists to answer questions about how the app
 * and the business are doing. That needs counts, names, program structure and
 * schedules. It does not need a 15-year-old's screening notes or their private
 * conversation with their coach, so it cannot have them at all.
 *
 * Anything refused here is refused with a message telling the agent to ask a
 * human, which is the correct outcome: a person with the same access can look
 * it up deliberately.
 */

/**
 * Collections the agent may never read, at any depth.
 *
 * `assessments` holds injuryHistory, elbowPainType, posture screening and free
 * text about a minor's body. `chats` is the athlete's private thread with their
 * coach. `teamChat` is excluded because team-chat.mjs is the way into the room
 * — reaching it through the owner-token path would sidestep that script's own
 * shape and hand the agent every staff conversation at once.
 */
export const BLOCKED_COLLECTIONS = new Set(['assessments', 'chats', 'teamChat', 'teamChatReads', 'chatReads'])

/**
 * Fields stripped from whatever does come back, per collection.
 *
 * `'*'` applies everywhere. These are the fields that carry contact details or
 * free text someone wrote about a person, as opposed to the structural data
 * the agent actually reasons about.
 */
export const REDACTED_FIELDS = {
  '*': ['email', 'photoURL'],
  // A data log's `notes` is the athlete typing about how their arm felt.
  dataLogs: ['notes'],
  // Exercise `notes` inside a program are coaching cues, not personal — so
  // programs are deliberately not listed here.
}

export const REDACTED = '[redacted by data policy]'

/** The collection id a path refers to, ignoring document ids between them. */
export function collectionSegments(path) {
  const parts = String(path || '').split('/').map(s => s.trim()).filter(Boolean)
  return parts.filter((_, i) => i % 2 === 0)
}

/**
 * Throws if this path touches a blocked collection at any level, so
 * `dataLogs/{uid}/entries` is fine while `chats/{uid}/messages` is not.
 */
export function assertReadable(path) {
  const blocked = collectionSegments(path).find(seg => BLOCKED_COLLECTIONS.has(seg))
  if (blocked) {
    throw new Error(
      `Reading "${blocked}" is not available to this tool: it holds athletes' personal ` +
      `health and private messages, and this script runs unattended with owner-level ` +
      `access. Ask a human to look it up if the question genuinely needs it.`
    )
  }
}

/** Field names to strip for a given path. */
export function redactedFieldsFor(path) {
  const segs = collectionSegments(path)
  const perCollection = segs.flatMap(seg => REDACTED_FIELDS[seg] || [])
  return new Set([...REDACTED_FIELDS['*'], ...perCollection])
}

/**
 * Replaces redacted values rather than dropping the keys, so the agent can
 * see that something exists and was withheld instead of concluding an athlete
 * has no email on file and reporting that as a data problem.
 */
export function redactDoc(path, obj) {
  const fields = redactedFieldsFor(path)
  if (!obj || typeof obj !== 'object') return obj
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, fields.has(k) ? REDACTED : v])
  )
}
