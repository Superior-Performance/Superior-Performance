import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  getUser, getAllPrograms, getAssessment, saveAssessment,
  updateUser, deleteUser, getProgramForAthlete, updateProgram,
  createProgram, getSettings,
} from '../../firebase/firestore'
import { getDataLogs } from '../../firebase/firestore'
import { ArrowLeft, Save, Zap, Dumbbell, MessageCircle, Pencil, Trash2, X, Sparkles, KeyRound, XCircle, FileSpreadsheet, Download } from 'lucide-react'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../../firebase/config'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import ProgramEditorModal from '../../components/ProgramEditorModal'

// Mirrors the "Assessment Intake" Google Sheet column-for-column (minus
// Athlete Name, which the app already tracks) so the saved doc can be handed
// straight to that sheet once the two are wired together.
const PASS_FAIL = ['Pass', 'Fail']
const YES_NO = ['Yes', 'No']
const FULL_LIMITED_SIDES = ['Full', 'Limited (bilateral)', 'Limited (left)', 'Limited (right)']

const FIELD_GROUPS = [
  {
    title: 'General',
    fields: [
      { key: 'assessmentDate', label: 'Assessment Date', type: 'date' },
      { key: 'age',            label: 'Age',             type: 'number' },
      { key: 'ageBracket',     label: 'Age Bracket',      type: 'select', options: ['14u', '15u', '16u', '17u', '18u', 'College'] },
      { key: 'trainingAge',    label: 'Training Age (yrs lifting)', type: 'number' },
      { key: 'sportPosition',  label: 'Sport / Position', type: 'text' },
      { key: 'handedness',     label: 'Handedness',       type: 'select', options: ['Left', 'Right'] },
      { key: 'injuryHistory',  label: 'Injury History / Pain (red flags)', type: 'text', wide: true },
    ],
  },
  {
    title: 'ISA',
    fields: [
      { key: 'isaReading',       label: 'ISA Reading',                type: 'select', options: ['Neutral', 'Narrow', 'Wide'] },
      { key: 'compressionSigns', label: 'Compression Signs (ISA test)', type: 'select', options: ['Not compressed', 'Slightly compressed', 'Compressed'] },
    ],
  },
  {
    title: 'Shoulder',
    fields: [
      { key: 'shoulderERLeft',            label: 'Shoulder ER - Left (deg)',  type: 'number' },
      { key: 'shoulderERRight',           label: 'Shoulder ER - Right (deg)', type: 'number' },
      { key: 'activeShoulderERTestLeft',  label: 'Active Shoulder ER Test - Left',  type: 'select', options: PASS_FAIL },
      { key: 'activeShoulderERTestRight', label: 'Active Shoulder ER Test - Right', type: 'select', options: PASS_FAIL },
      { key: 'shoulderIRLimitedLeft',     label: 'Shoulder IR Limited - Left',  type: 'select', options: YES_NO },
      { key: 'shoulderIRLimitedRight',    label: 'Shoulder IR Limited - Right', type: 'select', options: YES_NO },
      { key: 'shoulderFlexion',           label: 'Shoulder Flexion', type: 'select', options: FULL_LIMITED_SIDES },
    ],
  },
  {
    title: 'Hip',
    fields: [
      { key: 'hipIRLimitedLeft',  label: 'Hip IR Limited - Left',  type: 'select', options: YES_NO },
      { key: 'hipIRLimitedRight', label: 'Hip IR Limited - Right', type: 'select', options: YES_NO },
      { key: 'hipERLimitedLeft',  label: 'Hip ER Limited - Left',  type: 'select', options: YES_NO },
      { key: 'hipERLimitedRight', label: 'Hip ER Limited - Right', type: 'select', options: YES_NO },
      { key: 'hipExtension',      label: 'Hip Extension (table test)', type: 'select', options: FULL_LIMITED_SIDES },
    ],
  },
  {
    title: 'Lower Body',
    fields: [
      { key: 'hamstringTest',          label: 'Hamstring Test',            type: 'select', options: PASS_FAIL },
      { key: 'splitsTest',             label: 'Splits Test',               type: 'select', options: PASS_FAIL },
      { key: 'ankleDorsiflexionLeft',  label: 'Ankle Dorsiflexion - Left',  type: 'select', options: PASS_FAIL },
      { key: 'ankleDorsiflexionRight', label: 'Ankle Dorsiflexion - Right', type: 'select', options: PASS_FAIL },
    ],
  },
  {
    title: 'T-Spine',
    fields: [
      { key: 'tSpineRotation',  label: 'T-Spine Rotation',  type: 'select', options: [...FULL_LIMITED_SIDES, 'Limited (glove side)'] },
      { key: 'tSpineExtension', label: 'T-Spine Extension', type: 'select', options: ['Full', 'Limited'] },
      { key: 'tSpineFlexion',   label: 'T-Spine Flexion',   type: 'select', options: ['Full', 'Limited'] },
    ],
  },
  {
    title: 'Elbow / Forearm',
    fields: [
      { key: 'pecTest',                 label: 'Pec Test',                 type: 'select', options: PASS_FAIL },
      { key: 'elbowPainType',           label: 'Elbow Pain Type',          type: 'select', options: ['None', 'Olecranon', 'Tennis elbow', 'Both'] },
      { key: 'flexorForearmTightness',  label: 'Flexor Forearm Tightness', type: 'select', options: PASS_FAIL },
    ],
  },
  {
    title: 'Posture & Notes',
    fields: [
      { key: 'ribFlare',          label: 'Rib Flare',              type: 'select', options: YES_NO },
      { key: 'scapControl',       label: 'Scap Control / Winging', type: 'text' },
      { key: 'postureFeet',       label: 'Posture - Feet',         type: 'text' },
      { key: 'posturePelvis',     label: 'Posture - Pelvis',       type: 'text' },
      { key: 'postureUpperBody',  label: 'Posture - Upper Body',   type: 'text' },
      { key: 'otherNotes',        label: 'Other Notes',            type: 'text', wide: true },
    ],
  },
]

