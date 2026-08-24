import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getAllAthletes, createUser } from '../../firebase/firestore'
import { createAthleteAuth } from '../../firebase/adminAuth'
import { Users, Plus, Search, ChevronRight, X } from 'lucide-react'
import toast from 'react-hot-toast'
import EmptyState from '../../components/EmptyState'
import { programTypeInfo } from '../../constants/programTypes'

export default function AdminAthletesPage() {
  const navigate = useNavigate()
  const [athletes, setAthletes] = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [showModal, setShowModal] = useState(false)

  // New user form
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole]         = useState('athlete')
  const [saving, setSaving]     = useState(false)

  useEffect(() => { fetchAthletes() }, [])

  async function fetchAthletes() {
    setLoading(true)
    try {
      const snap = await getAllAthletes()
      setAthletes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } finally {
      setLoading(false)
    }
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

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Athletes</h1>
          <p className="text-gray-500 text-sm mt-0.5">{athletes.length} total</p>
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
      <div className="relative mb-5">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search athletes…"
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sp-green-500 bg-white"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Users} title="No athletes found" subtitle="Add your first athlete to get started." compact />
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Program</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => navigate(`/admin/athletes/${a.id}`)}
                  className="hover:bg-gray-50 transition cursor-pointer"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-sp-green-100 text-sp-green-600 flex items-center justify-center font-bold text-sm">
                        {a.name?.charAt(0) || '?'}
                      </div>
                      <span className="font-medium text-gray-900 hover:text-sp-green-600 transition">{a.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500">{a.email}</td>
                  <td className="px-5 py-3.5">
                    {a.programTypes?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {a.programTypes.map(t => (
                          <span key={t} className={`px-2 py-1 text-xs font-medium rounded-full ${programTypeInfo(t).badgeClass}`}>
                            {programTypeInfo(t).shortLabel}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="px-2 py-1 bg-gray-100 text-gray-400 text-xs font-medium rounded-full">None</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <span className="inline-flex items-center gap-1 text-sp-green-500 text-sm font-medium">
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
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Role</label>
              <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                {['athlete', 'admin'].map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`flex-1 py-2.5 text-sm font-semibold capitalize transition ${
                      role === r
                        ? 'bg-sp-green-500 text-white'
                        : 'bg-white text-gray-500 hover:bg-gray-50'
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
              <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition">Cancel</button>
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
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sp-green-500"
        {...props}
      />
    </div>
  )
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Spinner({ sm }) {
  return <div className={`${sm ? 'w-3.5 h-3.5 border' : 'w-6 h-6 border-2'} border-current border-t-transparent rounded-full animate-spin`} />
}
