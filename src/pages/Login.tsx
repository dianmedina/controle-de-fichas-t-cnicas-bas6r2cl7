import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { UtensilsCrossed, AlertCircle, Loader2, KeyRound } from 'lucide-react'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('medinafiles@gmail.com')
  const [password, setPassword] = useState('Skip@Pass')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const loggedUser = await login(email.trim(), password)
      // Se for Cozinha ou se tentou rota restrita, redireciona para /fichas
      if (loggedUser.role === 'cozinha') {
        navigate('/fichas', { replace: true })
      } else {
        // Se a rota 'from' for raiz ou qualquer outra válida, vai pra ela
        navigate(from === '/login' ? '/' : from, { replace: true })
      }
    } catch (err: unknown) {
      console.error('Erro de login:', err)
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'Credenciais inválidas. Verifique seu e-mail e senha.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const fillDefaultCredentials = () => {
    setEmail('medinafiles@gmail.com')
    setPassword('Skip@Pass')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <Card className="w-full max-w-md shadow-xl border-slate-200">
        <CardHeader className="space-y-2 text-center pb-6">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-600 to-orange-500 text-white shadow-lg shadow-amber-500/25">
            <UtensilsCrossed className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-slate-900">
            Controle de Fichas Técnicas
          </CardTitle>
          <CardDescription className="text-sm text-slate-500">
            Acesse o sistema de fichas, custos e precificação do restaurante
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu.email@restaurante.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Senha</Label>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            <div className="pt-2">
              <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold flex items-center gap-1 text-amber-950">
                    <KeyRound className="h-3.5 w-3.5" /> Acesso do Chef / Gestor:
                  </p>
                  <p className="mt-0.5">
                    E-mail:{' '}
                    <code className="bg-amber-100 px-1 py-0.5 rounded text-[11px]">
                      medinafiles@gmail.com
                    </code>
                  </p>
                  <p>
                    Senha:{' '}
                    <code className="bg-amber-100 px-1 py-0.5 rounded text-[11px]">Skip@Pass</code>
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={fillDefaultCredentials}
                  className="text-xs h-7 border-amber-300 bg-white hover:bg-amber-100/50 text-amber-900 shrink-0"
                >
                  Preencher
                </Button>
              </div>
            </div>
          </CardContent>

          <CardFooter className="pt-2">
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-medium"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Entrando...
                </>
              ) : (
                'Entrar no Sistema'
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
