/**
 * Team chat @-mention parsing.
 *
 * Handles look like `@claude` (any agent) or `@claude-jake` (one specific
 * agent). Parsed once at write time and stored on the message so the
 * scheduled agent can tell "someone asked me something" from "someone said
 * the word claude" without re-parsing every message body on every wake-up.
 *
 * Kept as pure functions in their own module because both sides need them:
 * the composer parses before writing, the renderer splits for highlighting,
 * and the agent script (which runs outside React entirely) matches its own
 * handle against the stored array.
 */

// Trailing punctuation must not get swallowed into the handle — "@claude,"
// and "@claude?" both mention `claude`. The optional -suffix allows
// per-person agents (@claude-jake) without a hardcoded roster.
const MENTION_RE = /@(claude(?:-[a-z0-9_]+)?)\b/gi

/** Every distinct agent handle mentioned in `text`, lowercased. */
export function parseMentions(text) {
  const found = new Set()
  for (const match of String(text || '').matchAll(MENTION_RE)) {
    found.add(match[1].toLowerCase())
  }
  return [...found]
}

/**
 * Does `mentions` address the agent identified by `handle`?
 * A bare `@claude` addresses every agent; `@claude-jake` only that one.
 */
export function mentionsAgent(mentions, handle) {
  if (!Array.isArray(mentions) || mentions.length === 0) return false
  const me = String(handle || '').toLowerCase()
  return mentions.includes('claude') || mentions.includes(me)
}

/**
 * Split `text` into ordered segments for rendering, so mentions can be
 * styled without dangerously setting innerHTML.
 * Returns [{ type: 'text' | 'mention', value }].
 */
export function splitOnMentions(text) {
  const str = String(text || '')
  const segments = []
  let cursor = 0

  for (const match of str.matchAll(MENTION_RE)) {
    if (match.index > cursor) {
      segments.push({ type: 'text', value: str.slice(cursor, match.index) })
    }
    segments.push({ type: 'mention', value: match[0] })
    cursor = match.index + match[0].length
  }
  if (cursor < str.length) segments.push({ type: 'text', value: str.slice(cursor) })
  return segments
}
