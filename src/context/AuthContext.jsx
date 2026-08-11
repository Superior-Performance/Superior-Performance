import { createContext, useContext, useEffect, useState } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
} from 'firebase/auth'
import { auth } from '../firebase/config'
import { getUser, createUser } from '../firebase/firestore'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [userProfile, setUserProfile]   = useState(null)
  const [loading, setLoading]           = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user)
      if (user) {
        try {
          const snap = await getUser(user.uid)
          setUserProfile(snap.exists() ? snap.data() : null)
        } catch (err) {
          console.error('Failed to load user profile:', err)
          setUserProfile(null)
        }
      } else {
        setUserProfile(null)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  const login = (email, password) =>
    signInWithEmailAndPassword(auth, email, password)

  const logout = () => signOut(auth)

  const register = async (email, password, name, role = 'athlete') => {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    await createUser(cred.user.uid, { name, email, role })
    setUserProfile({ name, email, role })
    return cred
  }

  const refreshProfile = async () => {
    if (!currentUser) return
    const snap = await getUser(currentUser.uid)
    setUserProfile(snap.exists() ? snap.data() : null)
  }

  return (
    <AuthContext.Provider value={{
      currentUser,
      userProfile,
      loading,
      login,
      logout,
      register,
      refreshProfile,
      isAdmin: userProfile?.role === 'admin',
      isAthlete: userProfile?.role === 'athlete',
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
