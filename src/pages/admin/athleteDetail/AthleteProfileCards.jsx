import { GraduationCap, CalendarRange, Users2 } from 'lucide-react'
import TrainingDayPicker from '../../../components/TrainingDayPicker'
import { ATHLETE_TYPES } from '../../../constants/programTypes'
import { groupColor } from '../../../constants/athleteGroups'

/**
 * The three cards above the tabs: what service tier the athlete is on, which
 * weekdays they train, and which groups they belong to.
 *
 * All three are "set it from the profile page" settings rather than fields in
 * the Edit modal, because a coach needs to change them quickly — an athlete
 * heading off to campus, or back — without clicking through a form. Every
 * write is optimistic and lives in athleteDetail/useAthleteProfileEdits,
 * whose return value arrives here as `profile`.
 */
export default function AthleteProfileCards({ groups, profile }) {
  return (
    <>
      {/* Service tier — In-House / College Remote / Premier. Purely a
          classification now: every tier runs on the same dated calendar, and
          which weekdays they train is the Training Days card below. */}
      <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 px-5 py-4 mb-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-sp-green-500/15 text-sp-green-400 flex items-center justify-center flex-shrink-0">
            <GraduationCap size={17} />
          </div>
          <div>
            <p className="font-semibold text-white text-sm">Athlete Type</p>
            <p className="text-xs text-sp-ink-300 mt-0.5 max-w-xl">
              Which service this athlete is on. Every tier follows the same dated schedule — to
              change which days they train, use Training Days below.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3" role="radiogroup" aria-label="Athlete type">
          {ATHLETE_TYPES.map(({ key, label, blurb }) => {
            const active = profile.athleteType === key
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={profile.togglingType}
                onClick={() => profile.setAthleteType(key)}
                className={`text-left rounded-xl border px-4 py-3 transition disabled:opacity-60 ${
                  active
                    ? 'border-sp-green-500 bg-sp-green-500/10'
                    : 'border-sp-ink-600 bg-sp-ink-900/40 hover:border-sp-ink-300/40'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${
                    active ? 'border-sp-green-500' : 'border-sp-ink-300/50'
                  }`}>
                    {active && <span className="w-2 h-2 rounded-full bg-sp-green-500" />}
                  </span>
                  <span className={`text-sm font-semibold ${active ? 'text-white' : 'text-sp-ink-100'}`}>{label}</span>
                </span>
                <span className="block text-xs text-sp-ink-300 mt-1.5">{blurb}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Training days — which weekdays this athlete actually trains. Drives
          where a program's day types land when pulled from the Outputs sheet
          (see utils/trainingDays), which is what used to be hardcoded as four
          consecutive days for everyone. */}
      <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 px-5 py-4 mb-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-sp-green-500/15 text-sp-green-400 flex items-center justify-center flex-shrink-0">
            <CalendarRange size={17} />
          </div>
          <div>
            <p className="font-semibold text-white text-sm">Training Days</p>
            <p className="text-xs text-sp-ink-300 mt-0.5 max-w-xl">
              The days of the week this athlete trains. A program pulled from the sheet puts its
              day types on these days, in order. Changing this affects the next pull — programs
              already built keep the days they were built with.
            </p>
          </div>
        </div>
        <TrainingDayPicker
          value={profile.ownTrainingDays}
          onToggle={profile.toggleTrainingDay}
          disabled={profile.savingDays}
          inheritedFrom={profile.inheritedPool?.name || null}
        />
      </div>

      {/* Groups — membership is a tag, so this is a row of toggles rather
          than a form: tap to add, tap again to remove, saved immediately. */}
      {groups.length > 0 && (
        <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 px-5 py-4 mb-6">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-sp-green-500/15 text-sp-green-400 flex items-center justify-center flex-shrink-0">
              <Users2 size={17} />
            </div>
            <div>
              <p className="font-semibold text-white text-sm">Groups</p>
              <p className="text-xs text-sp-ink-300 mt-0.5">
                Cohorts this athlete trains with. They can be in more than one.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {groups.map(g => {
              const c = groupColor(g.color)
              const member = profile.memberGroupIds.has(g.id)
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => profile.toggleGroup(g)}
                  disabled={profile.savingGroup === g.id}
                  aria-pressed={member}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition disabled:opacity-50 ${
                    member ? c.activeClass : 'bg-sp-ink-900/40 border-sp-ink-600 text-sp-ink-300 hover:border-sp-ink-300/40'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${member ? c.dotClass : 'bg-sp-ink-600'}`} />
                  {g.name}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
