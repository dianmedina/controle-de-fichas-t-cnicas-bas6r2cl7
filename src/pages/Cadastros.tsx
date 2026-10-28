import React, { useEffect, useState, useMemo } from 'react'
import { dishTypesService } from '@/services/dishTypes'
import { ingredientCategoriesService } from '@/services/ingredientCategories'
import { DishType, IngredientCategory } from '@/types/restaurant'
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import {
  UtensilsCrossed,
  Tags,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  FolderTree,
  AlertTriangle,
  Info,
  CookingPot,
  Utensils,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react'

export default function Cadastros() {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<'dish_types' | 'ingredient_categories'>('dish_types')

  // Listas
  const [dishTypes, setDishTypes] = useState<DishType[]>([])
  const [categories, setCategories] = useState<IngredientCategory[]>([])
  const [loading, setLoading] = useState(true)

  // Mapas de uso
  const [dishTypeUsage, setDishTypeUsage] = useState<Record<string, number>>({})
  const [categoryUsage, setCategoryUsage] = useState<Record<string, number>>({})

  // Modal DishType
  const [isDishTypeModalOpen, setIsDishTypeModalOpen] = useState(false)
  const [editingDishType, setEditingDishType] = useState<DishType | null>(null)
  const [dishTypeForm, setDishTypeForm] = useState({
    name: '',
    slug: '',
    description: '',
    color: 'amber',
    sort_order: '1',
    is_garnish: false,
  })
  const [savingDishType, setSavingDishType] = useState(false)

  // Modal Category
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<IngredientCategory | null>(null)
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    slug: '',
    description: '',
    color: 'slate',
    sort_order: '1',
  })
  const [savingCategory, setSavingCategory] = useState(false)

  // Modais de exclusão com proteção
  const [deleteDishTypeTarget, setDeleteDishTypeTarget] = useState<DishType | null>(null)
  const [dishTypeFallbackId, setDishTypeFallbackId] = useState<string>('')
  const [deletingDishType, setDeletingDishType] = useState(false)

  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<IngredientCategory | null>(null)
  const [categoryFallbackId, setCategoryFallbackId] = useState<string>('')
  const [deletingCategory, setDeletingCategory] = useState(false)

  const loadData = async () => {
    try {
      setLoading(true)
      const [allTypes, allCats] = await Promise.all([
        dishTypesService.getAll(),
        ingredientCategoriesService.getAll(),
      ])
      setDishTypes(allTypes)
      setCategories(allCats)

      // Carrega contadores de uso de forma assíncrona
      const typeCounts: Record<string, number> = {}
      for (const t of allTypes) {
        typeCounts[t.id] = await dishTypesService.countUsage(t)
      }
      setDishTypeUsage(typeCounts)

      const catCounts: Record<string, number> = {}
      for (const c of allCats) {
        catCounts[c.id] = await ingredientCategoriesService.countUsage(c)
      }
      setCategoryUsage(catCounts)
    } catch (error) {
      console.error('Erro ao carregar cadastros:', error)
      toast({
        title: 'Erro ao carregar dados',
        description: 'Não foi possível buscar os tipos de pratos e categorias.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // HANDLERS DISH TYPE
  const handleOpenCreateDishType = () => {
    setEditingDishType(null)
    setDishTypeForm({
      name: '',
      slug: '',
      description: '',
      color: 'amber',
      sort_order: String(dishTypes.length + 1),
      is_garnish: false,
    })
    setIsDishTypeModalOpen(true)
  }

  const handleOpenEditDishType = (dt: DishType) => {
    setEditingDishType(dt)
    setDishTypeForm({
      name: dt.name,
      slug: dt.slug,
      description: dt.description || '',
      color: dt.color || 'amber',
      sort_order: String(dt.sort_order ?? 1),
      is_garnish: Boolean(dt.is_garnish),
    })
    setIsDishTypeModalOpen(true)
  }

  const handleSaveDishType = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dishTypeForm.name.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Informe o nome do tipo de prato.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSavingDishType(true)
      const sortNum = parseInt(dishTypeForm.sort_order, 10) || 1
      if (editingDishType) {
        await dishTypesService.update(editingDishType.id, {
          name: dishTypeForm.name.trim(),
          slug: dishTypeForm.slug.trim() || undefined,
          description: dishTypeForm.description.trim() || undefined,
          color: dishTypeForm.color,
          sort_order: sortNum,
          is_garnish: dishTypeForm.is_garnish,
        })
        toast({ title: 'Tipo de prato atualizado com sucesso!' })
      } else {
        await dishTypesService.create({
          name: dishTypeForm.name.trim(),
          slug: dishTypeForm.slug.trim() || undefined,
          description: dishTypeForm.description.trim() || undefined,
          color: dishTypeForm.color,
          sort_order: sortNum,
          is_garnish: dishTypeForm.is_garnish,
        })
        toast({ title: 'Tipo de prato cadastrado com sucesso!' })
      }
      setIsDishTypeModalOpen(false)
      loadData()
    } catch (err: any) {
      console.error('Erro ao salvar tipo de prato:', err)
      toast({
        title: 'Erro ao salvar',
        description:
          err?.message || 'Verifique se já não existe outro tipo com este mesmo slug/nome.',
        variant: 'destructive',
      })
    } finally {
      setSavingDishType(false)
    }
  }

  const handleOpenDeleteDishType = (dt: DishType) => {
    setDeleteDishTypeTarget(dt)
    // Seleciona um fallback diferente do alvo
    const other = dishTypes.find((t) => t.id !== dt.id)
    setDishTypeFallbackId(other ? other.id : '')
  }

  const handleConfirmDeleteDishType = async () => {
    if (!deleteDishTypeTarget) return
    try {
      setDeletingDishType(true)
      await dishTypesService.deleteSafe(deleteDishTypeTarget.id, dishTypeFallbackId || undefined)
      toast({
        title: 'Tipo de prato excluído!',
        description: 'As fichas técnicas vinculadas foram reclassificadas com segurança.',
      })
      setDeleteDishTypeTarget(null)
      loadData()
    } catch (err) {
      console.error('Erro ao excluir tipo de prato:', err)
      toast({
        title: 'Erro ao excluir',
        description: 'Não foi possível excluir o tipo selecionado.',
        variant: 'destructive',
      })
    } finally {
      setDeletingDishType(false)
    }
  }

  // HANDLERS CATEGORY
  const handleOpenCreateCategory = () => {
    setEditingCategory(null)
    setCategoryForm({
      name: '',
      slug: '',
      description: '',
      color: 'slate',
      sort_order: String(categories.length + 1),
    })
    setIsCategoryModalOpen(true)
  }

  const handleOpenEditCategory = (cat: IngredientCategory) => {
    setEditingCategory(cat)
    setCategoryForm({
      name: cat.name,
      slug: cat.slug,
      description: cat.description || '',
      color: cat.color || 'slate',
      sort_order: String(cat.sort_order ?? 1),
    })
    setIsCategoryModalOpen(true)
  }

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!categoryForm.name.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Informe o nome da categoria.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSavingCategory(true)
      const sortNum = parseInt(categoryForm.sort_order, 10) || 1
      if (editingCategory) {
        await ingredientCategoriesService.update(editingCategory.id, {
          name: categoryForm.name.trim(),
          slug: categoryForm.slug.trim() || undefined,
          description: categoryForm.description.trim() || undefined,
          color: categoryForm.color,
          sort_order: sortNum,
        })
        toast({ title: 'Categoria atualizada com sucesso!' })
      } else {
        await ingredientCategoriesService.create({
          name: categoryForm.name.trim(),
          slug: categoryForm.slug.trim() || undefined,
          description: categoryForm.description.trim() || undefined,
          color: categoryForm.color,
          sort_order: sortNum,
        })
        toast({ title: 'Categoria cadastrada com sucesso!' })
      }
      setIsCategoryModalOpen(false)
      loadData()
    } catch (err: any) {
      console.error('Erro ao salvar categoria:', err)
      toast({
        title: 'Erro ao salvar',
        description:
          err?.message || 'Verifique se já não existe outra categoria com este mesmo nome/slug.',
        variant: 'destructive',
      })
    } finally {
      setSavingCategory(false)
    }
  }

  const handleOpenDeleteCategory = (cat: IngredientCategory) => {
    setDeleteCategoryTarget(cat)
    const other = categories.find((c) => c.id !== cat.id)
    setCategoryFallbackId(other ? other.id : '')
  }

  const handleConfirmDeleteCategory = async () => {
    if (!deleteCategoryTarget) return
    try {
      setDeletingCategory(true)
      await ingredientCategoriesService.deleteSafe(
        deleteCategoryTarget.id,
        categoryFallbackId || undefined,
      )
      toast({
        title: 'Categoria excluída!',
        description: 'Os insumos vinculados foram reclassificados com segurança.',
      })
      setDeleteCategoryTarget(null)
      loadData()
    } catch (err) {
      console.error('Erro ao excluir categoria:', err)
      toast({
        title: 'Erro ao excluir',
        description: 'Não foi possível excluir a categoria selecionada.',
        variant: 'destructive',
      })
    } finally {
      setDeletingCategory(false)
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <FolderTree className="h-6 w-6 text-amber-600" />
            Cadastros do Sistema
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Gerencie os tipos de fichas técnicas e as categorias dos insumos sem depender apenas de
            importações de planilhas.
          </p>
        </div>
      </div>

      {/* Abas */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as 'dish_types' | 'ingredient_categories')}
        className="w-full space-y-4"
      >
        <TabsList className="bg-slate-100 p-1 border border-slate-200">
          <TabsTrigger
            value="dish_types"
            className="gap-2 data-[state=active]:bg-white data-[state=active]:text-amber-900 data-[state=active]:shadow-xs font-semibold"
          >
            <UtensilsCrossed className="h-4 w-4" />
            Tipos de Pratos ({dishTypes.length})
          </TabsTrigger>
          <TabsTrigger
            value="ingredient_categories"
            className="gap-2 data-[state=active]:bg-white data-[state=active]:text-amber-900 data-[state=active]:shadow-xs font-semibold"
          >
            <Tags className="h-4 w-4" />
            Categorias de Insumos ({categories.length})
          </TabsTrigger>
        </TabsList>

        {/* ABA: TIPOS DE PRATOS */}
        <TabsContent value="dish_types" className="space-y-4 m-0">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-slate-500">
              Tipos definem a classificação das fichas técnicas no cardápio e controlam quais fichas
              podem ser adicionadas como <strong>sub-fichas (guarnições)</strong> em pratos
              principais.
            </div>
            <Button
              onClick={handleOpenCreateDishType}
              className="bg-amber-600 hover:bg-amber-700 text-white shadow-xs gap-1.5 shrink-0"
              size="sm"
            >
              <Plus className="h-4 w-4" />
              Novo Tipo de Prato
            </Button>
          </div>

          <Card className="border-slate-200 shadow-xs">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="h-7 w-7 animate-spin text-amber-600" />
                  <p className="text-sm">Carregando tipos de pratos...</p>
                </div>
              ) : dishTypes.length === 0 ? (
                <div className="p-12 text-center text-slate-500">
                  Nenhum tipo de prato cadastrado.
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-slate-50/75">
                    <TableRow>
                      <TableHead className="w-12 text-center font-semibold text-slate-700">
                        Ordem
                      </TableHead>
                      <TableHead className="font-semibold text-slate-700">Tipo de Prato</TableHead>
                      <TableHead className="font-semibold text-slate-700">
                        Identificador (Slug)
                      </TableHead>
                      <TableHead className="font-semibold text-slate-700">
                        Papel / Comportamento
                      </TableHead>
                      <TableHead className="font-semibold text-slate-700 text-center">
                        Fichas Vinculadas
                      </TableHead>
                      <TableHead className="font-semibold text-slate-700 text-right">
                        Ações
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dishTypes.map((dt) => {
                      const inUseCount = dishTypeUsage[dt.id] ?? 0
                      return (
                        <TableRow key={dt.id} className="hover:bg-slate-50/50">
                          <TableCell className="text-center font-mono text-xs text-slate-500">
                            {dt.sort_order ?? '-'}
                          </TableCell>
                          <TableCell className="font-semibold text-slate-900">
                            <div className="flex items-center gap-2">
                              {dt.is_garnish ? (
                                <CookingPot className="h-4 w-4 text-orange-500 shrink-0" />
                              ) : (
                                <Utensils className="h-4 w-4 text-amber-600 shrink-0" />
                              )}
                              <span>{dt.name}</span>
                            </div>
                            {dt.description && (
                              <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                                {dt.description}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-slate-600">
                            <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-700">
                              {dt.slug}
                            </span>
                          </TableCell>
                          <TableCell>
                            {dt.is_garnish ? (
                              <Badge className="bg-orange-100 text-orange-900 border-orange-200 font-medium text-xs">
                                Guarnição / Sub-Ficha
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-100 text-amber-900 border-amber-200 font-medium text-xs">
                                Prato / Item Padrão
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                inUseCount > 0
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {inUseCount} {inUseCount === 1 ? 'ficha' : 'fichas'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenEditDishType(dt)}
                                className="h-8 w-8 text-slate-600 hover:text-amber-700 hover:bg-amber-50"
                                title="Editar tipo"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenDeleteDishType(dt)}
                                className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                title="Excluir tipo"
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
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA: CATEGORIAS DE INSUMOS */}
        <TabsContent value="ingredient_categories" className="space-y-4 m-0">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-slate-500">
              Categorias organizam os insumos e ingredientes (ex.: Carnes, Hortifruti, Laticínios) e
              facilitam filtros e relatórios de compra.
            </div>
            <Button
              onClick={handleOpenCreateCategory}
              className="bg-amber-600 hover:bg-amber-700 text-white shadow-xs gap-1.5 shrink-0"
              size="sm"
            >
              <Plus className="h-4 w-4" />
              Nova Categoria
            </Button>
          </div>

          <Card className="border-slate-200 shadow-xs">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="h-7 w-7 animate-spin text-amber-600" />
                  <p className="text-sm">Carregando categorias...</p>
                </div>
              ) : categories.length === 0 ? (
                <div className="p-12 text-center text-slate-500">
                  Nenhuma categoria de insumo cadastrada.
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-slate-50/75">
                    <TableRow>
                      <TableHead className="w-12 text-center font-semibold text-slate-700">
                        Ordem
                      </TableHead>
                      <TableHead className="font-semibold text-slate-700">Categoria</TableHead>
                      <TableHead className="font-semibold text-slate-700">
                        Identificador (Slug)
                      </TableHead>
                      <TableHead className="font-semibold text-slate-700">Descrição</TableHead>
                      <TableHead className="font-semibold text-slate-700 text-center">
                        Insumos Vinculados
                      </TableHead>
                      <TableHead className="font-semibold text-slate-700 text-right">
                        Ações
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categories.map((cat) => {
                      const inUseCount = categoryUsage[cat.id] ?? 0
                      return (
                        <TableRow key={cat.id} className="hover:bg-slate-50/50">
                          <TableCell className="text-center font-mono text-xs text-slate-500">
                            {cat.sort_order ?? '-'}
                          </TableCell>
                          <TableCell className="font-semibold text-slate-900">
                            <span className="inline-flex items-center gap-1.5">
                              <Tags className="h-3.5 w-3.5 text-amber-600" />
                              {cat.name}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-slate-600">
                            <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-700">
                              {cat.slug}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-slate-500">
                            {cat.description || <span className="italic text-slate-300">-</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                inUseCount > 0
                                  ? 'bg-amber-50 text-amber-900 border border-amber-200'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {inUseCount} {inUseCount === 1 ? 'insumo' : 'insumos'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenEditCategory(cat)}
                                className="h-8 w-8 text-slate-600 hover:text-amber-700 hover:bg-amber-50"
                                title="Editar categoria"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenDeleteCategory(cat)}
                                className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                title="Excluir categoria"
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
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* MODAL CRIAÇÃO/EDIÇÃO DE TIPO DE PRATO */}
      <Dialog open={isDishTypeModalOpen} onOpenChange={setIsDishTypeModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSaveDishType}>
            <DialogHeader>
              <DialogTitle>
                {editingDishType ? 'Editar Tipo de Prato' : 'Novo Tipo de Prato'}
              </DialogTitle>
              <DialogDescription>
                Configure o nome, identificador e o comportamento desta classificação de ficha.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3">
              <div className="space-y-1.5">
                <Label htmlFor="dt-name">Nome do Tipo *</Label>
                <Input
                  id="dt-name"
                  placeholder="Ex: Prato Principal, Guarnição, Sobremesa..."
                  value={dishTypeForm.name}
                  onChange={(e) => setDishTypeForm({ ...dishTypeForm, name: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="dt-slug">Identificador (Slug)</Label>
                  <Input
                    id="dt-slug"
                    placeholder="Ex: sobremesa (automático)"
                    value={dishTypeForm.slug}
                    onChange={(e) => setDishTypeForm({ ...dishTypeForm, slug: e.target.value })}
                  />
                  <p className="text-[10px] text-slate-400">Deixe em branco para auto-gerar.</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="dt-order">Ordem de Exibição</Label>
                  <Input
                    id="dt-order"
                    type="number"
                    min="1"
                    value={dishTypeForm.sort_order}
                    onChange={(e) =>
                      setDishTypeForm({ ...dishTypeForm, sort_order: e.target.value })
                    }
                  />
                </div>
              </div>

              {/* Toggle de Guarnição / Sub-Ficha */}
              <div className="rounded-xl border border-slate-200 p-3 bg-slate-50/70 space-y-2">
                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    id="dt-is-garnish"
                    checked={dishTypeForm.is_garnish}
                    onChange={(e) =>
                      setDishTypeForm({ ...dishTypeForm, is_garnish: e.target.checked })
                    }
                    className="h-4 w-4 mt-0.5 rounded border-slate-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
                  />
                  <div className="flex-1">
                    <Label
                      htmlFor="dt-is-garnish"
                      className="text-sm font-semibold text-slate-800 cursor-pointer block"
                    >
                      Permitir vincular como Sub-Ficha (Guarnição)
                    </Label>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Fichas deste tipo poderão ser adicionadas dentro de pratos principais como
                      acompanhamentos/componentes (ex.: arroz, feijão, purê, farofa).
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dt-desc">Descrição (opcional)</Label>
                <Textarea
                  id="dt-desc"
                  rows={2}
                  placeholder="Informações adicionais sobre este tipo de prato..."
                  value={dishTypeForm.description}
                  onChange={(e) =>
                    setDishTypeForm({ ...dishTypeForm, description: e.target.value })
                  }
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDishTypeModalOpen(false)}
                disabled={savingDishType}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={savingDishType}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {savingDishType && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingDishType ? 'Salvar Alterações' : 'Cadastrar Tipo'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL CRIAÇÃO/EDIÇÃO DE CATEGORIA DE INSUMO */}
      <Dialog open={isCategoryModalOpen} onOpenChange={setIsCategoryModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSaveCategory}>
            <DialogHeader>
              <DialogTitle>
                {editingCategory ? 'Editar Categoria' : 'Nova Categoria de Insumo'}
              </DialogTitle>
              <DialogDescription>
                Informe o nome e a ordem para categorizar os insumos do restaurante.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3">
              <div className="space-y-1.5">
                <Label htmlFor="cat-name">Nome da Categoria *</Label>
                <Input
                  id="cat-name"
                  placeholder="Ex: Carnes, Hortifruti, Laticínios..."
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cat-slug">Identificador (Slug)</Label>
                  <Input
                    id="cat-slug"
                    placeholder="Ex: carnes (automático)"
                    value={categoryForm.slug}
                    onChange={(e) => setCategoryForm({ ...categoryForm, slug: e.target.value })}
                  />
                  <p className="text-[10px] text-slate-400">Deixe em branco para auto-gerar.</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cat-order">Ordem de Exibição</Label>
                  <Input
                    id="cat-order"
                    type="number"
                    min="1"
                    value={categoryForm.sort_order}
                    onChange={(e) =>
                      setCategoryForm({ ...categoryForm, sort_order: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cat-desc">Descrição (opcional)</Label>
                <Textarea
                  id="cat-desc"
                  rows={2}
                  placeholder="Informações sobre quais produtos pertencem a esta categoria..."
                  value={categoryForm.description}
                  onChange={(e) =>
                    setCategoryForm({ ...categoryForm, description: e.target.value })
                  }
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCategoryModalOpen(false)}
                disabled={savingCategory}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={savingCategory}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {savingCategory && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingCategory ? 'Salvar Alterações' : 'Cadastrar Categoria'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL PROTEGIDO DE EXCLUSÃO DE TIPO DE PRATO */}
      <Dialog
        open={Boolean(deleteDishTypeTarget)}
        onOpenChange={() => setDeleteDishTypeTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Excluir Tipo: {deleteDishTypeTarget?.name}
            </DialogTitle>
            <DialogDescription>
              {(() => {
                const count = deleteDishTypeTarget
                  ? (dishTypeUsage[deleteDishTypeTarget.id] ?? 0)
                  : 0
                if (count > 0) {
                  return `Atenção: Existem ${count} ${count === 1 ? 'ficha técnica cadastrada' : 'fichas técnicas cadastradas'} utilizando este tipo. Para proteger o sistema contra fichas órfãs, escolha para qual tipo elas devem ser reclassificadas.`
                }
                return 'Tem certeza que deseja excluir este tipo de prato? Esta ação não pode ser desfeita.'
              })()}
            </DialogDescription>
          </DialogHeader>

          {deleteDishTypeTarget && (dishTypeUsage[deleteDishTypeTarget.id] ?? 0) > 0 && (
            <div className="space-y-2 py-2">
              <Label className="text-xs font-semibold text-slate-700">
                Reclassificar fichas vinculadas para: *
              </Label>
              <Select value={dishTypeFallbackId} onValueChange={setDishTypeFallbackId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo de destino..." />
                </SelectTrigger>
                <SelectContent>
                  {dishTypes
                    .filter((t) => t.id !== deleteDishTypeTarget.id)
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} {t.is_garnish ? '(Guarnição)' : ''}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-slate-500">
                Garante que nenhuma ficha técnica perca sua classificação ou quebre sub-fichas.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteDishTypeTarget(null)}
              disabled={deletingDishType}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDeleteDishType}
              disabled={
                deletingDishType ||
                ((dishTypeUsage[deleteDishTypeTarget?.id || ''] ?? 0) > 0 && !dishTypeFallbackId)
              }
            >
              {deletingDishType && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar Exclusão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL PROTEGIDO DE EXCLUSÃO DE CATEGORIA */}
      <Dialog
        open={Boolean(deleteCategoryTarget)}
        onOpenChange={() => setDeleteCategoryTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Excluir Categoria: {deleteCategoryTarget?.name}
            </DialogTitle>
            <DialogDescription>
              {(() => {
                const count = deleteCategoryTarget
                  ? (categoryUsage[deleteCategoryTarget.id] ?? 0)
                  : 0
                if (count > 0) {
                  return `Atenção: Existem ${count} ${count === 1 ? 'insumo cadastrado' : 'insumos cadastrados'} pertencentes a esta categoria. Escolha para qual categoria esses itens devem ser movidos.`
                }
                return 'Tem certeza que deseja excluir esta categoria? Esta ação não pode ser desfeita.'
              })()}
            </DialogDescription>
          </DialogHeader>

          {deleteCategoryTarget && (categoryUsage[deleteCategoryTarget.id] ?? 0) > 0 && (
            <div className="space-y-2 py-2">
              <Label className="text-xs font-semibold text-slate-700">
                Mover insumos vinculados para: *
              </Label>
              <Select value={categoryFallbackId} onValueChange={setCategoryFallbackId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a categoria de destino..." />
                </SelectTrigger>
                <SelectContent>
                  {categories
                    .filter((c) => c.id !== deleteCategoryTarget.id)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-slate-500">
                Os insumos serão reclassificados para a categoria escolhida sem afetar os custos.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteCategoryTarget(null)}
              disabled={deletingCategory}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDeleteCategory}
              disabled={
                deletingCategory ||
                ((categoryUsage[deleteCategoryTarget?.id || ''] ?? 0) > 0 && !categoryFallbackId)
              }
            >
              {deletingCategory && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar Exclusão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
