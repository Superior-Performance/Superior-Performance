import LegalLayout from './LegalLayout'

export default function RefundPolicyPage() {
  return (
    <LegalLayout title="Refund Policy" updated="[DATE TO BE FILLED IN ON PUBLISH]">
      <span className="todo">
        This entire page is a placeholder structure — it needs your actual billing and cancellation terms before it says anything true. Nothing below should be published as-is. Tell me how you actually bill (per-session, monthly, per program block), your cancellation notice window, and whether partial/prorated refunds are ever given, and I'll fill this in correctly.
      </span>

      <h2>How billing works</h2>
      <span className="todo">TODO: describe your actual billing (e.g., "Programs are billed monthly in advance" or "Paid per 12-week block at the time of assessment").</span>

      <h2>Cancellations</h2>
      <span className="todo">TODO: your cancellation notice requirement, if any (e.g., "Cancel anytime; no refund for the current billing period" or "14 days' notice required").</span>

      <h2>Refunds</h2>
      <span className="todo">TODO: under what circumstances (if any) a refund is given — e.g., unused sessions, program never started, injury preventing participation.</span>

      <h2>How to request a refund or cancellation</h2>
      <p>Contact us at <a href="mailto:superiorperformance.sp@gmail.com">superiorperformance.sp@gmail.com</a> and we'll respond within a few business days.</p>
    </LegalLayout>
  )
}
