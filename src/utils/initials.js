// Avatar initials for a full name — "Jake Deakins" -> "JD", a single name
// -> its first letter, nothing -> "?". Shared so every avatar circle in the
// app (admin roster, athlete lists, chat, account page) reads the same way.
export function initials(name) {
  const trimmed = String(name || '').trim()
  if (!trimmed) return '?'
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}
