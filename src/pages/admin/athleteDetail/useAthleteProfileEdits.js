import { useState } from 'react'
import toast from 'react-hot-toast'
import { updateUser, addAthleteToGroup, removeAthleteFromGroup } from '../../../firebase/firestore'
import { athleteTypeOf, athleteTypeInfo } from '../../../constants/programTypes'
import { normalizeTrainingDays } from '../../../utils/trainingDays'

/**
 * Service tier, training days and group membership for one athlete — the
 * three settings the profile page edits in place rather than through the Edit
 * modal, since a coach needs to change them quickly (an athlete heading off
 * to campus, or back) without clicking through a form.
 *
 * Every write here is optimistic and reverts on failure: these are one-tap
 * controls, and waiting on a round trip to see a radio button move reads as
 * the click not registering.
 */
export function useAthleteProfileEdits({ uid, athlete, setAthlete, groups }) {
  const [togglingType, setTogglingType] = useState(false)
  const [savingGroup, setSavingGroup] = useState(null)
  const [savingDays, setSavingDays] = useState(false)

  // Switching tiers no longer changes what the athlete sees. College Remote
  // used to put them on an entirely separate dateless screen; every tier now
  // runs the one dated calendar, and the thing that actually differs between
  // a remote guy and an in-house guy — which weekdays they train — is the
  // Training Days card. Switching tiers is therefore safe at any time and
  // touches no program content.
  const athleteType = athleteTypeOf(athlete)

  // Which groups exist is passed in, so the chips can offer every one of
  // them — membership itself is on the athlete doc (groupIds).
  const memberGroupIds = new Set(athlete?.groupIds || [])

  // The athlete's own training days, or the pool's if they have none of their
  // own — see effectiveTrainingDays. This is what a program pull uses to decide
  // which weekday each day type lands on.
  const ownTrainingDays = normalizeTrainingDays(athlete?.trainingDays)
  const inheritedPool = ownTrainingDays.length
    ? null
    : groups.find(g => (athlete?.groupIds || []).includes(g.id) && normalizeTrainingDays(g.trainingDays).length)

  async function toggleGroup(group) {
    const isMember = memberGroupIds.has(group.id)
    setSavingGroup(group.id)
    const prev = athlete.groupIds || []
    setAthlete(a => ({
      ...a,
      groupIds: isMember ? prev.filter(id => id !== group.id) : [...prev, group.id],
    })) // optimistic
    try {
      if (isMember) await removeAthleteFromGroup(uid, group.id)
      else await addAthleteToGroup(uid, group.id)
    } catch {
      setAthlete(a => ({ ...a, groupIds: prev }))
      toast.error('Could not update groups.')
    } finally {
      setSavingGroup(null)
    }
  }

  async function setAthleteType(nextType) {
    if (nextType === athleteType) return
    setTogglingType(true)
    const prevType = athlete.athleteType
    setAthlete(a => ({ ...a, athleteType: nextType })) // optimistic
    try {
      await updateUser(uid, { athleteType: nextType })
      toast.success(`Switched to ${athleteTypeInfo(nextType).label}.`)
    } catch {
      setAthlete(a => ({ ...a, athleteType: prevType }))
      toast.error('Could not update athlete type.')
    } finally {
      setTogglingType(false)
    }
  }

  async function toggleTrainingDay(num) {
    const next = ownTrainingDays.includes(num)
      ? ownTrainingDays.filter(d => d !== num)
      : [...ownTrainingDays, num]
    const normalized = normalizeTrainingDays(next)
    setSavingDays(true)
    const prev = athlete.trainingDays
    setAthlete(a => ({ ...a, trainingDays: normalized })) // optimistic
    try {
      await updateUser(uid, { trainingDays: normalized })
    } catch {
      setAthlete(a => ({ ...a, trainingDays: prev }))
      toast.error('Could not update training days.')
    } finally {
      setSavingDays(false)
    }
  }

  return {
    athleteType, setAthleteType, togglingType,
    memberGroupIds, toggleGroup, savingGroup,
    ownTrainingDays, inheritedPool, toggleTrainingDay, savingDays,
  }
}
