import LegalLayout from './LegalLayout'

export default function TermsPage() {
  return (
    <LegalLayout title="Terms & Conditions" updated="[DATE TO BE FILLED IN ON PUBLISH]">
      <span className="todo">
        TODO before publishing: fill in the business's legal name/entity and state of operation, confirm billing terms, and have an attorney review this page — particularly the liability section, given this describes physical athletic training.
      </span>

      <h2>Agreement to terms</h2>
      <p>By using this website or the Superior Performance coaching app, you (or, if you're a minor, your parent or guardian on your behalf) agree to these terms.</p>

      <h2>Our services</h2>
      <p>Superior Performance provides individualized throwing, lifting, and mobility training programs, delivered remotely or in-house, based on an in-person or remote assessment.</p>

      <h2>Accounts and minors</h2>
      <p>
        Accounts are created by a coach, not through public self-signup. Where an athlete is under 18, a parent or guardian must review these terms and our <a href="/privacy">Privacy Policy</a> and consent to the athlete's participation and use of the app.
      </p>

      <h2>Assumption of risk — physical training</h2>
      <p>
        <strong>Athletic training carries an inherent risk of injury.</strong> Throwing, lifting, and mobility work — whether performed in-house or remotely — should be done as instructed and within your own physical limits. You (or your parent/guardian) are responsible for disclosing relevant injury history, following program instructions, and stopping if something feels wrong. Superior Performance is not a medical provider; nothing in a program is medical advice, and any pain or injury should be evaluated by a qualified medical professional.
      </p>
      <span className="todo">TODO: this page is not a substitute for a signed liability waiver — for a physical training business, an attorney-drafted waiver signed by the athlete/parent (separate from this web page) is strongly recommended in addition to this section.</span>

      <h2>Payment and billing</h2>
      <span className="todo">TODO: describe actual billing here — how athletes are charged (e.g., per program, monthly), accepted payment methods, and billing cadence. This site does not currently process payment online.</span>

      <h2>Cancellations and refunds</h2>
      <p>See our <a href="/refund-policy">Refund Policy</a> for cancellation and refund terms.</p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Use the app only for its intended purpose — following and tracking your own (or your athlete's) training program.</li>
        <li>Don't share your account credentials or another athlete's program/data.</li>
        <li>Don't attempt to access another athlete's account or data.</li>
      </ul>

      <h2>Intellectual property</h2>
      <p>Program content, the Superior Performance name and mark, and the app itself are the property of Superior Performance. Your own training data (logged workouts, weights, notes) belongs to you.</p>

      <h2>Third-party services</h2>
      <p>The app embeds or links to third-party services (YouTube, Vimeo, Google Drive, Rapsodo) for exercise videos and pitch-tracking data. Those services' own terms and privacy practices apply to your use of them.</p>

      <h2>Limitation of liability</h2>
      <span className="todo">TODO: this section needs attorney drafting specific to your state — a generic limitation-of-liability clause for a physical training business carries real weight and shouldn't be templated.</span>
      <p>To the fullest extent permitted by law, Superior Performance is not liable for indirect, incidental, or consequential damages arising from use of this service.</p>

      <h2>Governing law</h2>
      <span className="todo">TODO: name the state whose law governs these terms.</span>

      <h2>Changes to these terms</h2>
      <p>We may update these terms as the service changes. Continued use of the app after an update means you accept the revised terms.</p>

      <h2>Contact us</h2>
      <p>Questions about these terms: <a href="mailto:superiorperformance.sp@gmail.com">superiorperformance.sp@gmail.com</a>.</p>
    </LegalLayout>
  )
}
