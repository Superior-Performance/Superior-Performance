import { useState } from 'react'
import { X, Send, CheckCircle2 } from 'lucide-react'
import { getPublicSettings } from '../firebase/firestore'
import toast from 'react-hot-toast'

/**
 * Public-facing "get in touch" form on the landing page. No backend exists for
 * this app, so submissions go out the same way the Sheets integrations do —
 * a GET request to a Google Apps Script web app, configured in Admin Settings,
 * which emails the message straight to superiorperformance.sp@gmail.com.
 */
export default function InquiryModal({ onClose }) {
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [phone, setPhone]       = useState('')
  const [message, setMessage]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent]         = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const settingsSnap = await getPublicSettings()
      const scriptUrl = settingsSnap.exists() ? settingsSnap.data().inquiryScriptUrl : ''
      if (!scriptUrl) {
        toast.error("Inquiries aren't set up yet — email superiorperformance.sp@gmail.com directly.")
        return
      }

      const params = new URLSearchParams({ name, email, phone, message })
      const res = await fetch(`${scriptUrl}?${params.toString()}`)
      const json = await res.json()

      if (!json.success) {
        toast.error(json.error || 'Could not send your message. Try again.')
        return
      }
      setSent(true)
    } catch (err) {
      toast.error('Could not send your message: ' + (err.message || 'Unknown error'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="animate-modal-backdrop fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="animate-modal-panel bg-[#10151d] border border-white/10 rounded-3xl w-full max-w-md p-7 shadow-2xl relative"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-5 right-5 text-white/40 hover:text-white transition" aria-label="Close">
          <X size={20} />
        </button>

        {sent ? (
          <div className="text-center py-8">
            <div className="w-14 h-14 rounded-2xl bg-sp-green-500/15 text-sp-green-400 flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 size={26} />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Message sent</h2>
            <p className="text-white/50 text-sm">Thanks for reaching out — we'll get back to you soon.</p>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-bold text-white mb-1">Get in touch</h2>
            <p className="text-white/50 text-sm mb-6">Tell us a bit about your athlete and what you're looking for.</p>
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <Field label="Name" value={name} onChange={setName} required />
              <Field label="Email" type="email" value={email} onChange={setEmail} required />
              <Field label="Phone (optional)" type="tel" value={phone} onChange={setPhone} />
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Message</label>
                <textarea
                  required
                  rows={4}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="What are you looking for?"
                  className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-sp-green-500 resize-none"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 py-3 font-bold text-sm rounded-xl transition-all disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #2E9E63, #216341)' }}
              >
                <Send size={15} />
                {submitting ? 'Sending…' : 'Send Message'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

function Field({ label, type = 'text', value, onChange, required }) {
  return (
    <div>
      <label className="block text-xs font-medium text-white/50 mb-1.5">{label}</label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-sp-green-500"
      />
    </div>
  )
}
