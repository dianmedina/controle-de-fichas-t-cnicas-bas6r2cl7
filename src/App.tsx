/* Main App Component - Handles routing (using react-router-dom), query client and other providers - use this file to add all routes */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import Layout from './components/Layout'

import Index from './pages/Index'
import Insumos from './pages/Insumos'
import FichasTecnicas from './pages/FichasTecnicas'
import FichaDetalhe from './pages/FichaDetalhe'
import VendasPrecificacao from './pages/VendasPrecificacao'
import Cadastros from './pages/Cadastros'
import Configuracoes from './pages/Configuracoes'
import Login from './pages/Login'
import NotFound from './pages/NotFound'

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* Rotas Protegidas sob o Layout Principal */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            {/* Rotas que o Cozinha acessa */}
            <Route path="/fichas" element={<FichasTecnicas />} />
            <Route path="/fichas/:id" element={<FichaDetalhe />} />

            {/* Rotas exclusivas de Gestor */}
            <Route
              path="/"
              element={
                <ProtectedRoute requiredRole="gestor">
                  <Index />
                </ProtectedRoute>
              }
            />
            <Route
              path="/insumos"
              element={
                <ProtectedRoute requiredRole="gestor">
                  <Insumos />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vendas-precificacao"
              element={
                <ProtectedRoute requiredRole="gestor">
                  <VendasPrecificacao />
                </ProtectedRoute>
              }
            />
            <Route
              path="/cadastros"
              element={
                <ProtectedRoute requiredRole="gestor">
                  <Cadastros />
                </ProtectedRoute>
              }
            />
            <Route
              path="/configuracoes"
              element={
                <ProtectedRoute requiredRole="gestor">
                  <Configuracoes />
                </ProtectedRoute>
              }
            />

            {/* Redirecionamentos para compatibilidade com links antigos */}
            <Route path="/vendas" element={<Navigate to="/vendas-precificacao" replace />} />
            <Route path="/precificacao" element={<Navigate to="/vendas-precificacao" replace />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </AuthProvider>
  </BrowserRouter>
)

export default App
