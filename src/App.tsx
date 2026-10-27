/* Main App Component - Handles routing (using react-router-dom), query client and other providers - use this file to add all routes */
import { BrowserRouter, Routes, Route } from 'react-router-dom'
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
import Vendas from './pages/Vendas'
import Precificacao from './pages/Precificacao'
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
            <Route path="/" element={<Index />} />
            <Route path="/insumos" element={<Insumos />} />
            <Route path="/fichas" element={<FichasTecnicas />} />
            <Route path="/fichas/:id" element={<FichaDetalhe />} />
            <Route path="/vendas" element={<Vendas />} />
            <Route path="/precificacao" element={<Precificacao />} />
            <Route path="/configuracoes" element={<Configuracoes />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </AuthProvider>
  </BrowserRouter>
)

export default App
