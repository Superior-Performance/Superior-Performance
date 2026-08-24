import { useEffect, useState, useRef } from 'react'
import { getAllPrograms, createProgram, updateProgram, deleteProgram } from '../../firebase/firestore'
import { Plus, Upload, Trash2, Copy, Pencil, X, FileSpreadsheet, LayoutList, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import Papa from 'papaparse'
import EmptyState from '../../components/EmptyState'
import ProgramEditorModal from '../../components/ProgramEditorModal'
import { PROGRAM_TYPES } from '../../constants/programTypes'
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
  const [programs, setPrograms]   = useState([])
  const [loading, setLoading]     = useState(true)
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

  useEffect(() => { fetchPrograms() }, [])

  async function fetchPrograms() {
    setLoading(true)
    try {
      const snap = await getAllPrograms()
      setPrograms(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } finally {
      setLoading(false)
    }
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
      await fetchPrograms()
      // Jump straight into the editor so the coach can start adding content
      // without leaving this page to assign it to an athlete first.
      setEditingProgram({ id: ref.id, name, weeks, programType, startDate, active: true, athleteId: null })
    } catch {
      toast.error('Could not create program.')
    } finally {
      setSaving(false)
    }
  }

  async function saveProgramWeeks(programId, weeks, startDate) {
    await updateProgram(programId, { weeks, totalWeeks: weeks.length, startDate })
    fetchPrograms()
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
      fetchPrograms()
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
      fetchPrograms()
    } catch {
      toast.error('Could not delete program.')
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Programs</h1>
          <p className="text-gray-500 text-sm mt-0.5">{programs.length} total</p>
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
      <div className="bg-blue-50 rounded-xl p-4 mb-6 flex items-start gap-3">
        <FileSpreadsheet size={18} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700">
          <p className="font-medium mb-0.5">Import from Google Sheets</p>
          <p className="text-blue-500">Export your Google Sheet as CSV and import it when creating a program. Expected columns: <code className="bg-blue-100 px-1 rounded text-xs">Week, Day, Title, Exercise, Sets, Reps, Load, Notes, Category</code> (Category is optional)</p>
        </div>
      </div>

      {/* Programs list */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : programs.length === 0 ? (
        <EmptyState icon={LayoutList} title="No programs yet" subtitle="Create your first one to get started." compact />
      ) : (
        <div className="space-y-3">
          {programs.map((prog) => (
            <div key={prog.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div
                className="group flex items-center px-5 py-4 cursor-pointer hover:bg-gray-50 transition"
                onClick={() => setEditingProgram(prog)}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900">{prog.name}</p>
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-semibold uppercase tracking-wide rounded-full">
                      {PROGRAM_TYPES.find(t => t.key === (prog.programType || 'correctives'))?.label || 'Correctives'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {prog.weeks?.length || 0} weeks · {prog.active ? 'Active' : 'Inactive'}
                    {prog.athleteId && <span className="ml-1.5 text-sp-green-500">· Assigned</span>}
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
          an existing program from the list. Template mode (no `onPublish`)
          since programs here aren't tied to an athlete yet. */}
      {editingProgram && (
        <ProgramEditorModal
          program={editingProgram}
          onClose={() => setEditingProgram(null)}
          onSave={(weeks, startDate) => saveProgramWeeks(editingProgram.id, weeks, startDate)}
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
                <p className="text-sm text-gray-500 mt-1">
                  {deletingProgram.athleteId && deletingProgram.active
                    ? 'This program is currently assigned to an athlete — deleting it removes it from their schedule immediately.'
                    : 'This cannot be undone.'}
                </p>
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

function Spinner({ sm }) {
  return <div className={`${sm ? 'w-3.5 h-3.5 border' : 'w-6 h-6 border-2'} border-current border-t-transparent rounded-full animate-spin`} />
}
