import LegalLayout from './LegalLayout'

// Cookie Policy is folded into this page as its own section (a standard,
// common pattern) rather than a separate route — split it out if preferred.
//
// Marked with a `.todo` block wherever the text depends on a fact only the
// business owner can supply (legal name, address, billing/refund terms,
// whether any athlete served is under 13). Nothing here should be treated as
// legal advice — have an attorney review before publishing, especially given
// how much of this data concerns minors.
export default function PrivacyPolicyPage() {
  return (
    <LegalLayout title="Privacy Policy" updated="[DATE TO BE FILLED IN ON PUBLISH]">
      <span className="todo">
        TODO before publishing: fill in the business's legal name, entity type, and mailing address everywhere this page says "Superior Performance" as a placeholder for that legal identity. A privacy policy needs a real, identifiable, contactable party behind it.
      </span>

      <h2>Who we are</h2>
      <p>
        Superior Performance ("we," "us") provides individualized throwing, lifting, and mobility programs for pitchers, delivered through this website and a private coaching app.
        You can reach us at <a href="mailto:superiorperformance.sp@gmail.com">superiorperformance.sp@gmail.com</a>.
      </p>
      <span className="todo">TODO: add legal business address here (required in most states for a compliant privacy policy).</span>

      <h2>Information we collect</h2>
      <p>We collect information directly from you, and from a parent/guardian or coach on your behalf, including:</p>
      <ul>
        <li><strong>Contact requests</strong> (public site): name, email, grad year or competition level, current top velocity, and any notes you choose to share.</li>
        <li><strong>Account credentials</strong>: email address and password, used to sign in to the coaching app.</li>
        <li><strong>Assessment and training data</strong>: age, age bracket, sport/position, handedness, training history, injury history and pain points, mobility and strength screening results, and program assignments — collected by a coach as part of building your program.</li>
        <li><strong>Training activity</strong>: completed workouts, logged weights, and reported velocity, entered by you or your coach inside the app.</li>
        <li><strong>Profile photo</strong> (optional), if you choose to add one to your account.</li>
        <li><strong>Messages</strong> sent between you and your coach inside the app's chat.</li>
      </ul>
      <p>We only collect what's needed to build and run a training program safely — we don't collect data for advertising or resale, and we don't run analytics or ad-tracking scripts on this site.</p>

      <h2>How we use your information</h2>
      <ul>
        <li>To build, adjust, and deliver your training program</li>
        <li>To communicate with you (or your parent/guardian) about your program, scheduling, and requests</li>
        <li>To track progress over time (velocity, weight, completed work)</li>
        <li>To respond to inquiries submitted through the contact form</li>
      </ul>

      <h2>Who we share it with</h2>
      <p>We don't sell your information. It's shared only with the services that make the app work:</p>
      <ul>
        <li><strong>Google Firebase</strong> — hosts the app, stores account and program data, and handles sign-in.</li>
        <li><strong>Google Sheets / Apps Script</strong> — used internally by coaches to build and manage programs; contact-form submissions are routed here.</li>
        <li><strong>YouTube, Vimeo, or Google Drive</strong> — when a program includes an exercise demonstration video, it's embedded from one of these services; the video only loads when you choose to watch it.</li>
        <li><strong>Rapsodo</strong> — if your program uses Rapsodo pitch-tracking, your session data is shown via Rapsodo's own dashboard, embedded in the app.</li>
      </ul>
      <p>We may also disclose information if required by law, or to protect the safety of an athlete.</p>

      <h2>Cookies</h2>
      <p>
        This site does not use advertising or analytics cookies. The only cookies/local storage in use are:
      </p>
      <ul>
        <li><strong>Essential session cookies</strong> from Firebase Authentication, needed to keep you signed in.</li>
        <li><strong>YouTube's privacy-enhanced embed</strong> (<code>youtube-nocookie.com</code>), which does not set tracking cookies unless you press play on a video.</li>
      </ul>
      <p>Because we don't use non-essential tracking cookies today, this site does not show a cookie-consent banner. If that changes — for example, if analytics or advertising tools are added later — this policy and the site's cookie handling will be updated accordingly.</p>

      <h2>Children's privacy</h2>
      <p>
        Our programs serve youth and high school athletes, including some under age 13. Athletes under 13 do not access the app or log in directly — a parent or coach manages the account, enters assessment information, and reviews the training program on the athlete's behalf. Where an athlete is a minor, a parent or guardian is responsible for reviewing this policy and consenting to their child's participation before an account is created. Parents/guardians may contact us at any time to review, correct, or request deletion of their child's information.
      </p>
      <span className="todo">TODO: this describes the intended practice — worth a quick attorney confirmation that how consent is actually obtained today (verbally at assessment? a signed intake form?) is sufficient, and that it's documented somewhere.</span>

      <h2>Data retention and deletion</h2>
      <span className="todo">TODO: confirm how long training data is kept after an athlete stops training, and how a deletion request is actually carried out (Firebase records, Google Sheets, any exported reports) before publishing this section as final.</span>
      <p>
        We keep account and training data for as long as your account is active, or as needed to provide the service. You (or a parent/guardian) can request deletion of your data at any time by emailing us — we'll confirm what's been removed.
      </p>

      <h2>Security</h2>
      <p>We use Firebase's built-in authentication and access controls to protect your account and data. No method of transmission or storage is 100% secure, and we can't guarantee absolute security.</p>

      <h2>Your rights</h2>
      <span className="todo">TODO: confirm your state so this section can name the specific law that applies (e.g., a California resident has rights under the CCPA/CPRA) rather than speaking only in general terms.</span>
      <p>Depending on where you live, you may have the right to access, correct, or delete your personal information, or to ask what we collect and why. Contact us to make a request.</p>

      <h2>Changes to this policy</h2>
      <p>We may update this policy as the service changes. We'll update the date at the top of this page when we do.</p>

      <h2>Contact us</h2>
      <p>Questions about this policy or your data: <a href="mailto:superiorperformance.sp@gmail.com">superiorperformance.sp@gmail.com</a>.</p>
    </LegalLayout>
  )
}
