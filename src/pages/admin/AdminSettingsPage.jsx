import { useEffect, useState } from 'react'
import { getSettings, saveSettings, getPublicSettings, savePublicSettings } from '../../firebase/firestore'
import { Settings, Save, CheckCircle, Lock } from 'lucide-react'
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth'
import { auth } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import toast from 'react-hot-toast'

export default function AdminSettingsPage() {
  const { userProfile } = useAuth()
  const [scriptUrl, setScriptUrl] = useState('')
  const [assessmentScriptUrl, setAssessmentScriptUrl] = useState('')
  const [inquiryScriptUrl, setInquiryScriptUrl] = useState('')
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [savingAssessment, setSavingAssessment] = useState(false)
  const [savingInquiry, setSavingInquiry] = useState(false)

  // Password change
  const [current, setCurrent]   = useState('')
  const [next, setNext]         = useState('')
  const [confirm, setConfirm]   = useState('')
  const [pwSaving, setPwSaving] = useState(false)

  async function handlePasswordChange(e) {
    e.preventDefault()
    if (next !== confirm) { toast.error('New passwords do not match.'); return }
    if (next.length < 6)  { toast.error('Password must be at least 6 characters.'); return }
    setPwSaving(true)
    try {
      const user       = auth.currentUser
      const credential = EmailAuthProvider.credential(user.email, current)
      await reauthenticateWithCredential(user, credential)
      await updatePassword(user, next)
      toast.success('Password updated!')
      setCurrent(''); setNext(''); setConfirm('')
    } catch (err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        toast.error('Current password is incorrect.')
      } else {
        toast.error('Could not update password.')
      }
    } finally {
      setPwSaving(false)
    }
  }

  useEffect(() => {
    Promise.all([getSettings(), getPublicSettings()]).then(([snap, publicSnap]) => {
      if (snap.exists()) {
        setScriptUrl(snap.data().sheetsScriptUrl || '')
        setAssessmentScriptUrl(snap.data().assessmentSheetScriptUrl || '')
      }
      if (publicSnap.exists()) {
        setInquiryScriptUrl(publicSnap.data().inquiryScriptUrl || '')
      }
      setLoading(false)
    })
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await saveSettings({ sheetsScriptUrl: scriptUrl.trim() })
      toast.success('Settings saved!')
    } catch {
      toast.error('Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveAssessmentUrl(e) {
    e.preventDefault()
    setSavingAssessment(true)
    try {
      await saveSettings({ assessmentSheetScriptUrl: assessmentScriptUrl.trim() })
      toast.success('Settings saved!')
    } catch {
      toast.error('Save failed.')
    } finally {
      setSavingAssessment(false)
    }
  }

  async function handleSaveInquiryUrl(e) {
    e.preventDefault()
    setSavingInquiry(true)
    try {
      await savePublicSettings({ inquiryScriptUrl: inquiryScriptUrl.trim() })
      toast.success('Settings saved!')
    } catch {
      toast.error('Save failed.')
    } finally {
      setSavingInquiry(false)
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-sp-green-50 text-sp-green-600 flex items-center justify-center">
          <Settings size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-500 text-sm">Configure integrations for Superior Performance</p>
        </div>
      </div>

      {/* Google Sheets Integration */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-1">
          <h2 className="font-semibold text-gray-900">Google Sheets Algorithm</h2>
          {scriptUrl && (
            <span className="flex items-center gap-1 text-xs text-sp-green-600 font-medium">
              <CheckCircle size={13} /> Connected
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Paste your Google Apps Script web app URL here. When you click "Generate Program from Sheet"
          on any athlete, their assessment scores will be sent to your Sheet, the algorithm will run,
          and the output program will be imported automatically.
        </p>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Apps Script Web App URL
            </label>
            <input
              type="url"
              value={scriptUrl}
              onChange={e => setScriptUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sp-green-500 font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={saving || loading}
            className="btn-brand flex items-center gap-2 px-4 py-2.5 text-sm rounded-xl"
          >
            <Save size={14} />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>

        {/* Setup guide */}
        <div className="mt-8 pt-6 border-t border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">How to set up your Google Sheet</h3>
          <ol className="space-y-3 text-sm text-gray-500">
            <li className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-sp-green-100 text-sp-green-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
              <span>Create a new Google Sheet. Add a tab called <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">Inputs</code> and a tab called <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">Output</code>.</span>
            </li>
            <li className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-sp-green-100 text-sp-green-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
              <span>In the <strong>Inputs</strong> tab, put labels in column A and input values in column B, rows 2–9 (Grip Strength, Shoulder ER, Shoulder IR, Hip Mobility, Baseline Velo, Arm Strength, Sprint Time, Body Weight).</span>
            </li>
            <li className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-sp-green-100 text-sp-green-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
              <span>In the <strong>Output</strong> tab, row 1 must be headers: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">Week, Day, Category, Exercise, Sets, Reps, Intensity, Notes</code>. Your algorithm populates rows 2+ using formulas referencing the Inputs tab. <strong>Category</strong> is per-exercise, not per-day — a single day can mix rows tagged <code className="bg-gray-100 px-1 rounded text-xs font-mono">Mobilization</code>, <code className="bg-gray-100 px-1 rounded text-xs font-mono">Correctives</code>, <code className="bg-gray-100 px-1 rounded text-xs font-mono">Movement Activation</code>, and one of <code className="bg-gray-100 px-1 rounded text-xs font-mono">Hybrid Day Plyos</code> / <code className="bg-gray-100 px-1 rounded text-xs font-mono">High-Intent Day Plyos</code> / <code className="bg-gray-100 px-1 rounded text-xs font-mono">Recovery Day Plyos</code> — the athlete sees each as its own clickable tile for that day. Other text still works, it just won't get a matching color or icon.</span>
            </li>
            <li className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-sp-green-100 text-sp-green-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
              <span>In your Sheet, go to <strong>Extensions → Apps Script</strong>, paste the script from below, then click <strong>Deploy → New deployment → Web app</strong>. Set "Who has access" to <em>Anyone</em>. Copy the URL and paste it above.</span>
            </li>
          </ol>

          {/* Apps Script code */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Apps Script Code</p>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(APPS_SCRIPT_CODE)
                  toast.success('Copied to clipboard!')
                }}
                className="text-xs text-sp-green-500 hover:text-sp-green-600 font-medium"
              >
                Copy
              </button>
            </div>
            <pre className="bg-gray-950 text-green-400 text-xs rounded-xl p-4 overflow-x-auto leading-relaxed">
              {APPS_SCRIPT_CODE}
            </pre>
          </div>
        </div>
      </div>

      {/* Assessment Intake Sheet */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mt-5">
        <div className="flex items-start justify-between mb-1">
          <h2 className="font-semibold text-gray-900">Assessment Intake Sheet</h2>
          {assessmentScriptUrl && (
            <span className="flex items-center gap-1 text-xs text-sp-green-600 font-medium">
              <CheckCircle size={13} /> Connected
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Paste the Apps Script web app URL for your Assessment Intake sheet here. When you click
          "Log to Intake Sheet" on any athlete, their full assessment gets appended as a new row —
          same fields, same order, same dropdown values as the sheet itself. The same script also
          handles pulling programs back in: "Pull Correctives from Sheet" reads the{' '}
          <strong>Program Output</strong> tab, and "Pull Lifting from Sheet" reads the{' '}
          <strong>Lifting Output</strong> tab — each athlete can have both active at once, plus a
          throwing program assigned separately from the Programs page.
        </p>

        <form onSubmit={handleSaveAssessmentUrl} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Apps Script Web App URL
            </label>
            <input
              type="url"
              value={assessmentScriptUrl}
              onChange={e => setAssessmentScriptUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sp-green-500 font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={savingAssessment || loading}
            className="btn-brand flex items-center gap-2 px-4 py-2.5 text-sm rounded-xl"
          >
            <Save size={14} />
            {savingAssessment ? 'Saving…' : 'Save'}
          </button>
        </form>

        {/* Setup guide */}
        <div className="mt-8 pt-6 border-t border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">How to connect this to your sheet</h3>
          <ol className="space-y-3 text-sm text-gray-500">
            <li className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-sp-green-100 text-sp-green-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
              <span>Open your Assessment Intake sheet, confirm the tab is named exactly <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">Assessment Intake</code> (the script looks it up by that name).</span>
            </li>
            <li className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-sp-green-100 text-sp-green-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
              <span>Go to <strong>Extensions → Apps Script</strong>, delete any existing code, and paste the script below.</span>
            </li>
            <li className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-sp-green-100 text-sp-green-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
              <span>Click <strong>Deploy → New deployment → Web app</strong>. Set "Who has access" to <em>Anyone</em>. Copy the resulting URL and paste it above.</span>
            </li>
            <li className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-sp-green-100 text-sp-green-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
              <span>On any athlete's Assessment tab, fill in what you have and click <strong>Log to Intake Sheet</strong> — it appends one row to the bottom of the sheet, same as filling it in by hand.</span>
            </li>
            <li className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-sp-green-100 text-sp-green-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">5</span>
              <span>
                Add a tab named exactly <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">Program Output</code> with header row{' '}
                <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">Athlete Name, Week, Day, Category, Exercise, Sets, Reps, Intensity, Notes</code>.
                This holds each athlete's correctives &amp; mobility program — one row per exercise, same athlete name as their assessment row.
                Use <strong>Category</strong> to tag each exercise as <code className="bg-gray-100 px-1 rounded text-xs font-mono">Mobilization</code>, <code className="bg-gray-100 px-1 rounded text-xs font-mono">Correctives</code>, <code className="bg-gray-100 px-1 rounded text-xs font-mono">Movement Activation</code>, or the day's plyo routine (<code className="bg-gray-100 px-1 rounded text-xs font-mono">Hybrid Day Plyos</code>, <code className="bg-gray-100 px-1 rounded text-xs font-mono">High-Intent Day Plyos</code>, or <code className="bg-gray-100 px-1 rounded text-xs font-mono">Recovery Day Plyos</code>) — the athlete sees each as its own clickable tile.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-sp-green-100 text-sp-green-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">6</span>
              <span>
                Add a second tab named exactly <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">Lifting Output</code> with the same header row. This holds each athlete's lifting program, same format, same rules.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-sp-green-100 text-sp-green-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">7</span>
              <span>
                Prefer one tab that already includes Catch Play instead of splitting it out? Add a tab named exactly <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">Pre-Throw Outputs</code> with header row{' '}
                <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">Athlete Name, Week, Day, Type, Exercise, Sets, Reps, Intensity, Notes, Video URL</code>.
                <strong> Type</strong> works exactly like Category above, plus one more value: <code className="bg-gray-100 px-1 rounded text-xs font-mono">Catch Play</code> for that week's throwing work — it lands as its own tile right alongside Mobilization, Correctives, Movement Activation and the plyo routine, all in the same program.
                <strong> Day</strong> can be a plain number for a remote athlete's one flexible session a week, or a weekday name (<code className="bg-gray-100 px-1 rounded text-xs font-mono">Monday</code>, <code className="bg-gray-100 px-1 rounded text-xs font-mono">Friday (optional)</code>) for an in-house athlete's set training days — leave it blank and everything lands on one day, same as before.
                <strong> Video URL</strong> is optional — paste a link per exercise and the athlete gets a "Watch video" button in an in-app player, nothing to leave the app for.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-sp-green-100 text-sp-green-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">8</span>
              <span>
                On that athlete's Assessment tab, click <strong>Pull Correctives from Sheet</strong>, <strong>Pull Lifting from Sheet</strong>, or <strong>Pull from Pre-Throw Outputs</strong> — each reads its own tab and creates a draft for review, independent of the others.
                Throwing programs can also work the old way: build a handful of shared templates in the <strong>Programs</strong> page and assign them to whichever athletes fit, from the Throwing section of their Program tab — those still show up alongside the correctives categories as a <strong>Catch Play</strong> tile too, no extra setup needed.
              </span>
            </li>
          </ol>

          {/* Apps Script code */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Apps Script Code</p>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(ASSESSMENT_APPS_SCRIPT_CODE)
                  toast.success('Copied to clipboard!')
                }}
                className="text-xs text-sp-green-500 hover:text-sp-green-600 font-medium"
              >
                Copy
              </button>
            </div>
            <pre className="bg-gray-950 text-green-400 text-xs rounded-xl p-4 overflow-x-auto leading-relaxed">
              {ASSESSMENT_APPS_SCRIPT_CODE}
            </pre>
          </div>
        </div>
      </div>

      {/* Landing Page Inquiry Form */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mt-5">
        <div className="flex items-start justify-between mb-1">
          <h2 className="font-semibold text-gray-900">Landing Page Inquiry Form</h2>
          {inquiryScriptUrl && (
            <span className="flex items-center gap-1 text-xs text-sp-green-600 font-medium">
              <CheckCircle size={13} /> Connected
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Paste the Apps Script web app URL here to turn on the "Inquire" form on the public landing
          page. Every submission gets emailed straight to{' '}
          <strong>superiorperformance.sp@gmail.com</strong> — nothing is stored in the app.
        </p>

        <form onSubmit={handleSaveInquiryUrl} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Apps Script Web App URL
            </label>
            <input
              type="url"
              value={inquiryScriptUrl}
              onChange={e => setInquiryScriptUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sp-green-500 font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={savingInquiry || loading}
            className="btn-brand flex items-center gap-2 px-4 py-2.5 text-sm rounded-xl"
          >
            <Save size={14} />
            {savingInquiry ? 'Saving…' : 'Save'}
          </button>
        </form>

        {/* Setup guide */}
        <div className="mt-8 pt-6 border-t border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">How to set this up</h3>
          <ol className="space-y-3 text-sm text-gray-500">
            <li className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-sp-green-100 text-sp-green-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
              <span>Go to <a href="https://script.google.com" target="_blank" rel="noreferrer" className="text-sp-green-600 underline">script.google.com</a> and start a blank project — this one doesn't need a spreadsheet, it only sends mail.</span>
            </li>
            <li className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-sp-green-100 text-sp-green-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
              <span>Delete the placeholder code and paste the script below. Sign in with whichever Google account you want sending these — the address it's deployed under doesn't matter, it always emails <strong>superiorperformance.sp@gmail.com</strong>.</span>
            </li>
            <li className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-sp-green-100 text-sp-green-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
              <span>Click <strong>Deploy → New deployment → Web app</strong>. Set "Who has access" to <em>Anyone</em>. The first time, Google will ask you to authorize the script to send mail on your behalf — approve it.</span>
            </li>
            <li className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-sp-green-100 text-sp-green-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
              <span>Copy the resulting URL and paste it above, then Save. The "Inquire" button on the landing page will start working immediately — no redeploy needed.</span>
            </li>
          </ol>

          {/* Apps Script code */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Apps Script Code</p>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(INQUIRY_APPS_SCRIPT_CODE)
                  toast.success('Copied to clipboard!')
                }}
                className="text-xs text-sp-green-500 hover:text-sp-green-600 font-medium"
              >
                Copy
              </button>
            </div>
            <pre className="bg-gray-950 text-green-400 text-xs rounded-xl p-4 overflow-x-auto leading-relaxed">
              {INQUIRY_APPS_SCRIPT_CODE}
            </pre>
          </div>
        </div>
      </div>

      {/* Change password */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mt-5">
        <div className="flex items-center gap-2 mb-1">
          <Lock size={16} className="text-gray-400" />
          <h2 className="font-semibold text-gray-900">Change Password</h2>
        </div>
        <p className="text-sm text-gray-500 mb-5">Signed in as <span className="font-medium text-gray-700">{userProfile?.email}</span></p>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <PwField label="Current Password" value={current} onChange={setCurrent} />
          <PwField label="New Password"     value={next}    onChange={setNext}    minLength={6} />
          <PwField label="Confirm New Password" value={confirm} onChange={setConfirm} />
          <button
            type="submit"
            disabled={pwSaving}
            className="btn-brand flex items-center gap-2 px-4 py-2.5 text-sm rounded-xl"
          >
            <Lock size={14} />
            {pwSaving ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  )
}

function PwField({ label, value, onChange, ...props }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="password"
        required
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sp-green-500"
        {...props}
      />
    </div>
  )
}

const APPS_SCRIPT_CODE = `function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const inputSheet = ss.getSheetByName('Inputs');
    const outputSheet = ss.getSheetByName('Output');

    if (!inputSheet || !outputSheet) {
      return respond({ success: false, error: 'Missing Inputs or Output tab.' });
    }

    // Write assessment scores into column B, rows 2–9
    const fields = [
      'gripStrength', 'shoulderER', 'shoulderIR', 'hipMobility',
      'baselineVelo', 'armStrength', 'sprintTime', 'bodyWeight'
    ];
    fields.forEach((field, i) => {
      const val = e.parameter[field];
      inputSheet.getRange(i + 2, 2).setValue(val !== undefined ? Number(val) : '');
    });

    // Force recalculation
    SpreadsheetApp.flush();

    // Read output rows (skip header row 1, skip blank rows)
    const data = outputSheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim());
    const rows = data.slice(1).filter(row => row[0] !== '' && row[0] !== null);

    const program = rows.map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    });

    return respond({ success: true, program });

  } catch (err) {
    return respond({ success: false, error: err.message });
  }
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}`;

const ASSESSMENT_APPS_SCRIPT_CODE = `function doGet(e) {
  const action = e.parameter.action || 'append';
  if (action === 'pullProgram') return pullProgram(e);
  if (action === 'pullOutputs') return pullOutputs(e);
  if (action === 'setupOutputTabs') return setupOutputTabs();
  return appendAssessment(e);
}

function appendAssessment(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Assessment Intake');
    if (!sheet) {
      return respond({ success: false, error: 'Could not find the "Assessment Intake" tab.' });
    }

    // Column order must match the sheet exactly, left to right. Program
    // planning fields are appended at the end rather than interleaved, so
    // adding them doesn't shift any existing column for a sheet that's
    // already in use.
    const columns = [
      'athleteName', 'assessmentDate', 'age', 'ageBracket', 'trainingAge',
      'sportPosition', 'handedness', 'injuryHistory', 'isaReading', 'compressionSigns',
      'shoulderERLeft', 'shoulderERRight', 'activeShoulderERTestLeft', 'activeShoulderERTestRight',
      'shoulderIRLimitedLeft', 'shoulderIRLimitedRight', 'hipIRLimitedLeft', 'hipIRLimitedRight',
      'hipERLimitedLeft', 'hipERLimitedRight', 'hipExtension', 'hamstringTest', 'splitsTest',
      'ankleDorsiflexionLeft', 'ankleDorsiflexionRight', 'shoulderFlexion', 'tSpineRotation',
      'tSpineExtension', 'tSpineFlexion', 'pecTest', 'elbowPainType', 'flexorForearmTightness',
      'ribFlare', 'scapControl', 'postureFeet', 'posturePelvis', 'postureUpperBody', 'otherNotes',
      'mode', 'programLengthWeeks', 'trainingPhase'
    ];

    const row = columns.map(key => e.parameter[key] || '');
    sheet.appendRow(row);

    return respond({ success: true });

  } catch (err) {
    return respond({ success: false, error: err.message });
  }
}

function pullProgram(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Program Output');
    if (!sheet) {
      return respond({ success: false, error: 'Could not find the "Program Output" tab.' });
    }

    const athleteName = (e.parameter.athleteName || '').trim().toLowerCase();
    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim());

    const rows = data.slice(1)
      .filter(row => row[0] !== '' && row[0] !== null)
      .map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i]; });
        return obj;
      })
      .filter(row => String(row['Athlete Name'] || '').trim().toLowerCase() === athleteName);

    if (!rows.length) {
      return respond({ success: false, error: 'No program rows found for "' + e.parameter.athleteName + '" in Program Output.' });
    }

    return respond({ success: true, program: rows });

  } catch (err) {
    return respond({ success: false, error: err.message });
  }
}

const OUTPUT_TABS = ["Pre-Throw Outputs", "Plyo Outputs", "Throwing/Post-Throw Outputs", "Mobility Outputs", "Lifting Outputs", "Throwing Ramp-Up Template"];
const OUTPUT_HEADERS = ["Athlete Name", "Week", "Day", "Type", "Exercise", "Sets", "Reps", "Intensity", "Notes", "Video URL"];

// "Pre-Throw Outputs" already has 6 extra columns in the live sheet (added
// by hand) for the choice-pair correctives' 2nd option - every "option B"
// goes in these columns on the SAME row as its primary, not as a separate
// row. Other Outputs tabs don't have this pattern yet, so headers are
// per-tab, not one shared constant.
const OUTPUT_HEADERS_BY_TAB = {
  "Pre-Throw Outputs": OUTPUT_HEADERS.concat([
    "Alternate Exercise", "Alternate Sets", "Alternate Reps",
    "Alternate Intensity", "Alternate Notes", "Alternate Video URL",
  ]),
};

function outputHeadersFor(tabName) {
  return OUTPUT_HEADERS_BY_TAB[tabName] || OUTPUT_HEADERS;
}

function pullOutputs(e) {
  try {
    const tabName = e.parameter.tab;
    if (!tabName || OUTPUT_TABS.indexOf(tabName) === -1) {
      return respond({ success: false, error: 'tab parameter must be one of: ' + OUTPUT_TABS.join(', ') });
    }
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tabName);
    if (!sheet) {
      return respond({ success: false, error: 'No "' + tabName + '" tab - run setupOutputTabs first.' });
    }

    const athleteName = (e.parameter.athleteName || '').trim().toLowerCase();
    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim());

    const rows = data.slice(1)
      .filter(row => row[0] !== '' && row[0] !== null)
      .map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i]; });
        return obj;
      })
      .filter(row => !athleteName || String(row['Athlete Name'] || '').trim().toLowerCase() === athleteName);

    return respond({ success: true, tab: tabName, program: rows });

  } catch (err) {
    return respond({ success: false, error: err.message });
  }
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action || 'pushProgram';
    if (action === 'pushProgram') return pushProgram(payload);
    if (action === 'pushOutputs') return pushOutputs(payload);
    if (action === 'deleteOutputsRows') return deleteOutputsRows(payload);
    if (action === 'addDropdownColumns') return addDropdownColumns(payload);
    return respond({ success: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return respond({ success: false, error: err.message });
  }
}

// Appends new columns with header labels + a dropdown validation list, added
// after whatever the target tab's current last column is. Doesn't touch
// existing columns or data - safe to run on Assessment Intake with real
// athlete rows already in it.
function addDropdownColumns(payload) {
  try {
    const sheetName = payload.sheetName;
    const columns = payload.columns; // [{ header: "Mode", options: ["In-House", "Remote"] }, ...]
    const dataRowCount = payload.dataRowCount || 300;
    if (!sheetName) return respond({ success: false, error: 'sheetName is required.' });
    if (!Array.isArray(columns) || !columns.length) return respond({ success: false, error: 'columns must be a non-empty array.' });

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sheet) return respond({ success: false, error: 'No sheet named "' + sheetName + '"' });

    const startCol = sheet.getLastColumn() + 1;
    const neededCols = startCol + columns.length - 1;
    if (sheet.getMaxColumns() < neededCols) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), neededCols - sheet.getMaxColumns());
    }
    const neededRows = dataRowCount + 1;
    if (sheet.getMaxRows() < neededRows) {
      sheet.insertRowsAfter(sheet.getMaxRows(), neededRows - sheet.getMaxRows());
    }

    columns.forEach(function (col, i) {
      const c = startCol + i;
      sheet.getRange(1, c).setValue(col.header).setFontWeight('bold');
      if (col.options && col.options.length) {
        const rule = SpreadsheetApp.newDataValidation().requireValueInList(col.options, true).setAllowInvalid(true).build();
        sheet.getRange(2, c, dataRowCount, 1).setDataValidation(rule);
      }
      sheet.setColumnWidth(c, 140);
    });

    return respond({ success: true, sheetName: sheetName, startCol: startCol, columnsAdded: columns.length });
  } catch (err) {
    return respond({ success: false, error: err.message });
  }
}

function pushProgram(payload) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Program Output');
    if (!sheet) {
      return respond({ success: false, error: 'Could not find the "Program Output" tab.' });
    }

    const athleteName = String(payload.athleteName || '').trim();
    const rows = payload.rows;
    if (!athleteName) {
      return respond({ success: false, error: 'athleteName is required.' });
    }
    if (!Array.isArray(rows) || !rows.length) {
      return respond({ success: false, error: 'rows must be a non-empty array.' });
    }

    const headers = ['Athlete Name', 'Week', 'Day', 'Category', 'Exercise', 'Sets', 'Reps', 'Intensity', 'Notes'];

    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const existing = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (let i = existing.length - 1; i >= 0; i--) {
        if (String(existing[i][0]).trim().toLowerCase() === athleteName.toLowerCase()) {
          sheet.deleteRow(i + 2);
        }
      }
    }

    const values = rows.map(row => headers.map(h => (row[h] !== undefined ? row[h] : '')));
    const target = sheet.getRange(sheet.getLastRow() + 1, 1, values.length, headers.length);
    target.setNumberFormat('@');
    target.setValues(values);

    return respond({ success: true, rowsWritten: values.length });

  } catch (err) {
    return respond({ success: false, error: err.message });
  }
}

function pushOutputs(payload) {
  try {
    const tabName = payload.tab;
    if (!tabName || OUTPUT_TABS.indexOf(tabName) === -1) {
      return respond({ success: false, error: 'tab must be one of: ' + OUTPUT_TABS.join(', ') });
    }
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tabName);
    if (!sheet) {
      return respond({ success: false, error: 'No "' + tabName + '" tab - run setupOutputTabs first.' });
    }
    const headers = outputHeadersFor(tabName);

    const athleteName = String(payload.athleteName || '').trim();
    const rows = payload.rows;
    if (!athleteName) return respond({ success: false, error: 'athleteName is required.' });
    if (!Array.isArray(rows) || !rows.length) return respond({ success: false, error: 'rows must be a non-empty array.' });

    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const existing = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (let i = existing.length - 1; i >= 0; i--) {
        if (String(existing[i][0]).trim().toLowerCase() === athleteName.toLowerCase()) {
          sheet.deleteRow(i + 2);
        }
      }
    }

    const values = rows.map(row => headers.map(h => (row[h] !== undefined ? row[h] : '')));
    const target = sheet.getRange(sheet.getLastRow() + 1, 1, values.length, headers.length);
    target.setNumberFormat('@');
    target.setValues(values);

    return respond({ success: true, tab: tabName, rowsWritten: values.length });

  } catch (err) {
    return respond({ success: false, error: err.message });
  }
}

function deleteOutputsRows(payload) {
  try {
    const tabName = payload.tab;
    if (!tabName || OUTPUT_TABS.indexOf(tabName) === -1) {
      return respond({ success: false, error: 'tab must be one of: ' + OUTPUT_TABS.join(', ') });
    }
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tabName);
    if (!sheet) return respond({ success: false, error: 'No "' + tabName + '" tab.' });

    const athleteName = String(payload.athleteName || '').trim();
    if (!athleteName) return respond({ success: false, error: 'athleteName is required.' });

    const lastRow = sheet.getLastRow();
    let deleted = 0;
    if (lastRow > 1) {
      const existing = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (let i = existing.length - 1; i >= 0; i--) {
        if (String(existing[i][0]).trim().toLowerCase() === athleteName.toLowerCase()) {
          sheet.deleteRow(i + 2);
          deleted++;
        }
      }
    }
    return respond({ success: true, tab: tabName, rowsDeleted: deleted });
  } catch (err) {
    return respond({ success: false, error: err.message });
  }
}

function setupOutputTabs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const preThrowTypeOptions = ["Mobilization", "Correctives", "Movement Activation"];
  const plyoTypeOptions = ["Recovery Plyo", "Hybrid Plyo", "High Intent Day Plyo"];
  const throwingTypeOptions = ["Catch Play", "Post-Throw"];

  OUTPUT_TABS.forEach(function (tabName) {
    let sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      sheet = ss.insertSheet(tabName);
    }
    // Always verify the header row matches exactly - a no-op if it's already
    // correct, but fixes tabs that were created blank (no header row at all).
    const headers = outputHeadersFor(tabName);
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    const currentHeaders = headerRange.getValues()[0];
    const matches = headers.every(function (h, i) { return currentHeaders[i] === h; });
    if (!matches) {
      headerRange.setValues([headers]);
      headerRange.setFontWeight("bold");
    }

    const lastRow = 300;
    let typeOptions = null;
    if (tabName === "Pre-Throw Outputs") typeOptions = preThrowTypeOptions;
    if (tabName === "Plyo Outputs") typeOptions = plyoTypeOptions;
    if (tabName === "Throwing/Post-Throw Outputs") typeOptions = throwingTypeOptions;

    if (typeOptions) {
      const rule = SpreadsheetApp.newDataValidation().requireValueInList(typeOptions, true).setAllowInvalid(true).build();
      sheet.getRange(2, 4, lastRow - 1, 1).setDataValidation(rule);
    }
  });

  return respond({ success: true, tabs: OUTPUT_TABS });
}`;

const INQUIRY_APPS_SCRIPT_CODE = `function doGet(e) {
  try {
    const name    = (e.parameter.name    || '').trim();
    const email   = (e.parameter.email   || '').trim();
    const phone   = (e.parameter.phone   || '').trim();
    const message = (e.parameter.message || '').trim();

    if (!name || !email || !message) {
      return respond({ success: false, error: 'Name, email, and message are required.' });
    }

    MailApp.sendEmail({
      to: 'superiorperformance.sp@gmail.com',
      replyTo: email,
      subject: 'New inquiry from ' + name,
      body:
        'New inquiry from the Superior Performance website\\n\\n' +
        'Name: ' + name + '\\n' +
        'Email: ' + email + '\\n' +
        'Phone: ' + (phone || '—') + '\\n\\n' +
        'Message:\\n' + message,
    });

    return respond({ success: true });

  } catch (err) {
    return respond({ success: false, error: err.message });
  }
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}`;
