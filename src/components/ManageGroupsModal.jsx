import { useState } from 'react'
import { Plus, Trash2, X, Check, Pencil } from 'lucide-react'
import toast from 'react-hot-toast'
import ConfirmDialog from './ConfirmDialog'
import { GROUP_COLORS, groupColor, suggestGroupColor, PREMIER_POOL, isPremierPool } from '../constants/athleteGroups'
import { createAthleteGroup, updateAthleteGroup, deleteAthleteGroup, getActiveProgramsForAthletes, updateLiveProgram } from '../firebase/firestore'
import { replaceProgramDays, skipReasonText } from '../utils/replaceProgramDays'
import { effectiveTrainingDays } from '../utils/trainingDays'
import TrainingDayPicker from './TrainingDayPicker'
import { normalizeTrainingDays, formatTrainingDays } from '../utils/trainingDays'

/**
 * Create and edit roster groups.
 *
 * Deliberately small: a name, a colour, an optional start date for the block
 * the group is running, and the weekdays the group trains on. Membership isn't
 * edited here — it's set from the roster (select athletes → add to group) and
 * from an athlete's own page, both of which are where a coach already is when
 * they think about it.
 *
 * Training days are what make this double as Premier pool management. A pool is
 * just a group whose members share a weekly schedule: set the days once here
 * and every athlete in the pool inherits them on their next program pull,
 * unless they have days of their own (see utils/trainingDays'
 * effectiveTrainingDays). That inheritance is the whole "roughly the same
 * schedule" property — the pool sets the shape, and one athlete with a class
 * conflict can differ without leaving the pool.
 *
 * Deleting a group clears it off every athlete carrying it, so the count in
 * the confirm is the number of people about to lose the tag. The athletes and
 * their programs are untouched.
 */
