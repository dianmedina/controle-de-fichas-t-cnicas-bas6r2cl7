import React, { useEffect, useState, useMemo } from 'react'
import { recipesService, RecipeWithCost } from '@/services/recipes'
import { salesService } from '@/services/sales'
import { Sale, formatCurrency, formatPercent } from '@/types/restaurant'
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import {
  DollarSign,
  TrendingUp,
  Search,
  Pencil,
  Loader2,
  Utensils,
  CookingPot,
  Sparkles,
  ArrowUpRight,
  Calculator,
  Percent,
} from 'lucide-react'

interface PricingConsolidation {
  recipe: RecipeWithCost
  totalSold: number
  totalRevenue: number
  totalCost: number
  totalProfit: number
  overallMargin: number
}

export default function Precificacao() {
  const { toast } = useToast()
  const [recipesWithCost, setRecipesWithCost] = useState<RecipeWithCost[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  // Modal para atualizar preço de venda rápido
  const [editingRecipe, setEditingRecipe] = useState<RecipeWithCost | null>(null)
  const [newSellingPrice, setNewSellingPrice] = useState('')
  const [savingPrice, setSavingPrice] = useState(false)

  // Sugestor de preço por margem alvo
  const [targetMargin, setTargetMargin] = useState('60')

  const loadData = async () => {
    try {
      setLoading(true)
      const [allRecipes, allItems, allSales] = await Promise.all([
        recipesService.getAll(),
        recipesService.getAllRecipeItems(),
        salesService.getAll(),
      ])

      const enriched = allRecipes.map((r) => {
        const items = allItems.filter((i) => i.recipe_id === r.id)
        return recipesService.computeCosts(r, items)
      })

      setRecipesWithCost(enriched)
      setSales(allSales)
    } catch (error) {
      console.error('Erro ao carregar dados de precificação:', error)
      toast({
        title: 'Erro ao carregar precificação',
        description: 'Não foi possível carregar os dados financeiros.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Consolidação por prato
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

  // Filtragem de busca
  const filteredList = useMemo(() => {
    return consolidatedList.filter((item) =>
      item.recipe.name.toLowerCase().includes(searchTerm.toLowerCase()),
    )
  }, [consolidatedList, searchTerm])

  // Totais globais
  const globalSummary = useMemo(() => {
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

  const handleOpenEditPrice = (rw: RecipeWithCost) => {
    setEditingRecipe(rw)
    setNewSellingPrice(rw.selling_price ? rw.selling_price.toString() : '')
  }

  const handleApplyTargetMargin = (rw: RecipeWithCost) => {
    const margin = parseFloat(targetMargin) || 60
    if (margin >= 100) return
    // Preço = Custo / (1 - Margem/100)
    const suggestedPrice = rw.costPerPortion / (1 - margin / 100)
    setNewSellingPrice(suggestedPrice.toFixed(2))
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
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-emerald-600" />
            Consolidação de Precificação & Rentabilidade
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Análise consolidada por prato: custo por porção, preço de venda, margem de contribuição
            e lucro realizado por vendas.
          </p>
        </div>
      </div>

      {/* Cards de Resumo Global */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-xs border-slate-200 bg-white">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase font-semibold text-slate-500">
              Faturamento Consolidado
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-slate-900">
              {formatCurrency(globalSummary.faturamento)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            Receita total baseada nas vendas registradas
          </CardContent>
        </Card>

        <Card className="shadow-xs border-slate-200 bg-white">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase font-semibold text-slate-500">
              Custo de Insumos (CMV)
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-amber-700">
              {formatCurrency(globalSummary.custo)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            Custo total de matéria-prima das porções vendidas
          </CardContent>
        </Card>

        <Card className="shadow-xs border-slate-200 bg-white">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase font-semibold text-slate-500">
              Lucro Bruto Realizado
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-700">
              {formatCurrency(globalSummary.lucro)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            Faturamento menos o custo de insumos
          </CardContent>
        </Card>

        <Card className="shadow-xs border-slate-200 bg-white">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase font-semibold text-slate-500">
              Margem Média Consolidada
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-blue-700">
              {formatPercent(globalSummary.margemGlobal)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            {globalSummary.vendas} porções vendidas no período
          </CardContent>
        </Card>
      </div>

      {/* Busca */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar prato por nome..."
            className="pl-9 bg-slate-50 border-slate-200 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Tabela de Consolidação */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-7 w-7 animate-spin text-amber-600" />
            <p className="text-sm">Calculando indicadores financeiros...</p>
          </div>
        ) : filteredList.length === 0 ? (
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
                    Preço de Venda
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
                  <TableHead className="font-semibold text-slate-700 text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredList.map((item) => {
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
                          <span className="text-xs text-amber-600 font-medium">Não definido</span>
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
                          Alterar Preço
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

      {/* Modal Ajustar Preço de Venda */}
      <Dialog open={!!editingRecipe} onOpenChange={() => setEditingRecipe(null)}>
        <DialogContent className="sm:max-w-md">
          {editingRecipe && (
            <form onSubmit={handleSavePrice}>
              <DialogHeader>
                <DialogTitle>Definir Preço de Venda</DialogTitle>
                <DialogDescription>
                  Ajuste o valor praticado para <strong>{editingRecipe.name}</strong>.
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

                {/* Simulador rápido de Margem Alvo */}
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
                      onClick={() => {
                        setTargetMargin('50')
                        const p = editingRecipe.costPerPortion / 0.5
                        setNewSellingPrice(p.toFixed(2))
                      }}
                      className="text-xs h-7 bg-white hover:bg-amber-100 text-amber-900"
                    >
                      50% de margem
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setTargetMargin('60')
                        const p = editingRecipe.costPerPortion / 0.4
                        setNewSellingPrice(p.toFixed(2))
                      }}
                      className="text-xs h-7 bg-white hover:bg-amber-100 text-amber-900"
                    >
                      60% de margem
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setTargetMargin('70')
                        const p = editingRecipe.costPerPortion / 0.3
                        setNewSellingPrice(p.toFixed(2))
                      }}
                      className="text-xs h-7 bg-white hover:bg-amber-100 text-amber-900"
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
