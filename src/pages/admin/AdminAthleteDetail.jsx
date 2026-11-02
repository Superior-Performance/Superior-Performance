import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  getUser, getAssessment, saveAssessment, saveAssessmentSnapshot, getAssessmentHistory, updateUser,
  deleteAthleteCompletely, getProgramForAthlete, getProgramsForAthlete, getGeneralPrograms,
  getCompletions, getAthleteGroups, getDataLogs,
} from '../../firebase/firestore'
import Avatar from '../../components/Avatar'
import { ArrowLeft, MessageCircle, Pencil, Trash2, KeyRound } from 'lucide-react'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../../firebase/config'
import toast from 'react-hot-toast'
import ProgramEditorModal from '../../components/ProgramEditorModal'
import Skeleton from '../../components/Skeleton'
import ConfirmDialog from '../../components/ConfirmDialog'
import AthleteProgramView from '../../components/AthleteProgramView'
import { computeTotalArcs } from '../../constants/assessmentFields'
import { snapshotKeyFor } from '../../utils/assessmentHistory'
import AssessmentTab from './athleteDetail/AssessmentTab'
import ProgramTab from './athleteDetail/ProgramTab'
import DataLogsTab, { AddLogModal } from './athleteDetail/DataLogsTab'
import AthleteProfileCards from './athleteDetail/AthleteProfileCards'
import { useAthleteProfileEdits } from './athleteDetail/useAthleteProfileEdits'
import EditAthleteModal from './athleteDetail/EditAthleteModal'
import DeleteAthleteModal from './athleteDetail/DeleteAthleteModal'
import { useAthleteDataLogs } from './athleteDetail/useAthleteDataLogs'
import { useAthleteProgramActions } from './athleteDetail/useAthleteProgramActions'
import { useSheetPulls } from './athleteDetail/useSheetPulls'

