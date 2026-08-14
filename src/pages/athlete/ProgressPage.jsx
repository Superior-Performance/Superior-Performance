import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getProgramForAthlete } from '../../firebase/firestore'
import { subscribeCompletions } from '../../firebase/firestore'
import { TrendingUp, CheckCircle2, Lock } from 'lucide-react'
import EmptyState from '../../components/EmptyState'

export default function ProgressPage() {
  const { currentUser } = useAuth()
  const [program, setProgram]         = useState(null)
  const [completions, setCompletions] = useState({})
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    if (!currentUser) return
    getProgramForAthlete(currentUser.uid).then((snap) => {
      if (!snap.empty) setProgram({ id: snap.docs[0].id, ...snap.docs[0].data() })
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

  if (loading) return <PageLoader />
  if (!program) return (
    <EmptyState
      icon={TrendingUp}
      title="No program yet"
      subtitle="Progress will appear once your coach assigns a program."
    />
  )

  const weeks = program.weeks || []
  const totalDays = weeks.reduce((s, w) => s + (w.days?.length || 0), 0)
  const completedDays = Object.values(completions).filter(c => c.completed).length
  const overallPct = totalDays ? Math.round((completedDays / totalDays) * 100) : 0

  // Current week = first week with any incomplete days
  let currentWeekIdx = weeks.findIndex((w, wi) =>
    w.days?.some((_, di) => !completions[`${wi}_${di}`]?.completed)
  )
  if (currentWeekIdx === -1) currentWeekIdx = weeks.length - 1

  return (
    <div className="px-4 py-5 space-y-5">
      {/* Overall ring */}
      <div className="surface-brand relative overflow-hidden text-white rounded-2xl p-5 flex items-center gap-5">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(circle at 90% 100%, rgba(46,158,99,0.3), transparent 60%)' }}
        />
        <Ring pct={overallPct} />
        <div className="relative">
          <p className="text-xs text-white/60">Overall Progress</p>
          <p className="text-2xl font-bold">{overallPct}%</p>
          <p className="text-xs text-white/60 mt-0.5">{completedDays} of {totalDays} sessions done</p>
        </div>
      </div>

      {/* This week card */}
      {weeks[currentWeekIdx] && (() => {
        const w = weeks[currentWeekIdx]
        const weekDays = w.days?.length || 0
        const weekDone = w.days?.filter((_, di) => completions[`${currentWeekIdx}_${di}`]?.completed).length || 0
        const weekPct  = weekDays ? Math.round((weekDone / weekDays) * 100) : 0
        return (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <p className="text-xs text-gray-400 mb-0.5">This Week</p>
            <p className="font-bold text-gray-900 mb-3">Week {currentWeekIdx + 1}</p>
            <div className="flex gap-1.5">
              {w.days?.map((day, di) => {
                const done = !!completions[`${currentWeekIdx}_${di}`]?.completed
                return (
                  <div key={di} className="flex-1 flex flex-col items-center gap-1">
                    <div className={`w-full h-2 rounded-full ${done ? 'bg-sp-green-400' : 'bg-gray-100'}`} />
                    <span className="text-[9px] font-medium text-gray-400">
                      {['M','T','W','T','F','S','S'][di]}
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-gray-400 mt-3">{weekDone}/{weekDays} sessions · {weekPct}% complete</p>
          </div>
        )
      })()}

      {/* All weeks */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">All Weeks</p>
        <div className="space-y-2">
          {weeks.map((w, wi) => {
            const total = w.days?.length || 0
            const done  = w.days?.filter((_, di) => completions[`${wi}_${di}`]?.completed).length || 0
            const pct   = total ? Math.round((done / total) * 100) : 0
            const isCurrentWeek = wi === currentWeekIdx
            const isPast = wi < currentWeekIdx
            return (
              <div key={wi} className={`bg-white rounded-xl px-4 py-3 border ${isCurrentWeek ? 'border-sp-green-200' : 'border-gray-100'} shadow-sm`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {isPast
                      ? <CheckCircle2 size={15} className="text-sp-green-400" />
                      : isCurrentWeek
                        ? <div className="w-2 h-2 rounded-full bg-sp-green-500" />
                        : <Lock size={13} className="text-gray-300" />
                    }
                    <span className={`text-sm font-medium ${isCurrentWeek ? 'text-sp-green-600' : 'text-gray-700'}`}>
                      Week {wi + 1}
                      {isCurrentWeek && <span className="ml-1.5 text-[10px] bg-sp-green-100 text-sp-green-600 px-1.5 py-0.5 rounded-full">Current</span>}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">{done}/{total}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-sp-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Ring({ pct }) {
  const r  = 30
  const c  = 2 * Math.PI * r
  const dash = (pct / 100) * c
  return (
    <svg width="80" height="80" viewBox="0 0 80 80">
      <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="8" />
      <circle
        cx="40" cy="40" r={r} fill="none"
        stroke="#2E9E63" strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`}
        strokeDashoffset={c / 4}
        transform="rotate(-90 40 40)"
        style={{ transition: 'stroke-dasharray .5s ease' }}
      />
      <text x="40" y="45" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">{pct}%</text>
    </svg>
  )
}

function PageLoader() {
  return <div className="flex justify-center items-center min-h-[60vh]">
    <div className="w-8 h-8 border-2 border-sp-green-500 border-t-transparent rounded-full animate-spin" />
  </div>
}
