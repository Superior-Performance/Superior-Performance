import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../firebase/config'
import toast from 'react-hot-toast'
import Logo from '../components/Logo'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate   = useNavigate()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSending, setResetSending] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    try {
      await login(email, password)
    } catch (err) {
      toast.error(
        err.code === 'auth/invalid-credential'
          ? 'Invalid email or password.'
          : 'Login failed. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  async function handleReset(e) {
    e.preventDefault()
    setResetSending(true)
    try {
      await sendPasswordResetEmail(auth, resetEmail)
      toast.success('Reset email sent — check your inbox.')
      setShowReset(false)
      setResetEmail('')
    } catch (err) {
      toast.error(err.code === 'auth/user-not-found' ? 'No account found with that email.' : 'Could not send reset email.')
    } finally {
      setResetSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#080c14] flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Glow orb, matching the landing page */}
      <div
        className="fixed top-[-200px] left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(46,158,99,0.15) 0%, transparent 70%)' }}
      />

      {/* Logo / Title */}
      <div className="relative z-10 mb-10 text-center">
        <Logo className="h-14 w-auto mx-auto mb-4" />
        <p className="text-white/60 mt-1 text-sm">Sign in to access your program</p>
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm bg-white rounded-2xl shadow-xl p-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-sp-green-500 text-sm transition"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-sp-green-500 text-sm transition"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-brand w-full py-3 rounded-xl flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : null}
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          <button
            type="button"
            onClick={() => { setResetEmail(email); setShowReset(true) }}
            className="w-full text-center text-xs text-gray-400 hover:text-sp-green-500 transition pt-1"
          >
            Forgot your password?
          </button>
        </form>
      </div>

      <p className="relative z-10 mt-6 text-white/40 text-xs text-center">
        Contact your coach if you need access.
      </p>

      {/* Forgot password modal */}
      {showReset && (
        <div className="animate-modal-backdrop fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="animate-modal-panel bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Reset Password</h2>
            <p className="text-sm text-gray-500 mb-5">Enter your email and we'll send you a reset link.</p>
            <form onSubmit={handleReset} className="space-y-4">
              <input
                type="email"
                required
                value={resetEmail}
                onChange={e => setResetEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-sp-green-500 text-sm"
              />
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowReset(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition">Cancel</button>
                <button type="submit" disabled={resetSending} className="btn-brand flex-1 py-2.5 rounded-xl text-sm">
                  {resetSending ? 'Sending…' : 'Send Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