export default function AdminAthleteDetail() {
  const { uid } = useParams()
  const navigate = useNavigate()
  const [athlete, setAthlete]       = useState(null)
  const [activePrograms, setActivePrograms] = useState({}) // { correctives, throwing, lifting } -> program | undefined
  const [programs, setPrograms]     = useState([])
  const [assessment, setAssessment] = useState({})
  // Past assessments, one per date — see saveAssessmentScores and
  // utils/assessmentHistory. Loaded alongside the current values.
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [logs, setLogs]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [loadError, setLoadError]   = useState(null)
  const [saving, setSaving]         = useState(false)
  const [tab, setTab]               = useState('assessment')
  const [showEdit, setShowEdit]     = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleteResult, setDeleteResult] = useState(null) // set once deletion finishes — shows a real summary instead of a toast that vanishes
  const [editName, setEditName]     = useState('')
  const [editEmail, setEditEmail]   = useState('')
  const [groups, setGroups] = useState([])
  // Program tab shows one program type at a time (a sub-tab) instead of all
  // four stacked, and "Assign Existing" is a search modal instead of an
  // always-open list — both purely to keep this page from ballooning as an
  // athlete (or the assignable library) accumulates programs over a season.
  const [programTypeTab, setProgramTypeTab] = useState('correctives')
  const [completions, setCompletions] = useState({})

  useEffect(() => {
    load()
    setHistoryLoading(true)
    refreshHistory()
  }, [uid])

  useEffect(() => {
    getAthleteGroups()
      .then(snap => setGroups(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {}) // groups are a convenience here; the page works without them
  }, [])

  async function load() {
    setLoading(true)
    setLoadError(null)
    try {
      const [userSnap, progSnap, assessSnap, ownProgs, generalProgs, logsSnap, completionsSnap] = await Promise.all([
        getUser(uid),
        getProgramForAthlete(uid),
        getAssessment(uid),
        getProgramsForAthlete(uid),
        getGeneralPrograms(),
        getDataLogs(uid),
        getCompletions(uid),
      ])
      setAthlete(userSnap.exists() ? { id: uid, ...userSnap.data() } : null)
      const active = {}
      progSnap.docs.forEach(d => {
        const data = d.data()
        active[data.programType || 'correctives'] = { id: d.id, ...data }
      })
      setActivePrograms(active)
      if (assessSnap.exists()) {
        const { updatedAt, ...data } = assessSnap.data()
        setAssessment(data)
      } else {
        setAssessment({})
      }
      setPrograms(mergePrograms(ownProgs, generalProgs))
      setLogs(logsSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      const completionsMap = {}
      completionsSnap.forEach(d => { completionsMap[d.id] = d.data() })
      setCompletions(completionsMap)
    } catch (err) {
      console.error('Failed to load athlete detail:', err)
      setLoadError(err.message || 'Something went wrong loading this athlete.')
    } finally {
      setLoading(false)
    }
  }

  // This page only ever needs two slices of the programs collection — this
  // athlete's own (active/inactive/draft alike) and the unassigned general
  // library — never every other athlete's programs too. See
  // getProgramsForAthlete/getGeneralPrograms in firestore.js.
  function mergePrograms(ownSnap, generalSnap) {
    const own = ownSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    const general = generalSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    return [...own, ...general]
  }

  async function refreshPrograms() {
    const [ownProgs, generalProgs] = await Promise.all([getProgramsForAthlete(uid), getGeneralPrograms()])
    setPrograms(mergePrograms(ownProgs, generalProgs))
  }

  // Google Sheet traffic — "Log to Intake Sheet" and the Generate Program
  // menu's Outputs pulls. See athleteDetail/useSheetPulls.
  const sheetPulls = useSheetPulls({ uid, athlete, assessment, programs, groups, refreshPrograms })

  // Program assignment, drafts and live edits — see
  // athleteDetail/useAthleteProgramActions.
  const {
    editingDraft, setEditingDraft, editingLive, setEditingLive, confirmState, setConfirmState,
    removeProgram, assignProgram, saveDraftWeeks, discardDraft, openLiveProgram, saveLiveWeeks,
  } = useAthleteProgramActions({ uid, activePrograms, setActivePrograms, refreshPrograms, reload: load, setSaving })

  // Body weight / velo entries, follow-up flags, goals and the season report
  // export — see athleteDetail/useAthleteDataLogs.
  const dataLogs = useAthleteDataLogs({ uid, athlete, setAthlete, logs, setLogs, programs, completions, reload: load })

  // Tier, training days and group membership — see
  // athleteDetail/useAthleteProfileEdits.
  const profile = useAthleteProfileEdits({ uid, athlete, setAthlete, groups })

  async function saveAssessmentScores() {
    setSaving(true)
    try {
      // Total arc of motion is derived from the degree readings, so it's
      // computed here rather than held in form state where it could drift
      // from the numbers it comes from. Firestore-only — never on the form.
      const withArcs = { ...assessment, ...computeTotalArcs(assessment) }
      await saveAssessment(uid, withArcs)
      // Keep a copy filed under its assessment date, so the next screen
      // compares against this one instead of replacing it. Same date means
      // the same entry — correcting a typo doesn't create a second record.
      const dateKey = snapshotKeyFor(withArcs)
      await saveAssessmentSnapshot(uid, dateKey, withArcs)
      await refreshHistory()
      const existing = history.some(h => h.id === dateKey)
      toast.success(existing ? `Assessment for ${dateKey} updated.` : `Assessment saved to history (${dateKey}).`)
    } catch (err) {
      console.error('Assessment save failed:', err)
      toast.error('Save failed: ' + (err?.message || 'unknown error'))
    } finally {
      setSaving(false)
    }
  }

  async function refreshHistory() {
    try {
      const snap = await getAssessmentHistory(uid)
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (err) {
      console.error('Could not load assessment history:', err)
    } finally {
      setHistoryLoading(false)
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
      const summary = await deleteAthleteCompletely(uid)
      setDeleteResult(summary)
    } catch (err) {
      toast.error('Delete failed: ' + (err.message || 'Unknown error'))
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

  if (loading) return (
    <div className="p-8 max-w-4xl bg-sp-ink-900 min-h-full">
      <Skeleton className="h-4 w-20 mb-5" />
      <div className="bg-sp-ink-800 border border-sp-ink-600 rounded-2xl px-6 py-5 mb-6 flex items-center gap-4">
        <Skeleton className="w-12 h-12 rounded-full flex-shrink-0" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3.5 w-52" />
        </div>
      </div>
      <Skeleton className="h-16 rounded-2xl mb-6" />
      <Skeleton className="h-10 w-72 rounded-xl mb-6" />
      <Skeleton className="h-48 rounded-2xl" />
    </div>
  )

  if (loadError) return (
    <div className="p-8 bg-sp-ink-900 min-h-full">
      <Link to="/admin/athletes" className="inline-flex items-center gap-1.5 text-sm text-sp-ink-300 hover:text-white mb-5 transition">
        <ArrowLeft size={15} /> Athletes
      </Link>
      <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 max-w-lg">
        <p className="font-semibold text-red-300 mb-1">Couldn't load this athlete</p>
        <p className="text-sm text-red-400/80 mb-4">{loadError}</p>
        <button
          onClick={load}
          className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-500 transition"
        >
          Try again
        </button>
      </div>
    </div>
  )

  if (!athlete) return (
    <div className="p-8 bg-sp-ink-900 min-h-full">
      <Link to="/admin/athletes" className="inline-flex items-center gap-1.5 text-sm text-sp-ink-300 hover:text-white mb-5 transition">
        <ArrowLeft size={15} /> Athletes
      </Link>
      <p className="text-sp-ink-300">Athlete not found. They may have been deleted.</p>
    </div>
  )

  return (
    <div className="p-8 max-w-4xl bg-sp-ink-900 min-h-full">
      {/* Back + header */}
      <Link to="/admin/athletes" className="inline-flex items-center gap-1.5 text-sm text-sp-ink-300 hover:text-white mb-5 transition">
        <ArrowLeft size={15} /> Athletes
      </Link>

      <div className="surface-brand relative overflow-hidden text-white rounded-2xl px-6 py-5 mb-6">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(circle at 90% 0%, rgba(46,158,99,0.3), transparent 60%)' }}
        />
        <div className="relative flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <Avatar name={athlete.name} photoURL={athlete.photoURL} size={12} onColor />
            <div>
              <h1 className="text-2xl font-bold">{athlete.name}</h1>
              <p className="text-white/60 text-sm">{athlete.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to={`/admin/chat/${uid}`}
              className="flex items-center gap-2 px-3.5 py-2 bg-white/10 hover:bg-white/15 rounded-xl text-sm font-medium transition"
            >
              <MessageCircle size={15} />
              Message
            </Link>
            <button
              onClick={sendResetEmail}
              className="flex items-center gap-2 px-3.5 py-2 bg-white/10 hover:bg-white/15 rounded-xl text-sm font-medium transition"
              title="Send password reset email"
            >
              <KeyRound size={15} />
              Reset Password
            </button>
            <button
              onClick={openEdit}
              className="flex items-center gap-2 px-3.5 py-2 bg-white/10 hover:bg-white/15 rounded-xl text-sm font-medium transition"
            >
              <Pencil size={15} />
              Edit
            </button>
            <button
              onClick={() => setShowDelete(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-red-500/15 text-red-300 hover:bg-red-500/25 rounded-xl text-sm font-medium transition"
            >
              <Trash2 size={15} />
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Athlete type / training days / groups — see
          athleteDetail/AthleteProfileCards */}
      <AthleteProfileCards groups={groups} profile={profile} />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-sp-ink-800 border border-sp-ink-600 rounded-xl p-1 w-fit">
        {[['assessment','Assessment'],['schedule','Schedule'],['program','Program'],['logs','Data Logs']].map(([k,l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === k ? 'bg-sp-ink-600 text-white' : 'text-sp-ink-300 hover:text-white'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === 'assessment' && (
        <AssessmentTab
          assessment={assessment}
          setAssessment={setAssessment}
          saving={saving}
          onSave={saveAssessmentScores}
          history={history}
          historyLoading={historyLoading}
          sheetPulls={sheetPulls}
        />
      )}

      {/* Schedule tab — read-only. Deliberately not the editor: this is for
          looking at what an athlete actually has, without a single control
          that could write to a live program. */}
      {tab === 'schedule' && (
        <AthleteProgramView
          programs={programs}
          completions={completions}
          athleteId={uid}
        />
      )}

      {/* Program tab — see athleteDetail/ProgramTab */}
      {tab === 'program' && (
        <ProgramTab
          athleteId={uid}
          programs={programs}
          activePrograms={activePrograms}
          programTypeTab={programTypeTab}
          setProgramTypeTab={setProgramTypeTab}
          saving={saving}
          onEditLiveProgram={openLiveProgram}
          onRemoveProgram={removeProgram}
          onAssignProgram={assignProgram}
          onReviewDraft={setEditingDraft}
          onDiscardDraft={discardDraft}
        />
      )}

      {editingDraft && (
        <ProgramEditorModal
          program={editingDraft}
          onClose={() => setEditingDraft(null)}
          onSave={(weeks, startDate) => saveDraftWeeks(editingDraft.id, weeks, startDate)}
          onPublish={() => assignProgram(editingDraft.id)}
        />
      )}

      {editingLive && (
        <ProgramEditorModal
          live
          program={editingLive}
          onClose={() => setEditingLive(null)}
          onSave={(weeks, startDate) => saveLiveWeeks(editingLive.id, weeks, startDate)}
        />
      )}

      {showEdit && (
        <EditAthleteModal
          editName={editName}
          setEditName={setEditName}
          editEmail={editEmail}
          setEditEmail={setEditEmail}
          saving={saving}
          onSubmit={handleEdit}
          onClose={() => setShowEdit(false)}
        />
      )}

      {showDelete && (
        <DeleteAthleteModal
          athlete={athlete}
          deleteResult={deleteResult}
          saving={saving}
          onDelete={handleDelete}
          onClose={() => setShowDelete(false)}
          onDone={() => { setShowDelete(false); setDeleteResult(null); navigate('/admin/athletes') }}
        />
      )}

      {/* Logs tab — see athleteDetail/DataLogsTab */}
      {tab === 'logs' && <DataLogsTab logs={logs} dataLogs={dataLogs} />}

      {/* Add body weight / velo entry */}
      {dataLogs.showAddLog && <AddLogModal dataLogs={dataLogs} />}

      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel="Discard"
          danger
          onCancel={() => setConfirmState(null)}
          onConfirm={() => { confirmState.onConfirmFn(); setConfirmState(null) }}
        />
      )}
    </div>
  )
}
