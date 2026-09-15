/**
 * Team chat @-mention parsing.
 *
 * Each agent in the room has a name rather than a generic one: Atlas answers
 * for Jake, Skip answers for Ian. Naming them matters — with two agents, a
 * single shared handle means either both reply to the same question or neither
 * is sure it owns it.
 *
 * Parsed once at write time and stored on the message so an agent can tell
 * "someone asked me something" from "someone said my name" without re-parsing
 * every message body on every wake-up.
 *
 * Pure functions in their own module because three places need them: the
 * composer parses before writing, the renderer splits for highlighting, and
 * the agent scripts (which run outside React entirely) match their own handle
 * against the stored array.
 */

/**
 * Agents that actually answer in this room.
 *
 * The UI uses this to decide whether an unanswered mention is real queued work
 * — without it, typing a human's name like `@ian` would render "waiting on
 * Atlas" forever, since no agent is ever going to claim it.
 */
export const AGENT_HANDLES = ['atlas', 'skip']

/**
 * The room addressed a single agent as `@claude` before the agents were named.
 * Kept so the habit doesn't silently fail — it resolves to Atlas, which is who
 * `@claude` always meant on Jake's side.
 */
const HANDLE_ALIASES = { claude: 'atlas' }

// Any @handle, not just known agents: storing unknown ones is harmless and
// means adding an agent later doesn't need old messages reparsed. Trailing
// punctuation must not get swallowed — "@atlas," and "@atlas?" both mention
// atlas.
const MENTION_RE = /@([a-z][a-z0-9_-]{0,30})\b/gi

/** Every distinct handle mentioned in `text`, lowercased and alias-resolved. */
export function parseMentions(text) {
  const found = new Set()
  for (const match of String(text || '').matchAll(MENTION_RE)) {
    const handle = match[1].toLowerCase()
    found.add(HANDLE_ALIASES[handle] || handle)
  }
  return [...found]
}

/**
 * The handles a message actually addresses — stored array unioned with a fresh
 * parse of the body.
 *
 * `mentions` is written once by whichever client posted, so a stale deployment
 * bakes its parser's blind spots into the data permanently. That bit: a client
 * built before the agents were named wrote `mentions: []` for "@atlas …", the
 * message never showed up as pending, and it was silently dropped rather than
 * answered late. Re-parsing costs nothing and makes the stored array an
 * optimization instead of a single point of failure.
 */
export function effectiveMentions(message) {
  const stored = Array.isArray(message?.mentions) ? message.mentions : []
  return [...new Set([...stored, ...parseMentions(message?.text)])]
}

/** Just the mentions that name an agent who will actually respond. */
export function agentMentions(mentions) {
  if (!Array.isArray(mentions)) return []
  return mentions.filter(m => AGENT_HANDLES.includes(m))
}

/** Does `mentions` address the agent identified by `handle`? */
export function mentionsAgent(mentions, handle) {
  if (!Array.isArray(mentions) || mentions.length === 0) return false
  return mentions.includes(String(handle || '').toLowerCase())
}

/**
 * Split `text` into ordered segments for rendering, so mentions can be styled
 * without dangerously setting innerHTML. Agent handles are marked separately
 * from ordinary @-text so only real mentions get the accent treatment.
 * Returns [{ type: 'text' | 'mention', value, isAgent }].
 */
export function splitOnMentions(text) {
  const str = String(text || '')
  const segments = []
  let cursor = 0

  for (const match of str.matchAll(MENTION_RE)) {
    if (match.index > cursor) {
      segments.push({ type: 'text', value: str.slice(cursor, match.index) })
    }
    const resolved = HANDLE_ALIASES[match[1].toLowerCase()] || match[1].toLowerCase()
    segments.push({
      type: 'mention',
      value: match[0],
      isAgent: AGENT_HANDLES.includes(resolved),
    })
    cursor = match.index + match[0].length
  }
  if (cursor < str.length) segments.push({ type: 'text', value: str.slice(cursor) })
  return segments
}