export default function ManageGroupsModal({ groups, athletes, onClose, onChanged }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(() => suggestGroupColor(groups))
  const [startDate, setStartDate] = useState('')
  const [trainingDays, setTrainingDays] = useState([])
  const [isPool, setIsPool] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState({ name: '', color: 'blue', startDate: '', trainingDays: [], isPool: false })
  const [confirm, setConfirm] = useState(null)
  const [replacing, setReplacing] = useState(false)

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
      await createAthleteGroup({
        name: trimmed, color, startDate: startDate || null, trainingDays,
        kind: isPool ? PREMIER_POOL : null,
      })
      setName('')
      setStartDate('')
      setTrainingDays([])
      setIsPool(false)
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
    setDraft({
      name: group.name,
      color: group.color || 'blue',
      startDate: group.startDate || '',
      trainingDays: normalizeTrainingDays(group.trainingDays),
      isPool: isPremierPool(group),
    })
  }

  async function saveEdit(group) {
    const trimmed = draft.name.trim()
    if (!trimmed) return
    const nextDays = normalizeTrainingDays(draft.trainingDays)
    const daysChanged = JSON.stringify(nextDays) !== JSON.stringify(normalizeTrainingDays(group.trainingDays))
    setSaving(true)
    try {
      await updateAthleteGroup(group.id, {
        name: trimmed,
        color: draft.color,
        startDate: draft.startDate || null,
        trainingDays: nextDays,
        kind: draft.isPool ? PREMIER_POOL : null,
      })
      setEditingId(null)
      await onChanged()
      // Saving the schedule and moving existing programs onto it are two
      // separate decisions. The days are already saved at this point and take
      // effect on the next pull either way; this only asks about programs that
      // already exist, and declining leaves them exactly as they were.
      if (daysChanged && nextDays.length) await offerReplace({ ...group, trainingDays: nextDays })
    } catch (err) {
      toast.error(err.message || 'Could not save that change.')
    } finally {
      setSaving(false)
    }
  }

  /**
   * After a pool's training days change, offer to move its athletes' existing
   * programs onto the new days.
   *
   * Only athletes who actually FOLLOW the pool are considered: someone with
   * training days of their own ignores the pool's (see effectiveTrainingDays),
   * so re-placing their program to match it would override a deliberate
   * exception the coach set for that athlete.
   *
   * The whole plan is computed before anything is written, so the confirm can
   * state exactly what will move and what won't — and nothing is touched if
   * the coach says no.
   */
  async function offerReplace(group) {
    const followers = athletes.filter(a =>
      (a.groupIds || []).includes(group.id) &&
      effectiveTrainingDays(a, [group]).join() === normalizeTrainingDays(group.trainingDays).join()
    )
    if (followers.length === 0) return

    let programs
    try {
      programs = await getActiveProgramsForAthletes(followers.map(a => a.id))
    } catch {
      toast.error('Days saved, but the existing programs could not be checked.')
      return
    }
    if (programs.length === 0) return

    const plans = programs.map(p => ({ program: p, result: replaceProgramDays(p, group.trainingDays) }))
    const movable = plans.filter(p => p.result.ok)
    const blocked = plans.filter(p => !p.result.ok && p.result.reason !== 'unchanged')

    if (movable.length === 0) {
      if (blocked.length) {
        toast(`Days saved. ${blocked.length} program${blocked.length === 1 ? '' : 's'} couldn't be moved — ${skipReasonText(blocked[0].result.reason, blocked[0].result)}.`)
      }
      return
    }

    const nameOf = (uid) => athletes.find(a => a.id === uid)?.name || 'an athlete'
    const athleteCount = new Set(movable.map(p => p.program.athleteId)).size

    setConfirm({
      title: `Move ${movable.length} existing program${movable.length === 1 ? '' : 's'} onto these days?`,
      message:
        `${formatTrainingDays(group.trainingDays)} is saved for ${group.name} and applies to everything pulled from now on.\n\n` +
        `${movable.length} program${movable.length === 1 ? '' : 's'} across ${athleteCount} athlete${athleteCount === 1 ? '' : 's'} can also be moved now — their sessions keep their day types and everything already completed, they just land on the new weekdays.` +
        (blocked.length
          ? `\n\n${blocked.length} will be left alone: ${nameOf(blocked[0].program.athleteId)}'s ${blocked[0].program.programType || 'program'} because ${skipReasonText(blocked[0].result.reason, blocked[0].result)}.`
          : ''),
      confirmLabel: 'Move them',
      onConfirmFn: async () => {
        setReplacing(true)
        let done = 0
        const failed = []
        for (const { program, result } of movable) {
          try {
            // updateLiveProgram, not updateProgram: this changes what the
            // athlete sees next time they open the app, so it should raise
            // their "your coach updated this" notice rather than move the
            // week under them silently.
            await updateLiveProgram(program.id, { weeks: result.weeks })
            done++
          } catch {
            failed.push(nameOf(program.athleteId))
          }
        }
        setReplacing(false)
        await onChanged()
        if (failed.length) toast.error(`Moved ${done}; ${failed.length} failed (${[...new Set(failed)].join(', ')}).`)
        else toast.success(`Moved ${done} program${done === 1 ? '' : 's'} onto ${formatTrainingDays(group.trainingDays)}.`)
      },
    })
  }

  function askDelete(group) {
    const members = membersOf(group.id)
    setConfirm({
      title: `Delete "${group.name}"?`,
      confirmLabel: 'Delete',
      danger: true,
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

  const toggleDay = (days, num) => normalizeTrainingDays(
    days.includes(num) ? days.filter(d => d !== num) : [...days, num]
  )

  const poolToggle = (checked, onToggle, id) => (
    <label htmlFor={id} className="flex items-center gap-2 text-xs text-sp-ink-200 cursor-pointer select-none">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={e => onToggle(e.target.checked)}
        className="w-3.5 h-3.5 rounded border-sp-ink-600 bg-sp-ink-900 text-sp-green-500 focus:ring-sp-green-500 focus:ring-offset-0"
      />
      Premier pool
      <span className="text-sp-ink-300">— shows under Premier on the roster</span>
    </label>
  )

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
              Cohorts you train together — a camp, a team, a Premier pool. Give a group training
              days and its athletes inherit that weekly schedule. An athlete can be in more than one.
            </p>
          </div>
          {/* Closing mid-run would hide a loop that is still writing to
              programs one at a time, leaving the coach unsure which athletes
              actually moved. */}
          <button
            onClick={onClose}
            disabled={replacing}
            className="p-1 hover:bg-white/10 text-sp-ink-300 rounded-lg disabled:opacity-40"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {replacing && (
          <p className="px-6 py-2 text-xs text-sp-green-300 border-b border-sp-ink-600 flex-shrink-0">
            Moving programs onto the new days…
          </p>
        )}

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
                  <div>
                    <p className="text-[11px] font-semibold text-sp-ink-300 uppercase tracking-wider mb-1.5">Training days</p>
                    <TrainingDayPicker
                      value={draft.trainingDays}
                      onToggle={(num) => setDraft(d => ({ ...d, trainingDays: toggleDay(d.trainingDays, num) }))}
                      label={`Training days for ${g.name}`}
                    />
                  </div>
                  {poolToggle(draft.isPool, (v) => setDraft(d => ({ ...d, isPool: v })), `pool-${g.id}`)}
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
                    {normalizeTrainingDays(g.trainingDays).length > 0 && ` · ${formatTrainingDays(g.trainingDays)}`}
                    {isPremierPool(g) && ' · Premier pool'}
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
          <div>
            <p className="text-[11px] font-semibold text-sp-ink-300 uppercase tracking-wider mb-1.5">
              Training days <span className="font-normal normal-case tracking-normal">— optional, inherited by members</span>
            </p>
            <TrainingDayPicker
              value={trainingDays}
              onToggle={(num) => setTrainingDays(d => toggleDay(d, num))}
              label="Training days for the new group"
            />
          </div>
          {poolToggle(isPool, setIsPool, 'new-group-pool')}
        </form>
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel || 'Confirm'}
          danger={!!confirm.danger}
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
