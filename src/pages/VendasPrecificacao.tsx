import React, { useEffect, useState, useMemo } from 'react'
import { salesService } from '@/services/sales'
import { recipesService, RecipeWithCost } from '@/services/recipes'
import { Sale, Recipe, formatCurrency, formatPercent } from '@/types/restaurant'
import { ImportSalesDialog } from '@/components/ImportSalesDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import {
  TrendingUp,
  DollarSign,
  Plus,
  Calendar,
  Pencil,
  Trash2,
  Loader2,
  Utensils,
  CookingPot,
  Filter,
  FileSpreadsheet,
  Calculator,
  Search,
  ArrowUpRight,
  Scale,
  Sparkles,
} from 'lucide-react'

interface PricingConsolidation {
  recipe: RecipeWithCost
  totalSold: number
  totalRevenue: number
  totalCost: number
  totalProfit: number
  overallMargin: number
}

export default function VendasPrecificacao() {
  const { toast } = useToast()

  // Dados centrais
  const [sales, setSales] = useState<Sale[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [recipesWithCost, setRecipesWithCost] = useState<RecipeWithCost[]>([])
  const [loading, setLoading] = useState(true)

  // Aba ativa: 'consolidado' | 'vendas'
  const [activeTab, setActiveTab] = useState('consolidado')

  // Filtros de Vendas
  const [dateFilter, setDateFilter] = useState<string>('')
  const [selectedRecipeFilter, setSelectedRecipeFilter] = useState<string>('all')

  // Filtros de Precificação
  const [pricingSearch, setPricingSearch] = useState<string>('')

  // Modal Novo / Edição de Venda Manual
  const [isSaleModalOpen, setIsSaleModalOpen] = useState(false)
  const [editingSale, setEditingSale] = useState<Sale | null>(null)
  const [savingSale, setSavingSale] = useState(false)

  // Form Venda Manual
  const todayStr = new Date().toISOString().slice(0, 10)
  const [saleFormData, setSaleFormData] = useState({
    recipe_id: '',
    date: todayStr,
    quantity: '1',
  })

  // Modal Exclusão Venda
  const [deleteSaleConfirmId, setDeleteSaleConfirmId] = useState<string | null>(null)
  const [deletingSale, setDeletingSale] = useState(false)

  // Modal Importação Excel
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)

  // Modal Edição Rápida de Preço de Venda
  const [editingRecipe, setEditingRecipe] = useState<RecipeWithCost | null>(null)
  const [newSellingPrice, setNewSellingPrice] = useState('')
  const [savingPrice, setSavingPrice] = useState(false)
  const [targetMargin, setTargetMargin] = useState('60')

  const loadData = async () => {
    try {
      setLoading(true)
      const [salesData, recipesData, allItems] = await Promise.all([
        salesService.getAll(),
        recipesService.getAll(),
        recipesService.getAllRecipeItems(),
      ])

      const enriched = recipesData.map((r) => {
        const items = allItems.filter((i) => i.recipe_id === r.id)
        return recipesService.computeCosts(r, items)
      })

      setSales(salesData)
      setRecipes(recipesData)
      setRecipesWithCost(enriched)
    } catch (error) {
      console.error('Erro ao carregar dados de vendas e precificação:', error)
      toast({
        title: 'Erro ao carregar dados',
        description: 'Não foi possível carregar o histórico de vendas e dados financeiros.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Vendas filtradas
  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      const matchesDate = !dateFilter || sale.date === dateFilter
      const matchesRecipe =
        selectedRecipeFilter === 'all' || sale.recipe_id === selectedRecipeFilter
      return matchesDate && matchesRecipe
    })
  }, [sales, dateFilter, selectedRecipeFilter])

  // Consolidação de Precificação por Prato (baseada no total de vendas)
  const consolidatedList: PricingConsolidation[] = useMemo(() => {
    return recipesWithCost.map((rw) => {
      const pratoSales = sales.filter((s) => s.recipe_id === rw.id)
      const totalSold = pratoSales.reduce((acc, s) => acc + s.quantity, 0)
      const totalRevenue = totalSold * (rw.selling_price || 0)
      const totalCost = totalSold * rw.costPerPortion
      const totalProfit = totalRevenue - totalCost
      const overallMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0

      return {
        recipe: rw,
        totalSold,
        totalRevenue,
        totalCost,
        totalProfit,
        overallMargin,
      }
    })
  }, [recipesWithCost, sales])

  // Consolidação filtrada por busca
  const filteredConsolidated = useMemo(() => {
    return consolidatedList.filter((item) =>
      item.recipe.name.toLowerCase().includes(pricingSearch.toLowerCase()),
    )
  }, [consolidatedList, pricingSearch])

  // Métricas Globais Unificadas
  const globalMetrics = useMemo(() => {
    let faturamento = 0
    let custo = 0
    let lucro = 0
    let vendas = 0

    for (const item of consolidatedList) {
      faturamento += item.totalRevenue
      custo += item.totalCost
      lucro += item.totalProfit
      vendas += item.totalSold
    }

    const margemGlobal = faturamento > 0 ? (lucro / faturamento) * 100 : 0

    return { faturamento, custo, lucro, vendas, margemGlobal }
  }, [consolidatedList])

  // Handlers de Venda Manual
  const handleOpenCreateSale = () => {
    setEditingSale(null)
    setSaleFormData({
      recipe_id: recipes[0]?.id || '',
      date: todayStr,
      quantity: '1',
    })
    setIsSaleModalOpen(true)
  }

  const handleOpenEditSale = (sale: Sale) => {
    setEditingSale(sale)
    setSaleFormData({
      recipe_id: sale.recipe_id,
      date: sale.date,
      quantity: sale.quantity.toString(),
    })
    setIsSaleModalOpen(true)
  }

  const handleSaveSale = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!saleFormData.recipe_id || !saleFormData.date || !saleFormData.quantity) {
      toast({
        title: 'Preencha todos os campos',
        description: 'Selecione o prato, informe a data e a quantidade vendida.',
        variant: 'destructive',
      })
      return
    }

    const qtyNum = parseInt(saleFormData.quantity, 10)
    if (isNaN(qtyNum) || qtyNum <= 0) {
      toast({
        title: 'Quantidade inválida',
        description: 'Informe um número inteiro positivo.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSavingSale(true)
      if (editingSale) {
        await salesService.update(editingSale.id, {
          recipe_id: saleFormData.recipe_id,
          date: saleFormData.date,
          quantity: qtyNum,
        })
        toast({ title: 'Venda atualizada com sucesso!' })
      } else {
        // Usa upsert para somar à data existente se for novo lançamento manual do mesmo prato
        const res = await salesService.upsertSale(saleFormData.recipe_id, saleFormData.date, qtyNum)
        if (res.action === 'updated') {
          toast({
            title: 'Venda acumulada com sucesso!',
            description: `A quantidade de ${qtyNum} un. foi somada ao registro já existente para esta data.`,
          })
        } else {
          toast({ title: 'Venda registrada com sucesso!' })
        }
      }
      setIsSaleModalOpen(false)
      loadData()
    } catch (error) {
      console.error('Erro ao salvar venda:', error)
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível registrar a venda.',
        variant: 'destructive',
      })
    } finally {
      setSavingSale(false)
    }
  }

  const handleDeleteSale = async () => {
    if (!deleteSaleConfirmId) return
    try {
      setDeletingSale(true)
      await salesService.delete(deleteSaleConfirmId)
      toast({ title: 'Venda excluída com sucesso!' })
      setDeleteSaleConfirmId(null)
      loadData()
    } catch (error) {
      console.error('Erro ao excluir venda:', error)
      toast({
        title: 'Erro ao excluir',
        description: 'Não foi possível remover o registro de venda.',
        variant: 'destructive',
      })
    } finally {
      setDeletingSale(false)
    }
  }

  // Handlers de Precificação / Margem
  const handleOpenEditPrice = (rw: RecipeWithCost) => {
    setEditingRecipe(rw)
    setNewSellingPrice(rw.selling_price ? rw.selling_price.toString() : '')
  }

  const handleApplyTargetMargin = (rw: RecipeWithCost, marginNum: number) => {
    if (marginNum >= 100) return
    const suggestedPrice = rw.costPerPortion / (1 - marginNum / 100)
    setNewSellingPrice(suggestedPrice.toFixed(2))
    setTargetMargin(marginNum.toString())
  }

  const handleSavePrice = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingRecipe) return

    const priceNum = parseFloat(newSellingPrice.replace(',', '.'))
    if (isNaN(priceNum) || priceNum < 0) {
      toast({
        title: 'Preço inválido',
        description: 'Informe um valor numérico válido.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSavingPrice(true)
      await recipesService.update(editingRecipe.id, {
        selling_price: priceNum,
      })
      toast({
        title: 'Preço atualizado com sucesso!',
        description: `Novo preço de ${formatCurrency(priceNum)} salvo para ${editingRecipe.name}.`,
      })
      setEditingRecipe(null)
      loadData()
    } catch (error) {
      console.error('Erro ao atualizar preço:', error)
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar o novo preço de venda.',
        variant: 'destructive',
      })
    } finally {
      setSavingPrice(false)
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Cabeçalho Unificado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
              <TrendingUp className="h-5 w-5" />
            </span>
            Vendas & Precificação
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Controle de vendas diárias, consolidação de margens de lucro e precificação inteligente
            por ficha técnica.
          </p>
        </div>

        {/* Botões de Ação Rápida */}
        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsImportModalOpen(true)}
            className="border-emerald-300 text-emerald-800 hover:bg-emerald-50 shadow-xs flex items-center gap-1.5"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            Importar Planilha (.xlsx)
          </Button>

          <Button
            type="button"
            onClick={handleOpenCreateSale}
            className="bg-amber-600 hover:bg-amber-700 text-white shadow-xs flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Lançar Venda Manual
          </Button>
        </div>
      </div>

      {/* Cards de Métricas Globais Unificadas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-xs border-slate-200 bg-white">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase font-semibold text-slate-500 flex items-center justify-between">
              <span>Faturamento Total</span>
              <DollarSign className="h-4 w-4 text-emerald-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-slate-900">
              {formatCurrency(globalMetrics.faturamento)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            {globalMetrics.vendas} porções vendidas no total
          </CardContent>
        </Card>

        <Card className="shadow-xs border-slate-200 bg-white">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase font-semibold text-slate-500 flex items-center justify-between">
              <span>Custo de Insumos (CMV)</span>
              <Scale className="h-4 w-4 text-amber-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-amber-700">
              {formatCurrency(globalMetrics.custo)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            Custo real da matéria-prima vendida
          </CardContent>
        </Card>

        <Card className="shadow-xs border-slate-200 bg-white">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase font-semibold text-slate-500 flex items-center justify-between">
              <span>Lucro Bruto Realizado</span>
              <Sparkles className="h-4 w-4 text-emerald-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-700">
              {formatCurrency(globalMetrics.lucro)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            Receita bruta menos custos diretos
          </CardContent>
        </Card>

        <Card className="shadow-xs border-slate-200 bg-white">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase font-semibold text-slate-500 flex items-center justify-between">
              <span>Margem Média Geral</span>
              <span className="text-xs font-bold text-blue-600">%</span>
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-blue-700">
              {formatPercent(globalMetrics.margemGlobal)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            Retorno consolidado sobre vendas
          </CardContent>
        </Card>
      </div>

      {/* Navegação por Abas: Consolidação vs Lançamentos Diários */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-slate-100 p-1 border border-slate-200">
          <TabsTrigger
            value="consolidado"
            className="text-xs sm:text-sm font-semibold gap-2 data-[state=active]:bg-white data-[state=active]:text-amber-900 data-[state=active]:shadow-xs"
          >
            <DollarSign className="h-4 w-4" />
            Consolidação & Precificação por Prato
          </TabsTrigger>
          <TabsTrigger
            value="vendas"
            className="text-xs sm:text-sm font-semibold gap-2 data-[state=active]:bg-white data-[state=active]:text-amber-900 data-[state=active]:shadow-xs"
          >
            <TrendingUp className="h-4 w-4" />
            Lançamentos de Vendas Diárias ({sales.length})
          </TabsTrigger>
        </TabsList>

        {/* ==================== ABA 1: CONSOLIDAÇÃO & PRECIFICAÇÃO ==================== */}
        <TabsContent value="consolidado" className="space-y-4 focus-visible:outline-none">
          {/* Barra de Busca */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar prato por nome..."
                className="pl-9 bg-slate-50 border-slate-200 text-sm"
                value={pricingSearch}
                onChange={(e) => setPricingSearch(e.target.value)}
              />
            </div>
            <p className="text-xs text-slate-500">
              Mostrando {filteredConsolidated.length} de {consolidatedList.length} pratos/guarnições
            </p>
          </div>

          {/* Tabela de Precificação e Rentabilidade */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
                <Loader2 className="h-7 w-7 animate-spin text-amber-600" />
                <p className="text-sm">Calculando custos e consolidação...</p>
              </div>
            ) : filteredConsolidated.length === 0 ? (
              <div className="p-12 text-center">
                <DollarSign className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-slate-800">
                  Nenhuma ficha para precificar
                </h3>
                <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
                  Cadastre suas fichas técnicas e insumos para visualizar a consolidação de
                  precificação.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50/75">
                    <TableRow>
                      <TableHead className="font-semibold text-slate-700">Prato / Ficha</TableHead>
                      <TableHead className="font-semibold text-slate-700">Tipo</TableHead>
                      <TableHead className="font-semibold text-slate-700 text-right">
                        Custo / Porção
                      </TableHead>
                      <TableHead className="font-semibold text-slate-700 text-right">
                        Preço Praticado
                      </TableHead>
                      <TableHead className="font-semibold text-slate-700 text-right">
                        Lucro / Porção
                      </TableHead>
                      <TableHead className="font-semibold text-slate-700 text-right">
                        Margem Unit.
                      </TableHead>
                      <TableHead className="font-semibold text-slate-700 text-center">
                        Vendas (un)
                      </TableHead>
                      <TableHead className="font-semibold text-slate-700 text-right">
                        Faturamento
                      </TableHead>
                      <TableHead className="font-semibold text-slate-700 text-right">
                        Lucro Total
                      </TableHead>
                      <TableHead className="font-semibold text-slate-700 text-right">
                        Ação
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredConsolidated.map((item) => {
                      const rw = item.recipe
                      const hasPrice = rw.selling_price > 0

                      return (
                        <TableRow key={rw.id} className="hover:bg-slate-50/50">
                          <TableCell className="font-semibold text-slate-900">
                            <div className="flex items-center gap-2">
                              {rw.type === 'prato' ? (
                                <Utensils className="h-4 w-4 text-amber-600 shrink-0" />
                              ) : (
                                <CookingPot className="h-4 w-4 text-orange-500 shrink-0" />
                              )}
                              <span>{rw.name}</span>
                            </div>
                          </TableCell>

                          <TableCell>
                            {rw.type === 'prato' ? (
                              <Badge className="bg-amber-100 text-amber-900 border-amber-200 font-medium">
                                Prato
                              </Badge>
                            ) : (
                              <Badge className="bg-orange-100 text-orange-900 border-orange-200 font-medium">
                                Guarnição
                              </Badge>
                            )}
                          </TableCell>

                          <TableCell className="text-right font-medium text-slate-700">
                            {formatCurrency(rw.costPerPortion)}
                          </TableCell>

                          <TableCell className="text-right font-bold text-slate-900">
                            {hasPrice ? (
                              formatCurrency(rw.selling_price)
                            ) : (
                              <span className="text-xs text-amber-600 font-medium">
                                Não definido
                              </span>
                            )}
                          </TableCell>

                          <TableCell className="text-right font-semibold text-emerald-700">
                            {hasPrice ? (
                              formatCurrency(rw.profitPerPortion)
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </TableCell>

                          <TableCell className="text-right">
                            {hasPrice ? (
                              <span
                                className={`inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full ${
                                  rw.marginPercent >= 60
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : rw.marginPercent >= 40
                                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                                }`}
                              >
                                {formatPercent(rw.marginPercent)}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </TableCell>

                          <TableCell className="text-center font-bold text-slate-800">
                            {item.totalSold > 0 ? (
                              item.totalSold
                            ) : (
                              <span className="text-xs text-slate-400 font-normal">0</span>
                            )}
                          </TableCell>

                          <TableCell className="text-right font-medium text-slate-900">
                            {formatCurrency(item.totalRevenue)}
                          </TableCell>

                          <TableCell className="text-right font-bold text-emerald-700">
                            {formatCurrency(item.totalProfit)}
                          </TableCell>

                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenEditPrice(rw)}
                              className="text-xs h-7 px-2 border-slate-300 hover:border-amber-500 hover:text-amber-800"
                            >
                              <Pencil className="h-3 w-3 mr-1" />
                              Simular / Ajustar
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ==================== ABA 2: LANÇAMENTOS DE VENDAS DIÁRIAS ==================== */}
        <TabsContent value="vendas" className="space-y-4 focus-visible:outline-none">
          {/* Barra de Filtros */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex flex-col sm:flex-row gap-3 flex-1">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                <Input
                  type="date"
                  className="w-full sm:w-[180px] text-sm bg-slate-50 border-slate-200"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                />
                {dateFilter && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDateFilter('')}
                    className="text-xs text-slate-500 hover:text-slate-900"
                  >
                    Limpar data
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-slate-400 shrink-0" />
                <Select value={selectedRecipeFilter} onValueChange={setSelectedRecipeFilter}>
                  <SelectTrigger className="w-full sm:w-[240px] text-sm bg-slate-50 border-slate-200">
                    <SelectValue placeholder="Filtrar por prato" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os pratos e guarnições</SelectItem>
                    {recipes.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="text-xs text-slate-500 self-end sm:self-center">
              {filteredSales.length} {filteredSales.length === 1 ? 'registro' : 'registros'}
            </div>
          </div>

          {/* Tabela de Vendas */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
                <Loader2 className="h-7 w-7 animate-spin text-amber-600" />
                <p className="text-sm">Carregando lançamentos de vendas...</p>
              </div>
            ) : filteredSales.length === 0 ? (
              <div className="p-12 text-center">
                <TrendingUp className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-slate-800">Nenhuma venda encontrada</h3>
                <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
                  {dateFilter || selectedRecipeFilter !== 'all'
                    ? 'Nenhum lançamento corresponde ao filtro especificado.'
                    : 'Lance as primeiras vendas do dia ou importe uma planilha .xlsx para começar.'}
                </p>
                <div className="mt-4 flex items-center justify-center gap-2">
                  <Button
                    onClick={() => setIsImportModalOpen(true)}
                    variant="outline"
                    className="border-emerald-300 text-emerald-800 hover:bg-emerald-50 text-xs"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                    Importar Planilha
                  </Button>
                  <Button
                    onClick={handleOpenCreateSale}
                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Lançar Manualmente
                  </Button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50/75">
                    <TableRow>
                      <TableHead className="font-semibold text-slate-700">Data</TableHead>
                      <TableHead className="font-semibold text-slate-700">
                        Prato / Guarnição
                      </TableHead>
                      <TableHead className="font-semibold text-slate-700">Tipo</TableHead>
                      <TableHead className="font-semibold text-slate-700 text-center">
                        Qtd. Vendida
                      </TableHead>
                      <TableHead className="font-semibold text-slate-700 text-right">
                        Preço Unitário
                      </TableHead>
                      <TableHead className="font-semibold text-slate-700 text-right">
                        Total Bruto
                      </TableHead>
                      <TableHead className="font-semibold text-slate-700 text-right">
                        Ações
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSales.map((sale) => {
                      const r = recipes.find((rec) => rec.id === sale.recipe_id)
                      const unitPrice = r?.selling_price || 0
                      const total = sale.quantity * unitPrice

                      return (
                        <TableRow key={sale.id} className="hover:bg-slate-50/50">
                          <TableCell className="font-medium text-slate-900 whitespace-nowrap">
                            {sale.date.split('-').reverse().join('/')}
                          </TableCell>

                          <TableCell className="font-semibold text-slate-900">
                            <div className="flex items-center gap-2">
                              {r?.type === 'prato' ? (
                                <Utensils className="h-4 w-4 text-amber-600 shrink-0" />
                              ) : (
                                <CookingPot className="h-4 w-4 text-orange-500 shrink-0" />
                              )}
                              <span>{r?.name || 'Prato não encontrado'}</span>
                            </div>
                          </TableCell>

                          <TableCell>
                            {r?.type === 'prato' ? (
                              <Badge className="bg-amber-100 text-amber-900 border-amber-200 font-medium">
                                Prato
                              </Badge>
                            ) : (
                              <Badge className="bg-orange-100 text-orange-900 border-orange-200 font-medium">
                                Guarnição
                              </Badge>
                            )}
                          </TableCell>

                          <TableCell className="text-center font-bold text-slate-900">
                            {sale.quantity}
                          </TableCell>

                          <TableCell className="text-right text-slate-700 font-medium">
                            {unitPrice > 0 ? formatCurrency(unitPrice) : '-'}
                          </TableCell>

                          <TableCell className="text-right font-bold text-emerald-700">
                            {formatCurrency(total)}
                          </TableCell>

                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenEditSale(sale)}
                                className="h-8 w-8 text-slate-600 hover:text-amber-700 hover:bg-amber-50"
                                title="Editar lançamento"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeleteSaleConfirmId(sale.id)}
                                className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                title="Excluir lançamento"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Modal Importar Planilha Excel */}
      <ImportSalesDialog
        open={isImportModalOpen}
        onOpenChange={setIsImportModalOpen}
        recipes={recipes}
        onSuccess={loadData}
      />

      {/* Modal Lançar / Editar Venda Manual */}
      <Dialog open={isSaleModalOpen} onOpenChange={setIsSaleModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSaveSale}>
            <DialogHeader>
              <DialogTitle>
                {editingSale ? 'Editar Lançamento de Venda' : 'Registrar Venda Manual'}
              </DialogTitle>
              <DialogDescription>
                Informe o prato vendido, a data do serviço e a quantidade de porções. Se já existir
                venda para este prato nesta data, a quantidade será somada.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="s-recipe">Prato / Guarnição *</Label>
                <Select
                  value={saleFormData.recipe_id}
                  onValueChange={(val) => setSaleFormData({ ...saleFormData, recipe_id: val })}
                >
                  <SelectTrigger id="s-recipe">
                    <SelectValue placeholder="Selecione o prato..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {recipes.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name} ({formatCurrency(r.selling_price || 0)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="s-date">Data da Venda *</Label>
                  <Input
                    id="s-date"
                    type="date"
                    value={saleFormData.date}
                    onChange={(e) => setSaleFormData({ ...saleFormData, date: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="s-qty">Quantidade Vendida *</Label>
                  <Input
                    id="s-qty"
                    type="number"
                    min="1"
                    step="1"
                    value={saleFormData.quantity}
                    onChange={(e) => setSaleFormData({ ...saleFormData, quantity: e.target.value })}
                    required
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsSaleModalOpen(false)}
                disabled={savingSale}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={savingSale}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {savingSale && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingSale ? 'Salvar Venda' : 'Confirmar Lançamento'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Exclusão Venda */}
      <Dialog open={!!deleteSaleConfirmId} onOpenChange={() => setDeleteSaleConfirmId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir Lançamento</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir este registro de venda? Os cálculos consolidados de
              faturamento e lucro serão recalculados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteSaleConfirmId(null)}
              disabled={deletingSale}
            >
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteSale} disabled={deletingSale}>
              {deletingSale && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir Registro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Ajustar Preço de Venda / Simulador de Margem Alvo */}
      <Dialog open={!!editingRecipe} onOpenChange={() => setEditingRecipe(null)}>
        <DialogContent className="sm:max-w-md">
          {editingRecipe && (
            <form onSubmit={handleSavePrice}>
              <DialogHeader>
                <DialogTitle>Definir Preço de Venda & Margem</DialogTitle>
                <DialogDescription>
                  Ajuste o valor praticado ou simule margens para{' '}
                  <strong>{editingRecipe.name}</strong>.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Custo por porção:</span>
                    <span className="font-bold text-slate-800">
                      {formatCurrency(editingRecipe.costPerPortion)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Rendimento da ficha:</span>
                    <span className="font-medium text-slate-700">
                      {editingRecipe.yield_portions} porções
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="p-price">Novo Preço de Venda (R$) *</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-400 text-sm">R$</span>
                    <Input
                      id="p-price"
                      type="number"
                      step="0.01"
                      min="0"
                      className="pl-9 font-bold text-slate-900"
                      value={newSellingPrice}
                      onChange={(e) => setNewSellingPrice(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Simulador rápido de Margem Alvo (50%, 60%, 70%) */}
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg space-y-2">
                  <p className="text-xs font-semibold text-amber-950 flex items-center gap-1">
                    <Calculator className="h-3.5 w-3.5" />
                    Simular por Margem Alvo:
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleApplyTargetMargin(editingRecipe, 50)}
                      className={`text-xs h-7 bg-white hover:bg-amber-100 ${
                        targetMargin === '50'
                          ? 'border-amber-600 text-amber-950 font-bold'
                          : 'text-amber-900'
                      }`}
                    >
                      50% de margem
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleApplyTargetMargin(editingRecipe, 60)}
                      className={`text-xs h-7 bg-white hover:bg-amber-100 ${
                        targetMargin === '60'
                          ? 'border-amber-600 text-amber-950 font-bold'
                          : 'text-amber-900'
                      }`}
                    >
                      60% de margem
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleApplyTargetMargin(editingRecipe, 70)}
                      className={`text-xs h-7 bg-white hover:bg-amber-100 ${
                        targetMargin === '70'
                          ? 'border-amber-600 text-amber-950 font-bold'
                          : 'text-amber-900'
                      }`}
                    >
                      70% de margem
                    </Button>
                  </div>
                </div>

                {/* Pré-visualização da Margem Resultante */}
                {parseFloat(newSellingPrice) > 0 && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-emerald-800">Lucro unitário estimado:</span>
                      <span className="font-bold text-emerald-900">
                        {formatCurrency(parseFloat(newSellingPrice) - editingRecipe.costPerPortion)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-emerald-800">Margem percentual:</span>
                      <span className="font-bold text-emerald-900">
                        {(
                          ((parseFloat(newSellingPrice) - editingRecipe.costPerPortion) /
                            parseFloat(newSellingPrice)) *
                          100
                        ).toFixed(1)}
                        %
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingRecipe(null)}
                  disabled={savingPrice}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={savingPrice}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {savingPrice && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Atualizar Preço
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
