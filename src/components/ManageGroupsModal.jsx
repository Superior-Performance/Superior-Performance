import { useState } from 'react'
import { Plus, Trash2, X, Check, Pencil } from 'lucide-react'
import toast from 'react-hot-toast'
import ConfirmDialog from './ConfirmDialog'
import { GROUP_COLORS, groupColor, suggestGroupColor } from '../constants/athleteGroups'
import { createAthleteGroup, updateAthleteGroup, deleteAthleteGroup } from '../firebase/firestore'

/**
 * Create and edit roster groups.
 *
 * Deliberately small: a name, a colour, and an optional start date for the
 * block the group is running. Membership isn't edited here — it's set from
 * the roster (select athletes → add to group) and from an athlete's own page,
 * both of which are where a coach already is when they think about it.
 *
 * Deleting a group clears it off every athlete carrying it, so the count in
 * the confirm is the number of people about to lose the tag. The athletes and
 * their programs are untouched.
 */
export default function ManageGroupsModal({ groups, athletes, onClose, onChanged }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(() => suggestGroupColor(groups))
  const [startDate, setStartDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState({ name: '', color: 'blue', startDate: '' })
  const [confirm, setConfirm] = useState(null)

  const membersOf = (groupId) => athletes.filter(a => (a.groupIds || []).includes(groupId))

  async function handleCreate(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    if (groups.some(g => g.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error('There’s already a group with that name.')
      return
    }
    setSaving(true)
    try {
      await createAthleteGroup({ name: trimmed, color, startDate: startDate || null })
      setName('')
      setStartDate('')
      setColor(suggestGroupColor([...groups, { color }]))
      await onChanged()
      toast.success(`${trimmed} created.`)
    } catch (err) {
      toast.error(err.message || 'Could not create that group.')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(group) {
    setEditingId(group.id)
    setDraft({ name: group.name, color: group.color || 'blue', startDate: group.startDate || '' })
  }

  async function saveEdit(group) {
    const trimmed = draft.name.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      await updateAthleteGroup(group.id, { name: trimmed, color: draft.color, startDate: draft.startDate || null })
      setEditingId(null)
      await onChanged()
    } catch (err) {
      toast.error(err.message || 'Could not save that change.')
    } finally {
      setSaving(false)
    }
  }

  function askDelete(group) {
    const members = membersOf(group.id)
    setConfirm({
      title: `Delete "${group.name}"?`,
      message: members.length
        ? `${members.length} athlete${members.length === 1 ? '' : 's'} will lose this tag. Their programs, schedules and history are untouched.`
        : 'Nothing is in this group yet.',
      onConfirmFn: async () => {
        try {
          await deleteAthleteGroup(group.id, members.map(a => a.id))
          await onChanged()
          toast.success(`${group.name} deleted.`)
        } catch (err) {
          toast.error(err.message || 'Could not delete that group.')
        }
      },
    })
  }

  const colorPicker = (selected, onPick) => (
    <div className="flex items-center gap-1.5">
      {GROUP_COLORS.map(c => (
        <button
          key={c.key}
          type="button"
          onClick={() => onPick(c.key)}
          aria-label={c.key}
          aria-pressed={selected === c.key}
          className={`w-5 h-5 rounded-full ${c.dotClass} transition ${
            selected === c.key ? 'ring-2 ring-offset-2 ring-offset-sp-ink-800 ring-white/70' : 'opacity-60 hover:opacity-100'
          }`}
        />
      ))}
    </div>
  )

  return (
    <div className="animate-modal-backdrop fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="animate-modal-panel bg-sp-ink-800 border border-sp-ink-600 rounded-2xl w-full max-w-lg shadow-xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-sp-ink-600">
          <div>
            <h2 className="text-lg font-bold text-white">Groups</h2>
            <p className="text-xs text-sp-ink-300 mt-0.5">
              Cohorts you train together — a camp, a team. An athlete can be in more than one.
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10 text-sp-ink-300 rounded-lg" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {groups.length === 0 && (
            <p className="text-sm text-sp-ink-300 py-4 text-center">
              No groups yet — add one below.
            </p>
          )}

          {groups.map(g => {
            const c = groupColor(g.color)
            const members = membersOf(g.id)
            const editing = editingId === g.id

            if (editing) {
              return (
                <div key={g.id} className="bg-sp-ink-900/60 border border-sp-ink-600 rounded-xl p-3 space-y-3">
                  <input
                    value={draft.name}
                    onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-sp-ink-600 rounded-lg text-sm text-sp-ink-50 bg-sp-ink-900 focus:outline-none focus:ring-2 focus:ring-sp-green-500"
                  />
                  <div className="flex items-center justify-between gap-3">
                    {colorPicker(draft.color, (key) => setDraft(d => ({ ...d, color: key })))}
                    <input
                      type="date"
                      value={draft.startDate}
                      onChange={e => setDraft(d => ({ ...d, startDate: e.target.value }))}
                      title="Block start date — offered as the default when assigning programs to this group"
                      className="px-2 py-1 border border-sp-ink-600 rounded-lg text-xs text-sp-ink-50 bg-sp-ink-900 focus:outline-none focus:ring-2 focus:ring-sp-green-500"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => saveEdit(g)}
                      disabled={saving}
                      className="btn-brand flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg"
                    >
                      <Check size={13} /> Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 text-xs text-sp-ink-300 hover:text-white transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )
            }

            return (
              <div key={g.id} className="flex items-center gap-3 bg-sp-ink-900/40 border border-sp-ink-600/60 rounded-xl px-3 py-2.5">
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${c.dotClass}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{g.name}</p>
                  <p className="text-[11px] text-sp-ink-300">
                    {members.length} athlete{members.length === 1 ? '' : 's'}
                    {g.startDate && ` · starts ${g.startDate}`}
                  </p>
                </div>
                <button
                  onClick={() => startEdit(g)}
                  className="p-1.5 text-sp-ink-300/70 hover:text-sp-green-400 transition"
                  aria-label={`Edit ${g.name}`}
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => askDelete(g)}
                  className="p-1.5 text-sp-ink-300/70 hover:text-red-400 transition"
                  aria-label={`Delete ${g.name}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )
          })}
        </div>

        <form onSubmit={handleCreate} className="px-6 py-4 border-t border-sp-ink-600 space-y-3">
          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="New group name (e.g. Winter Throwing Camp)"
              className="flex-1 px-3 py-2 border border-sp-ink-600 rounded-lg text-sm text-sp-ink-50 placeholder-sp-ink-300 bg-sp-ink-900 focus:outline-none focus:ring-2 focus:ring-sp-green-500"
            />
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="btn-brand flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg disabled:opacity-50"
            >
              <Plus size={14} /> Add
            </button>
          </div>
          <div className="flex items-center justify-between gap-3">
            {colorPicker(color, setColor)}
            <label className="flex items-center gap-2 text-xs text-sp-ink-300">
              Starts
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                title="Optional — the date this group's block begins"
                className="px-2 py-1 border border-sp-ink-600 rounded-lg text-xs text-sp-ink-50 bg-sp-ink-900 focus:outline-none focus:ring-2 focus:ring-sp-green-500"
              />
            </label>
          </div>
        </form>
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            const run = confirm.onConfirmFn
            setConfirm(null)
            await run()
          }}
        />
      )}
    </div>
  )
}
