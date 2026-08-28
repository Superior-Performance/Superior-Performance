// A single pulsing placeholder block — the building piece for page-level
// loading skeletons. Sized/shaped per use via className (e.g. "h-4 w-32
// rounded-full" for a text line, "h-20 rounded-2xl" for a card). Reserved
// for initial page/section loads where the shape of the coming content is
// known ahead of time — inline action feedback (a button's "Saving…"
// spinner) should stay a spinner, not a skeleton.
export default function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-sp-ink-600/50 rounded-lg ${className}`} />
}