export default function AdminAthleteDetail() {
  const { uid } = useParams()
  const navigate = useNavigate()
  const [athlete, setAthlete]       = useState(null)
  const [program, setProgram]       = useState(null)
  const [programs, setPrograms]     = useState([])
  const [assessment, setAssessment] = useState({})
  const [logs, setLogs]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [loadError, setLoadError]   = useState(null)
  const [saving, setSaving]         = useState(false)
  const [sendingToSheet, setSendingToSheet] = useState(false)
  const [pullingProgram, setPullingProgram] = useState(false)
  const [editingDraft, setEditingDraft]     = useState(null)
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
      if (assessSnap.exists()) {
        const { updatedAt, ...data } = assessSnap.data()
        setAssessment(data)
      } else {
        setAssessment({})
      }
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
      await saveAssessment(uid, assessment)
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

  async function sendToIntakeSheet() {
    setSendingToSheet(true)
    try {
      const settingsSnap = await getSettings()
      const scriptUrl = settingsSnap.exists() ? settingsSnap.data().assessmentSheetScriptUrl : ''
      if (!scriptUrl) {
        toast.error('No Assessment Intake script URL set. Go to Settings first.')
        return
      }

      const params = new URLSearchParams()
      Object.entries(assessment).forEach(([k, v]) => { if (v) params.set(k, v) })
      params.set('athleteName', athlete.name)

      const res = await fetch(`${scriptUrl}?${params.toString()}`)
      const json = await res.json()

      if (!json.success) {
        toast.error(json.error || 'Sheet did not accept the row.')
        return
      }
      toast.success('Logged to the Assessment Intake sheet!')
    } catch (err) {
      toast.error('Could not reach the sheet: ' + (err.message || 'Unknown error'))
    } finally {
      setSendingToSheet(false)
    }
  }

  // Shared by generateFromSheet and pullProgramFromSheet — both end up with the
  // same flat row shape (Week, Day, Category, Exercise, Sets, Reps, Intensity, Notes).
  // Creates a DRAFT (active: false) rather than publishing straight to the
  // athlete, so it can be reviewed and edited first — see the Drafts Awaiting
  // Review section on the Program tab.
  async function createDraftFromRows(rows, programName) {
    const weeksMap = {}
    rows.forEach(row => {
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

    await createProgram({
      name:       programName,
      athleteId:  uid,
      totalWeeks: weeks.length,
      weeks,
      active:     false,
    })

    const allProgs = await getAllPrograms()
    setPrograms(allProgs.docs.map(d => ({ id: d.id, ...d.data() })))
  }

  async function generateFromSheet() {
    setSaving(true)
    try {
      // 1. Get the Apps Script URL from settings
      const settingsSnap = await getSettings()
      const scriptUrl = settingsSnap.exists() ? settingsSnap.data().sheetsScriptUrl : ''
      if (!scriptUrl) {
        toast.error('No Apps Script URL set. Go to Settings first.')
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
        return
      }

      await createDraftFromRows(json.program, `${athlete.name} — Generated Program`)
      toast.success('Draft created — review it below before publishing.')
    } catch (err) {
      console.error(err)
      toast.error('Generation failed: ' + (err.message || 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  async function pullProgramFromSheet() {
    setPullingProgram(true)
    try {
      // 1. Get the Assessment Intake script URL from settings — same script,
      //    a different action, reading the "Program Output" tab instead of
      //    appending to "Assessment Intake".
      const settingsSnap = await getSettings()
      const scriptUrl = settingsSnap.exists() ? settingsSnap.data().assessmentSheetScriptUrl : ''
      if (!scriptUrl) {
        toast.error('No Assessment Intake script URL set. Go to Settings first.')
        return
      }

      // 2. Ask for this athlete's rows from the Program Output tab
      const params = new URLSearchParams()
      params.set('action', 'pullProgram')
      params.set('athleteName', athlete.name)
      const res = await fetch(`${scriptUrl}?${params.toString()}`)
      const json = await res.json()

      if (!json.success || !json.program?.length) {
        toast.error(json.error || 'No program rows found for this athlete in the Program Output tab.')
        return
      }

      await createDraftFromRows(json.program, `${athlete.name} — Program`)
      toast.success('Draft pulled from the sheet — review it below before publishing.')
    } catch (err) {
      console.error(err)
      toast.error('Could not reach the sheet: ' + (err.message || 'Unknown error'))
    } finally {
      setPullingProgram(false)
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
      const allProgs = await getAllPrograms()
      setPrograms(allProgs.docs.map(d => ({ id: d.id, ...d.data() })))
      toast.success('Program assigned!')
    } catch {
      toast.error('Assignment failed.')
    } finally {
      setSaving(false)
    }
  }

  async function saveDraftWeeks(programId, weeks) {
    await updateProgram(programId, { weeks, totalWeeks: weeks.length })
    const allProgs = await getAllPrograms()
    setPrograms(allProgs.docs.map(d => ({ id: d.id, ...d.data() })))
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-sp-green-500 border-t-transparent rounded-full animate-spin" /></div>

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
          <div className="w-12 h-12 rounded-full bg-sp-green-100 text-sp-green-600 flex items-center justify-center font-bold text-xl">
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
            <div>
              <h2 className="font-semibold text-gray-900">Assessment Intake</h2>
              <p className="text-xs text-gray-400 mt-0.5">Matches the Assessment Intake Google Sheet field-for-field.</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button
                onClick={saveAssessmentScores}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 disabled:opacity-60 transition"
              >
                <Save size={14} />
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={sendToIntakeSheet}
                disabled={sendingToSheet}
                className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 disabled:opacity-60 transition"
              >
                <FileSpreadsheet size={14} />
                {sendingToSheet ? 'Logging…' : 'Log to Intake Sheet'}
              </button>
              <button
                onClick={pullProgramFromSheet}
                disabled={pullingProgram}
                className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 disabled:opacity-60 transition"
                title="Pulls this athlete's rows from the Program Output tab and assigns them as a program"
              >
                <Download size={14} />
                {pullingProgram ? 'Pulling…' : 'Pull Program from Sheet'}
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

          <div className="space-y-6">
            {FIELD_GROUPS.map(({ title, fields }) => (
              <div key={title} className="pt-5 border-t border-gray-100 first:pt-0 first:border-0">
                <h3 className="font-semibold text-gray-800 mb-3 text-sm">{title}</h3>
                <div className="grid grid-cols-2 gap-4">
                  {fields.map((field) => (
                    <AssessmentField
                      key={field.key}
                      field={field}
                      value={assessment[field.key] || ''}
                      onChange={(v) => setAssessment(p => ({ ...p, [field.key]: v }))}
                    />
                  ))}
                </div>
              </div>
            ))}
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
                  <span className="px-2.5 py-1 bg-sp-green-100 text-sp-green-800 text-xs font-medium rounded-full">Active</span>
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

          {/* Drafts awaiting review — created by Generate/Pull Program from Sheet,
              not visible to the athlete until published from the editor below */}
          {programs.filter(p => p.athleteId === uid && p.active === false).length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <h2 className="font-semibold text-amber-900 mb-3">Drafts Awaiting Review</h2>
              <div className="space-y-2">
                {programs.filter(p => p.athleteId === uid && p.active === false).map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-amber-100 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{p.name}</p>
                      <p className="text-xs text-gray-500">{p.weeks?.length || 0} weeks · not visible to the athlete yet</p>
                    </div>
                    <button
                      onClick={() => setEditingDraft(p)}
                      className="text-xs px-3 py-1.5 bg-amber-100 text-amber-800 font-medium rounded-lg hover:bg-amber-200 transition"
                    >
                      Review
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Assign from existing */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Assign Program</h2>
            <div className="space-y-2">
              {programs.filter(p => p.id !== program?.id && !(p.active === false && p.athleteId)).map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.weeks?.length || 0} weeks</p>
                  </div>
                  <button
                    onClick={() => assignProgram(p.id)}
                    disabled={saving}
                    className="text-xs px-3 py-1.5 bg-sp-green-50 text-sp-green-600 font-medium rounded-lg hover:bg-sp-green-100 transition"
                  >
                    Assign
                  </button>
                </div>
              ))}
              {programs.length === 0 && (
                <p className="text-gray-400 text-sm">No programs yet. Create one in <Link to="/admin/programs" className="text-sp-green-500 underline">Programs</Link>.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {editingDraft && (
        <ProgramEditorModal
          program={editingDraft}
          onClose={() => setEditingDraft(null)}
          onSave={(weeks) => saveDraftWeeks(editingDraft.id, weeks)}
          onPublish={() => assignProgram(editingDraft.id)}
        />
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
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sp-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email (display only)</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={e => setEditEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sp-green-500"
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

function AssessmentField({ field, value, onChange }) {
  const { label, type, options, wide } = field
  const wrapClass = wide ? 'col-span-2' : ''

  if (type === 'select') {
    return (
      <div className={wrapClass}>
        <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sp-green-500 bg-white"
        >
          <option value="">— Select —</option>
          {options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <div className={wrapClass}>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input
        type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
        step={type === 'number' ? '0.1' : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sp-green-500"
        placeholder={type === 'text' ? '' : '—'}
      />
    </div>
  )
}
