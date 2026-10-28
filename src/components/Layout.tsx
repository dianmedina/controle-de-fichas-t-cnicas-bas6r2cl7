import React, { useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  LayoutDashboard,
  Boxes,
  ScrollText,
  DollarSign,
  TrendingUp,
  FolderTree,
  Settings,
  LogOut,
  UtensilsCrossed,
  Menu,
  X,
  ChefHat,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const navItems = [
    { label: 'Dashboard', path: '/', icon: LayoutDashboard },
    { label: 'Insumos', path: '/insumos', icon: Boxes },
    { label: 'Fichas Técnicas', path: '/fichas', icon: ScrollText },
    { label: 'Vendas & Precificação', path: '/vendas-precificacao', icon: TrendingUp },
    { label: 'Cadastros', path: '/cadastros', icon: FolderTree },
    { label: 'Configurações', path: '/configuracoes', icon: Settings },
  ]

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex w-64 flex-col border-r border-slate-200 bg-white shadow-sm shrink-0">
        <div className="p-6 border-b border-slate-100 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-600 to-orange-500 text-white shadow-md shadow-amber-500/20">
            <UtensilsCrossed className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-900 leading-none">
              Controle de Fichas
            </h1>
            <p className="text-xs text-slate-500 mt-1">Gestão Gastronômica</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive =
              item.path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.path)

            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                  isActive
                    ? 'bg-amber-50 text-amber-800 font-semibold shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                )}
              >
                <Icon
                  className={cn('h-4 w-4 shrink-0', isActive ? 'text-amber-700' : 'text-slate-500')}
                />
                {item.label}
              </NavLink>
            )
          })}
        </nav>

        {/* User Card & Logout */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-9 w-9 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs uppercase shrink-0 border border-amber-200">
                <ChefHat className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-800 truncate">
                  {user?.name || 'Chef / Gestor'}
                </p>
                <p className="text-[11px] text-slate-500 truncate">{user?.email}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              title="Sair do sistema"
              className="text-slate-400 hover:text-red-600 hover:bg-red-50 h-8 w-8 shrink-0"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-30">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-amber-600 to-orange-500 text-white shadow-sm">
              <UtensilsCrossed className="h-4 w-4" />
            </div>
            <span className="font-bold text-slate-900 text-sm">Controle de Fichas</span>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Abrir menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </header>

        {/* Mobile Dropdown Nav */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-3 space-y-1 shadow-lg z-30">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive =
                item.path === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(item.path)

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-amber-50 text-amber-800 font-semibold'
                      : 'text-slate-600 hover:bg-slate-50',
                  )}
                >
                  <Icon
                    className={cn(
                      'h-4 w-4 shrink-0',
                      isActive ? 'text-amber-700' : 'text-slate-500',
                    )}
                  />
                  {item.label}
                </NavLink>
              )
            })}
            <div className="pt-3 mt-2 border-t border-slate-100 flex items-center justify-between">
              <div className="text-xs text-slate-600">
                Logado como: <span className="font-medium">{user?.email}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 text-xs h-8"
              >
                <LogOut className="h-3.5 w-3.5 mr-1" />
                Sair
              </Button>
            </div>
          </div>
        )}

        {/* Main Content Viewport */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
