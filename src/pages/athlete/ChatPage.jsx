import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { subscribeChat, sendMessage, markChatRead } from '../../firebase/realtime'
import { Send } from 'lucide-react'
import { format, isToday, isYesterday } from 'date-fns'
import EmptyState from '../../components/EmptyState'

export default function ChatPage() {
  const { currentUser, userProfile } = useAuth()
  const [messages, setMessages] = useState([])
  const [text, setText]         = useState('')
  const [sending, setSending]   = useState(false)
  const bottomRef               = useRef(null)

  useEffect(() => {
    if (!currentUser) return
    const unsub = subscribeChat(currentUser.uid, (msgs) => {
      setMessages(msgs)
      markChatRead(currentUser.uid, currentUser.uid)
    })
    return unsub
  }, [currentUser])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(e) {
    e.preventDefault()
    if (!text.trim() || sending) return
    setSending(true)
    try {
      await sendMessage(currentUser.uid, {
        text: text.trim(),
        senderUid:  currentUser.uid,
        senderName: userProfile?.name || 'Athlete',
        role: 'athlete',
      })
      setText('')
    } catch {
      // silently fail; retry on next attempt
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-136px)]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center">
            <EmptyState
              icon={Send}
              title="Chat with your coach"
              subtitle="Ask questions about your program, workouts, or anything else."
              compact
            />
          </div>
        )}

        {messages.map((msg, i) => {
          const isMe     = msg.senderUid === currentUser.uid
          const prev     = messages[i - 1]
          const showDate = !prev || !sameDay(prev.timestamp, msg.timestamp)
          const ts       = msg.timestamp ? new Date(msg.timestamp) : null

          return (
            <div key={msg.id}>
              {showDate && ts && (
                <div className="flex justify-center my-3">
                  <span className="text-[11px] text-gray-400 bg-gray-100 rounded-full px-3 py-1">
                    {isToday(ts) ? 'Today' : isYesterday(ts) ? 'Yesterday' : format(ts, 'MMM d')}
                  </span>
                </div>
              )}
              <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-1`}>
                <div className={`max-w-[78%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                  {!isMe && msg.senderName && (
                    <span className="text-[10px] text-gray-400 ml-1 mb-0.5">{msg.senderName}</span>
                  )}
                  <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    isMe
                      ? 'bg-brand-500 text-white rounded-br-sm'
                      : 'bg-white border border-gray-100 text-gray-900 rounded-bl-sm shadow-sm'
                  }`}>
                    {msg.text}
                  </div>
                  {ts && (
                    <span className="text-[9px] text-gray-300 mt-0.5 mx-1">
                      {format(ts, 'h:mm a')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="flex items-end gap-2 px-4 py-3 border-t border-gray-100 bg-white safe-bottom"
      >
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask your coach…"
          className="flex-1 bg-gray-100 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="btn-brand w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 active:scale-95"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  )
}

function sameDay(a, b) {
  if (!a || !b) return false
  const da = new Date(a), db = new Date(b)
  return da.getFullYear() === db.getFullYear()
    && da.getMonth() === db.getMonth()
    && da.getDate() === db.getDate()
}
