import { useState } from 'react'
import toast from 'react-hot-toast'
import { getPublicSettings } from '../../firebase/firestore'
import { Reveal } from './motion'
import { C, DISPLAY, BODY, MONO, SR_ONLY } from './theme'

// Who a lead can say sent them. Kept as a list so adding a coach is one line
// here rather than three edits in the markup. "Other" is last and opens a free
// text box — a name we haven't thought of is more useful than a shrug, and it
// is how this list learns what to add next.
const REFERRERS = ['Ian Lohse', 'Jake Deakins', 'Danny Hill', 'Other']

// ── 3.11 Request form ────────────────────────────────────────────────────────
export default function RequestForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [gradYear, setGradYear] = useState('')
  const [velo, setVelo] = useState('')
  const [notes, setNotes] = useState('')
  const [referrer, setReferrer] = useState('')
  const [referrerOther, setReferrerOther] = useState('')
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
    // Optional — email is already a required way to reach them, and a lead
    // form earns nothing by refusing a lead over a phone number. Checked only
    // when given, and loosely: people type (573) 555-0123, 573-555-0123 and
    // 5735550123, and all three are the same number. Count the digits, allow
    // a leading 1, say nothing about the punctuation.
    if (phone.trim()) {
      const digits = phone.replace(/\D/g, '')
      if (digits.length < 10 || digits.length > 11) next.phone = 'Enter a 10-digit phone number.'
    }
    if (velo.trim() && !/^\d+(\.\d+)?$/.test(velo.trim())) next.velo = 'Numbers only.'
    // The question itself is optional — a lead form that interrogates people
    // converts worse, and attribution is worth less than the lead. But picking
    // "Other" and leaving the box empty answers nothing, so that one is caught.
    if (referrer === 'Other' && !referrerOther.trim()) next.referrerOther = 'Let us know who sent you.'
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

      // Folded into the message body rather than sent as its own parameter:
      // inquiry.gs emails whatever `message` contains, so this arrives today
      // against the script already deployed. A new parameter would mean
      // pasting a new version of that script into Apps Script first, and the
      // referral would silently vanish until someone did.
      const referredBy = referrer === 'Other' ? referrerOther.trim() : referrer
      const message = [
        `Grad year / level: ${gradYear.trim()}`,
        `Current top velo: ${velo.trim() ? `${velo.trim()} mph` : 'Not provided'}`,
        `Referred by: ${referredBy || 'Not provided'}`,
        '',
        notes.trim() || 'No additional notes.',
      ].join('\n')

      // inquiry.gs has always read a `phone` parameter and printed it in the
      // notification email — it just had nothing to print, so every inquiry
      // so far has said "Phone: —". Nothing to change on the script side.
      const params = new URLSearchParams({ name: name.trim(), email: email.trim(), phone: phone.trim(), message })
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

              <FormField id="req-name" label="Full name" autoComplete="name" placeholder="Full name" value={name} onChange={setName} error={errors.name} className="lp-input" style={fieldStyle} />
              <FormField id="req-email" label="Email" type="email" autoComplete="email" placeholder="Email" value={email} onChange={setEmail} error={errors.email} className="lp-input" style={fieldStyle} />
              <FormField id="req-phone" label="Phone (optional)" type="tel" autoComplete="tel" placeholder="Phone (optional)" value={phone} onChange={setPhone} error={errors.phone} className="lp-input" style={fieldStyle} />
              <FormField id="req-grad" label="Grad year / level" placeholder="Grad year / level" value={gradYear} onChange={setGradYear} error={errors.gradYear} className="lp-input" style={fieldStyle} />
              <FormField id="req-velo" label="Current top velo (mph)" placeholder="Current top velo (mph)" value={velo} onChange={setVelo} error={errors.velo} className="lp-input" style={fieldStyle} />
              <div style={{ background: C.ink }}>
                <label htmlFor="req-referrer" style={SR_ONLY}>Referred by</label>
                <select
                  id="req-referrer"
                  className="lp-input lp-focus"
                  value={referrer}
                  onChange={e => setReferrer(e.target.value)}
                  style={{
                    ...fieldStyle,
                    // Native select chrome ignores the field's dark fill on
                    // some browsers and renders a light control mid-form, so
                    // the arrow is drawn here instead of inherited.
                    appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
                    color: referrer ? C.paper : 'rgba(242,244,243,.45)',
                    cursor: 'pointer',
                    backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'><path d='M1 1l5 5 5-5' stroke='%23F2F4F3' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 22px center',
                    paddingRight: 52,
                  }}
                >
                  {/* Empty default so this reads as a placeholder like every
                      other field, and so skipping it stays the easy path. */}
                  <option value="" style={{ color: '#111' }}>Referred by (optional)</option>
                  {REFERRERS.map(r => (
                    <option key={r} value={r} style={{ color: '#111' }}>{r}</option>
                  ))}
                </select>
              </div>

              {referrer === 'Other' && (
                <FormField
                  id="req-referrer-other"
                  label="Who referred you"
                  placeholder="Who referred you?"
                  value={referrerOther}
                  onChange={setReferrerOther}
                  error={errors.referrerOther}
                  className="lp-input"
                  style={fieldStyle}
                />
              )}

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

function FormField({ id, label, type = 'text', autoComplete, placeholder, value, onChange, error, className, style }) {
  return (
    <div style={{ background: C.ink }}>
      <label htmlFor={id} style={SR_ONLY}>{label}</label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
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
