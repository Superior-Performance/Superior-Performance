import { useEffect, useState, useRef } from 'react'
import {
  getGeneralPrograms, getAllAthletes, getProgramsForAthlete,
  createProgram, updateProgram, deleteProgram,
} from '../../firebase/firestore'
import { Plus, Upload, Trash2, Copy, Pencil, X, FileSpreadsheet, LayoutList, AlertTriangle, Search, ChevronDown, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import Papa from 'papaparse'
import EmptyState from '../../components/EmptyState'
import ProgramEditorModal from '../../components/ProgramEditorModal'
import { PROGRAM_TYPES, programTypeInfo } from '../../constants/programTypes'
import { makeExerciseId } from '../../utils/programIds'

/**
 * Google Sheets CSV format expected:
 * Week, Day, Title, Exercise, Sets, Reps, Load, Notes, Category
 * 1, 1, Long Toss Day, Long Toss, 1, -, 90ft-150ft, Build distance gradually, Catch Play
 * 1, 1, Long Toss Day, Arm Circles, 2, 10, bodyweight, , Mobilization
 * ...
 * Category is optional — leave it blank and the exercise just won't be
 * grouped under a labeled tile in the athlete view.
 */
function parseCsvToProgram(rows) {
  const weekMap = {}
  rows.forEach((row) => {
    const weekNum = parseInt(row['Week'] || row['week'])
    const dayNum  = parseInt(row['Day']  || row['day'])
    if (!weekNum || !dayNum) return
    const wi = weekNum - 1
    const di = dayNum - 1
    if (!weekMap[wi]) weekMap[wi] = { days: {} }
    if (!weekMap[wi].days[di]) weekMap[wi].days[di] = { title: '', exercises: [] }
    const day = weekMap[wi].days[di]
    if (!day.title) day.title = row['Title'] || row['title'] || `Day ${dayNum}`
    day.exercises.push({
      id:       makeExerciseId(),   // stable across later edits — see utils/programIds
      name:     row['Exercise'] || row['exercise'] || '',
      sets:     row['Sets']     || row['sets']     || '',
      reps:     row['Reps']     || row['reps']     || '',
      load:     row['Load']     || row['load']     || '',
      notes:    row['Notes']    || row['notes']    || '',
      category: row['Category'] || row['category'] || '',
      videoUrl: row['Video URL'] || row['video url'] || row['Video'] || row['video'] || '',
    })
  })
  const weeks = []
  const maxWeek = Math.max(...Object.keys(weekMap).map(Number)) + 1
  for (let wi = 0; wi < maxWeek; wi++) {
    const weekData = weekMap[wi] || { days: {} }
    const maxDay = weekData.days ? Math.max(...Object.keys(weekData.days).map(Number), -1) + 1 : 0
    const days = []
    for (let di = 0; di < maxDay; di++) {
      days.push(weekData.days[di] || { title: `Day ${di + 1}`, exercises: [] })
    }
    weeks.push({ days })
  }
  return weeks
}

export default function AdminProgramsPage() {
  // General (unassigned template) programs — the page's primary, searchable
  // list. Athlete-specific programs are never fetched in bulk here — see
  // athleteProgramsCache below — so this page's read cost stays flat no
  // matter how many athletes or how much program history piles up.
  const [generalPrograms, setGeneralPrograms] = useState([])
  const [athletes, setAthletes]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [generalSearch, setGeneralSearch] = useState('')
  const [athleteSearch, setAthleteSearch] = useState('')
  const [expandedAthlete, setExpandedAthlete] = useState(null) // uid or null
  const [athleteProgramsCache, setAthleteProgramsCache] = useState({}) // uid -> { loading, programs }
  const [showForm, setShowForm]   = useState(false)
  const [programName, setProgramName] = useState('')
  const [programType, setProgramType] = useState('throwing')
  const [totalWeeks, setTotalWeeks]   = useState(8)
  const [startDate, setStartDate]     = useState(() => new Date().toISOString().slice(0, 10))
  const [saving, setSaving]       = useState(false)
  const [csvWeeks, setCsvWeeks]   = useState(null)
  const [editingProgram, setEditingProgram] = useState(null)
  const [deletingProgram, setDeletingProgram] = useState(null)
  const fileRef = useRef()

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    try {
      const [genSnap, athSnap] = await Promise.all([getGeneralPrograms(), getAllAthletes()])
      setGeneralPrograms(genSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)))
      setAthletes(athSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || '')))
    } finally {
      setLoading(false)
    }
  }

  async function fetchGeneralOnly() {
    const snap = await getGeneralPrograms()
    setGeneralPrograms(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)))
  }

  // Athlete-owned programs are only ever fetched for the one athlete row
  // being opened, and cached after that so re-collapsing/re-expanding
  // doesn't re-read. Archived drafts (already published — see
  // AdminAthleteDetail) are filtered out so this doesn't fill back up with
  // history that's no longer relevant.
  async function toggleAthlete(uid) {
    if (expandedAthlete === uid) { setExpandedAthlete(null); return }
    setExpandedAthlete(uid)
    if (athleteProgramsCache[uid]) return
    setAthleteProgramsCache(prev => ({ ...prev, [uid]: { loading: true, programs: [] } }))
    const snap = await getProgramsForAthlete(uid)
    const progs = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => !p.archived)
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
    setAthleteProgramsCache(prev => ({ ...prev, [uid]: { loading: false, programs: progs } }))
  }

  function invalidateAthleteCache(uid) {
    if (!uid) return
    setAthleteProgramsCache(prev => {
      if (!(uid in prev)) return prev
      const next = { ...prev }
      delete next[uid]
      return next
    })
  }

  function handleCsvImport(e) {
    const file = e.target.files[0]
    if (!file) return
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        try {
          const weeks = parseCsvToProgram(result.data)
          setCsvWeeks(weeks)
          setTotalWeeks(weeks.length)
          toast.success(`Parsed ${weeks.length} weeks from CSV!`)
        } catch {
          toast.error('Could not parse CSV. Check the format.')
        }
      },
    })
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!programName.trim()) return
    setSaving(true)
    try {
      // Build empty week structure if no CSV
      const weeks = csvWeeks || Array.from({ length: totalWeeks }, (_, i) => ({
        days: Array.from({ length: 5 }, (_, j) => ({
          title: `Day ${j + 1}`,
          exercises: [],
        })),
      }))
      const name = programName.trim()
      const ref = await createProgram({ name, weeks, programType, startDate, athleteId: null })
      setShowForm(false)
      setProgramName('')
      setProgramType('throwing')
      setStartDate(new Date().toISOString().slice(0, 10))
      setCsvWeeks(null)
      await fetchGeneralOnly()
      // Jump straight into the editor so the coach can start adding content
      // without leaving this page to assign it to an athlete first.
      setEditingProgram({ id: ref.id, name, weeks, programType, startDate, active: true, athleteId: null })
    } catch {
      toast.error('Could not create program.')
    } finally {
      setSaving(false)
    }
  }

  async function saveProgramWeeks(programId, weeks, startDate, athleteId) {
    await updateProgram(programId, { weeks, totalWeeks: weeks.length, startDate })
    if (athleteId) invalidateAthleteCache(athleteId)
    else await fetchGeneralOnly()
  }

  async function duplicateProgram(prog) {
    try {
      await createProgram({
        name: `${prog.name} (Copy)`,
        weeks: prog.weeks || [],
        programType: prog.programType || 'correctives',
        athleteId: null,
        active: true,
      })
      toast.success('Program duplicated!')
      fetchGeneralOnly()
    } catch {
      toast.error('Could not duplicate program.')
    }
  }

  async function handleDeleteProgram() {
    if (!deletingProgram) return
    try {
      await deleteProgram(deletingProgram.id)
      toast.success('Program deleted.')
      setDeletingProgram(null)
      await fetchGeneralOnly()
    } catch {
      toast.error('Could not delete program.')
    }
  }

  const filteredGeneral = generalPrograms.filter(p => p.name?.toLowerCase().includes(generalSearch.toLowerCase()))
  const filteredAthletes = athletes.filter(a => a.name?.toLowerCase().includes(athleteSearch.toLowerCase()) || a.email?.toLowerCase().includes(athleteSearch.toLowerCase()))

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Programs</h1>
          <p className="text-gray-500 text-sm mt-0.5">{generalPrograms.length} general · {athletes.length} athletes</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn-brand flex items-center gap-2 px-4 py-2 text-sm rounded-xl"
        >
          <Plus size={16} />
          New Program
        </button>
      </div>

      {/* CSV import hint */}
      <div className="bg-blue-50 rounded-xl p-3.5 mb-6 flex items-start gap-3">
        <FileSpreadsheet size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">
          <span className="font-medium">Import from Google Sheets: </span>
          export your Sheet as CSV and import it when creating a program. Expected columns:{' '}
          <code className="bg-blue-100 px-1 rounded">Week, Day, Title, Exercise, Sets, Reps, Load, Notes, Category</code> (Category optional)
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <div className="space-y-8">
          {/* General programs — the reusable library */}
          <div>
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">General Programs</h2>
            <div className="relative mb-3">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={generalSearch}
                onChange={(e) => setGeneralSearch(e.target.value)}
                placeholder="Search general programs…"
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sp-green-500 bg-white"
              />
            </div>

            {generalPrograms.length === 0 ? (
              <EmptyState icon={LayoutList} title="No general programs yet" subtitle="Create a reusable template to get started." compact />
            ) : filteredGeneral.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No matches.</p>
            ) : (
              <div className="space-y-2">
                {filteredGeneral.map((prog) => (
                  <div key={prog.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    <div
                      className="group flex items-center px-5 py-3.5 cursor-pointer hover:bg-gray-50 transition"
                      onClick={() => setEditingProgram(prog)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900 truncate">{prog.name}</p>
                          <span className="flex-shrink-0 px-2 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-semibold uppercase tracking-wide rounded-full">
                            {PROGRAM_TYPES.find(t => t.key === (prog.programType || 'correctives'))?.shortLabel || 'Correctives'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {prog.weeks?.length || 0} weeks · {prog.active ? 'Active' : 'Inactive'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button
                          onClick={(e) => { e.stopPropagation(); duplicateProgram(prog) }}
                          className="p-2 text-gray-400 hover:text-sp-green-600 hover:bg-gray-100 rounded-lg transition"
                          title="Duplicate"
                        >
                          <Copy size={15} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeletingProgram(prog) }}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-gray-100 rounded-lg transition"
                          title="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <Pencil size={14} className="text-gray-300 ml-2 flex-shrink-0" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Athlete programs — grouped per athlete instead of one flat list,
              each athlete's own programs loaded only when opened */}
          <div>
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Athlete Programs</h2>
            <div className="relative mb-3">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={athleteSearch}
                onChange={(e) => setAthleteSearch(e.target.value)}
                placeholder="Search athletes…"
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sp-green-500 bg-white"
              />
            </div>

            {athletes.length === 0 ? (
              <EmptyState icon={Users} title="No athletes yet" compact />
            ) : filteredAthletes.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No matches.</p>
            ) : (
              <div className="space-y-2">
                {filteredAthletes.map((a) => (
                  <AthleteProgramsRow
                    key={a.id}
                    athlete={a}
                    expanded={expandedAthlete === a.id}
                    onToggle={() => toggleAthlete(a.id)}
                    cacheEntry={athleteProgramsCache[a.id]}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create program modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">New Program</h2>
              <button onClick={() => { setShowForm(false); setCsvWeeks(null) }} className="p-1 hover:bg-gray-100 rounded-lg transition"><X size={18} /></button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Program Name</label>
                <input
                  type="text"
                  required
                  value={programName}
                  onChange={(e) => setProgramName(e.target.value)}
                  placeholder="e.g. 8-Week Velocity Builder"
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sp-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Program Type</label>
                <select
                  value={programType}
                  onChange={(e) => setProgramType(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sp-green-500 bg-white"
                >
                  {PROGRAM_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-1">Each athlete can have one active program per type — assigning a new one of the same type replaces their current one, not the other types.</p>
              </div>

              {!csvWeeks && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Number of Weeks</label>
                  <input
                    type="number"
                    min={1}
                    max={52}
                    value={totalWeeks}
                    onChange={(e) => setTotalWeeks(parseInt(e.target.value))}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sp-green-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sp-green-500"
                />
                <p className="text-xs text-gray-400 mt-1">Day 1 of Week 1 — adjustable later from the editor.</p>
              </div>

              {/* CSV import */}
              <div
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer hover:bg-gray-50 transition ${
                  csvWeeks ? 'border-sp-green-300 bg-sp-green-50' : 'border-gray-200'
                }`}
                onClick={() => fileRef.current?.click()}
              >
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCsvImport} />
                <Upload size={20} className={`mx-auto mb-2 ${csvWeeks ? 'text-sp-green-500' : 'text-gray-400'}`} />
                {csvWeeks ? (
                  <p className="text-sm font-medium text-sp-green-800">CSV loaded — {csvWeeks.length} weeks parsed</p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-gray-600">Import from Google Sheets CSV</p>
                    <p className="text-xs text-gray-400 mt-1">Click to upload or drag and drop</p>
                  </>
                )}
              </div>

              <p className="text-xs text-gray-400 -mt-1">
                Or skip both and start blank — you'll land in the editor next to build it out.
              </p>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowForm(false); setCsvWeeks(null) }} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition">Cancel</button>
                <button type="submit" disabled={saving} className="btn-brand flex-1 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2">
                  {saving && <Spinner sm />}
                  {saving ? 'Creating…' : 'Create & Edit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Program editor — used both right after creation and when reopening
          an existing GENERAL program from the list. Template mode (no
          `onPublish`) since programs here aren't tied to an athlete yet.
          Athlete-owned programs open from their own profile instead, where
          the live-edit safety machinery (stable exercise ids, completion-key
          migration) already lives — see AdminAthleteDetail. */}
      {editingProgram && (
        <ProgramEditorModal
          program={editingProgram}
          onClose={() => setEditingProgram(null)}
          onSave={(weeks, startDate) => saveProgramWeeks(editingProgram.id, weeks, startDate, editingProgram.athleteId)}
        />
      )}

      {/* Delete confirmation */}
      {deletingProgram && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={17} className="text-red-500" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Delete "{deletingProgram.name}"?</h2>
                <p className="text-sm text-gray-500 mt-1">This cannot be undone.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeletingProgram(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition">Cancel</button>
              <button onClick={handleDeleteProgram} className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 transition">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// One athlete's row in the "Athlete Programs" accordion — collapsed by
// default, so 100+ athletes reads as 100+ short rows rather than every one
// of their programs listed flat. Programs load lazily on first expand (see
// toggleAthlete) and only cover viewing/status; actual editing happens on
// the athlete's own profile, where the live-program safety logic lives.
function AthleteProgramsRow({ athlete, expanded, onToggle, cacheEntry }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full bg-sp-green-100 text-sp-green-600 flex items-center justify-center font-bold text-sm flex-shrink-0">
            {athlete.name?.charAt(0) || '?'}
          </div>
          <div className="text-left min-w-0">
            <p className="font-medium text-gray-900 text-sm truncate">{athlete.name}</p>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {athlete.programTypes?.length ? athlete.programTypes.map(t => (
                <span key={t} className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${programTypeInfo(t).badgeClass}`}>
                  {programTypeInfo(t).shortLabel}
                </span>
              )) : (
                <span className="text-[11px] text-gray-400">No active programs</span>
              )}
            </div>
          </div>
        </div>
        <ChevronDown size={16} className={`text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-5 py-3">
          {!cacheEntry || cacheEntry.loading ? (
            <div className="py-3 flex justify-center"><Spinner sm /></div>
          ) : cacheEntry.programs.length === 0 ? (
            <p className="text-xs text-gray-400 py-1">No programs for this athlete yet.</p>
          ) : (
            <div className="space-y-1.5 mb-2">
              {cacheEntry.programs.map((p) => (
                <div key={p.id} className="flex items-center gap-2 py-1">
                  <span className="flex-shrink-0 px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-semibold uppercase tracking-wide rounded-full">
                    {PROGRAM_TYPES.find(t => t.key === (p.programType || 'correctives'))?.shortLabel || 'Correctives'}
                  </span>
                  <p className="text-sm text-gray-700 truncate flex-1 min-w-0">{p.name}</p>
                  {!p.active && <span className="flex-shrink-0 text-[10px] text-amber-600 font-medium">Draft</span>}
                </div>
              ))}
            </div>
          )}
          <Link
            to={`/admin/athletes/${athlete.id}`}
            className="inline-flex items-center gap-1 text-xs text-sp-green-600 hover:text-sp-green-700 font-medium transition"
          >
            Open athlete profile →
          </Link>
        </div>
      )}
    </div>
  )
}

function Spinner({ sm }) {
  return <div className={`${sm ? 'w-3.5 h-3.5 border' : 'w-6 h-6 border-2'} border-current border-t-transparent rounded-full animate-spin`} />
}
