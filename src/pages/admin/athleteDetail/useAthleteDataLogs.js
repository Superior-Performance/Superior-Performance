import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { addDataLog, setDataLogFlag, updateUser } from '../../../firebase/firestore'
import { downloadSeasonReport } from '../../../utils/seasonReport'

/**
 * The Data Logs tab's writes: body weight / velo entries, the coach's
 * follow-up flags, the coach-set goals, and the season report export.
 *
 * Admin-side body weight / velo entry goes to the same dataLogs collection
 * the athlete's own Progress tab writes to, so it shows up in both places
 * immediately (see firestore.rules for the matching write permission).
 *
 * `logs` stays owned by the page, which fetches them in the same batch as
 * everything else on load; this hook only ever hands back an updated copy
 * (the optimistic flag toggle) or asks for a reload.
 */
export function useAthleteDataLogs({ uid, athlete, setAthlete, logs, setLogs, programs, completions, reload }) {
  const [showAddLog, setShowAddLog] = useState(false)
  const [logType, setLogType]       = useState('velo')
  const [logValue, setLogValue]     = useState('')
  const [logDate, setLogDate]       = useState('')
  const [logNotes, setLogNotes]     = useState('')
  const [logSaving, setLogSaving]   = useState(false)
  // Coach-set targets shown as a reference line on the athlete's own trend
  // charts (see TrendChart's `goal` prop) — admin-only, like every other
  // users/{uid} field besides photoURL (see firestore.rules).
  const [goalVelo, setGoalVelo]     = useState('')
  const [goalWeight, setGoalWeight] = useState('')
  const [savingGoals, setSavingGoals] = useState(false)
  const [exportingReport, setExportingReport] = useState(false)

  // Sync the goal inputs whenever a fresh athlete doc comes in (initial
  // load, or after load() re-runs) — not on every keystroke.
  useEffect(() => {
    setGoalVelo(athlete?.goals?.velo ?? '')
    setGoalWeight(athlete?.goals?.weight ?? '')
  }, [athlete?.goals?.velo, athlete?.goals?.weight])

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
      reload()
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

  // A season summary as CSV — see utils/seasonReport for the row layout.
  // Only the button state and the failure toast live here.
  function exportSeasonReport() {
    setExportingReport(true)
    try {
      downloadSeasonReport({ athlete, athleteId: uid, programs, completions, logs })
    } catch (err) {
      console.error('Could not build season report:', err)
      toast.error('Could not export report.')
    } finally {
      setExportingReport(false)
    }
  }

  return {
    showAddLog, setShowAddLog,
    logType, setLogType,
    logValue, setLogValue,
    logDate, setLogDate,
    logNotes, setLogNotes,
    logSaving,
    goalVelo, setGoalVelo,
    goalWeight, setGoalWeight,
    savingGoals,
    exportingReport,
    toggleLogFlag, openAddLog, handleAddLog, saveGoals, exportSeasonReport,
  }
}
