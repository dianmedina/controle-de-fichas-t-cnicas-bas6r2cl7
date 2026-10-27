import React, { createContext, useContext, useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { RecordModel } from 'pocketbase'

interface AuthContextType {
  user: RecordModel | null
  token: string | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<RecordModel | null>(pb.authStore.record)
  const [token, setToken] = useState<string | null>(pb.authStore.token)
  const [isLoading, setIsLoading] = useState<boolean>(true)

  useEffect(() => {
    // Escuta mudanças na autenticação do PocketBase
    const unsubscribe = pb.authStore.onChange((newToken, newRecord) => {
      setToken(newToken)
      setUser(newRecord)
    })

    // Se houver token mas não há certeza se ainda é válido, valida em segundo plano
    if (pb.authStore.isValid) {
      setUser(pb.authStore.record)
      setToken(pb.authStore.token)
    }
    setIsLoading(false)

    return () => {
      unsubscribe()
    }
  }, [])

  const login = async (email: string, password: string) => {
    const authData = await pb.collection('users').authWithPassword(email, password)
    setUser(authData.record)
    setToken(authData.token)
  }

  const logout = () => {
    pb.authStore.clear()
    setUser(null)
    setToken(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        logout,
        isAuthenticated: !!token && pb.authStore.isValid,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
