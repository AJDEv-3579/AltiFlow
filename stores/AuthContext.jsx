import React, { createContext, useContext, useState, useEffect } from 'react'
import { authService } from '@/services/authService'
import { getToken } from '@/services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showProfile, setShowProfile] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)

  async function loadMe() {
    const token = getToken()
    if (!token) {
      setUser(null)
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const u = await authService.getMe()
      setUser(u)
    } catch (e) {
      authService.logout()
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMe()
  }, [])

  function logout() {
    authService.logout()
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        loading,
        loadMe,
        reloadUser: loadMe,
        logout,
        showProfile,
        setShowProfile,
        showChangePassword,
        setShowChangePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
