import { useState } from 'react'
import toast from 'react-hot-toast'
import { getPublicSettings } from '../../firebase/firestore'
import { Reveal } from './motion'
import { C, DISPLAY, BODY, MONO, SR_ONLY } from './theme'

// ── 3.11 Request form ────────────────────────────────────────────────────────
export default function RequestForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [gradYear, setGradYear] = useState('')
  const [velo, setVelo] = useState('')
  const [notes, setNotes] = useState('')
  const [consent, setConsent] = useState(false)
  const [honeypot, setHoneypot] = useState('') // spam trap — real users never fill this in
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  function validate() {
    const next = {}
    if (!name.trim()) next.name = 'Enter your name.'
    if (!email.trim()) next.email = 'Enter your email.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = "That email doesn't look right."
    if (!gradYear.trim()) next.gradYear = 'Enter your grad year or level.'
    if (velo.trim() && !/^\d+(\.\d+)?$/.test(velo.trim())) next.velo = 'Numbers only.'
    if (!consent) next.consent = 'Please confirm you agree before sending.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (honeypot) return // silently drop bot submissions
    if (!validate()) return
    setSubmitting(true)
    try {
      const settingsSnap = await getPublicSettings()
      const scriptUrl = settingsSnap.exists() ? settingsSnap.data().inquiryScriptUrl : ''
      if (!scriptUrl) {
        toast.error("Requests aren't set up yet — email superiorperformance.sp@gmail.com directly.")
        return
      }

      const message = [
        `Grad year / level: ${gradYear.trim()}`,
        `Current top velo: ${velo.trim() ? `${velo.trim()} mph` : 'Not provided'}`,
        '',
        notes.trim() || 'No additional notes.',
      ].join('\n')

      const params = new URLSearchParams({ name: name.trim(), email: email.trim(), phone: '', message })
      const res = await fetch(`${scriptUrl}?${params.toString()}`)
      const json = await res.json()

      if (!json.success) {
        toast.error(json.error || 'Could not send your request. Try again.')
        return
      }
      setSent(true)
    } catch (err) {
      toast.error('Could not send your request: ' + (err.message || 'Unknown error'))
    } finally {
      setSubmitting(false)
    }
  }

  const fieldStyle = { width: '100%', background: C.ink, border: 'none', padding: '20px 22px', fontSize: 16, color: C.paper, fontFamily: BODY }

  return (
    <section id="request" className="lp-anchor" style={{ padding: 'clamp(72px,9vw,140px) clamp(24px,5vw,88px)', background: C.inkDeep }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'clamp(36px,5vw,80px)', alignItems: 'start' }}>
        <Reveal>
          <h2 style={{ fontFamily: DISPLAY, fontWeight: 700, textTransform: 'uppercase', fontSize: 'clamp(38px,5.4vw,80px)', lineHeight: .92, letterSpacing: '-.01em', margin: 0 }}>
            Tell us about<br />your arm.
          </h2>
          <p style={{ fontFamily: BODY, fontSize: 17, lineHeight: 1.65, color: 'rgba(242,244,243,.7)', maxWidth: '44ch', marginTop: 24 }}>
            Send the basics and we'll come back with what an assessment looks like, what your program would cover, and what it costs. No pitch calls you didn't ask for.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 36 }}>
            {['Response within 24 hours', 'Remote and in-house options', 'No obligation'].map(t => (
              <span key={t} style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(242,244,243,.5)' }}>{t}</span>
            ))}
          </div>
        </Reveal>

        {sent ? (
          <div style={{ background: C.ink, padding: 'clamp(28px,3.5vw,48px)', textAlign: 'center' }}>
            <p style={{ fontFamily: DISPLAY, fontWeight: 700, textTransform: 'uppercase', fontSize: 22, color: C.greenBright, margin: 0 }}>Request sent</p>
            <p style={{ fontFamily: BODY, fontSize: 15, color: 'rgba(242,244,243,.68)', marginTop: 10 }}>We'll be in touch within 24 hours.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'rgba(255,255,255,.09)', border: '1px solid rgba(255,255,255,.09)' }}>
              {/* Honeypot — hidden from real users, bots fill every field */}
              <input
                type="text"
                value={honeypot}
                onChange={e => setHoneypot(e.target.value)}
                autoComplete="off"
                tabIndex={-1}
                aria-hidden="true"
                style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
              />

              <FormField id="req-name" label="Full name" placeholder="Full name" value={name} onChange={setName} error={errors.name} className="lp-input" style={fieldStyle} />
              <FormField id="req-email" label="Email" type="email" placeholder="Email" value={email} onChange={setEmail} error={errors.email} className="lp-input" style={fieldStyle} />
              <FormField id="req-grad" label="Grad year / level" placeholder="Grad year / level" value={gradYear} onChange={setGradYear} error={errors.gradYear} className="lp-input" style={fieldStyle} />
              <FormField id="req-velo" label="Current top velo (mph)" placeholder="Current top velo (mph)" value={velo} onChange={setVelo} error={errors.velo} className="lp-input" style={fieldStyle} />
              <div style={{ background: C.ink }}>
                <label htmlFor="req-notes" style={SR_ONLY}>Goals, availability, anything we should know</label>
                <textarea
                  id="req-notes"
                  className="lp-input"
                  rows={4}
                  placeholder="Goals, availability, anything we should know"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  style={{ ...fieldStyle, resize: 'vertical', display: 'block' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: 20 }}>
              <input
                id="req-consent"
                type="checkbox"
                checked={consent}
                onChange={e => setConsent(e.target.checked)}
                aria-invalid={!!errors.consent}
                aria-describedby={errors.consent ? 'req-consent-error' : undefined}
                style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0, accentColor: C.green, cursor: 'pointer' }}
              />
              {/* Says only what is actually true today. It used to assert the
                  visitor had read a Privacy Policy and Terms — pages that are
                  still placeholders and are stripped from every deploy, so
                  the links went nowhere and the claim was a consent record
                  for a document nobody could read. Worse, the deploy
                  carve-out removed this whole block along with the links,
                  which left the form collecting a minor's details with no
                  consent language at all. No links now, so nothing to strip.
                  Restore the policy references once the real pages ship. */}
              <label htmlFor="req-consent" style={{ fontFamily: BODY, fontSize: 14, lineHeight: 1.55, color: 'rgba(242,244,243,.72)', cursor: 'pointer' }}>
                I agree to be contacted about this request. What you send is used only to reply to you.
              </label>
            </div>
            {errors.consent && <p id="req-consent-error" style={{ fontFamily: MONO, fontSize: 11, color: '#ff8a7a', marginTop: 8 }}>{errors.consent}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="lp-btn-primary lp-focus"
              style={{ width: '100%', padding: 22, marginTop: 20, fontFamily: MONO, fontSize: 12, letterSpacing: '.2em', textTransform: 'uppercase', border: 'none', cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.7 : 1 }}
            >
              {submitting ? 'Sending…' : 'Send Request'}
            </button>
          </form>
        )}
      </div>
    </section>
  )
}

function FormField({ id, label, type = 'text', placeholder, value, onChange, error, className, style }) {
  return (
    <div style={{ background: C.ink }}>
      <label htmlFor={id} style={SR_ONLY}>{label}</label>
      <input
        id={id}
        type={type}
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        style={style}
      />
      {error && <p id={`${id}-error`} style={{ fontFamily: MONO, fontSize: 11, color: '#ff8a7a', padding: '0 22px 12px' }}>{error}</p>}
    </div>
  )
}
