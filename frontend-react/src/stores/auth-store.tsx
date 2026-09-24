import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as authService from '../services/authService'
import { MOCK_AUTH_EVENT, getMockSession } from '../services/mockSession'

type AuthState = {
  user: authService.AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [sessionToken, setSessionToken] = useState(() => getMockSession()?.token ?? null)

  useEffect(() => {
    const handleAuthChange = () => setSessionToken(getMockSession()?.token ?? null)
    window.addEventListener(MOCK_AUTH_EVENT, handleAuthChange)
    return () => window.removeEventListener(MOCK_AUTH_EVENT, handleAuthChange)
  }, [])

  const hasSession = Boolean(sessionToken)
  const meQuery = useQuery({
    queryKey: ['zeno-auth', 'me'],
    queryFn: authService.getMe,
    enabled: hasSession,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const value: AuthState = {
    user: hasSession ? meQuery.data ?? null : null,
    isLoading: hasSession && meQuery.isPending,
    isAuthenticated: hasSession && Boolean(meQuery.data),
    signOut: async () => {
      await authService.logout()
      queryClient.clear()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
