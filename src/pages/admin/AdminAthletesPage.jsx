import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getAllAthletes, getAllAssessments, getSettings, createUser } from '../../firebase/firestore'
import { createAthleteAuth } from '../../firebase/adminAuth'
import {
  OUTPUT_PULL_GROUPS, generateDraftProgram, generateAllDraftPrograms, sendAssessmentToIntakeSheet,
} from '../../utils/sheetPrograms'
import { Users, Plus, Search, ChevronRight, ChevronDown, X, FileSpreadsheet, Sparkles, CalendarRange } from 'lucide-react'
import toast from 'react-hot-toast'
import EmptyState from '../../components/EmptyState'
import Skeleton from '../../components/Skeleton'
import { programTypeInfo } from '../../constants/programTypes'
import Avatar from '../../components/Avatar'

// "Generate Programs" bulk menu — same 5 choices as the single-athlete
// page's "Generate Program" dropdown, so a coach who already knows that
// menu doesn't have to learn a second vocabulary for the bulk version.
const GENERATE_MENU_ITEMS = [
  ...OUTPUT_PULL_GROUPS.map(g => ({ kind: 'group', group: g, title: `Pull from ${g.label} Outputs` })),
  { kind: 'all', title: 'Pull all (combined)' },
]

export default function AdminAthletesPage() {
  const navigate = useNavigate()
  const [athletes, setAthletes] = useState([])
  const [assessments, setAssessments] = useState({}) // uid -> assessment doc data
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [showModal, setShowModal] = useState(false)

  // New user form
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole]         = useState('athlete')
  const [saving, setSaving]     = useState(false)

  // Bulk selection — a date-range filter that auto-checks matching athletes,
  // plus manual checkboxes so a coach can still adjust the set by hand.
  const [selected, setSelected] = useState(new Set())
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const [showGenerateMenu, setShowGenerateMenu] = useState(false)
  // { total, current, label, results: [{name, ok, detail}] } while a bulk
  // action is running; null otherwise. One at a time on purpose — the
  // coach's Apps Script has its own concurrency limits, and this doubles as
  // live progress instead of one opaque spinner for the whole batch.
  const [bulkRunning, setBulkRunning] = useState(null)

  useEffect(() => { fetchAthletes(); fetchAssessments() }, [])

  async function fetchAthletes() {
    setLoading(true)
    try {
      const snap = await getAllAthletes()
      setAthletes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } finally {
      setLoading(false)
    }
  }

  async function fetchAssessments() {
    const snap = await getAllAssessments()
    const map = {}
    snap.docs.forEach(d => { map[d.id] = d.data() })
    setAssessments(map)
  }

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true)
    try {
      // Use secondary auth instance so admin stays logged in
      const cred = await createAthleteAuth(email, password)
      await createUser(cred.user.uid, { name, email, role })
      toast.success(`${name} added as ${role}!`)
      setShowModal(false)
      setName(''); setEmail(''); setPassword(''); setRole('athlete')
      fetchAthletes()
    } catch (err) {
      toast.error(err.message || 'Could not create athlete.')
    } finally {
      setSaving(false)
    }
  }

  const filtered = athletes.filter(a =>
    a.name?.toLowerCase().includes(search.toLowerCase()) ||
    a.email?.toLowerCase().includes(search.toLowerCase())
  )

  const allVisibleSelected = filtered.length > 0 && filtered.every(a => selected.has(a.id))

  function toggleOne(id) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleAllVisible() {
    setSelected(prev => {
      const next = new Set(prev)
      if (allVisibleSelected) filtered.forEach(a => next.delete(a.id))
      else filtered.forEach(a => next.add(a.id))
      return next
    })
  }

  function applyDateFilter() {
    if (!dateFrom && !dateTo) { toast.error('Pick at least one date.'); return }
    const matches = filtered.filter(a => {
      const d = assessments[a.id]?.assessmentDate
      if (!d) return false
      if (dateFrom && d < dateFrom) return false
      if (dateTo && d > dateTo) return false
      return true
    })
    setSelected(new Set(matches.map(a => a.id)))
    toast(matches.length ? `${matches.length} athlete${matches.length === 1 ? '' : 's'} assessed in that range selected.` : 'No athletes assessed in that range.')
  }

  async function withScriptUrl(fn) {
    const settingsSnap = await getSettings()
    const scriptUrl = settingsSnap.exists() ? settingsSnap.data().assessmentSheetScriptUrl : ''
    if (!scriptUrl) { toast.error('No Assessment Intake script URL set. Go to Settings first.'); return }
    return fn(scriptUrl)
  }

  async function bulkSendToIntakeSheet() {
    const targets = athletes.filter(a => selected.has(a.id))
    if (!targets.length) return
    await withScriptUrl(async (scriptUrl) => {
      setBulkRunning({ total: targets.length, current: 0, label: '', results: [] })
      const results = []
      for (let i = 0; i < targets.length; i++) {
        const a = targets[i]
        setBulkRunning(prev => ({ ...prev, current: i + 1, label: a.name }))
        const assessmentData = assessments[a.id]
        if (!assessmentData) { results.push({ name: a.name, ok: false, detail: 'No assessment on file' }); continue }
        try {
          const json = await sendAssessmentToIntakeSheet(scriptUrl, a.name, assessmentData)
          results.push({ name: a.name, ok: !!json.success, detail: json.success ? 'Logged' : (json.error || 'Sheet rejected the row') })
        } catch (err) {
          results.push({ name: a.name, ok: false, detail: err.message || 'Network error' })
        }
      }
      finishBulk(results, (n, total) => `Sent ${n} of ${total} to the Assessment Intake sheet` + (n < total ? ` — ${total - n} failed.` : '.'))
    })
  }

  async function bulkGenerate(item) {
    const targets = athletes.filter(a => selected.has(a.id))
    if (!targets.length) return
    setShowGenerateMenu(false)
    await withScriptUrl(async (scriptUrl) => {
      setBulkRunning({ total: targets.length, current: 0, label: '', results: [] })
      const results = []
      for (let i = 0; i < targets.length; i++) {
        const a = targets[i]
        setBulkRunning(prev => ({ ...prev, current: i + 1, label: a.name }))
        try {
          if (item.kind === 'all') {
            const groupResults = await generateAllDraftPrograms(scriptUrl, a.id, a.name)
            const ok = groupResults.filter(r => r.ok)
            results.push({ name: a.name, ok: ok.length > 0, detail: ok.length ? `${ok.length}/${groupResults.length} types` : 'No rows found' })
          } else {
            const r = await generateDraftProgram(scriptUrl, a.id, a.name, item.group)
            results.push({ name: a.name, ok: r.ok, detail: r.ok ? `${r.count} rows` : r.error })
          }
        } catch (err) {
          results.push({ name: a.name, ok: false, detail: err.message || 'Network error' })
        }
      }
      finishBulk(results, (n, total) =>
        `Generated drafts for ${n} of ${total} athletes — review each in Drafts Awaiting Review before publishing.` +
        (n < total ? ` ${total - n} had no matching rows.` : '')
      )
    })
  }

  function finishBulk(results, message) {
    setBulkRunning(null)
    const n = results.filter(r => r.ok).length
    const failures = results.filter(r => !r.ok)
    if (n === 0) toast.error(message(n, results.length))
    else toast.success(message(n, results.length))
    if (failures.length) console.error('Bulk action failures:', failures)
  }

  return (
    <div className="p-8 bg-sp-ink-900 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sp-green-500/15 text-sp-green-400 flex items-center justify-center flex-shrink-0">
            <Users size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Athletes</h1>
            <p className="text-sp-ink-300 text-sm">{athletes.length} total</p>
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="btn-brand flex items-center gap-2 px-4 py-2 text-sm rounded-xl"
        >
          <Plus size={16} />
          Add Athlete
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-sp-ink-300" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search athletes…"
          className="w-full pl-9 pr-4 py-2.5 border border-sp-ink-600 rounded-xl text-sm text-sp-ink-50 placeholder-sp-ink-300 focus:outline-none focus:ring-2 focus:ring-sp-green-500 bg-sp-ink-800"
        />
      </div>

      {/* Bulk selection: date-range filter */}
      <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-sp-ink-800 border border-sp-ink-600 rounded-xl">
        <CalendarRange size={16} className="text-sp-ink-300 flex-shrink-0" />
        <span className="text-xs font-medium text-sp-ink-300 uppercase tracking-wide mr-1">Assessed</span>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="px-2.5 py-1.5 border border-sp-ink-600 rounded-lg text-sm text-sp-ink-50 bg-sp-ink-900 focus:outline-none focus:ring-2 focus:ring-sp-green-500"
        />
        <span className="text-sp-ink-300 text-sm">–</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="px-2.5 py-1.5 border border-sp-ink-600 rounded-lg text-sm text-sp-ink-50 bg-sp-ink-900 focus:outline-none focus:ring-2 focus:ring-sp-green-500"
        />
        <button
          onClick={applyDateFilter}
          className="px-3 py-1.5 border border-sp-ink-600 text-sp-ink-100 rounded-lg text-sm font-medium hover:bg-white/5 transition"
        >
          Apply
        </button>
        {selected.size > 0 && (
          <button
            onClick={() => setSelected(new Set())}
            className="text-sm text-sp-ink-300 hover:text-sp-ink-100 transition ml-1"
          >
            Clear selection
          </button>
        )}
        <span className="ml-auto text-sm font-medium text-sp-ink-100">{selected.size > 0 ? `${selected.size} selected` : ''}</span>
      </div>

      {/* Bulk action bar — only shown once something is selected */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-sp-green-500/10 border border-sp-green-500/30 rounded-xl">
          <span className="text-sm text-sp-ink-100">
            <strong>{selected.size}</strong> athlete{selected.size === 1 ? '' : 's'} selected
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={bulkSendToIntakeSheet}
              disabled={!!bulkRunning}
              className="flex items-center gap-2 px-3.5 py-2 border border-sp-ink-600 text-sp-ink-100 rounded-xl text-sm font-medium hover:bg-white/5 disabled:opacity-50 transition"
            >
              <FileSpreadsheet size={15} />
              Send to Intake Sheet
            </button>
            <div className="relative">
              <button
                onClick={() => setShowGenerateMenu(v => !v)}
                disabled={!!bulkRunning}
                className="btn-brand flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm disabled:opacity-50"
              >
                <Sparkles size={15} />
                Generate Programs
                <ChevronDown size={14} />
              </button>
              {showGenerateMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowGenerateMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 w-64 bg-sp-ink-800 border border-sp-ink-600 rounded-xl shadow-xl z-20 overflow-hidden">
                    {GENERATE_MENU_ITEMS.map((item, i) => (
                      <button
                        key={i}
                        onClick={() => bulkGenerate(item)}
                        className="w-full text-left px-4 py-2.5 text-sm text-sp-ink-100 hover:bg-white/5 transition border-b border-sp-ink-600/60 last:border-b-0"
                      >
                        {item.title}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bulk progress */}
      {bulkRunning && (
        <div className="mb-4 p-4 bg-sp-ink-800 border border-sp-ink-600 rounded-xl">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-sp-ink-100 font-medium">Working on {bulkRunning.label}…</span>
            <span className="text-sp-ink-300">{bulkRunning.current} / {bulkRunning.total}</span>
          </div>
          <div className="h-1.5 bg-sp-ink-600 rounded-full overflow-hidden">
            <div
              className="h-full bg-sp-green-500 transition-all"
              style={{ width: `${(bulkRunning.current / bulkRunning.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 overflow-hidden divide-y divide-sp-ink-600/60">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5">
              <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-44" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full flex-shrink-0" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Users} title="No athletes found" subtitle="Add your first athlete to get started." compact dark />
      ) : (
        <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sp-ink-600 bg-white/[0.03]">
                <th className="px-5 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    className="w-4 h-4 rounded accent-sp-green-500 cursor-pointer"
                    aria-label="Select all visible athletes"
                  />
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-sp-ink-300 uppercase tracking-wider">Name</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-sp-ink-300 uppercase tracking-wider">Email</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-sp-ink-300 uppercase tracking-wider">Assessed</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-sp-ink-300 uppercase tracking-wider">Program</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-sp-ink-600/60">
              {filtered.map((a) => (
                <tr
                  key={a.id}
                  className={`hover:bg-white/[0.04] transition cursor-pointer ${selected.has(a.id) ? 'bg-sp-green-500/[0.06]' : ''}`}
                  onClick={() => navigate(`/admin/athletes/${a.id}`)}
                >
                  <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(a.id)}
                      onChange={() => toggleOne(a.id)}
                      className="w-4 h-4 rounded accent-sp-green-500 cursor-pointer"
                      aria-label={`Select ${a.name}`}
                    />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={a.name} photoURL={a.photoURL} size={8} />
                      <span className="font-medium text-white hover:text-sp-green-400 transition">{a.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-sp-ink-300">{a.email}</td>
                  <td className="px-5 py-3.5 text-sp-ink-300">
                    {assessments[a.id]?.assessmentDate || <span className="text-sp-ink-300/60">—</span>}
                  </td>
                  <td className="px-5 py-3.5">
                    {a.programTypes?.length ? (
                      <div className="flex flex-wrap gap-2">
                        {a.programTypes.map(t => (
                          <span key={t} className="inline-flex items-center gap-1.5 text-xs font-medium text-sp-ink-100">
                            <span className={`w-1.5 h-1.5 rounded-full ${programTypeInfo(t).dotClass}`} />
                            {programTypeInfo(t).shortLabel}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-sp-ink-300/60">None</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <span className="inline-flex items-center gap-1 text-sp-green-400 text-sm font-medium">
                      View <ChevronRight size={14} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add athlete modal */}
      {showModal && (
        <Modal title="Add User" onClose={() => setShowModal(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            {/* Role toggle */}
            <div>
              <label className="block text-sm font-medium text-sp-ink-100 mb-1.5">Role</label>
              <div className="flex rounded-xl border border-sp-ink-600 overflow-hidden">
                {['athlete', 'admin'].map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`flex-1 py-2.5 text-sm font-semibold capitalize transition ${
                      role === r
                        ? 'bg-sp-green-500 text-white'
                        : 'bg-sp-ink-800 text-sp-ink-300 hover:bg-white/5'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Full Name" value={name} onChange={setName} placeholder="John Smith" required />
            <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="john@email.com" required />
            <Field label="Temporary Password" type="password" value={password} onChange={setPassword} placeholder="Min 6 characters" required minLength={6} />
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-sp-ink-600 text-sp-ink-100 rounded-xl text-sm font-medium hover:bg-white/5 transition">Cancel</button>
              <button type="submit" disabled={saving} className="btn-brand flex-1 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2">
                {saving && <Spinner sm />} {saving ? 'Creating…' : `Create ${role === 'admin' ? 'Admin' : 'Athlete'}`}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function Field({ label, value, onChange, ...props }) {
  return (
    <div>
      <label className="block text-sm font-medium text-sp-ink-100 mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3.5 py-2.5 border border-sp-ink-600 rounded-xl text-sm text-sp-ink-50 placeholder-sp-ink-300 bg-sp-ink-900 focus:outline-none focus:ring-2 focus:ring-sp-green-500"
        {...props}
      />
    </div>
  )
}

function Modal({ title, children, onClose }) {
  return (
    <div className="animate-modal-backdrop fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="animate-modal-panel bg-sp-ink-800 border border-sp-ink-600 rounded-2xl w-full max-w-md p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/10 text-sp-ink-300 rounded-lg transition"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Spinner({ sm }) {
  return <div className={`${sm ? 'w-3.5 h-3.5 border' : 'w-6 h-6 border-2'} border-current border-t-transparent rounded-full animate-spin`} />
}
