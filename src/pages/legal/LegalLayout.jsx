import { Link } from 'react-router-dom'
import Logo from '../../components/Logo'
import { C, DISPLAY, BODY, MONO, HAIRLINE } from '../landing/theme'

/**
 * Shared shell for the legal pages (Privacy, Terms, Refund Policy) — reuses
 * the landing page's design tokens so these don't look like a bolted-on
 * template, but stays deliberately plain: this is a page people read
 * carefully, not one that needs to sell anything.
 */
export default function LegalLayout({ title, updated, children }) {
  return (
    <div style={{ background: C.ink, color: C.paper, fontFamily: BODY, minHeight: '100vh' }}>
      <div style={{ padding: '20px clamp(24px,5vw,88px)', borderBottom: HAIRLINE, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }} className="lp-focus">
          <Logo variant="icon" className="h-[28px] w-[28px] flex-shrink-0" />
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(242,244,243,.7)' }}>Superior Performance</span>
        </Link>
        <Link to="/" className="lp-link lp-focus" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'rgba(242,244,243,.7)' }}>
          ← Back to site
        </Link>
      </div>

      <main style={{ maxWidth: 780, margin: '0 auto', padding: 'clamp(48px,7vw,96px) clamp(24px,5vw,32px) 120px' }}>
        <p style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: C.green, marginBottom: 16 }}>Last updated {updated}</p>
        <h1 style={{ fontFamily: DISPLAY, fontWeight: 700, textTransform: 'uppercase', fontSize: 'clamp(32px,4.5vw,52px)', lineHeight: 1.02, letterSpacing: '-.01em', margin: '0 0 40px' }}>{title}</h1>
        <div className="legal-prose">{children}</div>
      </main>

      <style>{`
        .legal-prose h2 {
          font-family: ${DISPLAY}; font-weight: 700; text-transform: uppercase;
          font-size: clamp(19px,2vw,24px); letter-spacing: .01em;
          margin: 44px 0 14px;
        }
        .legal-prose h2:first-child { margin-top: 0; }
        .legal-prose p, .legal-prose li {
          font-size: 16px; line-height: 1.7; color: rgba(242,244,243,.78);
        }
        .legal-prose p { margin: 0 0 16px; }
        .legal-prose ul, .legal-prose ol { margin: 0 0 16px; padding-left: 22px; }
        .legal-prose li { margin-bottom: 8px; }
        .legal-prose a { color: ${C.greenBright}; }
        .legal-prose strong { color: ${C.paper}; }
        .legal-prose .todo {
          display: block; margin: 4px 0 16px; padding: 12px 16px;
          background: rgba(224,168,46,.12); border: 1px solid rgba(224,168,46,.35);
          color: #f0c674; font-family: ${MONO}; font-size: 13px; line-height: 1.6;
        }
      `}</style>
    </div>
  )
}
