import { useState, useEffect } from 'react'
import { X, PlayCircle } from 'lucide-react'

/**
 * The exercise detail sheet — full notes, and the drill's video if it has
 * one, played in-app rather than bouncing the athlete out to YouTube.
 *
 * The URL normalising lives here with its only caller: which hosts need a
 * special embed shape is a property of this modal, not of the schedule.
 */
// A handful of common video hosts need a specific embeddable URL shape —
// everything else (direct file links, Google Drive preview links a coach
// already copied correctly) is passed through as-is.
function toEmbedUrl(url) {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    // youtube-nocookie.com is YouTube's privacy-enhanced embed domain — it
    // skips setting tracking cookies until the athlete actually presses play.
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      let id = u.searchParams.get('v')
      if (!id && u.pathname.startsWith('/shorts/')) id = u.pathname.split('/')[2]
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : url
    }
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1)
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : url
    }
    if (host === 'vimeo.com') {
      const id = u.pathname.split('/').filter(Boolean).pop()
      return id ? `https://player.vimeo.com/video/${id}` : url
    }
    if (host === 'drive.google.com' && url.includes('/view')) {
      return url.replace('/view', '/preview')
    }
    return url
  } catch {
    return url
  }
}
// Tapping an exercise's name (not its checkbox) opens this — full notes and,
// if the drill has one, a video that plays inside the app instead of
// bouncing the athlete out to YouTube or wherever it's hosted.
function ExerciseDetailModal({ detail, onClose }) {
  const [showVideo, setShowVideo] = useState(false)
  useEffect(() => { setShowVideo(false) }, [detail?.ex?.id])
  if (!detail) return null
  const { ex } = detail

  return (
    <div className="animate-modal-backdrop fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="animate-modal-panel bg-sp-ink-800 rounded-2xl w-full max-w-sm max-h-[85vh] overflow-y-auto border border-sp-ink-600" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-4 border-b border-sp-ink-600">
          <div className="min-w-0">
            <p className="font-bold text-sp-ink-50">{ex.name}</p>
            <p className="text-xs text-sp-ink-300 mt-0.5">
              {[ex.sets && `${ex.sets} sets`, ex.reps && `${ex.reps} reps`, ex.intensity || ex.load].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition flex-shrink-0 text-sp-ink-300"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {ex.notes && (
            <div>
              <p className="text-xs font-semibold text-sp-ink-300 uppercase tracking-wide mb-1">Notes</p>
              <p className="text-sm text-sp-ink-100">{ex.notes}</p>
            </div>
          )}

          {ex.videoUrl && !showVideo && (
            <button
              onClick={() => setShowVideo(true)}
              className="btn-brand w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm"
            >
              <PlayCircle size={16} /> Watch Video
            </button>
          )}

          {ex.videoUrl && showVideo && (
            <div className="rounded-xl overflow-hidden bg-black" style={{ aspectRatio: '16 / 9' }}>
              <iframe
                src={toEmbedUrl(ex.videoUrl)}
                className="w-full h-full"
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                title={ex.name}
              />
            </div>
          )}

          {!ex.notes && !ex.videoUrl && (
            <p className="text-sm text-sp-ink-300">No additional details for this exercise.</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default ExerciseDetailModal
