import React, { createContext, useContext, useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { RecordModel } from 'pocketbase'

export type UserRole = 'gestor' | 'cozinha'

export interface AppUser extends RecordModel {
  name: string
  email: string
  role: UserRole
  active?: boolean
}

interface AuthContextType {
  user: AppUser | null
  token: string | null
  isLoading: boolean
  role: UserRole
  isGestor: boolean
  isCozinha: boolean
  login: (email: string, password: string) => Promise<AppUser>
  logout: () => void
  refreshUser: () => Promise<void>
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(pb.authStore.record as AppUser | null)
  const [token, setToken] = useState<string | null>(pb.authStore.token)
  const [isLoading, setIsLoading] = useState<boolean>(true)

  useEffect(() => {
    // Escuta mudanças na autenticação do PocketBase
    const unsubscribe = pb.authStore.onChange((newToken, newRecord) => {
      setToken(newToken)
      setUser(newRecord as AppUser | null)
    })

    // Se houver token mas não há certeza se ainda é válido, valida em segundo plano
    if (pb.authStore.isValid && pb.authStore.record) {
      setUser(pb.authStore.record as AppUser)
      setToken(pb.authStore.token)

      // Valida token com o backend para pegar dados mais recentes do usuário (ex.: role atualizado)
      pb.collection('users')
        .authRefresh()
        .then((authData) => {
          if (authData.record.active === false) {
            pb.authStore.clear()
            setUser(null)
            setToken(null)
          } else {
            setUser(authData.record as AppUser)
            setToken(authData.token)
          }
        })
        .catch(() => {
          // Se o refresh falhar (ex.: token expirado ou usuário deletado/bloqueado)
          pb.authStore.clear()
          setUser(null)
          setToken(null)
        })
        .finally(() => {
          setIsLoading(false)
        })
    } else {
      setIsLoading(false)
    }

    return () => {
      unsubscribe()
    }
  }, [])

  const login = async (email: string, password: string): Promise<AppUser> => {
    const authData = await pb.collection('users').authWithPassword(email, password)
    const loggedUser = authData.record as AppUser

    if (loggedUser.active === false) {
      pb.authStore.clear()
      setUser(null)
      setToken(null)
      throw new Error('Esta conta de usuário foi desativada pelo gestor.')
    }

    setUser(loggedUser)
    setToken(authData.token)
    return loggedUser
  }

  const logout = () => {
    pb.authStore.clear()
    setUser(null)
    setToken(null)
  }

  const refreshUser = async () => {
    if (pb.authStore.isValid) {
      try {
        const authData = await pb.collection('users').authRefresh()
        setUser(authData.record as AppUser)
        setToken(authData.token)
      } catch (err) {
        console.error('Falha ao atualizar dados do usuário autenticado:', err)
      }
    }
  }

  const role: UserRole = user?.role === 'cozinha' ? 'cozinha' : 'gestor'
  const isGestor = role === 'gestor'
  const isCozinha = role === 'cozinha'

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        role,
        isGestor,
        isCozinha,
        login,
        logout,
        refreshUser,
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
