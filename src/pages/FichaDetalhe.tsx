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
  getEffectiveIngredientPrice,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  Printer,
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  FileText,
  Eye,
  ChevronDown,
  Users,
} from 'lucide-react'
import { PrintableRecipeSheet } from '@/components/PrintableRecipeSheet'

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
    labor_cost: '',
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

  // Modo de impressão (completa com custos ou para equipe sem custos)
  const [printHideCosts, setPrintHideCosts] = useState<boolean>(false)

  // Upload e gerenciamento de Fotos
  const [uploadingPhoto, setUploadingPhoto] = useState<'photo_1' | 'photo_2' | null>(null)
  const [photoPreviewModal, setPhotoPreviewModal] = useState<string | null>(null)

  // Edição rápida do Modo de Fazer
  const [isEditingNotes, setIsEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)

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
        labor_cost: r.labor_cost ? r.labor_cost.toString() : '',
        notes: r.notes || '',
      })
      setNotesDraft(r.notes || '')
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
    const laborNum = headerData.labor_cost ? parseFloat(headerData.labor_cost.replace(',', '.')) : 0

    try {
      setSavingHeader(true)
      const updated = await recipesService.update(id, {
        name: headerData.name.trim(),
        type: headerData.type,
        yield_portions: portionsNum,
        selling_price: priceNum,
        labor_cost: laborNum >= 0 ? laborNum : 0,
        notes: headerData.notes.trim() || undefined,
      })
      setRecipe(updated)
      setNotesDraft(updated.notes || '')
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

  // Salvar Modo de Fazer isoladamente na seção dedicada
  const handleSaveNotes = async () => {
    if (!id || !recipe) return
    try {
      setSavingNotes(true)
      const updated = await recipesService.update(id, {
        notes: notesDraft.trim() || undefined,
      })
      setRecipe(updated)
      setHeaderData((prev) => ({ ...prev, notes: updated.notes || '' }))
      setIsEditingNotes(false)
      toast({ title: 'Modo de preparo atualizado com sucesso!' })
    } catch (error) {
      console.error('Erro ao atualizar modo de preparo:', error)
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar o modo de preparo.',
        variant: 'destructive',
      })
    } finally {
      setSavingNotes(false)
    }
  }

  // Upload de Foto (photo_1 ou photo_2)
  const handleUploadPhoto = async (slot: 'photo_1' | 'photo_2', file: File) => {
    if (!id) return
    // Validação de tipo e tamanho (máx 5MB)
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Formato inválido',
        description: 'Por favor, selecione um arquivo de imagem (JPG, PNG, WEBP).',
        variant: 'destructive',
      })
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'Arquivo muito grande',
        description: 'A imagem deve ter no máximo 5 MB.',
        variant: 'destructive',
      })
      return
    }

    try {
      setUploadingPhoto(slot)
      const formData = new FormData()
      formData.append(slot, file)

      const updated = await recipesService.update(id, formData)
      setRecipe(updated)
      toast({
        title: 'Foto enviada!',
        description:
          slot === 'photo_1' ? 'Foto 1 do prato atualizada.' : 'Foto 2 do prato atualizada.',
      })
    } catch (error) {
      console.error('Erro ao fazer upload da foto:', error)
      toast({
        title: 'Erro no envio da foto',
        description: 'Não foi possível enviar a imagem para o servidor.',
        variant: 'destructive',
      })
    } finally {
      setUploadingPhoto(null)
    }
  }

  // Remoção de Foto (photo_1 ou photo_2)
  const handleRemovePhoto = async (slot: 'photo_1' | 'photo_2') => {
    if (!id || !recipe) return
    try {
      setUploadingPhoto(slot)
      const formData = new FormData()
      formData.append(slot, '') // PocketBase remove arquivo enviando string vazia ou null no FormData

      const updated = await recipesService.update(id, formData)
      setRecipe(updated)
      toast({
        title: 'Foto removida',
        description: 'A imagem foi removida da ficha técnica.',
      })
    } catch (error) {
      console.error('Erro ao remover foto:', error)
      toast({
        title: 'Erro ao remover foto',
        description: 'Não foi possível remover a imagem.',
        variant: 'destructive',
      })
    } finally {
      setUploadingPhoto(null)
    }
  }

  const handlePrint = (hideCosts: boolean = false) => {
    setPrintHideCosts(hideCosts)
    // Permite que o React aplique o estado antes do acionamento do diálogo nativo de impressão
    setTimeout(() => {
      window.print()
    }, 50)
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
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="default"
                size="sm"
                className="bg-slate-900 hover:bg-slate-800 text-white shadow-xs font-semibold gap-1.5"
                title="Exporta ou imprime a ficha técnica em folha única (A4)"
              >
                <Printer className="h-4 w-4 text-amber-400" />
                <span>Exportar PDF / Imprimir (1 Pág)</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-70 ml-0.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 p-1.5">
              <DropdownMenuLabel className="text-xs text-slate-500 font-semibold px-2 py-1">
                Escolha a versão da ficha técnica:
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => handlePrint(false)}
                className="cursor-pointer flex items-start gap-2.5 p-2 rounded-md hover:bg-slate-100 focus:bg-slate-100"
              >
                <div className="p-1 rounded bg-amber-100 text-amber-800 mt-0.5">
                  <DollarSign className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-semibold text-sm text-slate-900">Completa (com custos)</div>
                  <div className="text-[11px] text-slate-500 leading-tight mt-0.5">
                    Inclui preço base, custo no prato, mão de obra, CMV, preço de venda e margens.
                  </div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-1" />
              <DropdownMenuItem
                onClick={() => handlePrint(true)}
                className="cursor-pointer flex items-start gap-2.5 p-2 rounded-md hover:bg-slate-100 focus:bg-slate-100"
              >
                <div className="p-1 rounded bg-blue-100 text-blue-800 mt-0.5">
                  <Users className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-semibold text-sm text-slate-900">
                    Para a equipe (sem custos)
                  </div>
                  <div className="text-[11px] text-slate-500 leading-tight mt-0.5">
                    Sem nenhum valor financeiro. Exibe insumos, quantidades, rendimento, fotos e
                    modo de preparo.
                  </div>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {!isEditingHeader && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditingHeader(true)}
              className="text-slate-700 hover:bg-slate-50"
            >
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Editar Dados Gerais
            </Button>
          )}
        </div>
      </div>

      {/* Componente renderizado estritamente na folha de impressão / PDF (1 página) */}
      <PrintableRecipeSheet recipe={costSummary} hideCosts={printHideCosts} />

      {/* Formulário de Cabeçalho (Modo Edição ou Visualização) */}
      <div className="no-print space-y-6">
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
                  <Label htmlFor="h-labor">Custo de Mão de Obra da Batelada (R$)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-400 text-sm">R$</span>
                    <Input
                      id="h-labor"
                      type="number"
                      step="0.01"
                      min="0"
                      className="pl-9"
                      placeholder="0,00"
                      value={headerData.labor_cost}
                      onChange={(e) => setHeaderData({ ...headerData, labor_cost: e.target.value })}
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    Tempo de preparo × custo/minuto da equipe. É somado ao custo dos insumos.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="h-notes">Modo de Preparo e Instruções Operacionais</Label>
                  <Textarea
                    id="h-notes"
                    rows={5}
                    placeholder="Descreva detalhadamente o passo a passo de preparo, tempo de cocção, temperatura e padrão de empratamento..."
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

              <p className="text-xs text-slate-500">
                Ficha Técnica Operacional cadastrada no sistema. Utilize as seções abaixo para
                editar ingredientes, modo de fazer e fotos para a equipe da cozinha.
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
              {recipe.labor_cost !== undefined && recipe.labor_cost > 0 && (
                <>
                  <div className="w-px h-8 bg-slate-200" />
                  <div>
                    <p className="text-xs uppercase font-semibold text-slate-400">Mão de Obra</p>
                    <p className="text-xl font-bold text-slate-800">
                      {formatCurrency(recipe.labor_cost)}
                    </p>
                  </div>
                </>
              )}
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
              {costSummary.laborCost > 0 ? (
                <span>
                  Insumos ({formatCurrency(costSummary.ingredientsCost)}) + M.O. (
                  {formatCurrency(costSummary.laborCost)})
                </span>
              ) : (
                'Soma dos ingredientes utilizados'
              )}
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
                Adicione os ingredientes, temperos e itens usados nesta receita para calcular o
                custo exato.
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
                    const itemCost = ing ? calculateItemCost(item.quantity, item.unit, ing) : 0
                    const effPrice = ing
                      ? getEffectiveIngredientPrice(ing.price, ing.reduction_percent)
                      : 0
                    const hasRed = !!(ing?.reduction_percent && ing.reduction_percent > 0)
                    const pct =
                      costSummary.totalCost > 0 ? (itemCost / costSummary.totalCost) * 100 : 0

                    return (
                      <TableRow key={item.id} className="hover:bg-slate-50/50">
                        <TableCell className="font-medium text-slate-900">
                          <div>
                            <span>
                              {ing?.name || (
                                <span className="text-slate-400">Insumo não encontrado</span>
                              )}
                            </span>
                            {hasRed && (
                              <span className="block text-[11px] text-amber-700 font-medium">
                                Perda de {ing.reduction_percent}% no preparo
                              </span>
                            )}
                          </div>
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
                            hasRed ? (
                              <div>
                                <span className="font-bold text-amber-900">
                                  {formatCurrency(effPrice)}
                                </span>
                                <span className="text-xs text-slate-400 ml-1">/ {ing.unit}</span>
                                <span className="block text-[10px] text-slate-500">
                                  Base: {formatCurrency(ing.price)} (+{ing.reduction_percent}%)
                                </span>
                              </div>
                            ) : (
                              <>
                                {formatCurrency(ing.price)}
                                <span className="text-xs text-slate-400 ml-1">/ {ing.unit}</span>
                              </>
                            )
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

        {/* Seção 2 Colunas: Modo de Fazer (Preparo) + Fotos do Prato Finalizado */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Modo de Fazer (Preparo) - 7 Colunas */}
          <div className="lg:col-span-7">
            <Card className="border-slate-200 shadow-xs bg-white h-full flex flex-col">
              <CardHeader className="p-4 sm:p-5 border-b border-slate-100 flex flex-row items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <CookingPot className="h-5 w-5 text-amber-600" />
                    Modo de Fazer & Instruções de Preparo
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 mt-0.5">
                    Orientações passo a passo para a brigada de cozinha preparar o prato com padrão.
                  </CardDescription>
                </div>
                {!isEditingNotes && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setNotesDraft(recipe.notes || '')
                      setIsEditingNotes(true)
                    }}
                    className="text-slate-700 hover:bg-slate-50 shrink-0"
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Editar
                  </Button>
                )}
              </CardHeader>
              <CardContent className="p-4 sm:p-5 flex-1 flex flex-col justify-between">
                {isEditingNotes ? (
                  <div className="space-y-3">
                    <Label
                      htmlFor="notes-inline-edit"
                      className="text-xs font-semibold text-slate-700"
                    >
                      Escreva as etapas de preparo, pontos de cocção e montagem:
                    </Label>
                    <Textarea
                      id="notes-inline-edit"
                      rows={8}
                      placeholder="1. Pré-aqueça o forno a 180°C...&#10;2. Em uma panela funda, doure o alho e a cebola no azeite...&#10;3. Adicione os temperos e cozinhe em fogo brando por 20 minutos...&#10;4. Finalize com as ervas frescas e emprate conforme foto padrão."
                      className="font-mono text-sm leading-relaxed"
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                    />
                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsEditingNotes(false)}
                        disabled={savingNotes}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleSaveNotes}
                        disabled={savingNotes}
                        className="bg-amber-600 hover:bg-amber-700 text-white"
                      >
                        {savingNotes && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <Save className="h-4 w-4 mr-1.5" />
                        Salvar Modo de Fazer
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col">
                    {recipe.notes?.trim() ? (
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm text-slate-800 leading-relaxed whitespace-pre-wrap flex-1">
                        {recipe.notes.trim()}
                      </div>
                    ) : (
                      <div className="border border-dashed border-slate-200 rounded-xl p-8 text-center flex-1 flex flex-col items-center justify-center text-slate-400">
                        <CookingPot className="h-8 w-8 text-slate-300 mb-2" />
                        <p className="text-sm font-medium text-slate-600">
                          Nenhum modo de fazer cadastrado ainda
                        </p>
                        <p className="text-xs text-slate-400 mt-1 max-w-md">
                          Documente o passo a passo de preparo para garantir a padronização na
                          cozinha e na ficha técnica impressa.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setNotesDraft('')
                            setIsEditingNotes(true)
                          }}
                          className="mt-3 border-amber-300 text-amber-800 hover:bg-amber-50"
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Escrever Modo de Preparo
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Fotos do Prato (1 ou 2) - 5 Colunas */}
          <div className="lg:col-span-5">
            <Card className="border-slate-200 shadow-xs bg-white h-full flex flex-col">
              <CardHeader className="p-4 sm:p-5 border-b border-slate-100">
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Utensils className="h-5 w-5 text-amber-600" />
                  Fotos do Prato Finalizado (Até 2)
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Padrão visual de empratamento para orientar a brigada e exibir no PDF.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Slot Foto 1 */}
                  <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                        <ImageIcon className="h-3.5 w-3.5 text-amber-600" />
                        Foto 1 (Principal)
                      </span>
                      {recipe.photo_1 && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Cadastrada
                        </span>
                      )}
                    </div>

                    {recipe.photo_1 ? (
                      <div className="space-y-2">
                        <div className="relative group rounded-lg overflow-hidden border border-slate-200 bg-black aspect-video flex items-center justify-center">
                          <img
                            src={recipesService.getPhotoUrl(recipe, recipe.photo_1)}
                            alt="Foto 1 do prato"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setPhotoPreviewModal(
                                recipesService.getPhotoUrl(recipe, recipe.photo_1!),
                              )
                            }
                            className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-1 text-xs font-medium"
                            title="Visualizar em tamanho real"
                          >
                            <Eye className="h-4 w-4" />
                            Ampliar
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5 pt-1">
                          <label className="flex-1">
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={uploadingPhoto !== null}
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) handleUploadPhoto('photo_1', file)
                                e.target.value = ''
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={uploadingPhoto !== null}
                              className="w-full text-xs h-7 pointer-events-none"
                            >
                              {uploadingPhoto === 'photo_1' ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                <Upload className="h-3 w-3 mr-1" />
                              )}
                              Substituir
                            </Button>
                          </label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={uploadingPhoto !== null}
                            onClick={() => handleRemovePhoto('photo_1')}
                            className="text-xs h-7 text-red-600 hover:text-red-700 hover:bg-red-50 px-2"
                            title="Remover foto"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <label className="border-2 border-dashed border-slate-300 hover:border-amber-400 bg-white rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer transition-colors text-center aspect-video group">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingPhoto !== null}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleUploadPhoto('photo_1', file)
                            e.target.value = ''
                          }}
                        />
                        {uploadingPhoto === 'photo_1' ? (
                          <div className="flex flex-col items-center gap-1 text-amber-700">
                            <Loader2 className="h-6 w-6 animate-spin" />
                            <span className="text-xs font-medium">Enviando...</span>
                          </div>
                        ) : (
                          <>
                            <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mb-1 group-hover:scale-110 transition-transform">
                              <Upload className="h-4 w-4" />
                            </div>
                            <span className="text-xs font-semibold text-slate-700">
                              Enviar Foto 1
                            </span>
                            <span className="text-[10px] text-slate-400 mt-0.5">
                              JPG, PNG ou WEBP (máx 5MB)
                            </span>
                          </>
                        )}
                      </label>
                    )}
                  </div>

                  {/* Slot Foto 2 */}
                  <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                        <ImageIcon className="h-3.5 w-3.5 text-amber-600" />
                        Foto 2 (Opcional)
                      </span>
                      {recipe.photo_2 && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Cadastrada
                        </span>
                      )}
                    </div>

                    {recipe.photo_2 ? (
                      <div className="space-y-2">
                        <div className="relative group rounded-lg overflow-hidden border border-slate-200 bg-black aspect-video flex items-center justify-center">
                          <img
                            src={recipesService.getPhotoUrl(recipe, recipe.photo_2)}
                            alt="Foto 2 do prato"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setPhotoPreviewModal(
                                recipesService.getPhotoUrl(recipe, recipe.photo_2!),
                              )
                            }
                            className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-1 text-xs font-medium"
                            title="Visualizar em tamanho real"
                          >
                            <Eye className="h-4 w-4" />
                            Ampliar
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5 pt-1">
                          <label className="flex-1">
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={uploadingPhoto !== null}
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) handleUploadPhoto('photo_2', file)
                                e.target.value = ''
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={uploadingPhoto !== null}
                              className="w-full text-xs h-7 pointer-events-none"
                            >
                              {uploadingPhoto === 'photo_2' ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                <Upload className="h-3 w-3 mr-1" />
                              )}
                              Substituir
                            </Button>
                          </label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={uploadingPhoto !== null}
                            onClick={() => handleRemovePhoto('photo_2')}
                            className="text-xs h-7 text-red-600 hover:text-red-700 hover:bg-red-50 px-2"
                            title="Remover foto"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <label className="border-2 border-dashed border-slate-300 hover:border-amber-400 bg-white rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer transition-colors text-center aspect-video group">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingPhoto !== null}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleUploadPhoto('photo_2', file)
                            e.target.value = ''
                          }}
                        />
                        {uploadingPhoto === 'photo_2' ? (
                          <div className="flex flex-col items-center gap-1 text-amber-700">
                            <Loader2 className="h-6 w-6 animate-spin" />
                            <span className="text-xs font-medium">Enviando...</span>
                          </div>
                        ) : (
                          <>
                            <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mb-1 group-hover:scale-110 transition-transform">
                              <Upload className="h-4 w-4" />
                            </div>
                            <span className="text-xs font-semibold text-slate-700">
                              Enviar Foto 2
                            </span>
                            <span className="text-[10px] text-slate-400 mt-0.5">
                              Empratamento / Detalhes
                            </span>
                          </>
                        )}
                      </label>
                    )}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-amber-50/70 border border-amber-200/60 text-[11px] text-amber-900 flex items-start gap-2">
                  <FileText className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                  <span>
                    As fotos cadastradas aqui serão incluídas automaticamente no topo direito da
                    folha impressa (PDF), facilitando a montagem e padronização visual da cozinha.
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Modal Visualização de Foto Ampliada */}
      <Dialog open={!!photoPreviewModal} onOpenChange={() => setPhotoPreviewModal(null)}>
        <DialogContent className="sm:max-w-3xl p-3 bg-black border-slate-800 text-white">
          <DialogHeader className="p-2">
            <DialogTitle className="text-white text-base">
              Padrão Visual do Prato ({recipe.name})
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center max-h-[75vh] overflow-hidden rounded-lg bg-black">
            {photoPreviewModal && (
              <img
                src={photoPreviewModal}
                alt="Foto ampliada do prato"
                className="max-h-[70vh] w-auto max-w-full object-contain"
              />
            )}
          </div>
          <DialogFooter className="p-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPhotoPreviewModal(null)}
              className="text-white border-slate-700 hover:bg-slate-800"
            >
              Fechar Visualização
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                    {allIngredients.map((ing) => {
                      const eff = getEffectiveIngredientPrice(ing.price, ing.reduction_percent)
                      const hasRed = !!(ing.reduction_percent && ing.reduction_percent > 0)
                      return (
                        <SelectItem key={ing.id} value={ing.id}>
                          {ing.name} ({formatCurrency(eff)} / {ing.unit}
                          {hasRed ? ` - perda ${ing.reduction_percent}%` : ''})
                        </SelectItem>
                      )
                    })}
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
                      return formatCurrency(calculateItemCost(q, itemUnit, ing))
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
