import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  getUser, getAllPrograms, getAssessment, saveAssessment,
  updateUser, deleteUser, getProgramForAthlete, updateProgram,
  createProgram, getSettings,
} from '../../firebase/firestore'
import { getDataLogs } from '../../firebase/firestore'
import { ArrowLeft, Save, Zap, Dumbbell, MessageCircle, Pencil, Trash2, X, Sparkles, KeyRound, XCircle } from 'lucide-react'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../../firebase/config'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

const ASSESSMENT_FIELDS = [
  { key: 'gripStrength',   label: 'Grip Strength (lbs)' },
  { key: 'shoulderER',     label: 'Shoulder ER (°)'     },
  { key: 'shoulderIR',     label: 'Shoulder IR (°)'     },
  { key: 'hipMobility',    label: 'Hip Mobility (°)'    },
  { key: 'baselineVelo',   label: 'Baseline Velo (mph)' },
  { key: 'armStrength',    label: 'Arm Strength Score'  },
  { key: 'sprintTime',     label: '60-yd Sprint (sec)'  },
  { key: 'bodyWeight',     label: 'Body Weight (lbs)'   },
]

const POSTURE_FIELDS = [
  {
    key: 'pelvis',
    label: 'Pelvis Positioning',
    options: ['Neutral', 'Anterior', 'Posterior'],
  },
  {
    key: 'femur',
    label: 'Femur',
    options: ['Neutral', 'Externally Rotated', 'Internally Rotated'],
  },
  {
    key: 'foot',
    label: 'Foot',
    options: ['Neutral', 'Flat'],
  },
  {
    key: 'shoulder',
    label: 'Shoulder',
    options: ['Neutral', 'Anterior', 'Posterior'],
  },
  {
    key: 'cervicalSpine',
    label: 'Cervical Spine',
    options: ['Neutral', 'Anterior'],
  },
]

