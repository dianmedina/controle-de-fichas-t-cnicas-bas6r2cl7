import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { recipesService } from '@/services/recipes'
import { Recipe, formatCurrency } from '@/types/restaurant'
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import {
  Settings,
  DollarSign,
  Save,
  Loader2,
  Utensils,
  CookingPot,
  CheckCircle2,
  Info,
  FolderTree,
  ArrowRight,
} from 'lucide-react'

export default function Configuracoes() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [pricesState, setPricesState] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savingAll, setSavingAll] = useState(false)

  const loadRecipes = async () => {
    try {
      setLoading(true)
      const data = await recipesService.getAll()
      setRecipes(data)

      const stateMap: Record<string, string> = {}
      data.forEach((r) => {
        stateMap[r.id] = r.selling_price ? r.selling_price.toString() : ''
      })
      setPricesState(stateMap)
    } catch (error) {
      console.error('Erro ao carregar pratos:', error)
      toast({
        title: 'Erro ao carregar pratos',
        description: 'Não foi possível buscar a lista de pratos.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRecipes()
  }, [])

  const handlePriceChange = (id: string, value: string) => {
    setPricesState((prev) => ({ ...prev, [id]: value }))
  }

  const handleSaveSinglePrice = async (recipe: Recipe) => {
    const val = pricesState[recipe.id]
    const priceNum = val ? parseFloat(val.replace(',', '.')) : 0

    if (isNaN(priceNum) || priceNum < 0) {
      toast({
        title: 'Preço inválido',
        description: 'Informe um número válido.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSavingId(recipe.id)
      await recipesService.update(recipe.id, {
        selling_price: priceNum,
      })
      toast({
        title: 'Preço atualizado!',
        description: `${recipe.name} agora custa ${formatCurrency(priceNum)}.`,
      })
      loadRecipes()
    } catch (error) {
      console.error('Erro ao atualizar preço:', error)
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar o preço.',
        variant: 'destructive',
      })
    } finally {
      setSavingId(null)
    }
  }

  const handleSaveAll = async () => {
    try {
      setSavingAll(true)
      const updates = recipes.map(async (r) => {
        const val = pricesState[r.id]
        const priceNum = val ? parseFloat(val.replace(',', '.')) : 0
        if (!isNaN(priceNum) && priceNum >= 0 && priceNum !== r.selling_price) {
          return recipesService.update(r.id, { selling_price: priceNum })
        }
        return Promise.resolve(r)
      })

      await Promise.all(updates)
      toast({
        title: 'Todos os preços foram atualizados!',
        description: 'As alterações foram salvas com sucesso.',
      })
      loadRecipes()
    } catch (error) {
      console.error('Erro ao salvar em lote:', error)
      toast({
        title: 'Erro ao salvar alterações',
        description: 'Ocorreu um erro ao atualizar os preços.',
        variant: 'destructive',
      })
    } finally {
      setSavingAll(false)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Settings className="h-6 w-6 text-slate-700" />
            Configurações do Cardápio
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Definição em massa dos preços de venda praticados para pratos e guarnições do
            restaurante.
          </p>
        </div>
        <Button
          onClick={handleSaveAll}
          disabled={savingAll || loading || recipes.length === 0}
          className="bg-amber-600 hover:bg-amber-700 text-white shadow-sm flex items-center gap-1.5 self-start sm:self-auto"
        >
          {savingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar Todos os Preços
        </Button>
      </div>

      {/* Bloco 0: Atalho para Cadastros (Tipos de Pratos & Categorias de Insumos) */}
      <Card className="border-amber-200 bg-gradient-to-r from-amber-50/70 via-white to-orange-50/50 shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2 text-amber-950">
                <FolderTree className="h-5 w-5 text-amber-600" />
                Cadastros de Tipos de Pratos & Categorias de Insumos
              </CardTitle>
              <CardDescription className="text-slate-600 mt-1">
                Personalize os tipos de fichas técnicas (pratos, guarnições, sobremesas...) e as
                categorias dos insumos sem depender de planilhas de importação.
              </CardDescription>
            </div>
            <Button
              onClick={() => navigate('/cadastros')}
              className="bg-amber-600 hover:bg-amber-700 text-white shrink-0 gap-1.5"
            >
              Gerenciar Cadastros
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-3">
        <Info className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-slate-900">Como funciona a precificação:</p>
          <p className="mt-0.5 text-slate-700">
            Os preços alterados aqui afetam diretamente o cálculo de margem e o faturamento total
            gerado nos relatórios de vendas e precificação do restaurante.
          </p>
        </div>
      </div>

      {/* Tabela de Preços */}
      <Card className="border-slate-200 shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold text-slate-900">
            Preços de Venda Praticados
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Ajuste unitário ou salve todos os pratos de uma vez
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-amber-600" />
              <p className="text-sm">Carregando pratos...</p>
            </div>
          ) : recipes.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              Nenhuma ficha técnica cadastrada para configurar preços.
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-50/75">
                <TableRow>
                  <TableHead className="font-semibold text-slate-700">Prato / Item</TableHead>
                  <TableHead className="font-semibold text-slate-700">Tipo</TableHead>
                  <TableHead className="font-semibold text-slate-700 text-center">
                    Rendimento
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 text-right">
                    Preço de Venda (R$)
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipes.map((recipe) => (
                  <TableRow key={recipe.id} className="hover:bg-slate-50/50">
                    <TableCell className="font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        {recipe.type === 'prato' ? (
                          <Utensils className="h-4 w-4 text-amber-600 shrink-0" />
                        ) : (
                          <CookingPot className="h-4 w-4 text-orange-500 shrink-0" />
                        )}
                        <span>{recipe.name}</span>
                      </div>
                    </TableCell>

                    <TableCell>
                      {recipe.type === 'prato' ? (
                        <Badge className="bg-amber-100 text-amber-900 border-amber-200 font-medium">
                          Prato
                        </Badge>
                      ) : (
                        <Badge className="bg-orange-100 text-orange-900 border-orange-200 font-medium">
                          Guarnição
                        </Badge>
                      )}
                    </TableCell>

                    <TableCell className="text-center text-slate-600 text-sm">
                      {recipe.yield_portions} {recipe.yield_portions > 1 ? 'porções' : 'porção'}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="text-slate-400 text-xs">R$</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          className="w-28 text-right font-bold text-slate-900 h-8"
                          value={pricesState[recipe.id] ?? ''}
                          onChange={(e) => handlePriceChange(recipe.id, e.target.value)}
                        />
                      </div>
                    </TableCell>

                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={savingId === recipe.id}
                        onClick={() => handleSaveSinglePrice(recipe)}
                        className="text-xs h-8 border-slate-300 hover:border-amber-600 hover:text-amber-800"
                      >
                        {savingId === recipe.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <Save className="h-3.5 w-3.5 mr-1" />
                            Salvar
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
