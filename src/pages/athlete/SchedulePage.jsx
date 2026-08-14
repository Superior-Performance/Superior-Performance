import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getProgramForAthlete } from '../../firebase/firestore'
import { subscribeCompletions, markWorkoutComplete } from '../../firebase/firestore'
import { CheckCircle2, Circle, ChevronDown, ChevronUp, Dumbbell, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import { format, startOfWeek, addDays } from 'date-fns'
import EmptyState from '../../components/EmptyState'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function SchedulePage() {
  const { currentUser } = useAuth()
  const [program, setProgram]         = useState(null)
  const [completions, setCompletions] = useState({})
  const [expanded, setExpanded]       = useState(null)
  const [loading, setLoading]         = useState(true)
  const [currentWeek, setCurrentWeek] = useState(0)

  useEffect(() => {
    if (!currentUser) return
    getProgramForAthlete(currentUser.uid).then((snap) => {
      if (!snap.empty) {
        const doc = snap.docs[0]
        setProgram({ id: doc.id, ...doc.data() })
      }
      setLoading(false)
    })
  }, [currentUser])

  useEffect(() => {
    if (!currentUser) return
    return subscribeCompletions(currentUser.uid, (snap) => {
      const map = {}
      snap.forEach((d) => { map[d.id] = d.data() })
      setCompletions(map)
    })
  }, [currentUser])

  async function toggleComplete(weekIdx, dayIdx) {
    const key = `${weekIdx}_${dayIdx}`
    if (completions[key]?.completed) return
    try {
      await markWorkoutComplete(currentUser.uid, weekIdx, dayIdx)
      toast.success('Workout marked complete! 💪')
    } catch {
      toast.error('Could not save. Try again.')
    }
  }

  if (loading) return <PageLoader />

  if (!program) {
    return (
      <EmptyState
        icon={Dumbbell}
        title="No program assigned yet"
        subtitle="Your coach will assign a program soon."
      />
    )
  }

  const week = program.weeks?.[currentWeek]
  const totalWeeks = program.weeks?.length || 1
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })

  return (
    <div className="px-4 py-5">
      {/* Program header */}
      <div className="surface-brand relative overflow-hidden text-white rounded-2xl p-4 mb-5">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(circle at 90% 0%, rgba(107,140,255,0.3), transparent 60%)' }}
        />
        <div className="relative">
          <p className="text-xs text-white/60 mb-0.5">Active Program</p>
          <h1 className="font-bold text-lg leading-tight">{program.name}</h1>
          <div className="flex items-center gap-3 mt-3">
            <div className="flex-1 bg-white/10 rounded-full h-2">
              <div
                className="bg-green-400 h-2 rounded-full transition-all"
                style={{ width: `${Math.round((currentWeek / totalWeeks) * 100)}%` }}
              />
            </div>
            <span className="text-xs font-medium text-white/70">
              Week {currentWeek + 1}/{totalWeeks}
            </span>
          </div>
        </div>
      </div>

      {/* Week selector */}
      <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar pb-1">
        {Array.from({ length: totalWeeks }, (_, i) => (
          <button
            key={i}
            onClick={() => setCurrentWeek(i)}
            className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition ${
              currentWeek === i
                ? 'bg-brand-500 text-white'
                : 'bg-white border border-gray-200 text-gray-600'
            }`}
          >
            Wk {i + 1}
          </button>
        ))}
      </div>

      {/* Day cards */}
      <div className="space-y-3">
        {week?.days?.map((day, dayIdx) => {
          const key       = `${currentWeek}_${dayIdx}`
          const done      = !!completions[key]?.completed
          const isExpanded = expanded === key
          const date      = addDays(weekStart, dayIdx)

          return (
            <div
              key={dayIdx}
              className={`bg-white rounded-2xl overflow-hidden shadow-sm border transition ${
                done ? 'border-green-200' : 'border-gray-100'
              }`}
            >
              {/* Day header */}
              <div
                className="flex items-center px-4 py-3.5 cursor-pointer select-none"
                onClick={() => setExpanded(isExpanded ? null : key)}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center mr-3 flex-shrink-0 ${
                  done ? 'bg-green-100' : 'bg-gray-100'
                }`}>
                  {done
                    ? <CheckCircle2 size={20} className="text-green-500" />
                    : <span className="text-xs font-bold text-gray-500">{DAYS[dayIdx]}</span>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{day.title || `Day ${dayIdx + 1}`}</p>
                  <p className="text-xs text-gray-400">{format(date, 'EEEE, MMM d')} · {day.exercises?.length || 0} exercises</p>
                </div>
                <div className="flex items-center gap-2">
                  {!done && (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleComplete(currentWeek, dayIdx) }}
                      className="text-xs bg-brand-50 text-brand-500 font-medium px-3 py-1 rounded-full hover:bg-brand-100 transition"
                    >
                      Done
                    </button>
                  )}
                  {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                </div>
              </div>

              {/* Exercises */}
              {isExpanded && day.exercises?.length > 0 && (
                <div className="border-t border-gray-100 divide-y divide-gray-50">
                  {day.exercises.map((ex, i) => (
                    <div key={i} className="px-4 py-3 flex items-start gap-3">
                      <div className="w-7 h-7 bg-brand-50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Zap size={14} className="text-brand-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-gray-900">{ex.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {[ex.sets && `${ex.sets} sets`, ex.reps && `${ex.reps} reps`, ex.load, ex.notes]
                            .filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {isExpanded && (!day.exercises || day.exercises.length === 0) && (
                <div className="px-4 pb-4 text-sm text-gray-400">No exercises listed.</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PageLoader() {
  return (
    <div className="flex justify-center items-center min-h-[60vh]">
      <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
