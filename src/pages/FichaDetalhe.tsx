import React, { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { recipesService, RecipeWithCost } from '@/services/recipes'
import { ingredientsService } from '@/services/ingredients'
import {
  Recipe,
  RecipeItem,
  Ingredient,
  MeasurementUnit,
  calculateItemCost,
  formatCurrency,
  formatPercent,
} from '@/types/restaurant'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { useToast } from '@/hooks/use-toast'
import {
  ArrowLeft,
  Plus,
  Trash2,
  Pencil,
  ScrollText,
  DollarSign,
  PieChart,
  Percent,
  CookingPot,
  Utensils,
  Loader2,
  Save,
  Scale,
  Sparkles,
} from 'lucide-react'

const UNITS: MeasurementUnit[] = ['kg', 'g', 'L', 'mL', 'unidade']

export default function FichaDetalhe() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [items, setItems] = useState<RecipeItem[]>([])
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)

  // Edição dos dados da Ficha
  const [isEditingHeader, setIsEditingHeader] = useState(false)
  const [headerData, setHeaderData] = useState({
    name: '',
    type: 'prato' as 'prato' | 'guarnicao',
    yield_portions: '1',
    selling_price: '',
    notes: '',
  })
  const [savingHeader, setSavingHeader] = useState(false)

  // Modal Adicionar / Editar Item
  const [isItemModalOpen, setIsItemModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<RecipeItem | null>(null)
  const [selectedIngredientId, setSelectedIngredientId] = useState<string>('')
  const [itemQuantity, setItemQuantity] = useState<string>('')
  const [itemUnit, setItemUnit] = useState<MeasurementUnit>('g')
  const [savingItem, setSavingItem] = useState(false)

  // Confirmação de exclusão de item
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null)

  const loadRecipeData = async () => {
    if (!id) return
    try {
      setLoading(true)
      const [r, recItems, ings] = await Promise.all([
        recipesService.getById(id),
        recipesService.getItemsByRecipeId(id),
        ingredientsService.getAll(),
      ])

      setRecipe(r)
      setItems(recItems)
      setAllIngredients(ings)

      setHeaderData({
        name: r.name,
        type: r.type,
        yield_portions: r.yield_portions ? r.yield_portions.toString() : '1',
        selling_price: r.selling_price ? r.selling_price.toString() : '',
        notes: r.notes || '',
      })
    } catch (error) {
      console.error('Erro ao carregar detalhes da ficha:', error)
      toast({
        title: 'Erro ao carregar ficha',
        description: 'Não foi possível buscar os dados da ficha técnica solicitada.',
        variant: 'destructive',
      })
      navigate('/fichas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRecipeData()
  }, [id])

  // Cálculo financeiro da receita atual
  const costSummary: RecipeWithCost | null = useMemo(() => {
    if (!recipe) return null
    return recipesService.computeCosts(recipe, items)
  }, [recipe, items])

  // Abre modal de adicionar insumo
  const handleOpenAddItem = () => {
    setEditingItem(null)
    const firstIng = allIngredients[0]
    if (firstIng) {
      setSelectedIngredientId(firstIng.id)
      setItemUnit(firstIng.unit === 'kg' ? 'g' : firstIng.unit === 'L' ? 'mL' : firstIng.unit)
    } else {
      setSelectedIngredientId('')
      setItemUnit('g')
    }
    setItemQuantity('')
    setIsItemModalOpen(true)
  }

  // Abre modal de editar item
  const handleOpenEditItem = (item: RecipeItem) => {
    setEditingItem(item)
    setSelectedIngredientId(item.ingredient_id)
    setItemQuantity(item.quantity.toString())
    setItemUnit(item.unit)
    setIsItemModalOpen(true)
  }

  // Quando o usuário troca o insumo no select, ajusta a unidade padrão
  const handleSelectIngredient = (ingId: string) => {
    setSelectedIngredientId(ingId)
    const found = allIngredients.find((i) => i.id === ingId)
    if (found) {
      if (found.unit === 'kg') setItemUnit('g')
      else if (found.unit === 'L') setItemUnit('mL')
      else setItemUnit(found.unit)
    }
  }

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedIngredientId || !itemQuantity || !id) {
      toast({
        title: 'Preenchimento incompleto',
        description: 'Selecione um insumo e digite a quantidade utilizada.',
        variant: 'destructive',
      })
      return
    }

    const qtyNum = parseFloat(itemQuantity.replace(',', '.'))
    if (isNaN(qtyNum) || qtyNum <= 0) {
      toast({
        title: 'Quantidade inválida',
        description: 'Informe uma quantidade numérica maior que zero.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSavingItem(true)
      if (editingItem) {
        await recipesService.updateItem(editingItem.id, {
          ingredient_id: selectedIngredientId,
          quantity: qtyNum,
          unit: itemUnit,
        })
        toast({ title: 'Item atualizado!' })
      } else {
        await recipesService.addItem({
          recipe_id: id,
          ingredient_id: selectedIngredientId,
          quantity: qtyNum,
          unit: itemUnit,
        })
        toast({ title: 'Insumo adicionado à ficha técnica!' })
      }
      setIsItemModalOpen(false)
      // Recarrega itens
      const updatedItems = await recipesService.getItemsByRecipeId(id)
      setItems(updatedItems)
    } catch (error) {
      console.error('Erro ao salvar item:', error)
      toast({
        title: 'Erro ao salvar insumo',
        description: 'Ocorreu uma falha ao vincular o insumo à ficha.',
        variant: 'destructive',
      })
    } finally {
      setSavingItem(false)
    }
  }

  const handleDeleteItem = async (itemId: string) => {
    if (!id) return
    try {
      await recipesService.deleteItem(itemId)
      toast({ title: 'Insumo removido da ficha técnica!' })
      setDeletingItemId(null)
      const updatedItems = await recipesService.getItemsByRecipeId(id)
      setItems(updatedItems)
    } catch (error) {
      console.error('Erro ao remover item:', error)
      toast({
        title: 'Erro ao remover insumo',
        description: 'Não foi possível desvincular o insumo.',
        variant: 'destructive',
      })
    }
  }

  const handleSaveHeader = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!recipe || !id) return
    if (!headerData.name.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Informe o nome do prato.',
        variant: 'destructive',
      })
      return
    }

    const portionsNum = parseFloat(headerData.yield_portions.replace(',', '.')) || 1
    const priceNum = headerData.selling_price
      ? parseFloat(headerData.selling_price.replace(',', '.'))
      : 0

    try {
      setSavingHeader(true)
      const updated = await recipesService.update(id, {
        name: headerData.name.trim(),
        type: headerData.type,
        yield_portions: portionsNum,
        selling_price: priceNum,
        notes: headerData.notes.trim() || undefined,
      })
      setRecipe(updated)
      setIsEditingHeader(false)
      toast({ title: 'Dados da ficha atualizados!' })
    } catch (error) {
      console.error('Erro ao atualizar cabeçalho:', error)
      toast({
        title: 'Erro ao salvar ficha',
        description: 'Não foi possível atualizar as informações.',
        variant: 'destructive',
      })
    } finally {
      setSavingHeader(false)
    }
  }

  if (loading) {
    return (
      <div className="p-16 text-center flex flex-col items-center justify-center gap-3 text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
        <p className="text-sm">Carregando detalhes da ficha técnica...</p>
      </div>
    )
  }

  if (!recipe || !costSummary) {
    return null
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Botão Voltar e Ações */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/fichas')}
          className="text-slate-600 hover:text-slate-900 -ml-2"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Voltar para Fichas Técnicas
        </Button>

        <div className="flex items-center gap-2">
          {!isEditingHeader && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditingHeader(true)}
              className="text-slate-700"
            >
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Editar Dados Gerais
            </Button>
          )}
        </div>
      </div>

      {/* Formulário de Cabeçalho (Modo Edição ou Visualização) */}
      {isEditingHeader ? (
        <Card className="border-amber-300 shadow-md bg-amber-50/20">
          <form onSubmit={handleSaveHeader}>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Pencil className="h-4 w-4 text-amber-700" />
                Editar Informações da Ficha Técnica
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="h-name">Nome do Prato / Ficha *</Label>
                  <Input
                    id="h-name"
                    value={headerData.name}
                    onChange={(e) => setHeaderData({ ...headerData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="h-type">Tipo *</Label>
                  <Select
                    value={headerData.type}
                    onValueChange={(val: 'prato' | 'guarnicao') =>
                      setHeaderData({ ...headerData, type: val })
                    }
                  >
                    <SelectTrigger id="h-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="prato">Prato Principal</SelectItem>
                      <SelectItem value="guarnicao">Guarnição</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="h-yield">Rendimento da Receita (porções) *</Label>
                  <Input
                    id="h-yield"
                    type="number"
                    step="0.5"
                    min="0.1"
                    value={headerData.yield_portions}
                    onChange={(e) =>
                      setHeaderData({ ...headerData, yield_portions: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="h-price">Preço de Venda Praticado (R$)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-400 text-sm">R$</span>
                    <Input
                      id="h-price"
                      type="number"
                      step="0.01"
                      min="0"
                      className="pl-9"
                      value={headerData.selling_price}
                      onChange={(e) =>
                        setHeaderData({ ...headerData, selling_price: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="h-notes">Modo de Preparo e Observações</Label>
                <Textarea
                  id="h-notes"
                  rows={3}
                  value={headerData.notes}
                  onChange={(e) => setHeaderData({ ...headerData, notes: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditingHeader(false)}
                  disabled={savingHeader}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={savingHeader}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {savingHeader && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Save className="h-4 w-4 mr-1.5" />
                  Salvar Alterações
                </Button>
              </div>
            </CardContent>
          </form>
        </Card>
      ) : (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">{recipe.name}</h1>
              {recipe.type === 'prato' ? (
                <Badge className="bg-amber-100 text-amber-900 border-amber-200 font-medium">
                  Prato Principal
                </Badge>
              ) : (
                <Badge className="bg-orange-100 text-orange-900 border-orange-200 font-medium">
                  Guarnição
                </Badge>
              )}
            </div>

            <p className="text-sm text-slate-600 max-w-2xl">
              {recipe.notes || (
                <span className="italic text-slate-400">Sem modo de preparo cadastrado.</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-4 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6 shrink-0">
            <div>
              <p className="text-xs uppercase font-semibold text-slate-400">Rendimento</p>
              <p className="text-xl font-bold text-slate-800">
                {recipe.yield_portions} {recipe.yield_portions > 1 ? 'porções' : 'porção'}
              </p>
            </div>
            <div className="w-px h-8 bg-slate-200" />
            <div>
              <p className="text-xs uppercase font-semibold text-slate-400">Preço de Venda</p>
              <p className="text-xl font-bold text-slate-900">
                {recipe.selling_price > 0 ? (
                  formatCurrency(recipe.selling_price)
                ) : (
                  <span className="text-sm text-slate-400 italic">Não definido</span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Indicadores Financeiros da Ficha */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-xs border-slate-200 bg-white">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs font-semibold uppercase text-slate-500 flex items-center justify-between">
              <span>Custo Total da Batelada</span>
              <DollarSign className="h-4 w-4 text-slate-400" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-slate-900">
              {formatCurrency(costSummary.totalCost)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1 text-xs text-slate-500">
            Soma exata de todos os ingredientes utilizados
          </CardContent>
        </Card>

        <Card className="shadow-xs border-slate-200 bg-white">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs font-semibold uppercase text-slate-500 flex items-center justify-between">
              <span>Custo por Porção (CMV)</span>
              <Scale className="h-4 w-4 text-amber-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-amber-700">
              {formatCurrency(costSummary.costPerPortion)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1 text-xs text-slate-500">
            Custo unitário por prato servido ao cliente
          </CardContent>
        </Card>

        <Card className="shadow-xs border-slate-200 bg-white">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs font-semibold uppercase text-slate-500 flex items-center justify-between">
              <span>Lucro Bruto por Porção</span>
              <Sparkles className="h-4 w-4 text-emerald-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-700">
              {recipe.selling_price > 0 ? (
                formatCurrency(costSummary.profitPerPortion)
              ) : (
                <span className="text-base text-slate-400 font-normal">Defina o preço</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1 text-xs text-slate-500">
            Preço de venda menos o custo por porção
          </CardContent>
        </Card>

        <Card className="shadow-xs border-slate-200 bg-white">
          <CardHeader className="p-4 pb-1">
            <CardDescription className="text-xs font-semibold uppercase text-slate-500 flex items-center justify-between">
              <span>Margem de Contribuição</span>
              <Percent className="h-4 w-4 text-blue-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-blue-700">
              {recipe.selling_price > 0 ? (
                formatPercent(costSummary.marginPercent)
              ) : (
                <span className="text-base text-slate-400 font-normal">-</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1 text-xs text-slate-500">
            {costSummary.marginPercent >= 60
              ? 'Margem excelente para restaurante'
              : costSummary.marginPercent >= 40
                ? 'Margem dentro da média de mercado'
                : recipe.selling_price > 0
                  ? 'Margem baixa — atenção ao custo de insumo'
                  : 'Aguardando definição de preço de venda'}
          </CardContent>
        </Card>
      </div>

      {/* Tabela de Insumos da Ficha */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ScrollText className="h-5 w-5 text-amber-600" />
              Composição da Receita (Ingredientes)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Itens que compõem a receita com custo calculado com base no preço de compra.
            </p>
          </div>
          <Button
            onClick={handleOpenAddItem}
            className="bg-amber-600 hover:bg-amber-700 text-white shadow-sm flex items-center gap-1.5 self-start sm:self-auto text-sm"
          >
            <Plus className="h-4 w-4" />
            Adicionar Insumo
          </Button>
        </div>

        {items.length === 0 ? (
          <div className="p-12 text-center">
            <CookingPot className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <h4 className="text-base font-semibold text-slate-800">
              Nenhum insumo associado ainda
            </h4>
            <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
              Adicione os ingredientes, temperos e itens usados nesta receita para calcular o custo
              exato.
            </p>
            <Button
              onClick={handleOpenAddItem}
              variant="outline"
              className="mt-4 border-amber-300 text-amber-800 hover:bg-amber-50"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Adicionar Primeiro Insumo
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/75">
                <TableRow>
                  <TableHead className="font-semibold text-slate-700">Ingrediente</TableHead>
                  <TableHead className="font-semibold text-slate-700">Categoria</TableHead>
                  <TableHead className="font-semibold text-slate-700 text-center">
                    Qtd. Utilizada
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 text-right">
                    Preço Base de Compra
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 text-right">
                    Custo no Prato
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 text-right">
                    % do Custo
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const ing = item.expand?.ingredient_id
                  const itemCost = ing
                    ? calculateItemCost(item.quantity, item.unit, ing.price, ing.unit)
                    : 0
                  const pct =
                    costSummary.totalCost > 0 ? (itemCost / costSummary.totalCost) * 100 : 0

                  return (
                    <TableRow key={item.id} className="hover:bg-slate-50/50">
                      <TableCell className="font-medium text-slate-900">
                        {ing?.name || <span className="text-slate-400">Insumo não encontrado</span>}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className="bg-slate-100 text-slate-700 font-normal"
                        >
                          {ing?.category || 'Geral'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center font-semibold text-slate-800">
                        {item.quantity}{' '}
                        <span className="text-xs text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 font-medium">
                          {item.unit}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-slate-600 text-sm">
                        {ing ? (
                          <>
                            {formatCurrency(ing.price)}
                            <span className="text-xs text-slate-400 ml-1">/ {ing.unit}</span>
                          </>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="text-right font-bold text-slate-900">
                        {formatCurrency(itemCost)}
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold text-slate-600">
                        {pct.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEditItem(item)}
                            className="h-8 w-8 text-slate-600 hover:text-amber-700 hover:bg-amber-50"
                            title="Editar quantidade"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeletingItemId(item.id)}
                            className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                            title="Remover insumo da ficha"
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

      {/* Modal Adicionar / Editar Item de Insumo */}
      <Dialog open={isItemModalOpen} onOpenChange={setIsItemModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSaveItem}>
            <DialogHeader>
              <DialogTitle>
                {editingItem ? 'Editar Insumo na Ficha' : 'Adicionar Insumo à Ficha'}
              </DialogTitle>
              <DialogDescription>
                Selecione o ingrediente da despensa e a quantidade necessária para preparar a
                receita.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="item-ing">Ingrediente *</Label>
                <Select value={selectedIngredientId} onValueChange={handleSelectIngredient}>
                  <SelectTrigger id="item-ing">
                    <SelectValue placeholder="Selecione o insumo..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {allIngredients.map((ing) => (
                      <SelectItem key={ing.id} value={ing.id}>
                        {ing.name} ({formatCurrency(ing.price)} / {ing.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="item-qty">Quantidade *</Label>
                  <Input
                    id="item-qty"
                    type="number"
                    step="any"
                    min="0.0001"
                    placeholder="Ex: 250"
                    value={itemQuantity}
                    onChange={(e) => setItemQuantity(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="item-unit">Unidade Utilizada *</Label>
                  <Select
                    value={itemUnit}
                    onValueChange={(val: MeasurementUnit) => setItemUnit(val)}
                  >
                    <SelectTrigger id="item-unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITS.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Pré-visualização do custo proporcional */}
              {selectedIngredientId && itemQuantity && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs flex items-center justify-between">
                  <span className="text-slate-600">Custo estimado deste item:</span>
                  <span className="font-bold text-slate-900 text-sm">
                    {(() => {
                      const ing = allIngredients.find((i) => i.id === selectedIngredientId)
                      const q = parseFloat(itemQuantity.replace(',', '.')) || 0
                      if (!ing) return 'R$ 0,00'
                      return formatCurrency(calculateItemCost(q, itemUnit, ing.price, ing.unit))
                    })()}
                  </span>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsItemModalOpen(false)}
                disabled={savingItem}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={savingItem}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {savingItem && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingItem ? 'Salvar Quantidade' : 'Incluir Insumo'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Confirmação de Exclusão de Item */}
      <Dialog open={!!deletingItemId} onOpenChange={() => setDeletingItemId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remover Insumo</DialogTitle>
            <DialogDescription>
              Deseja remover este ingrediente da ficha técnica? O custo total e o custo por porção
              serão recalculados automaticamente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeletingItemId(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deletingItemId && handleDeleteItem(deletingItemId)}
            >
              Remover da Ficha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
