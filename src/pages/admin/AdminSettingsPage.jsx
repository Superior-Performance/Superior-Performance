import { useEffect, useState } from 'react'
import { getSettings, saveSettings } from '../../firebase/firestore'
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
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)

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
    getSettings().then(snap => {
      if (snap.exists()) setScriptUrl(snap.data().sheetsScriptUrl || '')
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
              <span>In the <strong>Output</strong> tab, row 1 must be headers: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">Week, Day, Category, Exercise, Sets, Reps, Intensity, Notes</code>. Your algorithm populates rows 2+ using formulas referencing the Inputs tab.</span>
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
