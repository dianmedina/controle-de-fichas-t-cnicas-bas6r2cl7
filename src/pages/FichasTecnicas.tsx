import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { recipesService, RecipeWithCost } from '@/services/recipes'
import { Recipe, RecipeType, formatCurrency, formatPercent } from '@/types/restaurant'
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
  Plus,
  Search,
  Pencil,
  Trash2,
  ScrollText,
  Loader2,
  Eye,
  Utensils,
  CookingPot,
  ArrowRight,
  TrendingUp,
} from 'lucide-react'

export default function FichasTecnicas() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [recipesWithCost, setRecipesWithCost] = useState<RecipeWithCost[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | RecipeType>('all')

  // Modal Criação / Edição rápida de Ficha
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null)
  const [saving, setSaving] = useState(false)

  // Modal Exclusão
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    type: 'prato' as RecipeType,
    yield_portions: '1',
    selling_price: '',
    notes: '',
  })

  const loadData = async () => {
    try {
      setLoading(true)
      const [allRecipes, allItems] = await Promise.all([
        recipesService.getAll(),
        recipesService.getAllRecipeItems(),
      ])

      const enriched = allRecipes.map((r) => {
        const items = allItems.filter((i) => i.recipe_id === r.id)
        return recipesService.computeCosts(r, items)
      })

      setRecipesWithCost(enriched)
    } catch (error) {
      console.error('Erro ao carregar fichas técnicas:', error)
      toast({
        title: 'Erro ao carregar fichas',
        description: 'Não foi possível carregar as fichas técnicas.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const filteredRecipes = useMemo(() => {
    return recipesWithCost.filter((item) => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesType = typeFilter === 'all' || item.type === typeFilter
      return matchesSearch && matchesType
    })
  }, [recipesWithCost, searchTerm, typeFilter])

  const handleOpenCreate = () => {
    setEditingRecipe(null)
    setFormData({
      name: '',
      type: 'prato',
      yield_portions: '1',
      selling_price: '',
      notes: '',
    })
    setIsModalOpen(true)
  }

  const handleOpenEdit = (recipe: Recipe) => {
    setEditingRecipe(recipe)
    setFormData({
      name: recipe.name,
      type: recipe.type,
      yield_portions: recipe.yield_portions ? recipe.yield_portions.toString() : '1',
      selling_price: recipe.selling_price ? recipe.selling_price.toString() : '',
      notes: recipe.notes || '',
    })
    setIsModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Informe o nome da ficha técnica.',
        variant: 'destructive',
      })
      return
    }

    const portionsNum = parseFloat(formData.yield_portions.replace(',', '.')) || 1
    const priceNum = formData.selling_price
      ? parseFloat(formData.selling_price.replace(',', '.'))
      : 0

    try {
      setSaving(true)
      if (editingRecipe) {
        await recipesService.update(editingRecipe.id, {
          name: formData.name.trim(),
          type: formData.type,
          yield_portions: portionsNum,
          selling_price: priceNum,
          notes: formData.notes.trim() || undefined,
        })
        toast({ title: 'Ficha técnica atualizada com sucesso!' })
        setIsModalOpen(false)
        loadData()
      } else {
        const created = await recipesService.create({
          name: formData.name.trim(),
          type: formData.type,
          yield_portions: portionsNum,
          selling_price: priceNum,
          notes: formData.notes.trim() || undefined,
        })
        toast({ title: 'Ficha técnica criada! Agora adicione os insumos.' })
        setIsModalOpen(false)
        navigate(`/fichas/${created.id}`)
      }
    } catch (error) {
      console.error('Erro ao salvar ficha:', error)
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar os dados da ficha.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirmId) return
    try {
      setDeleting(true)
      await recipesService.delete(deleteConfirmId)
      toast({ title: 'Ficha técnica excluída!' })
      setDeleteConfirmId(null)
      loadData()
    } catch (error) {
      console.error('Erro ao excluir ficha:', error)
      toast({
        title: 'Erro ao excluir',
        description: 'Não foi possível excluir a ficha técnica.',
        variant: 'destructive',
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <ScrollText className="h-6 w-6 text-amber-600" />
            Fichas Técnicas
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Gerenciamento e cálculo de custo operacional de pratos principais e guarnições.
          </p>
        </div>
        <Button
          onClick={handleOpenCreate}
          className="bg-amber-600 hover:bg-amber-700 text-white shadow-sm flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          Nova Ficha Técnica
        </Button>
      </div>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="shadow-xs border-slate-200">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase font-semibold text-slate-500">
              Total de Fichas
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-slate-800">
              {recipesWithCost.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            {recipesWithCost.filter((r) => r.type === 'prato').length} pratos •{' '}
            {recipesWithCost.filter((r) => r.type === 'guarnicao').length} guarnições
          </CardContent>
        </Card>

        <Card className="shadow-xs border-slate-200">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase font-semibold text-slate-500">
              Custo Médio por Porção
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-amber-700">
              {recipesWithCost.length > 0
                ? formatCurrency(
                    recipesWithCost.reduce((acc, r) => acc + r.costPerPortion, 0) /
                      recipesWithCost.length,
                  )
                : 'R$ 0,00'}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            Soma dos insumos dividida pelo rendimento
          </CardContent>
        </Card>

        <Card className="shadow-xs border-slate-200">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase font-semibold text-slate-500">
              Margem Média Bruta
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-700">
              {recipesWithCost.filter((r) => r.selling_price > 0).length > 0
                ? formatPercent(
                    recipesWithCost
                      .filter((r) => r.selling_price > 0)
                      .reduce((acc, r) => acc + r.marginPercent, 0) /
                      recipesWithCost.filter((r) => r.selling_price > 0).length,
                  )
                : '0%'}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            Considerando os preços de venda definidos
          </CardContent>
        </Card>
      </div>

      {/* Filtros e Busca */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar ficha por nome..."
            className="pl-9 bg-slate-50 border-slate-200 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={typeFilter}
            onValueChange={(val: 'all' | RecipeType) => setTypeFilter(val)}
          >
            <SelectTrigger className="w-full sm:w-[180px] text-sm bg-slate-50 border-slate-200">
              <SelectValue placeholder="Tipo de item" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="prato">Apenas Pratos</SelectItem>
              <SelectItem value="guarnicao">Apenas Guarnições</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Lista / Tabela de Fichas Técnicas */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-7 w-7 animate-spin text-amber-600" />
            <p className="text-sm">Carregando fichas técnicas...</p>
          </div>
        ) : filteredRecipes.length === 0 ? (
          <div className="p-12 text-center">
            <ScrollText className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-800">
              Nenhuma ficha técnica encontrada
            </h3>
            <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
              {searchTerm || typeFilter !== 'all'
                ? 'Nenhuma ficha corresponde aos filtros aplicados.'
                : 'Cadastre a primeira ficha técnica para calcular custos de produção dos pratos.'}
            </p>
            {!searchTerm && typeFilter === 'all' && (
              <Button
                onClick={handleOpenCreate}
                variant="outline"
                className="mt-4 border-amber-300 text-amber-800 hover:bg-amber-50"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Criar Primeira Ficha
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/75">
                <TableRow>
                  <TableHead className="font-semibold text-slate-700">Ficha Técnica</TableHead>
                  <TableHead className="font-semibold text-slate-700">Tipo</TableHead>
                  <TableHead className="font-semibold text-slate-700 text-center">
                    Insumos
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 text-center">
                    Rendimento
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 text-right">
                    Custo por Porção
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 text-right">
                    Preço de Venda
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 text-right">
                    Margem Estimada
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecipes.map((recipe) => (
                  <TableRow
                    key={recipe.id}
                    className="hover:bg-slate-50/50 cursor-pointer"
                    onClick={() => navigate(`/fichas/${recipe.id}`)}
                  >
                    <TableCell className="font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        {recipe.type === 'prato' ? (
                          <Utensils className="h-4 w-4 text-amber-600 shrink-0" />
                        ) : (
                          <CookingPot className="h-4 w-4 text-orange-500 shrink-0" />
                        )}
                        <span className="font-semibold text-slate-900">{recipe.name}</span>
                      </div>
                    </TableCell>

                    <TableCell onClick={(e) => e.stopPropagation()}>
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

                    <TableCell className="text-center text-slate-600">
                      <span className="font-medium">{recipe.items.length}</span>{' '}
                      <span className="text-xs text-slate-400">itens</span>
                    </TableCell>

                    <TableCell className="text-center text-slate-600">
                      <span className="font-medium">{recipe.yield_portions}</span>{' '}
                      <span className="text-xs text-slate-400">
                        {recipe.yield_portions > 1 ? 'porções' : 'porção'}
                      </span>
                    </TableCell>

                    <TableCell className="text-right font-semibold text-slate-800">
                      {formatCurrency(recipe.costPerPortion)}
                    </TableCell>

                    <TableCell className="text-right font-semibold text-slate-900">
                      {recipe.selling_price > 0 ? (
                        formatCurrency(recipe.selling_price)
                      ) : (
                        <span className="text-xs text-slate-400 italic">Não definido</span>
                      )}
                    </TableCell>

                    <TableCell className="text-right">
                      {recipe.selling_price > 0 ? (
                        <span
                          className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${
                            recipe.marginPercent >= 60
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : recipe.marginPercent >= 40
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {formatPercent(recipe.marginPercent)}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </TableCell>

                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/fichas/${recipe.id}`)}
                          className="h-8 px-2 text-amber-800 hover:bg-amber-50 text-xs font-medium"
                          title="Ver ficha completa"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          Detalhes
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenEdit(recipe)}
                          className="h-8 w-8 text-slate-600 hover:text-amber-700 hover:bg-amber-50"
                          title="Editar cabeçalho"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteConfirmId(recipe.id)}
                          className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                          title="Excluir ficha"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Modal Nova / Editar Ficha Técnica */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle>
                {editingRecipe ? 'Editar Ficha Técnica' : 'Nova Ficha Técnica'}
              </DialogTitle>
              <DialogDescription>
                Defina os dados gerais do prato ou guarnição. Na próxima etapa você poderá adicionar
                os ingredientes e quantidades.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="r-name">Nome da Ficha / Prato *</Label>
                <Input
                  id="r-name"
                  placeholder="Ex: Risoto de Camarão, Picanha na Brasa..."
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="r-type">Tipo *</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(val: RecipeType) => setFormData({ ...formData, type: val })}
                  >
                    <SelectTrigger id="r-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="prato">Prato Principal</SelectItem>
                      <SelectItem value="guarnicao">Guarnição / Acompanhamento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="r-yield">Rendimento (porções) *</Label>
                  <Input
                    id="r-yield"
                    type="number"
                    step="0.5"
                    min="0.1"
                    placeholder="1"
                    value={formData.yield_portions}
                    onChange={(e) => setFormData({ ...formData, yield_portions: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="r-price">Preço de Venda Sugerido (R$)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 text-sm">R$</span>
                  <Input
                    id="r-price"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    className="pl-9"
                    value={formData.selling_price}
                    onChange={(e) => setFormData({ ...formData, selling_price: e.target.value })}
                  />
                </div>
                <p className="text-xs text-slate-400">
                  Pode ser ajustado ou recalculado posteriormente na tela de Precificação.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="r-notes">Modo de Preparo / Observações</Label>
                <Textarea
                  id="r-notes"
                  rows={3}
                  placeholder="Instruções de preparo, tempo de cocção, montagem do prato..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingRecipe ? 'Salvar Alterações' : 'Criar e Montar Ficha'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Confirmação de Exclusão */}
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão da Ficha</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir esta ficha técnica? Todos os ingredientes associados a
              esta ficha também serão desvinculados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir Ficha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