export default function AdminAthleteDetail() {
  const { uid } = useParams()
  const navigate = useNavigate()
  const [athlete, setAthlete]       = useState(null)
  const [program, setProgram]       = useState(null)
  const [programs, setPrograms]     = useState([])
  const [assessment, setAssessment] = useState({})
  const [posture, setPosture]       = useState({})
  const [logs, setLogs]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [loadError, setLoadError]   = useState(null)
  const [saving, setSaving]         = useState(false)
  const [tab, setTab]               = useState('assessment')
  const [showEdit, setShowEdit]     = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [editName, setEditName]     = useState('')
  const [editEmail, setEditEmail]   = useState('')

  useEffect(() => {
    load()
  }, [uid])

  async function load() {
    setLoading(true)
    setLoadError(null)
    try {
      const [userSnap, progSnap, assessSnap, allProgs, logsSnap] = await Promise.all([
        getUser(uid),
        getProgramForAthlete(uid),
        getAssessment(uid),
        getAllPrograms(),
        getDataLogs(uid),
      ])
      setAthlete(userSnap.exists() ? { id: uid, ...userSnap.data() } : null)
      setProgram(!progSnap.empty ? { id: progSnap.docs[0].id, ...progSnap.docs[0].data() } : null)
      setAssessment(assessSnap.exists() ? assessSnap.data().scores  || {} : {})
      setPosture(assessSnap.exists()   ? assessSnap.data().posture || {} : {})
      setPrograms(allProgs.docs.map(d => ({ id: d.id, ...d.data() })))
      setLogs(logsSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (err) {
      console.error('Failed to load athlete detail:', err)
      setLoadError(err.message || 'Something went wrong loading this athlete.')
    } finally {
      setLoading(false)
    }
  }

  async function saveAssessmentScores() {
    setSaving(true)
    try {
      await saveAssessment(uid, assessment, posture)
      toast.success('Assessment saved!')
    } catch {
      toast.error('Save failed.')
    } finally {
      setSaving(false)
    }
  }

  function openEdit() {
    setEditName(athlete.name || '')
    setEditEmail(athlete.email || '')
    setShowEdit(true)
  }

  async function handleEdit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await updateUser(uid, { name: editName, email: editEmail })
      setAthlete(a => ({ ...a, name: editName, email: editEmail }))
      setShowEdit(false)
      toast.success('Athlete updated!')
    } catch {
      toast.error('Update failed.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setSaving(true)
    try {
      await deleteUser(uid)
      toast.success('Athlete deleted.')
      navigate('/admin/athletes')
    } catch {
      toast.error('Delete failed.')
      setSaving(false)
    }
  }

  async function generateFromSheet() {
    setSaving(true)
    try {
      // 1. Get the Apps Script URL from settings
      const settingsSnap = await getSettings()
      const scriptUrl = settingsSnap.exists() ? settingsSnap.data().sheetsScriptUrl : ''
      if (!scriptUrl) {
        toast.error('No Apps Script URL set. Go to Settings first.')
        setSaving(false)
        return
      }

      // 2. Build query string from current assessment scores
      const params = new URLSearchParams()
      Object.entries(assessment).forEach(([k, v]) => { if (v) params.set(k, v) })
      params.set('athleteName', athlete.name)

      // 3. Call the Apps Script (GET with query params avoids CORS redirect issues)
      const res = await fetch(`${scriptUrl}?${params.toString()}`)
      const json = await res.json()

      if (!json.success || !json.program?.length) {
        toast.error(json.error || 'Sheet returned no program data.')
        setSaving(false)
        return
      }

      // 4. Transform flat rows into nested weeks structure
      //    Expected columns: Week, Day, Category, Exercise, Sets, Reps, Intensity, Notes
      const weeksMap = {}
      json.program.forEach(row => {
        const wk  = Number(row['Week'])  || 1
        const day = Number(row['Day'])   || 1
        if (!weeksMap[wk]) weeksMap[wk] = { weekNum: wk, days: {} }
        if (!weeksMap[wk].days[day]) {
          weeksMap[wk].days[day] = {
            dayNum: day,
            category: row['Category'] || '',
            exercises: [],
          }
        }
        weeksMap[wk].days[day].exercises.push({
          name:      row['Exercise']  || '',
          sets:      row['Sets']      || '',
          reps:      row['Reps']      || '',
          intensity: row['Intensity'] || '',
          notes:     row['Notes']     || '',
        })
      })

      const weeks = Object.values(weeksMap)
        .sort((a, b) => a.weekNum - b.weekNum)
        .map(w => ({
          ...w,
          days: Object.values(w.days).sort((a, b) => a.dayNum - b.dayNum),
        }))

      // 5. Deactivate any current program
      if (program) await updateProgram(program.id, { active: false })

      // 6. Create the new program and assign to athlete
      const programRef = await createProgram({
        name:       `${athlete.name} — Generated Program`,
        athleteId:  uid,
        totalWeeks: weeks.length,
        weeks,
      })
      await updateUser(uid, { programId: programRef.id })

      // Refresh local state
      const snap = await getProgramForAthlete(uid)
      setProgram(!snap.empty ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null)

      toast.success('Program generated and assigned!')
    } catch (err) {
      console.error(err)
      toast.error('Generation failed: ' + (err.message || 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  async function sendResetEmail() {
    try {
      await sendPasswordResetEmail(auth, athlete.email)
      toast.success(`Reset email sent to ${athlete.email}`)
    } catch {
      toast.error('Could not send reset email.')
    }
  }

  async function removeProgram() {
    if (!program) return
    setSaving(true)
    try {
      await updateProgram(program.id, { active: false, athleteId: null })
      await updateUser(uid, { programId: null })
      setProgram(null)
      toast.success('Program removed.')
    } catch {
      toast.error('Could not remove program.')
    } finally {
      setSaving(false)
    }
  }

  async function assignProgram(programId) {
    setSaving(true)
    try {
      // Deactivate any existing program
      if (program) await updateProgram(program.id, { active: false })
      await updateProgram(programId, { athleteId: uid, active: true })
      await updateUser(uid, { programId })
      const snap = await getProgramForAthlete(uid)
      setProgram(!snap.empty ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null)
      toast.success('Program assigned!')
    } catch {
      toast.error('Assignment failed.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>

  if (loadError) return (
    <div className="p-8">
      <Link to="/admin/athletes" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-5 transition">
        <ArrowLeft size={15} /> Athletes
      </Link>
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 max-w-lg">
        <p className="font-semibold text-red-700 mb-1">Couldn't load this athlete</p>
        <p className="text-sm text-red-600 mb-4">{loadError}</p>
        <button
          onClick={load}
          className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 transition"
        >
          Try again
        </button>
      </div>
    </div>
  )

  if (!athlete) return (
    <div className="p-8">
      <Link to="/admin/athletes" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-5 transition">
        <ArrowLeft size={15} /> Athletes
      </Link>
      <p className="text-gray-500">Athlete not found. They may have been deleted.</p>
    </div>
  )

  return (
    <div className="p-8 max-w-4xl">
      {/* Back + header */}
      <Link to="/admin/athletes" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-5 transition">
        <ArrowLeft size={15} /> Athletes
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center font-bold text-xl">
            {athlete.name?.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{athlete.name}</h1>
            <p className="text-gray-500 text-sm">{athlete.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/admin/chat/${uid}`}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition"
          >
            <MessageCircle size={15} />
            Message
          </Link>
          <button
            onClick={sendResetEmail}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition"
            title="Send password reset email"
          >
            <KeyRound size={15} />
            Reset Password
          </button>
          <button
            onClick={openEdit}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition"
          >
            <Pencil size={15} />
            Edit
          </button>
          <button
            onClick={() => setShowDelete(true)}
            className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 transition"
          >
            <Trash2 size={15} />
            Delete
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {[['assessment','Assessment'],['program','Program'],['logs','Data Logs']].map(([k,l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === k ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Assessment tab */}
      {tab === 'assessment' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-gray-900">Assessment Scores</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={saveAssessmentScores}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 disabled:opacity-60 transition"
              >
                <Save size={14} />
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={generateFromSheet}
                disabled={saving}
                className="btn-brand flex items-center gap-2 px-4 py-2 text-sm rounded-xl"
              >
                <Sparkles size={14} />
                {saving ? 'Generating…' : 'Generate Program from Sheet'}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {ASSESSMENT_FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                <input
                  type="number"
                  step="0.1"
                  value={assessment[key] || ''}
                  onChange={(e) => setAssessment(p => ({ ...p, [key]: e.target.value }))}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="—"
                />
              </div>
            ))}
          </div>

          {/* Posture Assessment */}
          <div className="mt-6 pt-6 border-t border-gray-100">
            <h3 className="font-semibold text-gray-800 mb-4">Posture</h3>
            <div className="grid grid-cols-2 gap-4">
              {POSTURE_FIELDS.map(({ key, label, options }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                  <select
                    value={posture[key] || ''}
                    onChange={(e) => setPosture(p => ({ ...p, [key]: e.target.value }))}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                  >
                    <option value="">— Select —</option>
                    {options.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Program tab */}
      {tab === 'program' && (
        <div className="space-y-4">
          {/* Current program */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Current Program</h2>
            {program ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{program.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{program.weeks?.length || 0} weeks · Active</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">Active</span>
                  <button
                    onClick={removeProgram}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-500 text-xs font-medium rounded-lg hover:bg-red-50 transition"
                  >
                    <XCircle size={13} /> Remove
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-gray-400 text-sm">No program assigned.</p>
            )}
          </div>

          {/* Assign from existing */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Assign Program</h2>
            <div className="space-y-2">
              {programs.filter(p => p.id !== program?.id).map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.weeks?.length || 0} weeks</p>
                  </div>
                  <button
                    onClick={() => assignProgram(p.id)}
                    disabled={saving}
                    className="text-xs px-3 py-1.5 bg-brand-50 text-brand-600 font-medium rounded-lg hover:bg-brand-100 transition"
                  >
                    Assign
                  </button>
                </div>
              ))}
              {programs.length === 0 && (
                <p className="text-gray-400 text-sm">No programs yet. Create one in <Link to="/admin/programs" className="text-brand-500 underline">Programs</Link>.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">Edit Athlete</h2>
              <button onClick={() => setShowEdit(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
            </div>
            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input
                  required
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email (display only)</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={e => setEditEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <p className="text-xs text-gray-400 mt-1">Note: this updates the display name only, not their login email.</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowEdit(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition">Cancel</button>
                <button type="submit" disabled={saving} className="btn-brand flex-1 py-2.5 rounded-xl text-sm">
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDelete && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Delete Athlete?</h2>
              <button onClick={() => setShowDelete(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
            </div>
            <p className="text-sm text-gray-500 mb-5">
              This will permanently remove <span className="font-semibold text-gray-800">{athlete.name}</span> and all their data. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDelete(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition">Cancel</button>
              <button onClick={handleDelete} disabled={saving} className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 disabled:opacity-60 transition">
                {saving ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logs tab */}
      {tab === 'logs' && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Value</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Exercise</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {logs.map(log => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                      log.type === 'velo' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {log.type === 'velo' ? <Zap size={11} /> : <Dumbbell size={11} />}
                      {log.type === 'velo' ? 'Velocity' : 'Weight'}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-medium">{log.value} {log.type === 'velo' ? 'mph' : 'lbs'}</td>
                  <td className="px-5 py-3 text-gray-500">{log.exercise || '—'}</td>
                  <td className="px-5 py-3 text-gray-400">{log.date ? format(new Date(log.date), 'MMM d, yyyy') : '—'}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400">No data logged yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
