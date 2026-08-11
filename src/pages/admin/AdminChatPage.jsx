import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getAllAthletes } from '../../firebase/firestore'
import { subscribeChat, sendMessage, markChatRead } from '../../firebase/realtime'
import { useAuth } from '../../context/AuthContext'
import { Send, MessageCircle } from 'lucide-react'
import { format, isToday, isYesterday } from 'date-fns'

export default function AdminChatPage() {
  const { athleteUid } = useParams()
  const { currentUser, userProfile } = useAuth()
  const navigate = useNavigate()

  const [athletes, setAthletes]   = useState([])
  const [messages, setMessages]   = useState([])
  const [text, setText]           = useState('')
  const [sending, setSending]     = useState(false)
  const [selected, setSelected]   = useState(athleteUid || null)
  const bottomRef = useRef(null)

  useEffect(() => {
    getAllAthletes().then(snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setAthletes(list)
      if (!selected && list.length) setSelected(list[0].id)
    })
  }, [])

  useEffect(() => {
    if (!selected) return
    const unsub = subscribeChat(selected, (msgs) => {
      setMessages(msgs)
      markChatRead(selected, currentUser.uid)
    })
    return unsub
  }, [selected])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(e) {
    e.preventDefault()
    if (!text.trim() || !selected || sending) return
    setSending(true)
    try {
      await sendMessage(selected, {
        text: text.trim(),
        senderUid:  currentUser.uid,
        senderName: userProfile?.name || 'Coach',
        role: 'admin',
      })
      setText('')
    } finally {
      setSending(false)
    }
  }

  const selectedAthlete = athletes.find(a => a.id === selected)

  return (
    <div className="flex h-screen">
      {/* Athlete list sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        <div className="px-4 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Messages</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {athletes.map((a) => (
            <button
              key={a.id}
              onClick={() => { setSelected(a.id); navigate(`/admin/chat/${a.id}`) }}
              className={`w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition border-b border-gray-50 ${
                selected === a.id ? 'bg-brand-50 border-l-2 border-l-brand-500' : ''
              }`}
            >
              <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center font-bold text-sm flex-shrink-0">
                {a.name?.charAt(0)}
              </div>
              <div className="min-w-0">
                <p className={`text-sm font-medium truncate ${selected === a.id ? 'text-brand-600' : 'text-gray-900'}`}>{a.name}</p>
                <p className="text-xs text-gray-400 truncate">{a.email}</p>
              </div>
            </button>
          ))}
          {athletes.length === 0 && (
            <p className="px-4 py-6 text-sm text-gray-400">No athletes yet.</p>
          )}
        </div>
      </aside>

      {/* Chat panel */}
      <div className="flex-1 flex flex-col">
        {/* Chat header */}
        <div className="px-5 py-3.5 bg-white border-b border-gray-200 flex items-center gap-3">
          {selectedAthlete ? (
            <>
              <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center font-bold text-sm">
                {selectedAthlete.name?.charAt(0)}
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">{selectedAthlete.name}</p>
                <p className="text-xs text-gray-400">{selectedAthlete.email}</p>
              </div>
            </>
          ) : (
            <p className="text-gray-400 text-sm">Select an athlete</p>
          )}
        </div>

        {/* Messages */}
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <MessageCircle size={40} className="mx-auto mb-3 text-gray-200" />
              <p className="text-sm">Select an athlete to start chatting</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-1 bg-gray-50">
              {messages.length === 0 && (
                <div className="flex items-center justify-center h-full">
                  <p className="text-gray-400 text-sm">No messages yet. Start the conversation.</p>
                </div>
              )}
              {messages.map((msg, i) => {
                const isAdmin  = msg.role === 'admin'
                const prev     = messages[i - 1]
                const showDate = !prev || !sameDay(prev.timestamp, msg.timestamp)
                const ts       = msg.timestamp ? new Date(msg.timestamp) : null
                return (
                  <div key={msg.id}>
                    {showDate && ts && (
                      <div className="flex justify-center my-3">
                        <span className="text-[11px] text-gray-400 bg-white rounded-full px-3 py-1 border border-gray-100">
                          {isToday(ts) ? 'Today' : isYesterday(ts) ? 'Yesterday' : format(ts, 'MMM d')}
                        </span>
                      </div>
                    )}
                    <div className={`flex ${isAdmin ? 'justify-end' : 'justify-start'} mb-1`}>
                      <div className={`max-w-[65%] flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}>
                        {!isAdmin && <span className="text-[10px] text-gray-400 ml-1 mb-0.5">{msg.senderName}</span>}
                        <div className={`px-4 py-2.5 rounded-2xl text-sm ${
                          isAdmin
                            ? 'bg-brand-500 text-white rounded-br-sm'
                            : 'bg-white border border-gray-100 text-gray-900 rounded-bl-sm shadow-sm'
                        }`}>
                          {msg.text}
                        </div>
                        {ts && <span className="text-[9px] text-gray-400 mt-0.5 mx-1">{format(ts, 'h:mm a')}</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="flex items-center gap-3 px-5 py-4 bg-white border-t border-gray-200">
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Message athlete…"
                className="flex-1 bg-gray-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                type="submit"
                disabled={!text.trim() || sending}
                className="w-10 h-10 bg-brand-500 disabled:bg-gray-200 text-white rounded-xl flex items-center justify-center transition hover:bg-brand-600"
              >
                <Send size={16} />
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

function sameDay(a, b) {
  if (!a || !b) return false
  const da = new Date(a), db = new Date(b)
  return da.toDateString() === db.toDateString()
}
