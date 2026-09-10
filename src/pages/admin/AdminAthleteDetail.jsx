import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  getUser, getAssessment, saveAssessment,
  updateUser, deleteAthleteCompletely, getProgramForAthlete, updateProgram,
  updateLiveProgram, migrateCompletionKeys,
  createProgram, deleteProgram, getSettings, getProgramsForAthlete, getGeneralPrograms,
  getCompletions,
} from '../../firebase/firestore'
import { getDataLogs, addDataLog, setDataLogFlag } from '../../firebase/firestore'
import { ensureExerciseIds, completionKey, legacyCompletionKey, countProgramProgress } from '../../utils/programIds'
import Avatar from '../../components/Avatar'
import { ArrowLeft, Save, Zap, Scale, MessageCircle, Pencil, Trash2, X, Sparkles, KeyRound, XCircle, FileSpreadsheet, Download, ChevronDown, GraduationCap, Search, Plus, Flag, Target } from 'lucide-react'
import Papa from 'papaparse'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../../firebase/config'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import ProgramEditorModal from '../../components/ProgramEditorModal'
import ToggleSwitch from '../../components/ToggleSwitch'
import Skeleton from '../../components/Skeleton'
import ConfirmDialog from '../../components/ConfirmDialog'
import { PROGRAM_TYPES } from '../../constants/programTypes'
import {
  OUTPUT_PULL_GROUPS, generateDraftProgram, generateAllDraftPrograms, sendAssessmentToIntakeSheet,
} from '../../utils/sheetPrograms'

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
    title: 'Program Planning',
    fields: [
      { key: 'mode',                label: 'Mode',            type: 'select', options: ['In-House', 'Remote'] },
      { key: 'programLengthWeeks',  label: 'Program Length',  type: 'select', options: ['4 weeks', '8 weeks', '12 weeks'] },
      { key: 'trainingPhase',       label: 'Training Phase',  type: 'select', options: ['On-Ramp', 'In-Season', 'Off-Season'] },
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
  const [activePrograms, setActivePrograms] = useState({}) // { correctives, throwing, lifting } -> program | undefined
  const [programs, setPrograms]     = useState([])
  const [assessment, setAssessment] = useState({})
  const [logs, setLogs]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [loadError, setLoadError]   = useState(null)
  const [saving, setSaving]         = useState(false)
  const [sendingToSheet, setSendingToSheet] = useState(false)
  const [pullingOutputs, setPullingOutputs]         = useState(false)
  const [pullingThrowingOutputs, setPullingThrowingOutputs] = useState(false)
  const [pullingMobilityOutputs, setPullingMobilityOutputs] = useState(false)
  const [pullingLiftingOutputs, setPullingLiftingOutputs]   = useState(false)
  const [pullingAllOutputs, setPullingAllOutputs]           = useState(false)
  const [showGenerateMenu, setShowGenerateMenu]     = useState(false)
  const [editingDraft, setEditingDraft]     = useState(null)
  const [editingLive, setEditingLive]       = useState(null)   // an already-published program
  const [tab, setTab]               = useState('assessment')
  const [showEdit, setShowEdit]     = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleteResult, setDeleteResult] = useState(null) // set once deletion finishes — shows a real summary instead of a toast that vanishes
  const [editName, setEditName]     = useState('')
  const [editEmail, setEditEmail]   = useState('')
  const [togglingType, setTogglingType] = useState(false)
  // Program tab shows one program type at a time (a sub-tab) instead of all
  // four stacked, and "Assign Existing" is a search modal instead of an
  // always-open list — both purely to keep this page from ballooning as an
  // athlete (or the assignable library) accumulates programs over a season.
  const [programTypeTab, setProgramTypeTab] = useState('correctives')
  const [showAssignModal, setShowAssignModal] = useState(false)
  // Pending window.confirm()-style prompt — { title, message, onConfirmFn } |
  // null. See ConfirmDialog for why this is state instead of a synchronous
  // confirm() call.
  const [confirmState, setConfirmState] = useState(null)
  // Admin-side body weight / velo entry — same dataLogs collection the
  // athlete's own Progress tab writes to, so it shows up in both places
  // immediately (see firestore.rules for the matching write permission).
  const [showAddLog, setShowAddLog] = useState(false)
  const [logType, setLogType]       = useState('velo')
  const [logValue, setLogValue]     = useState('')
  const [logDate, setLogDate]       = useState('')
  const [logNotes, setLogNotes]     = useState('')
  const [logSaving, setLogSaving]   = useState(false)
  // Coach-set targets shown as a reference line on the athlete's own trend
  // charts (see TrendChart's `goal` prop) — admin-only, like every other
  // users/{uid} field besides photoURL (see firestore.rules).
  const [completions, setCompletions] = useState({})
  const [goalVelo, setGoalVelo]     = useState('')
  const [goalWeight, setGoalWeight] = useState('')
  const [savingGoals, setSavingGoals] = useState(false)
  const [exportingReport, setExportingReport] = useState(false)

  useEffect(() => {
    load()
  }, [uid])

  // Sync the goal inputs whenever a fresh athlete doc comes in (initial
  // load, or after load() re-runs) — not on every keystroke.
  useEffect(() => {
    setGoalVelo(athlete?.goals?.velo ?? '')
    setGoalWeight(athlete?.goals?.weight ?? '')
  }, [athlete?.goals?.velo, athlete?.goals?.weight])

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

  // College Remote Athlete Mode — flips straight from the profile page
  // rather than through the Edit modal, since it's the kind of thing a
  // coach needs to flip quickly (an athlete heading off to campus, or back)
  // without clicking through a form. Athletes in this mode aren't on a
  // per-week calendar at all — they pick from a fixed set of day types
  // (High Intent/Hybrid/Synergy/Recovery, tagged per day — usually auto-detected
  // from the Outputs sheet's Day column, see createDraftFromRows) that
  // apply across the whole program, not any specific week — see the
  // isRemote branch in SchedulePage.
  async function toggleAthleteType(nextIsRemote) {
    const nextType = nextIsRemote ? 'remote' : 'in_house'
    setTogglingType(true)
    const prevType = athlete.athleteType
    setAthlete(a => ({ ...a, athleteType: nextType })) // optimistic
    try {
      await updateUser(uid, { athleteType: nextType })
      toast.success(nextIsRemote ? 'College Remote Athlete Mode on.' : 'College Remote Athlete Mode off.')
    } catch {
      setAthlete(a => ({ ...a, athleteType: prevType }))
      toast.error('Could not update athlete type.')
    } finally {
      setTogglingType(false)
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

  // Sheet-sync logic (Week/Day parsing, row→program building, the fetch +
  // draft-creation calls) lives in utils/sheetPrograms.js, shared with the
  // roster's bulk "Send to Intake Sheet" / "Generate Programs" actions —
  // this page just supplies the UI (toasts, per-button loading state,
  // refreshing this athlete's program list after a draft lands).
  async function sendToIntakeSheet() {
    setSendingToSheet(true)
    try {
      const settingsSnap = await getSettings()
      const scriptUrl = settingsSnap.exists() ? settingsSnap.data().assessmentSheetScriptUrl : ''
      if (!scriptUrl) {
        toast.error('No Assessment Intake script URL set. Go to Settings first.')
        return
      }
      const json = await sendAssessmentToIntakeSheet(scriptUrl, athlete.name, assessment)
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

  async function pullOneGroup(group, setPulling) {
    setPulling(true)
    try {
      const settingsSnap = await getSettings()
      const scriptUrl = settingsSnap.exists() ? settingsSnap.data().assessmentSheetScriptUrl : ''
      if (!scriptUrl) {
        toast.error('No Assessment Intake script URL set. Go to Settings first.')
        return
      }
      const result = await generateDraftProgram(scriptUrl, uid, athlete.name, group, programs)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      await refreshPrograms()
      toast.success(`Draft pulled from ${group.tabs.join(' + ')} — review it below before publishing.`)
    } catch (err) {
      console.error(err)
      toast.error('Could not reach the sheet: ' + (err.message || 'Unknown error'))
    } finally {
      setPulling(false)
    }
  }

  const pullOutputsFromSheet         = () => pullOneGroup(OUTPUT_PULL_GROUPS[0], setPullingOutputs)
  const pullThrowingOutputsFromSheet = () => pullOneGroup(OUTPUT_PULL_GROUPS[1], setPullingThrowingOutputs)
  const pullLiftingOutputsFromSheet  = () => pullOneGroup(OUTPUT_PULL_GROUPS[2], setPullingLiftingOutputs)
  const pullMobilityOutputsFromSheet = () => pullOneGroup(OUTPUT_PULL_GROUPS[3], setPullingMobilityOutputs)

  // "All combined" pulls all four program types in one click — each still
  // becomes its own draft (an athlete can have one active program per type
  // at once, so there's no such thing as a single program spanning all of
  // them), just without clicking through the menu four times.
  async function pullAllOutputsFromSheet() {
    setPullingAllOutputs(true)
    try {
      const settingsSnap = await getSettings()
      const scriptUrl = settingsSnap.exists() ? settingsSnap.data().assessmentSheetScriptUrl : ''
      if (!scriptUrl) {
        toast.error('No Assessment Intake script URL set. Go to Settings first.')
        return
      }

      const results = await generateAllDraftPrograms(scriptUrl, uid, athlete.name, programs)
      const succeeded = results.filter(r => r.ok)
      const failed = results.filter(r => !r.ok)

      if (succeeded.length === 0) {
        toast.error('No rows found for this athlete in any Outputs tab.')
        return
      }
      await refreshPrograms()
      toast.success(
        `Pulled ${succeeded.length} of ${results.length} programs (${succeeded.map(r => r.label).join(', ')})` +
        (failed.length ? ` — nothing yet for ${failed.map(r => r.label).join(', ')}.` : '.')
      )
    } catch (err) {
      console.error(err)
      toast.error('Could not reach the sheet: ' + (err.message || 'Unknown error'))
    } finally {
      setPullingAllOutputs(false)
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

  // Optimistic — a coach scanning the table shouldn't wait on a round trip
  // to see the flag state change; reverts if the write actually fails.
  async function toggleLogFlag(entryId, flagged) {
    setLogs(prev => prev.map(l => l.id === entryId ? { ...l, flagged } : l))
    try {
      await setDataLogFlag(uid, entryId, flagged)
    } catch {
      toast.error('Could not update flag.')
      setLogs(prev => prev.map(l => l.id === entryId ? { ...l, flagged: !flagged } : l))
    }
  }

  function openAddLog(type) {
    setLogType(type)
    setLogValue('')
    setLogDate(new Date().toISOString().slice(0, 10))
    setLogNotes('')
    setShowAddLog(true)
  }

  async function handleAddLog(e) {
    e.preventDefault()
    if (!logValue || !logDate) return
    setLogSaving(true)
    try {
      // Noon, not midnight — a plain date-only value parsed at UTC midnight
      // can roll back a day once formatted in a timezone behind UTC.
      await addDataLog(uid, {
        type: logType,
        value: parseFloat(logValue),
        notes: logNotes.trim() || null,
        date: new Date(`${logDate}T12:00:00`).toISOString(),
      })
      toast.success('Entry added.')
      setShowAddLog(false)
      load()
    } catch {
      toast.error('Could not add entry.')
    } finally {
      setLogSaving(false)
    }
  }

  // Blank clears a goal (stored as null, not omitted, so it actually
  // overwrites a previously-set value instead of leaving it stale).
  async function saveGoals() {
    setSavingGoals(true)
    try {
      const goals = {
        velo: goalVelo === '' ? null : parseFloat(goalVelo),
        weight: goalWeight === '' ? null : parseFloat(goalWeight),
      }
      await updateUser(uid, { goals })
      setAthlete(prev => prev ? { ...prev, goals } : prev)
      toast.success('Goals updated.')
    } catch {
      toast.error('Could not save goals.')
    } finally {
      setSavingGoals(false)
    }
  }

  // A season summary as CSV — program completion, velo, and body weight —
  // built entirely from data this page already has in state (programs,
  // completions, logs), so there's no extra round trip on click. Uses
  // Papa.unparse (already a dependency for the sheet-import flow) rather
  // than adding a PDF library for a first cut.
  function exportSeasonReport() {
    setExportingReport(true)
    try {
      const rows = [
        ['Athlete', athlete?.name || ''],
        ['Report Generated', format(new Date(), 'MMM d, yyyy')],
        [],
        ['PROGRAMS'],
        ['Program Name', 'Type', 'Weeks', 'Completion %'],
      ]

      // Published programs only — a draft the athlete hasn't started yet
      // shouldn't pad a season summary.
      const seasonPrograms = programs.filter(p => p.athleteId === uid && p.active !== false)
      seasonPrograms.forEach(p => {
        const { total, done } = countProgramProgress(completions, p)
        const pct = total ? Math.round((done / total) * 100) : 0
        const typeInfo = PROGRAM_TYPES.find(t => t.key === (p.programType || 'correctives'))
        rows.push([p.name, typeInfo?.label || p.programType || '—', p.weeks?.length || 0, `${pct}%`])
      })
      if (seasonPrograms.length === 0) rows.push(['No programs on file', '', '', ''])

      const veloEntries = logs.filter(l => l.type === 'velo').sort((a, b) => new Date(b.date) - new Date(a.date))
      const weightEntries = logs.filter(l => l.type === 'weight').sort((a, b) => new Date(b.date) - new Date(a.date))
      const bestVelo = veloEntries.length ? Math.max(...veloEntries.map(l => l.value)) : null

      rows.push(
        [],
        ['VELO'],
        ['Best (mph)', bestVelo ?? '—'],
        ['Most Recent (mph)', veloEntries[0]?.value ?? '—', veloEntries[0]?.date ? format(new Date(veloEntries[0].date), 'MMM d, yyyy') : ''],
        ['Goal (mph)', athlete?.goals?.velo ?? '—'],
        ['Entries Logged', veloEntries.length],
        [],
        ['BODY WEIGHT'],
        ['Most Recent (lbs)', weightEntries[0]?.value ?? '—', weightEntries[0]?.date ? format(new Date(weightEntries[0].date), 'MMM d, yyyy') : ''],
        ['Goal (lbs)', athlete?.goals?.weight ?? '—'],
        ['Entries Logged', weightEntries.length],
      )

      const csv = Papa.unparse(rows)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(athlete?.name || 'athlete').replace(/\s+/g, '-')}-season-report-${format(new Date(), 'yyyy-MM-dd')}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Could not build season report:', err)
      toast.error('Could not export report.')
    } finally {
      setExportingReport(false)
    }
  }

  // Keeps a lightweight list of which program types this athlete currently has
  // active on their user doc, so the Athletes list can show it without an
  // extra programs query per row.
  async function syncProgramTypesFlag(nextActive) {
    await updateUser(uid, { programTypes: Object.keys(nextActive).filter(t => nextActive[t]) })
  }

  async function removeProgram(type) {
    const current = activePrograms[type]
    if (!current) return
    setSaving(true)
    try {
      await updateProgram(current.id, { active: false, athleteId: null })
      const nextActive = { ...activePrograms, [type]: undefined }
      setActivePrograms(nextActive)
      await syncProgramTypesFlag(nextActive)
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
      const target = programs.find(p => p.id === programId)
      if (!target) { toast.error('Program not found.'); return }
      const type = target.programType || 'correctives'
      // Guard against assigning away a program that's already active for a
      // different athlete — the Assign Existing list is filtered to prevent
      // this, but check again here so a stale list can't silently steal it.
      if (target.athleteId && target.athleteId !== uid) {
        toast.error('That program already belongs to another athlete.')
        return
      }
      // Deactivate whatever's currently active for that same program type only
      // — correctives/throwing/lifting are independent, assigning one doesn't
      // touch the others.
      const current = activePrograms[type]
      if (current) await updateProgram(current.id, { active: false })
      // Clone rather than mutate the source program — a reusable template
      // (or a program built for a different athlete) stays exactly as it
      // was, still assignable to the next athlete. This athlete gets their
      // own independent copy, so editing it never touches the original or
      // anyone else who started from the same template.
      const { id: _sourceId, athleteId: _sourceAthleteId, createdAt: _sourceCreatedAt, lastEditedAt: _sourceLastEditedAt, ...templateData } = target
      // Reset to today rather than inheriting the source program's start
      // date — a reusable template's original date has no bearing on when
      // *this* athlete is actually starting it. Adjustable after in the editor.
      await createProgram({ ...templateData, startDate: new Date().toISOString().slice(0, 10), athleteId: uid, active: true })
      // A draft's job is done once it's been published — archive it so it
      // drops out of "Drafts Awaiting Review" for good instead of sitting
      // there forever. Reusable templates (active === true) are never
      // touched here; they stay assignable to the next athlete.
      if (target.active === false) {
        await updateProgram(target.id, { archived: true })
      }
      const snap = await getProgramForAthlete(uid)
      const nextActive = {}
      snap.docs.forEach(d => {
        const data = d.data()
        nextActive[data.programType || 'correctives'] = { id: d.id, ...data }
      })
      setActivePrograms(nextActive)
      await syncProgramTypesFlag(nextActive)
      await refreshPrograms()
      toast.success('Program assigned — this athlete has their own copy, separate from the original.')
    } catch {
      toast.error('Assignment failed.')
    } finally {
      setSaving(false)
    }
  }

  async function saveDraftWeeks(programId, weeks, startDate) {
    await updateProgram(programId, { weeks, totalWeeks: weeks.length, startDate })
    await refreshPrograms()
  }

  // Manual cleanup for drafts that piled up before re-pulling started
  // auto-clearing the previous attempt (see createDraftFromRows) — a
  // one-off attempt the coach never reviewed, or one from before that fix
  // shipped, isn't going anywhere on its own otherwise.
  function discardDraft(draft) {
    setConfirmState({
      title: `Discard "${draft.name}"?`,
      message: "This can't be undone.",
      onConfirmFn: async () => {
        setSaving(true)
        try {
          await deleteProgram(draft.id)
          await refreshPrograms()
          toast.success('Draft discarded.')
        } catch {
          toast.error('Could not discard draft.')
        } finally {
          setSaving(false)
        }
      },
    })
  }

  /**
   * Open a published program for editing.
   *
   * Before the editor can safely reorder or delete anything, every exercise
   * needs a stable id — otherwise the athlete's completions (keyed by position)
   * would shift onto the wrong exercises. So we backfill ids first and move any
   * existing completion docs onto the new keys, then open the editor on the
   * migrated copy. Programs already carrying ids skip straight through.
   */
  async function openLiveProgram(program) {
    const { weeks, assigned, changed } = ensureExerciseIds(program.weeks)
    if (!changed) {
      setEditingLive(program)
      return
    }
    setSaving(true)
    try {
      const remaps = assigned.map(({ id, wi, di, ei }) => ({
        from: legacyCompletionKey(program.id, wi, di, ei),
        to:   completionKey(program.id, id),
      }))
      await migrateCompletionKeys(uid, remaps)
      await updateProgram(program.id, { weeks })
      const migrated = { ...program, weeks }
      setActivePrograms(prev => ({ ...prev, [program.programType || 'correctives']: migrated }))
      setEditingLive(migrated)
    } catch {
      toast.error('Could not open this program for editing.')
    } finally {
      setSaving(false)
    }
  }

  /** Save an edit to a program the athlete is already following. Goes live immediately. */
  async function saveLiveWeeks(programId, weeks, startDate) {
    const { weeks: withIds } = ensureExerciseIds(weeks)
    await updateLiveProgram(programId, { weeks: withIds, totalWeeks: withIds.length, startDate })
    await load()
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

  // Program tab shows one type at a time (programTypeTab) instead of all
  // four stacked — see the state declaration up top for why.
  const currentTypeLabel = PROGRAM_TYPES.find(t => t.key === programTypeTab)?.label || programTypeTab
  const currentTypeProgram = activePrograms[programTypeTab]
  const draftsForType = programs.filter(p =>
    p.athleteId === uid && p.active === false && !p.archived && (p.programType || 'correctives') === programTypeTab
  )
  // Only unassigned templates or this athlete's own (non-draft) programs
  // belong here — a program already active for a DIFFERENT athlete must
  // never show up as assignable, or "Assign" would silently steal it.
  const assignableForType = programs.filter(p =>
    (p.programType || 'correctives') === programTypeTab &&
    p.id !== currentTypeProgram?.id &&
    (!p.athleteId || p.athleteId === uid) &&
    !(p.active === false && p.athleteId === uid)
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

      {/* College Remote Athlete Mode */}
      <div className="flex items-center justify-between gap-4 bg-sp-ink-800 rounded-2xl border border-sp-ink-600 px-5 py-4 mb-6">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-sp-green-500/15 text-sp-green-400 flex items-center justify-center flex-shrink-0">
            <GraduationCap size={17} />
          </div>
          <div>
            <p className="font-semibold text-white text-sm">College Remote Athlete Mode</p>
            <p className="text-xs text-sp-ink-300 mt-0.5 max-w-md">
              For athletes without a fixed schedule to plan around in advance. Instead of a
              per-week calendar, they pick the day type — High Intent, Hybrid, Synergy, or Recovery —
              that fits their session and see that day's pre-throw, throw, mobility, and lift
              content together. Tagged automatically when the Outputs sheet's Day column names
              the type; use the program editor's Day Type dropdown to set it by hand otherwise.
            </p>
          </div>
        </div>
        <ToggleSwitch
          checked={athlete.athleteType === 'remote'}
          onChange={toggleAthleteType}
          disabled={togglingType}
          label="College Remote Athlete Mode"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-sp-ink-800 border border-sp-ink-600 rounded-xl p-1 w-fit">
        {[['assessment','Assessment'],['program','Program'],['logs','Data Logs']].map(([k,l]) => (
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

      {/* Assessment tab */}
      {tab === 'assessment' && (
        <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-semibold text-white">Assessment Intake</h2>
              <p className="text-xs text-sp-ink-300 mt-0.5">Matches the Assessment Intake Google Sheet field-for-field.</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button
                onClick={saveAssessmentScores}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 border border-sp-ink-600 text-sp-ink-100 text-sm font-semibold rounded-xl hover:bg-white/5 disabled:opacity-60 transition"
              >
                <Save size={14} />
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={sendToIntakeSheet}
                disabled={sendingToSheet}
                className="flex items-center gap-2 px-4 py-2 border border-sp-ink-600 text-sp-ink-100 text-sm font-semibold rounded-xl hover:bg-white/5 disabled:opacity-60 transition"
              >
                <FileSpreadsheet size={14} />
                {sendingToSheet ? 'Logging…' : 'Log to Intake Sheet'}
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowGenerateMenu(v => !v)}
                  disabled={pullingOutputs || pullingThrowingOutputs || pullingMobilityOutputs || pullingLiftingOutputs || pullingAllOutputs}
                  className="btn-brand flex items-center gap-2 px-4 py-2 text-sm rounded-xl disabled:opacity-60"
                >
                  <Sparkles size={14} />
                  {pullingOutputs || pullingThrowingOutputs || pullingMobilityOutputs || pullingLiftingOutputs || pullingAllOutputs ? 'Working…' : 'Generate Program'}
                  <ChevronDown size={14} className={showGenerateMenu ? 'rotate-180 transition-transform' : 'transition-transform'} />
                </button>

                {showGenerateMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowGenerateMenu(false)} />
                    <div className="absolute right-0 mt-2 w-96 bg-sp-ink-800 rounded-xl border border-sp-ink-600 shadow-lg z-20 overflow-hidden">
                      <button
                        onClick={() => { setShowGenerateMenu(false); pullOutputsFromSheet() }}
                        className="w-full text-left px-4 py-3 hover:bg-white/5 transition flex items-start gap-3"
                      >
                        <Download size={15} className="text-sp-ink-300 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-white">Pull from Pre-Throw Outputs</p>
                          <p className="text-xs text-sp-ink-300 mt-0.5">Mobilization, Correctives and Movement Activation merged into one program, by category.</p>
                        </div>
                      </button>
                      <button
                        onClick={() => { setShowGenerateMenu(false); pullThrowingOutputsFromSheet() }}
                        className="w-full text-left px-4 py-3 hover:bg-white/5 transition flex items-start gap-3 border-t border-sp-ink-600/60"
                      >
                        <Download size={15} className="text-sp-ink-300 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-white">Pull from Throwing/Post-Throw Outputs</p>
                          <p className="text-xs text-sp-ink-300 mt-0.5">Catch Play/Post-Throw plus the plyo routines, merged into one throwing program, by category.</p>
                        </div>
                      </button>
                      <button
                        onClick={() => { setShowGenerateMenu(false); pullLiftingOutputsFromSheet() }}
                        className="w-full text-left px-4 py-3 hover:bg-white/5 transition flex items-start gap-3 border-t border-sp-ink-600/60"
                      >
                        <Download size={15} className="text-sp-ink-300 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-white">Pull from Lifting Outputs</p>
                          <p className="text-xs text-sp-ink-300 mt-0.5">Reads the Lifting Outputs tab (with video URLs) as their lifting program.</p>
                        </div>
                      </button>
                      <button
                        onClick={() => { setShowGenerateMenu(false); pullMobilityOutputsFromSheet() }}
                        className="w-full text-left px-4 py-3 hover:bg-white/5 transition flex items-start gap-3 border-t border-sp-ink-600/60"
                      >
                        <Download size={15} className="text-sp-ink-300 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-white">Pull from Mobility Outputs</p>
                          <p className="text-xs text-sp-ink-300 mt-0.5">Reads the Mobility Outputs tab as their mobility program.</p>
                        </div>
                      </button>
                      <button
                        onClick={() => { setShowGenerateMenu(false); pullAllOutputsFromSheet() }}
                        className="w-full text-left px-4 py-3 hover:bg-sp-green-500/10 transition flex items-start gap-3 border-t border-sp-ink-600"
                      >
                        <Sparkles size={15} className="text-sp-green-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-white">Pull All (combined)</p>
                          <p className="text-xs text-sp-ink-300 mt-0.5">Runs all four pulls above in one click — each still lands as its own program, since an athlete keeps one active program per type.</p>
                        </div>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {FIELD_GROUPS.map(({ title, fields }) => (
              <div key={title} className="bg-sp-ink-900/40 border border-sp-ink-600/50 rounded-xl p-4">
                <h3 className="font-semibold text-sp-ink-100 mb-3 text-sm">{title}</h3>
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

      {/* Program tab — one program type at a time via a sub-tab, plus an
          on-demand search modal for assigning instead of an always-open
          list, so this stays readable no matter how much history an
          athlete (or the assignable library) accumulates over a season. */}
      {tab === 'program' && (
        <div className="space-y-4">
          {/* Type sub-tabs — a green dot marks types with an active program */}
          <div className="flex gap-1 bg-sp-ink-800 border border-sp-ink-600 rounded-xl p-1 w-fit">
            {PROGRAM_TYPES.map(({ key: k, label: l }) => (
              <button
                key={k}
                onClick={() => setProgramTypeTab(k)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
                  programTypeTab === k ? 'bg-sp-ink-600 text-white' : 'text-sp-ink-300 hover:text-white'
                }`}
              >
                {l}
                {activePrograms[k] && <span className="w-1.5 h-1.5 rounded-full bg-sp-green-500 flex-shrink-0" />}
              </button>
            ))}
          </div>

          {/* Current program — one compact row */}
          <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 px-5 py-4">
            {currentTypeProgram ? (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-sp-green-500/15 text-sp-green-300 text-[10px] font-semibold uppercase tracking-wide rounded-full flex-shrink-0">Active</span>
                    <p className="font-medium text-white truncate">{currentTypeProgram.name}</p>
                  </div>
                  <p className="text-xs text-sp-ink-300 mt-0.5">
                    {currentTypeProgram.weeks?.length || 0} weeks
                    {currentTypeProgram.lastEditedAt && (
                      <> · edited {format(currentTypeProgram.lastEditedAt.toDate?.() ?? currentTypeProgram.lastEditedAt, 'MMM d')}</>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => openLiveProgram(currentTypeProgram)}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-sp-ink-600 text-sp-ink-100 text-xs font-medium rounded-lg hover:bg-white/5 disabled:opacity-60 transition"
                  >
                    <Pencil size={13} /> Edit
                  </button>
                  <button
                    onClick={() => removeProgram(programTypeTab)}
                    disabled={saving}
                    className="p-1.5 text-sp-ink-300/60 hover:text-red-400 transition"
                    title="Remove"
                    aria-label="Remove program"
                  >
                    <XCircle size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sp-ink-300 text-sm">No {currentTypeLabel.toLowerCase()} program assigned.</p>
                <button
                  onClick={() => setShowAssignModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-sp-green-500/15 text-sp-green-300 text-xs font-semibold rounded-lg hover:bg-sp-green-500/25 transition flex-shrink-0"
                >
                  <Search size={13} /> Assign Program
                </button>
              </div>
            )}
          </div>

          {/* Drafts awaiting review — collapses away entirely once empty, and
              a published draft is archived so it never comes back here */}
          {draftsForType.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl px-5 py-4">
              <h3 className="font-semibold text-amber-300 mb-2.5 text-xs uppercase tracking-wide">Drafts Awaiting Review</h3>
              <div className="space-y-2">
                {draftsForType.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3">
                    <p className="text-sm text-sp-ink-100 truncate">{p.name}</p>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => setEditingDraft(p)}
                        className="text-xs px-3 py-1.5 bg-amber-500/20 text-amber-300 font-medium rounded-lg hover:bg-amber-500/30 transition"
                      >
                        Review
                      </button>
                      <button
                        onClick={() => discardDraft(p)}
                        disabled={saving}
                        className="p-1.5 text-amber-400/50 hover:text-red-400 transition"
                        title="Discard draft"
                        aria-label="Discard draft"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Swapping in a different program is always one click away, even
              with one already active — no need to Remove first */}
          {currentTypeProgram && (
            <button
              onClick={() => setShowAssignModal(true)}
              className="flex items-center gap-1.5 text-sm text-sp-ink-300 hover:text-sp-green-400 transition"
            >
              <Search size={14} /> Assign a different {currentTypeLabel.toLowerCase()} program
            </button>
          )}

          {showAssignModal && (
            <AssignProgramModal
              typeLabel={currentTypeLabel}
              programs={assignableForType}
              saving={saving}
              onAssign={(id) => { setShowAssignModal(false); assignProgram(id) }}
              onClose={() => setShowAssignModal(false)}
            />
          )}
        </div>
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

      {/* Edit modal */}
      {showEdit && (
        <div className="animate-modal-backdrop fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="animate-modal-panel bg-sp-ink-800 border border-sp-ink-600 rounded-2xl w-full max-w-md p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Edit Athlete</h2>
              <button onClick={() => setShowEdit(false)} className="p-1 hover:bg-white/10 text-sp-ink-300 rounded-lg"><X size={18} /></button>
            </div>
            <form onSubmit={handleEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-sp-ink-100 mb-1">Full Name</label>
                <input
                  required
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-sp-ink-600 rounded-xl text-sm text-sp-ink-50 bg-sp-ink-900 focus:outline-none focus:ring-2 focus:ring-sp-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-sp-ink-100 mb-1">Email (display only)</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={e => setEditEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-sp-ink-600 rounded-xl text-sm text-sp-ink-50 bg-sp-ink-900 focus:outline-none focus:ring-2 focus:ring-sp-green-500"
                />
                <p className="text-xs text-sp-ink-300 mt-1">Note: this updates the display name only, not their login email.</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowEdit(false)} className="flex-1 py-2.5 border border-sp-ink-600 text-sp-ink-100 rounded-xl text-sm font-medium hover:bg-white/5 transition">Cancel</button>
                <button type="submit" disabled={saving} className="btn-brand flex-1 py-2.5 rounded-xl text-sm">
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation modal — becomes a results summary once deleteResult is set,
          rather than closing straight to a toast that could overstate what actually happened. */}
      {showDelete && (
        <div className="animate-modal-backdrop fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="animate-modal-panel bg-sp-ink-800 border border-sp-ink-600 rounded-2xl w-full max-w-sm p-6 shadow-xl">
            {!deleteResult ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-white">Delete Athlete?</h2>
                  <button onClick={() => setShowDelete(false)} className="p-1 hover:bg-white/10 text-sp-ink-300 rounded-lg"><X size={18} /></button>
                </div>
                <p className="text-sm text-sp-ink-300 mb-5">
                  This will permanently remove <span className="font-semibold text-white">{athlete.name}</span>'s profile, assessment, chat history, workout completions, logged velo/weight, programs, and facility bookings. This cannot be undone.
                </p>
                <p className="text-xs text-sp-ink-400 mb-5">
                  Two things this won't touch: their login (Firebase Auth account) and any rows already pushed to your Google Sheets — you'll get a checklist for those after.
                </p>
                <div className="flex gap-3">
                  <button onClick={() => setShowDelete(false)} className="flex-1 py-2.5 border border-sp-ink-600 text-sp-ink-100 rounded-xl text-sm font-medium hover:bg-white/5 transition">Cancel</button>
                  <button onClick={handleDelete} disabled={saving} className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 disabled:opacity-60 transition">
                    {saving ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold text-white mb-4">{athlete.name}'s data removed</h2>
                <ul className="text-sm text-sp-ink-300 space-y-1.5 mb-5">
                  <li>✓ Profile, assessment, chat history, completions, logs, and {deleteResult.programs} program{deleteResult.programs === 1 ? '' : 's'} deleted</li>
                  {deleteResult.facilityBookings > 0 && <li>✓ {deleteResult.facilityBookings} facility booking{deleteResult.facilityBookings === 1 ? '' : 's'} cancelled and released</li>}
                  {deleteResult.storagePhoto && <li>✓ Profile photo removed</li>}
                  {deleteResult.errors.length > 0 && (
                    <li className="text-amber-400">⚠ Some data couldn't be removed automatically — see below.</li>
                  )}
                </ul>
                {deleteResult.errors.length > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-4 text-xs text-amber-300 space-y-1">
                    {deleteResult.errors.map((e, i) => <p key={i}>{e}</p>)}
                  </div>
                )}
                <div className="bg-white/5 rounded-xl p-3 mb-5 text-xs text-sp-ink-300 space-y-2">
                  <p className="font-semibold text-sp-ink-100">Two manual steps remain:</p>
                  <p>
                    1. Remove their login in{' '}
                    <a href="https://console.firebase.google.com/project/superior-performance-ba102/authentication/users" target="_blank" rel="noreferrer" className="text-sp-green-400 underline">
                      Firebase Console → Authentication
                    </a>
                    {athlete.email && <> — search for <span className="font-mono text-sp-ink-100">{athlete.email}</span></>}.
                  </p>
                  <p>2. Remove any matching rows from your Assessment Intake / Outputs sheets by athlete name, if you push data there.</p>
                </div>
                <button
                  onClick={() => { setShowDelete(false); setDeleteResult(null); navigate('/admin/athletes') }}
                  className="w-full py-2.5 bg-sp-green-500 text-white rounded-xl text-sm font-semibold hover:bg-sp-green-600 transition"
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Logs tab */}
      {tab === 'logs' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-sp-ink-300 uppercase tracking-wider">Body Weight & Velo</p>
            <div className="flex gap-2">
              <button
                onClick={exportSeasonReport}
                disabled={exportingReport}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sp-ink-800 border border-sp-ink-600 text-sp-ink-100 hover:bg-white/5 transition disabled:opacity-60"
              >
                <Download size={13} /> Export Report
              </button>
              <button
                onClick={() => openAddLog('weight')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sp-ink-800 border border-sp-ink-600 text-sp-ink-100 hover:bg-white/5 transition"
              >
                <Plus size={13} /> Body Weight
              </button>
              <button
                onClick={() => openAddLog('velo')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sp-ink-800 border border-sp-ink-600 text-sp-ink-100 hover:bg-white/5 transition"
              >
                <Plus size={13} /> Velo
              </button>
            </div>
          </div>

          {/* Goals — a coach-set target shown as a reference line on the
              athlete's own trend charts (TrendChart's `goal` prop). Admin-only
              on purpose: athletes can only self-write photoURL on their user
              doc, see firestore.rules. */}
          <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Target size={13} className="text-amber-400" />
              <p className="text-xs font-semibold text-sp-ink-300 uppercase tracking-wider">Goals</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-sp-ink-300 mb-1">Velo (mph)</label>
                <input
                  type="number"
                  step="0.1"
                  value={goalVelo}
                  onChange={e => setGoalVelo(e.target.value)}
                  placeholder="e.g. 90"
                  className="w-28 px-3 py-2 border border-sp-ink-600 rounded-lg text-sm text-sp-ink-50 placeholder-sp-ink-300 bg-sp-ink-900 focus:outline-none focus:ring-2 focus:ring-sp-green-500"
                />
              </div>
              <div>
                <label className="block text-xs text-sp-ink-300 mb-1">Body Weight (lbs)</label>
                <input
                  type="number"
                  step="0.1"
                  value={goalWeight}
                  onChange={e => setGoalWeight(e.target.value)}
                  placeholder="e.g. 190"
                  className="w-28 px-3 py-2 border border-sp-ink-600 rounded-lg text-sm text-sp-ink-50 placeholder-sp-ink-300 bg-sp-ink-900 focus:outline-none focus:ring-2 focus:ring-sp-green-500"
                />
              </div>
              <button
                onClick={saveGoals}
                disabled={savingGoals}
                className="px-4 py-2 bg-sp-green-500 hover:bg-sp-green-600 text-white rounded-lg text-sm font-semibold transition disabled:opacity-60"
              >
                {savingGoals ? 'Saving…' : 'Save Goals'}
              </button>
            </div>
          </div>
          <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/[0.03] border-b border-sp-ink-600">
                <th className="text-left px-5 py-3 text-xs font-semibold text-sp-ink-300 uppercase tracking-wider">Type</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-sp-ink-300 uppercase tracking-wider">Value</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-sp-ink-300 uppercase tracking-wider">Notes</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-sp-ink-300 uppercase tracking-wider">Date</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-sp-ink-300 uppercase tracking-wider">Flag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sp-ink-600/60">
              {logs.map(log => (
                <tr key={log.id} className={`hover:bg-white/[0.04] ${log.flagged ? 'bg-amber-500/5' : ''}`}>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                      log.type === 'velo' ? 'bg-amber-500/15 text-amber-300' : 'bg-sky-500/15 text-sky-300'
                    }`}>
                      {log.type === 'velo' ? <Zap size={11} /> : <Scale size={11} />}
                      {log.type === 'velo' ? 'Velo' : 'Body Weight'}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-medium text-white">{log.value} {log.type === 'velo' ? 'mph' : 'lbs'}</td>
                  <td className="px-5 py-3 text-sp-ink-300 max-w-xs truncate" title={log.notes || ''}>{log.notes || '—'}</td>
                  <td className="px-5 py-3 text-sp-ink-300">{log.date ? format(new Date(log.date), 'MMM d, yyyy') : '—'}</td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => toggleLogFlag(log.id, !log.flagged)}
                      className={`p-1.5 rounded-lg transition ${log.flagged ? 'text-amber-400' : 'text-sp-ink-300/40 hover:text-sp-ink-300'}`}
                      aria-label={log.flagged ? 'Unflag entry' : 'Flag for follow-up'}
                      title={log.flagged ? 'Unflag' : 'Flag for follow-up'}
                    >
                      <Flag size={15} fill={log.flagged ? 'currentColor' : 'none'} />
                    </button>
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-sp-ink-300">No data logged yet.</td></tr>
              )}
            </tbody>
          </table>
          </div>
          </div>
        </div>
      )}

      {/* Add body weight / velo entry */}
      {showAddLog && (
        <div className="animate-modal-backdrop fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="animate-modal-panel bg-sp-ink-800 border border-sp-ink-600 rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Add Log Entry</h2>
              <button onClick={() => setShowAddLog(false)} className="p-1 hover:bg-white/10 text-sp-ink-300 rounded-lg"><X size={18} /></button>
            </div>
            <form onSubmit={handleAddLog} className="space-y-4">
              <div className="flex gap-2">
                {[{ key: 'velo', label: 'Velo', Icon: Zap }, { key: 'weight', label: 'Body Weight', Icon: Scale }].map(t => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setLogType(t.key)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition ${
                      logType === t.key ? 'bg-sp-green-500 text-white' : 'bg-white/5 text-sp-ink-300'
                    }`}
                  >
                    <t.Icon size={15} />
                    {t.label}
                  </button>
                ))}
              </div>

              <div>
                <label className="text-xs font-medium text-sp-ink-300 mb-1 block">
                  {logType === 'velo' ? 'Velo (mph)' : 'Body Weight (lbs)'}
                </label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={logValue}
                  onChange={(e) => setLogValue(e.target.value)}
                  placeholder={logType === 'velo' ? 'e.g. 87.5' : 'e.g. 185'}
                  className="w-full px-4 py-2.5 bg-sp-ink-900 border border-sp-ink-600 text-white placeholder-sp-ink-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sp-green-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-sp-ink-300 mb-1 block">Date</label>
                <input
                  type="date"
                  required
                  value={logDate}
                  onChange={(e) => setLogDate(e.target.value)}
                  style={{ colorScheme: 'dark' }}
                  className="w-full px-4 py-2.5 bg-sp-ink-900 border border-sp-ink-600 text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sp-green-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-sp-ink-300 mb-1 block">Notes (optional) — visible to the athlete too</label>
                <input
                  type="text"
                  value={logNotes}
                  onChange={(e) => setLogNotes(e.target.value)}
                  placeholder="Context for this entry"
                  className="w-full px-4 py-2.5 bg-sp-ink-900 border border-sp-ink-600 text-white placeholder-sp-ink-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sp-green-500"
                />
              </div>

              <button
                type="submit"
                disabled={logSaving}
                className="btn-brand w-full py-3 rounded-xl flex items-center justify-center gap-2"
              >
                {logSaving && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {logSaving ? 'Saving…' : 'Save Entry'}
              </button>
            </form>
          </div>
        </div>
      )}

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

// Search-and-assign picker, opened from the Program tab instead of an
// always-visible list — keeps the athlete page compact as the assignable
// library (general templates + this athlete's own past programs) grows.
function AssignProgramModal({ typeLabel, programs, saving, onAssign, onClose }) {
  const [search, setSearch] = useState('')
  const filtered = programs.filter(p => p.name?.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="animate-modal-backdrop fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="animate-modal-panel bg-sp-ink-800 border border-sp-ink-600 rounded-2xl w-full max-w-md shadow-xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-sp-ink-600 flex-shrink-0">
          <h2 className="text-lg font-bold text-white">Assign {typeLabel} Program</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/10 text-sp-ink-300 rounded-lg transition"><X size={18} /></button>
        </div>
        <div className="px-5 py-3 border-b border-sp-ink-600 flex-shrink-0">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-sp-ink-300" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search programs…"
              className="w-full pl-9 pr-3 py-2 border border-sp-ink-600 rounded-xl text-sm text-sp-ink-50 placeholder-sp-ink-300 bg-sp-ink-900 focus:outline-none focus:ring-2 focus:ring-sp-green-500"
            />
          </div>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-3">
          {filtered.length === 0 ? (
            <p className="text-sp-ink-300 text-sm py-6 text-center">
              {programs.length === 0
                ? <>No {typeLabel.toLowerCase()} programs yet. Create one in <Link to="/admin/programs" className="text-sp-green-400 underline">Programs</Link>.</>
                : 'No matches.'}
            </p>
          ) : (
            <div className="space-y-1">
              {filtered.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 py-2 border-b border-sp-ink-600/60 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{p.name}</p>
                    <p className="text-xs text-sp-ink-300">
                      {p.weeks?.length || 0} weeks{!p.athleteId && ' · General'}
                    </p>
                  </div>
                  <button
                    onClick={() => onAssign(p.id)}
                    disabled={saving}
                    className="flex-shrink-0 text-xs px-3 py-1.5 bg-sp-green-500/15 text-sp-green-300 font-medium rounded-lg hover:bg-sp-green-500/25 disabled:opacity-60 transition"
                  >
                    Assign
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AssessmentField({ field, value, onChange }) {
  const { label, type, options, wide } = field
  const wrapClass = wide ? 'col-span-2' : ''

  if (type === 'select') {
    return (
      <div className={wrapClass}>
        <label className="block text-xs font-medium text-sp-ink-300 mb-1">{label}</label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3.5 py-2.5 border border-sp-ink-600 rounded-xl text-sm text-sp-ink-50 focus:outline-none focus:ring-2 focus:ring-sp-green-500 bg-sp-ink-900"
        >
          <option value="" className="bg-sp-ink-900 text-sp-ink-50">— Select —</option>
          {options.map(opt => (
            <option key={opt} value={opt} className="bg-sp-ink-900 text-sp-ink-50">{opt}</option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <div className={wrapClass}>
      <label className="block text-xs font-medium text-sp-ink-300 mb-1">{label}</label>
      <input
        type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
        step={type === 'number' ? '0.1' : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3.5 py-2.5 border border-sp-ink-600 rounded-xl text-sm text-sp-ink-50 placeholder-sp-ink-300 bg-sp-ink-900 focus:outline-none focus:ring-2 focus:ring-sp-green-500"
        placeholder={type === 'text' ? '' : '—'}
      />
    </div>
  )
}
