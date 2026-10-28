import React, { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ingredientsService } from '@/services/ingredients'
import { recipesService, RecipeWithCost } from '@/services/recipes'
import { salesService } from '@/services/sales'
import { Ingredient, Sale, formatCurrency, formatPercent } from '@/types/restaurant'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Boxes,
  ScrollText,
  DollarSign,
  TrendingUp,
  Plus,
  ArrowRight,
  Utensils,
  CookingPot,
  Scale,
  Sparkles,
  AlertTriangle,
  Loader2,
} from 'lucide-react'

export default function Index() {
  const navigate = useNavigate()
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [recipesWithCost, setRecipesWithCost] = useState<RecipeWithCost[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadDashboard() {
      try {
        setLoading(true)
        const [ings, recs, allItems, allSales] = await Promise.all([
          ingredientsService.getAll(),
          recipesService.getAll(),
          recipesService.getAllRecipeItems(),
          salesService.getAll(),
        ])

        const enriched = recs.map((r) => {
          const items = allItems.filter((i) => i.recipe_id === r.id)
          return recipesService.computeCosts(r, items, recs, allItems)
        })

        setIngredients(ings)
        setRecipesWithCost(enriched)
        setSales(allSales)
      } catch (error) {
        console.error('Erro ao carregar dashboard:', error)
      } finally {
        setLoading(false)
      }
    }

    loadDashboard()
  }, [])

  // Métricas agregadas
  const metrics = useMemo(() => {
    let faturamentoTotal = 0
    let custoTotal = 0
    let totalVendidos = 0

    sales.forEach((s) => {
      const rw = recipesWithCost.find((r) => r.id === s.recipe_id)
      if (rw) {
        const rev = s.quantity * (rw.selling_price || 0)
        const cost = s.quantity * rw.costPerPortion
        faturamentoTotal += rev
        custoTotal += cost
        totalVendidos += s.quantity
      }
    })

    const lucroTotal = faturamentoTotal - custoTotal
    const margemGeral = faturamentoTotal > 0 ? (lucroTotal / faturamentoTotal) * 100 : 0

    // Pratos com margem baixa (menor que 40% ou sem preço definido)
    const pratosAtencao = recipesWithCost.filter((r) => !r.selling_price || r.marginPercent < 40)

    return {
      faturamentoTotal,
      custoTotal,
      lucroTotal,
      totalVendidos,
      margemGeral,
      pratosAtencao,
    }
  }, [sales, recipesWithCost])

  // Pratos mais vendidos
  const topDishes = useMemo(() => {
    const dishMap: Record<string, { recipe: RecipeWithCost; count: number; revenue: number }> = {}

    sales.forEach((s) => {
      const rw = recipesWithCost.find((r) => r.id === s.recipe_id)
      if (rw) {
        if (!dishMap[rw.id]) {
          dishMap[rw.id] = { recipe: rw, count: 0, revenue: 0 }
        }
        dishMap[rw.id].count += s.quantity
        dishMap[rw.id].revenue += s.quantity * (rw.selling_price || 0)
      }
    })

    return Object.values(dishMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 4)
  }, [sales, recipesWithCost])

  if (loading) {
    return (
      <div className="p-16 text-center flex flex-col items-center justify-center gap-3 text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
        <p className="text-sm">Carregando painel de controle do restaurante...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Banner de Boas-Vindas */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-700 via-amber-600 to-orange-600 p-6 sm:p-8 text-white shadow-lg shadow-amber-900/10">
        <div className="relative z-10 max-w-2xl space-y-2">
          <Badge className="bg-amber-950/40 text-amber-100 hover:bg-amber-950/60 border-amber-400/30 text-xs">
            Visão Geral Operacional
          </Badge>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Controle de Fichas Técnicas & Custos
          </h1>
          <p className="text-amber-100 text-sm sm:text-base leading-relaxed">
            Acompanhe o custo por porção, margem bruta de contribuição e a consolidação das vendas
            diárias para garantir a lucratividade do seu cardápio.
          </p>

          <div className="pt-3 flex flex-wrap gap-2.5">
            <Button
              onClick={() => navigate('/fichas')}
              className="bg-white text-amber-900 hover:bg-amber-50 font-semibold shadow-sm text-xs sm:text-sm"
            >
              <ScrollText className="h-4 w-4 mr-1.5" />
              Fichas Técnicas
            </Button>
            <Button
              onClick={() => navigate('/insumos')}
              variant="outline"
              className="border-amber-300 text-white hover:bg-amber-800/40 text-xs sm:text-sm bg-transparent"
            >
              <Boxes className="h-4 w-4 mr-1.5" />
              Gerenciar Insumos
            </Button>
            <Button
              onClick={() => navigate('/vendas-precificacao')}
              variant="outline"
              className="border-amber-300 text-white hover:bg-amber-800/40 text-xs sm:text-sm bg-transparent"
            >
              <TrendingUp className="h-4 w-4 mr-1.5" />
              Vendas & Precificação
            </Button>
          </div>
        </div>

        {/* Fundo decorativo sutil */}
        <div className="absolute right-0 bottom-0 top-0 w-1/3 opacity-10 flex items-center justify-center pointer-events-none">
          <Utensils className="h-64 w-64 transform translate-x-12 translate-y-6" />
        </div>
      </div>

      {/* Cards de Métricas Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-xs border-slate-200">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase font-semibold text-slate-500 flex items-center justify-between">
              <span>Faturamento Total</span>
              <DollarSign className="h-4 w-4 text-emerald-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-slate-900">
              {formatCurrency(metrics.faturamentoTotal)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            {metrics.totalVendidos} pratos e guarnições vendidos
          </CardContent>
        </Card>

        <Card className="shadow-xs border-slate-200">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase font-semibold text-slate-500 flex items-center justify-between">
              <span>Custo de Insumos (CMV)</span>
              <Scale className="h-4 w-4 text-amber-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-amber-700">
              {formatCurrency(metrics.custoTotal)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            Custo real da matéria-prima vendida
          </CardContent>
        </Card>

        <Card className="shadow-xs border-slate-200">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase font-semibold text-slate-500 flex items-center justify-between">
              <span>Lucro Bruto Realizado</span>
              <Sparkles className="h-4 w-4 text-emerald-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-700">
              {formatCurrency(metrics.lucroTotal)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            Receita bruta menos custos diretos
          </CardContent>
        </Card>

        <Card className="shadow-xs border-slate-200">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase font-semibold text-slate-500 flex items-center justify-between">
              <span>Margem Média Bruta</span>
              <span className="text-xs font-bold text-blue-600">%</span>
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-blue-700">
              {formatPercent(metrics.margemGeral)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            Retorno sobre o faturamento total
          </CardContent>
        </Card>
      </div>

      {/* Grid de Blocos Rápidos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bloco 1: Pratos Mais Vendidos */}
        <Card className="lg:col-span-2 border-slate-200 shadow-xs">
          <CardHeader className="p-5 pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-amber-600" />
                Desempenho dos Pratos Mais Vendidos
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Volume de porções e faturamento consolidado
              </CardDescription>
            </div>
            <Link
              to="/vendas-precificacao"
              className="text-xs font-medium text-amber-700 hover:text-amber-800 flex items-center gap-1"
            >
              Ver precificação <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>

          <CardContent className="p-5 pt-2">
            {topDishes.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                Nenhuma venda registrada ainda. Cadastre lançamentos na aba Vendas.
              </div>
            ) : (
              <div className="space-y-3">
                {topDishes.map((item) => (
                  <div
                    key={item.recipe.id}
                    onClick={() => navigate(`/fichas/${item.recipe.id}`)}
                    className="p-3.5 rounded-xl border border-slate-100 hover:border-amber-200 bg-slate-50/50 hover:bg-amber-50/30 transition-colors flex items-center justify-between gap-4 cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
                        {item.recipe.type === 'prato' ? (
                          <Utensils className="h-4 w-4 text-amber-600" />
                        ) : (
                          <CookingPot className="h-4 w-4 text-orange-500" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {item.recipe.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          Custo: {formatCurrency(item.recipe.costPerPortion)} • Preço:{' '}
                          {formatCurrency(item.recipe.selling_price)}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-slate-900">
                        {item.count} {item.count > 1 ? 'porções' : 'porção'}
                      </p>
                      <p className="text-xs font-semibold text-emerald-700">
                        {formatCurrency(item.revenue)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bloco 2: Resumo Rápido da Operação */}
        <Card className="border-slate-200 shadow-xs flex flex-col justify-between">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Boxes className="h-5 w-5 text-amber-600" />
              Status do Restaurante
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Contagem dos cadastros do sistema
            </CardDescription>
          </CardHeader>

          <CardContent className="p-5 pt-0 space-y-4">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Boxes className="h-4 w-4 text-slate-500" />
                <span className="text-xs font-medium text-slate-700">Insumos Cadastrados</span>
              </div>
              <span className="font-bold text-sm text-slate-900">{ingredients.length}</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ScrollText className="h-4 w-4 text-slate-500" />
                <span className="text-xs font-medium text-slate-700">Fichas Técnicas</span>
              </div>
              <span className="font-bold text-sm text-slate-900">{recipesWithCost.length}</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <TrendingUp className="h-4 w-4 text-slate-500" />
                <span className="text-xs font-medium text-slate-700">Vendas Lançadas</span>
              </div>
              <span className="font-bold text-sm text-slate-900">{sales.length}</span>
            </div>

            {metrics.pratosAtencao.length > 0 && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Atenção à Precificação</p>
                  <p className="mt-0.5 text-amber-800">
                    {metrics.pratosAtencao.length}{' '}
                    {metrics.pratosAtencao.length === 1 ? 'prato possui' : 'pratos possuem'} margem
                    abaixo de 40% ou sem preço definido.
                  </p>
                  <Link
                    to="/vendas-precificacao"
                    className="inline-block mt-1 font-semibold underline text-amber-950"
                  >
                    Ajustar na Precificação →
                  </Link>
                </div>
              </div>
            )}
          </CardContent>

          <div className="p-4 border-t border-slate-100 bg-slate-50/50 rounded-b-xl">
            <Button
              onClick={() => navigate('/configuracoes')}
              variant="outline"
              size="sm"
              className="w-full text-xs text-slate-700 bg-white"
            >
              Definir Preços de Venda
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
