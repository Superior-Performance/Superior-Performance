import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth'
import { auth } from '../../firebase/config'
import { Lock, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { initials } from '../../utils/initials'

export default function AccountPage() {
  const { userProfile } = useAuth()
  const [current, setCurrent]   = useState('')
  const [next, setNext]         = useState('')
  const [confirm, setConfirm]   = useState('')
  const [saving, setSaving]     = useState(false)

  async function handleChange(e) {
    e.preventDefault()
    if (next !== confirm) { toast.error('New passwords do not match.'); return }
    if (next.length < 6)  { toast.error('Password must be at least 6 characters.'); return }

    setSaving(true)
    try {
      const user       = auth.currentUser
      const credential = EmailAuthProvider.credential(user.email, current)
      await reauthenticateWithCredential(user, credential)
      await updatePassword(user, next)
      toast.success('Password updated!')
      setCurrent(''); setNext(''); setConfirm('')
    } catch (err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        toast.error('Current password is incorrect.')
      } else {
        toast.error('Could not update password.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-4 py-6 max-w-md mx-auto min-h-[calc(100vh-136px)] bg-sp-ink-900">
      {/* Header */}
      <div className="mb-6">
        <div className="w-14 h-14 rounded-full bg-sp-green-500/20 text-sp-green-400 flex items-center justify-center font-bold text-2xl mb-3">
          {initials(userProfile?.name)}
        </div>
        <h1 className="text-xl font-bold text-white">{userProfile?.name}</h1>
        <p className="text-sp-ink-300 text-sm">{userProfile?.email}</p>
      </div>

      {/* Change password */}
      <div className="bg-sp-ink-800 rounded-2xl border border-sp-ink-600 p-5">
        <div className="flex items-center gap-2 mb-5">
          <Lock size={16} className="text-sp-ink-300" />
          <h2 className="font-semibold text-white">Change Password</h2>
        </div>
        <form onSubmit={handleChange} className="space-y-4">
          <Field
            label="Current Password"
            type="password"
            value={current}
            onChange={setCurrent}
            placeholder="Enter current password"
            required
          />
          <Field
            label="New Password"
            type="password"
            value={next}
            onChange={setNext}
            placeholder="Min 6 characters"
            required
            minLength={6}
          />
          <Field
            label="Confirm New Password"
            type="password"
            value={confirm}
            onChange={setConfirm}
            placeholder="Re-enter new password"
            required
          />
          <button
            type="submit"
            disabled={saving}
            className="btn-brand w-full py-3 rounded-xl flex items-center justify-center gap-2"
          >
            {saving
              ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Updating…</>
              : <><CheckCircle size={15} /> Update Password</>
            }
          </button>
        </form>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, ...props }) {
  return (
    <div>
      <label className="block text-sm font-medium text-sp-ink-100 mb-1">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3.5 py-2.5 border border-sp-ink-600 rounded-xl text-sm text-sp-ink-50 placeholder-sp-ink-300 bg-sp-ink-900 focus:outline-none focus:ring-2 focus:ring-sp-green-500"
        {...props}
      />
    </div>
  )
}
