import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  subscribeTeamChat, sendTeamChatMessage, markTeamChatRead, TEAM_CHAT_WINDOW,
} from '../../firebase/firestore'
import { parseMentions, splitOnMentions, agentMentions } from '../../utils/teamChat'
import { Send, Bot, Users, AtSign, Clock } from 'lucide-react'
import { format, isToday, isYesterday } from 'date-fns'
import EmptyState from '../../components/EmptyState'
import toast from 'react-hot-toast'

// Firestore Timestamps resolve only once the server confirms the write, so a
// just-sent message arrives via the optimistic snapshot with createdAt null.
const toDate = (ts) => ts?.toDate?.() ?? null

export default function AdminTeamChatPage() {
  const { currentUser, userProfile } = useAuth()
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => subscribeTeamChat(setMessages), [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Reading the room is the act of opening it — re-marked as messages land so
  // the badge doesn't reappear while someone is sitting on the page watching.
  useEffect(() => {
    if (currentUser) markTeamChatRead(currentUser.uid).catch(() => {})
  }, [currentUser, messages.length])

  async function handleSend(e) {
    e.preventDefault()
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    try {
      await sendTeamChatMessage({
        text: body,
        authorId: currentUser.uid,
        authorName: userProfile?.name || 'Coach',
        authorType: 'human',
        mentions: parseMentions(body),
      })
      setText('')
    } catch (err) {
      console.error('Team chat send failed:', err)
      toast.error('Message could not be sent. Try again.')
    } finally {
      setSending(false)
    }
  }

  function insertMention() {
    setText(t => (t.trim() ? `${t.replace(/\s+$/, '')} @atlas ` : '@atlas '))
    inputRef.current?.focus()
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] md:h-screen bg-sp-ink-900">
      <header className="flex-shrink-0 px-6 py-4 border-b border-sp-ink-600">
        <div className="flex items-center gap-2">
          <Users size={17} className="text-sp-ink-300" />
          <h1 className="font-semibold text-white">Team Chat</h1>
        </div>
        <p className="text-xs text-sp-ink-300 mt-1">
          Staff-only room. Tag <span className="text-sp-green-400 font-medium">@atlas</span> (Jake's)
          or <span className="text-sp-green-400 font-medium">@skip</span> (Ian's) to pull one into a
          thread — they pick it up within about a minute and reply here.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-1">
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center">
            <EmptyState
              icon={Users}
              title="No messages yet"
              subtitle="Start the thread — anything you'd normally text each other about the business."
              compact
              dark
            />
          </div>
        )}

        {messages.length >= TEAM_CHAT_WINDOW && (
          <p className="text-center text-[11px] text-sp-ink-300/70 pb-2">
            Showing the most recent {TEAM_CHAT_WINDOW} messages
          </p>
        )}

        {messages.map((msg, i) => {
          const isMe = msg.authorId === currentUser?.uid
          const isClaude = msg.authorType === 'claude'
          const prev = messages[i - 1]
          const ts = toDate(msg.createdAt)
          const showDate = !prev || !sameDay(toDate(prev.createdAt), ts)
          // A mention that no agent has claimed yet is queued work, not a
          // dropped message — say so, since replies arrive on a cadence
          // rather than instantly and silence otherwise reads as broken.
          const awaitingAgent =
            msg.authorType === 'human' && agentMentions(msg.mentions).length > 0 && !msg.answeredBy

          return (
            <div key={msg.id}>
              {showDate && ts && (
                <div className="flex justify-center my-3">
                  <span className="text-[11px] text-sp-ink-300 bg-sp-ink-800 border border-sp-ink-600 rounded-full px-3 py-1">
                    {isToday(ts) ? 'Today' : isYesterday(ts) ? 'Yesterday' : format(ts, 'MMM d')}
                  </span>
                </div>
              )}

              <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-1`}>
                <div className={`max-w-[78%] md:max-w-[62%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  {!isMe && (
                    <span className={`text-[10px] ml-1 mb-0.5 flex items-center gap-1 ${
                      isClaude ? 'text-sp-green-400 font-medium' : 'text-sp-ink-300'
                    }`}>
                      {isClaude && <Bot size={11} />}
                      {msg.authorName}
                    </span>
                  )}

                  <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    isMe
                      ? 'bg-sp-green-500 text-white rounded-br-sm'
                      : isClaude
                        ? 'bg-sp-ink-800 border border-sp-green-500/40 border-l-2 border-l-sp-green-500 text-sp-ink-50 rounded-bl-sm'
                        : 'bg-sp-ink-800 border border-sp-ink-600 text-sp-ink-50 rounded-bl-sm'
                  }`}>
                    {splitOnMentions(msg.text).map((seg, si) =>
                      seg.type === 'mention' && seg.isAgent
                        ? <span key={si} className={isMe ? 'font-semibold underline underline-offset-2' : 'text-sp-green-400 font-semibold'}>{seg.value}</span>
                        : <span key={si}>{seg.value}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-0.5 mx-1">
                    {ts && <span className="text-[9px] text-sp-ink-300/70">{format(ts, 'h:mm a')}</span>}
                    {awaitingAgent && (
                      <span className="text-[9px] text-sp-ink-300/70 flex items-center gap-1">
                        <Clock size={9} /> waiting on {agentMentions(msg.mentions).join(' + ')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSend}
        className="flex-shrink-0 flex items-end gap-2 px-4 md:px-6 py-3 border-t border-sp-ink-600 bg-sp-ink-900"
      >
        <button
          type="button"
          onClick={insertMention}
          title="Mention Claude"
          aria-label="Mention Claude"
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border border-sp-ink-600 text-sp-ink-300 hover:text-sp-green-400 hover:border-sp-green-500/50 transition"
        >
          <AtSign size={16} />
        </button>
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message the team…"
          className="flex-1 bg-sp-ink-800 border border-sp-ink-600 text-sp-ink-50 placeholder-sp-ink-300 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sp-green-500"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="btn-brand w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 active:scale-95 disabled:opacity-40"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  )
}

function sameDay(a, b) {
  if (!a || !b) return false
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}
