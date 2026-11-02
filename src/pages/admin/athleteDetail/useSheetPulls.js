import { useState } from 'react'
import toast from 'react-hot-toast'
import { getSettings } from '../../../firebase/settings'
import { effectiveTrainingDays } from '../../../utils/trainingDays'
import {
  OUTPUT_PULL_GROUPS, generateDraftProgram, generateAllDraftPrograms, sendAssessmentToIntakeSheet,
} from '../../../utils/sheetPrograms'

/**
 * The athlete page's Google Sheet traffic: logging an assessment to the
 * Intake sheet, and pulling the Outputs tabs back as draft programs.
 *
 * Sheet-sync logic (Week/Day parsing, row→program building, the fetch +
 * draft-creation calls) lives in utils/sheetPrograms.js, shared with the
 * roster's bulk "Send to Intake Sheet" / "Generate Programs" actions — this
 * hook just supplies the UI concerns (toasts, per-button loading state,
 * refreshing this athlete's program list after a draft lands).
 *
 * A hook rather than a component so the in-flight flags live in the page's
 * own state: a pull started on the Assessment tab keeps showing "Working…"
 * even if the coach clicks through to another tab while it runs.
 */
export function useSheetPulls({ uid, athlete, assessment, programs, groups, refreshPrograms }) {
  const [sendingToSheet, setSendingToSheet] = useState(false)
  const [pullingOutputs, setPullingOutputs]         = useState(false)
  const [pullingThrowingOutputs, setPullingThrowingOutputs] = useState(false)
  const [pullingMobilityOutputs, setPullingMobilityOutputs] = useState(false)
  const [pullingLiftingOutputs, setPullingLiftingOutputs]   = useState(false)
  const [pullingAllOutputs, setPullingAllOutputs]           = useState(false)
  const [showGenerateMenu, setShowGenerateMenu]     = useState(false)

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
      // Pass the athlete's training days (their own, else their pool's) so the
      // sheet's day types land on the weekdays they actually train.
      const result = await generateDraftProgram(scriptUrl, uid, athlete.name, group, programs, null, effectiveTrainingDays(athlete, groups))
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
      // Always resync, including after a failure: a pull that threw part-way
      // can still have written or removed documents, and holding on to ids
      // that no longer exist is what made the next save fail permanently.
      await refreshPrograms().catch(() => {})
      setPulling(false)
    }
  }

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

      const results = await generateAllDraftPrograms(scriptUrl, uid, athlete.name, programs, null, effectiveTrainingDays(athlete, groups))
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
      await refreshPrograms().catch(() => {})
      setPullingAllOutputs(false)
    }
  }

  return {
    sendingToSheet,
    sendToIntakeSheet,
    showGenerateMenu,
    setShowGenerateMenu,
    // Any sheet pull in flight — every entry in the Generate menu shares one
    // disabled state, since they all write drafts for the same athlete.
    anyPulling: pullingOutputs || pullingThrowingOutputs || pullingMobilityOutputs || pullingLiftingOutputs || pullingAllOutputs,
    pullOutputsFromSheet:         () => pullOneGroup(OUTPUT_PULL_GROUPS[0], setPullingOutputs),
    pullThrowingOutputsFromSheet: () => pullOneGroup(OUTPUT_PULL_GROUPS[1], setPullingThrowingOutputs),
    pullLiftingOutputsFromSheet:  () => pullOneGroup(OUTPUT_PULL_GROUPS[2], setPullingLiftingOutputs),
    pullMobilityOutputsFromSheet: () => pullOneGroup(OUTPUT_PULL_GROUPS[3], setPullingMobilityOutputs),
    pullAllOutputsFromSheet,
  }
}
