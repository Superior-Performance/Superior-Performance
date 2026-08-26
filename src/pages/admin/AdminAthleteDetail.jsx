import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  getUser, getAllPrograms, getAssessment, saveAssessment,
  updateUser, deleteUser, getProgramForAthlete, updateProgram,
  updateLiveProgram, migrateCompletionKeys,
  createProgram, getSettings,
} from '../../firebase/firestore'
import { getDataLogs } from '../../firebase/firestore'
import { ensureExerciseIds, completionKey, legacyCompletionKey, makeExerciseId } from '../../utils/programIds'
import { ArrowLeft, Save, Zap, Dumbbell, MessageCircle, Pencil, Trash2, X, Sparkles, KeyRound, XCircle, FileSpreadsheet, Download, ChevronDown, GraduationCap } from 'lucide-react'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../../firebase/config'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import ProgramEditorModal from '../../components/ProgramEditorModal'
import ToggleSwitch from '../../components/ToggleSwitch'
import { PROGRAM_TYPES, DAY_TYPES, matchDayType } from '../../constants/programTypes'

// Each day type's stable position in the draft's day grid — see
// createDraftFromRows below.
const DAY_TYPE_DAYNUM = Object.fromEntries(DAY_TYPES.map((dt, i) => [dt.key, i + 1]))

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
  const [editName, setEditName]     = useState('')
  const [editEmail, setEditEmail]   = useState('')
  const [togglingType, setTogglingType] = useState(false)

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

  // College Remote Athlete Mode — flips straight from the profile page
  // rather than through the Edit modal, since it's the kind of thing a
  // coach needs to flip quickly (an athlete heading off to campus, or back)
  // without clicking through a form. Athletes in this mode aren't on a
  // per-week calendar at all — they pick from a fixed set of day types
  // (High Intent/Medium/Recovery, tagged per day — usually auto-detected
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

  const WEEKDAY_TO_NUM = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7 }

  // Coaches write Week/Day as either a single number ("2"), a labeled number
  // ("Day 2", "Week 2"), a repeating range ("1-4", "1-3 (every training
  // day)") to mean "this block runs on every one of these weeks/days," or —
  // for in-house athletes with set training days — a weekday name
  // ("Monday", "Friday (optional)"). Weekday names map to a stable
  // Mon=1..Sun=7 so each real day lands on its own bucket instead of
  // collapsing into Day 1 — and "Day 1"/"Day 2"/"Day 3" must have their
  // label stripped first or they'd all fail to parse and collapse the same way.
  function parseWeekOrDayRange(raw) {
    const str = String(raw ?? '').trim().replace(/^(day|week)\s+/i, '')
    const range = str.match(/^(\d+)\s*-\s*(\d+)/)
    if (range) {
      const start = Number(range[1])
      const end   = Number(range[2])
      // A stray value in the Week/Day cell (a date serial, an ID, a typo)
      // can still match this pattern with a huge span — no real program
      // block runs more than a couple months, so cap it rather than
      // spinning a loop with millions of iterations and freezing the tab.
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 60) {
        return [1]
      }
      const nums = []
      for (let n = start; n <= end; n++) nums.push(n)
      return nums.length ? nums : [1]
    }
    const single = Number(str.match(/^\d+/)?.[0])
    if (Number.isFinite(single)) return [single]
    const weekday = WEEKDAY_TO_NUM[str.replace(/\(.*?\)/g, '').trim().toLowerCase()]
    return weekday ? [weekday] : [1]
  }

  // Shared by every Outputs-tab pull — all end up with the same flat row
  // shape (Week, Day, Category, Exercise, Sets, Reps, Intensity, Notes,
  // Video URL, plus an optional Alternate Exercise/Sets/Reps/Intensity/
  // Notes/Video URL for a same-row either/or option). The Outputs tabs call
  // their category column "Type" and their Day column can be blank (one
  // session a week) or a weekday name — both are handled here so every pull
  // path shares one code path. Creates
  // a DRAFT (active: false) rather than publishing straight to the athlete,
  // so it can be reviewed and edited first — see the Drafts Awaiting Review
  // section on the Program tab. programType determines which of the
  // athlete's 4 concurrent program slots this fills.
  async function createDraftFromRows(rows, programName, programType = 'correctives') {
    const weeksMap = {}
    rows.forEach(row => {
      const weekNums = parseWeekOrDayRange(row['Week'])
      // College Remote Athletes' rows put a day-type label ("High Intent
      // Day", "Medium Day", "Recovery Day") directly in the Day column
      // instead of a weekday name. parseWeekOrDayRange can't parse that as
      // a number, so it'd otherwise fall back to [1] for every row —
      // silently collapsing all three day types into one Day 1. Detect it
      // and give each type its own stable day bucket, tagged automatically
      // so the athlete's day-type picker (see SchedulePage) works right
      // after the pull instead of needing the coach to re-tag it by hand.
      const dayTypeKey = matchDayType(row['Day'])
      const dayNums = dayTypeKey
        ? [DAY_TYPE_DAYNUM[dayTypeKey]]
        : (row['Day'] !== undefined && row['Day'] !== '' ? parseWeekOrDayRange(row['Day']) : [1])
      const dayOptional = /\(optional\)/i.test(String(row['Day'] ?? ''))
      weekNums.forEach(wk => {
        if (!weeksMap[wk]) weeksMap[wk] = { weekNum: wk, days: {} }
        dayNums.forEach(day => {
          if (!weeksMap[wk].days[day]) {
            weeksMap[wk].days[day] = {
              dayNum: day,
              optional: dayOptional,
              exercises: [],
              ...(dayTypeKey ? { dayType: dayTypeKey } : {}),
            }
          }
          const category = row['Category'] || row['Type'] || ''
          weeksMap[wk].days[day].exercises.push({
            id:        makeExerciseId(),   // stable across later edits — see utils/programIds
            name:      row['Exercise']  || '',
            sets:      row['Sets']      || '',
            reps:      row['Reps']      || '',
            intensity: row['Intensity'] || '',
            notes:     row['Notes']     || '',
            // Per-exercise, not per-day — one day can mix Mobilization,
            // Correctives, Movement Activation and a plyo routine. See
            // constants/programTypes.js for the category taxonomy. "Type" is
            // the outputs tab's name for the same column.
            category,
            videoUrl:  row['Video URL'] || row['Video'] || '',
          })

          // The sheet can carry a second, either/or option on the same
          // row — same column names with "Alternate " in front (Alternate
          // Exercise, Alternate Sets, ...). When filled in, pair it with
          // the exercise just pushed via a shared altGroup so the athlete
          // sees them as one "choose one" slot instead of two separate
          // exercises — see utils/programIds and ProgramEditorModal's
          // "Add alt option".
          const altName = row['Alternate Exercise'] || ''
          if (altName.trim()) {
            const exercises = weeksMap[wk].days[day].exercises
            const group = makeExerciseId()
            exercises[exercises.length - 1].altGroup = group
            exercises.push({
              id:        makeExerciseId(),
              name:      altName,
              sets:      row['Alternate Sets']      || '',
              reps:      row['Alternate Reps']      || '',
              intensity: row['Alternate Intensity'] || '',
              notes:     row['Alternate Notes']     || '',
              category,
              videoUrl:  row['Alternate Video URL'] || row['Alternate Video'] || '',
              altGroup:  group,
            })
          }
        })
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
      programType,
      totalWeeks: weeks.length,
      weeks,
      // Defaults to today — the coach can adjust it in the review editor
      // before publishing, since it's what sets the athlete's Day 1.
      startDate:  new Date().toISOString().slice(0, 10),
      active:     false,
    })

    const allProgs = await getAllPrograms()
    setPrograms(allProgs.docs.map(d => ({ id: d.id, ...d.data() })))
  }

  // The coach's Sheet splits its exercise output across several tabs now —
  // Mobilization/Correctives/Movement Activation in "Pre-Throw Outputs", the
  // plyo routines in "Plyo Outputs", and one tab each for Mobility and
  // Lifting. pullOutputs needs a `tab` param and returns just that tab's
  // rows. Throwing/Post-Throw and Pre-Throw each pull two tabs and still
  // land as one program with category tiles, exactly like when it was one
  // tab; Mobility and Lifting each pull a single tab into their own program.
  const OUTPUT_PULL_GROUPS = [
    { tabs: ['Pre-Throw Outputs'],                                  programType: 'correctives', nameSuffix: 'Program',  label: 'Pre-Throw' },
    { tabs: ['Throwing/Post-Throw Outputs', 'Plyo Outputs'],   programType: 'throwing',    nameSuffix: 'Throwing', label: 'Throwing/Post-Throw' },
    { tabs: ['Lifting Outputs'],                                    programType: 'lifting',     nameSuffix: 'Lifting',  label: 'Lifting' },
    { tabs: ['Mobility Outputs'],                                   programType: 'mobility',    nameSuffix: 'Mobility', label: 'Mobility' },
  ]

  // No toast here — callers decide how to report results, since the
  // "combined" pull needs one summary toast instead of one per group.
  async function fetchOutputDraft(scriptUrl, { tabs, programType, nameSuffix, label }) {
    const results = await Promise.all(tabs.map(async (tabName) => {
      const params = new URLSearchParams()
      params.set('action', 'pullOutputs')
      params.set('tab', tabName)
      params.set('athleteName', athlete.name)
      // Apps Script occasionally just never responds — a hard timeout so
      // the button surfaces an error instead of sitting on "Working…"
      // forever with no way out but a page refresh.
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)
      let res
      try {
        res = await fetch(`${scriptUrl}?${params.toString()}`, { signal: controller.signal })
      } catch (err) {
        if (err.name === 'AbortError') throw new Error(`The sheet took too long to respond (${tabName}). Try again.`)
        throw err
      } finally {
        clearTimeout(timeoutId)
      }
      return res.json()
    }))

    const failed = results.find(r => !r.success)
    const rows = results.flatMap(r => r.program || [])
    if (!rows.length) return { label, ok: false, error: failed?.error || `No rows in ${tabs.join(' or ')}` }

    await createDraftFromRows(rows, `${athlete.name} — ${nameSuffix}`, programType)
    return { label, ok: true, count: rows.length }
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
      const result = await fetchOutputDraft(scriptUrl, group)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
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

      const results = await Promise.all(OUTPUT_PULL_GROUPS.map(group => fetchOutputDraft(scriptUrl, group)))
      const succeeded = results.filter(r => r.ok)
      const failed = results.filter(r => !r.ok)

      if (succeeded.length === 0) {
        toast.error('No rows found for this athlete in any Outputs tab.')
        return
      }
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
      const snap = await getProgramForAthlete(uid)
      const nextActive = {}
      snap.docs.forEach(d => {
        const data = d.data()
        nextActive[data.programType || 'correctives'] = { id: d.id, ...data }
      })
      setActivePrograms(nextActive)
      await syncProgramTypesFlag(nextActive)
      const allProgs = await getAllPrograms()
      setPrograms(allProgs.docs.map(d => ({ id: d.id, ...d.data() })))
      toast.success('Program assigned — this athlete has their own copy, separate from the original.')
    } catch {
      toast.error('Assignment failed.')
    } finally {
      setSaving(false)
    }
  }

  async function saveDraftWeeks(programId, weeks, startDate) {
    await updateProgram(programId, { weeks, totalWeeks: weeks.length, startDate })
    const allProgs = await getAllPrograms()
    setPrograms(allProgs.docs.map(d => ({ id: d.id, ...d.data() })))
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

      {/* College Remote Athlete Mode */}
      <div className="flex items-center justify-between gap-4 bg-white rounded-2xl border border-gray-200 px-5 py-4 mb-6">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-sp-green-100 text-sp-green-600 flex items-center justify-center flex-shrink-0">
            <GraduationCap size={17} />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">College Remote Athlete Mode</p>
            <p className="text-xs text-gray-400 mt-0.5 max-w-md">
              For athletes without a fixed schedule to plan around in advance. Instead of a
              per-week calendar, they pick the day type — High Intent, Medium, or Recovery —
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
                    <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl border border-gray-200 shadow-lg z-20 overflow-hidden">
                      <button
                        onClick={() => { setShowGenerateMenu(false); pullOutputsFromSheet() }}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 transition flex items-start gap-3"
                      >
                        <Download size={15} className="text-gray-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">Pull from Pre-Throw Outputs</p>
                          <p className="text-xs text-gray-400 mt-0.5">Mobilization, Correctives and Movement Activation merged into one program, by category.</p>
                        </div>
                      </button>
                      <button
                        onClick={() => { setShowGenerateMenu(false); pullThrowingOutputsFromSheet() }}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 transition flex items-start gap-3 border-t border-gray-50"
                      >
                        <Download size={15} className="text-gray-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">Pull from Throwing/Post-Throw Outputs</p>
                          <p className="text-xs text-gray-400 mt-0.5">Catch Play/Post-Throw plus the plyo routines, merged into one throwing program, by category.</p>
                        </div>
                      </button>
                      <button
                        onClick={() => { setShowGenerateMenu(false); pullLiftingOutputsFromSheet() }}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 transition flex items-start gap-3 border-t border-gray-50"
                      >
                        <Download size={15} className="text-gray-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">Pull from Lifting Outputs</p>
                          <p className="text-xs text-gray-400 mt-0.5">Reads the Lifting Outputs tab (with video URLs) as their lifting program.</p>
                        </div>
                      </button>
                      <button
                        onClick={() => { setShowGenerateMenu(false); pullMobilityOutputsFromSheet() }}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 transition flex items-start gap-3 border-t border-gray-50"
                      >
                        <Download size={15} className="text-gray-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">Pull from Mobility Outputs</p>
                          <p className="text-xs text-gray-400 mt-0.5">Reads the Mobility Outputs tab as their mobility program.</p>
                        </div>
                      </button>
                      <button
                        onClick={() => { setShowGenerateMenu(false); pullAllOutputsFromSheet() }}
                        className="w-full text-left px-4 py-3 hover:bg-sp-green-50 transition flex items-start gap-3 border-t border-gray-100"
                      >
                        <Sparkles size={15} className="text-sp-green-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">Pull All (combined)</p>
                          <p className="text-xs text-gray-400 mt-0.5">Runs all four pulls above in one click — each still lands as its own program, since an athlete keeps one active program per type.</p>
                        </div>
                      </button>
                    </div>
                  </>
                )}
              </div>
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

      {/* Program tab — one section per concurrent program type */}
      {tab === 'program' && (
        <div className="space-y-8">
          {PROGRAM_TYPES.map(({ key, label }) => {
            const current = activePrograms[key]
            const drafts = programs.filter(p => p.athleteId === uid && p.active === false && (p.programType || 'correctives') === key)
            // Only unassigned templates or this athlete's own (non-draft) programs
            // belong here — a program already active for a DIFFERENT athlete must
            // never show up as assignable, or "Assign" would silently steal it.
            const assignable = programs.filter(p =>
              (p.programType || 'correctives') === key &&
              p.id !== current?.id &&
              (!p.athleteId || p.athleteId === uid) &&
              !(p.active === false && p.athleteId === uid)
            )
            return (
              <div key={key} className="space-y-4">
                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">{label}</h2>

                {/* Current program of this type */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5">
                  {current ? (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{current.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {current.weeks?.length || 0} weeks ·{' '}
                          {(current.weeks || []).reduce((s, wk) => s + (wk.days || []).reduce((t, d) => t + (d.exercises?.length || 0), 0), 0)} exercises
                          {current.lastEditedAt && (
                            <> · edited {format(current.lastEditedAt.toDate?.() ?? current.lastEditedAt, 'MMM d')}</>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 bg-sp-green-100 text-sp-green-800 text-xs font-medium rounded-full">Active</span>
                        <button
                          onClick={() => openLiveProgram(current)}
                          disabled={saving}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-60 transition"
                        >
                          <Pencil size={13} /> View / Edit
                        </button>
                        <button
                          onClick={() => removeProgram(key)}
                          disabled={saving}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-500 text-xs font-medium rounded-lg hover:bg-red-50 transition"
                        >
                          <XCircle size={13} /> Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-400 text-sm">No {label.toLowerCase()} program assigned.</p>
                  )}
                </div>

                {/* Drafts awaiting review for this type — not visible to the
                    athlete until published from the editor below */}
                {drafts.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                    <h3 className="font-semibold text-amber-900 mb-3 text-sm">Drafts Awaiting Review</h3>
                    <div className="space-y-2">
                      {drafts.map((p) => (
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

                {/* Assign an existing program of this type */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 mb-3 text-sm">Assign Existing</h3>
                  <div className="space-y-2">
                    {assignable.map((p) => (
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
                    {assignable.length === 0 && (
                      <p className="text-gray-400 text-sm">No {label.toLowerCase()} programs yet. Create one in <Link to="/admin/programs" className="text-sp-green-500 underline">Programs</Link>.</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
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
