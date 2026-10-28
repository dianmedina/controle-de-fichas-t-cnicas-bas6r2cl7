import React, { useEffect, useState, useMemo } from 'react'
import { ingredientsService } from '@/services/ingredients'
import { ingredientCategoriesService } from '@/services/ingredientCategories'
import {
  Ingredient,
  IngredientCategory,
  MeasurementUnit,
  IngredientPriceHistory,
  formatCurrency,
  formatPackageInfo,
  getStandardUnitPrice,
  getEffectiveIngredientPrice,
} from '@/types/restaurant'
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
import { useToast } from '@/hooks/use-toast'
import { ImportIngredientsDialog } from '@/components/ImportIngredientsDialog'
import { MergeIngredientsDialog } from '@/components/MergeIngredientsDialog'
import { normalizeName, areNamesEquivalent } from '@/lib/stringUtils'
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Boxes,
  Loader2,
  Filter,
  DollarSign,
  Package,
  History,
  TrendingUp,
  TrendingDown,
  Minus,
  FileSpreadsheet,
  GitMerge,
  CheckSquare,
  Square,
} from 'lucide-react'

const UNITS: MeasurementUnit[] = ['kg', 'g', 'L', 'mL', 'unidade']

export default function Insumos() {
  const { toast } = useToast()
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [availableCategories, setAvailableCategories] = useState<IngredientCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  // Estado do Modal (Criação/Edição)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null)
  const [saving, setSaving] = useState(false)

  // Estado do Modal de Importação Excel
  const [isImportOpen, setIsImportOpen] = useState(false)

  // Estado do Histórico de Preços no Modal
  const [priceHistory, setPriceHistory] = useState<IngredientPriceHistory[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Estado do Modal de Confirmação de Exclusão
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Estado para Seleção Múltipla e Unificação (Merge)
  const [selectedIngredientIds, setSelectedIngredientIds] = useState<string[]>([])
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false)

  // Formulário
  const [formData, setFormData] = useState({
    name: '',
    price: '', // Se has_package, representa o preço pago pela embalagem inteira; se não, o preço por unit
    reduction_percent: '',
    unit: 'kg' as MeasurementUnit, // Medida padrão de cálculo (kg, L, unidade, etc.)
    has_package: false,
    package_size: '',
    package_unit: 'kg' as MeasurementUnit,
    category: '',
    supplier: '',
    min_stock: '',
  })

  // Preço por medida padrão convertido da embalagem
  const standardUnitPricePreview = useMemo(() => {
    const p = parseFloat(formData.price.replace(',', '.'))
    if (isNaN(p) || p < 0) return 0

    if (!formData.has_package) {
      return p
    }

    const pkgSize = parseFloat(formData.package_size.replace(',', '.'))
    if (isNaN(pkgSize) || pkgSize <= 0) return p

    return getStandardUnitPrice(p, pkgSize, formData.package_unit, formData.unit)
  }, [
    formData.price,
    formData.has_package,
    formData.package_size,
    formData.package_unit,
    formData.unit,
  ])

  // Preço de custo após redução (perda) calculado em tempo real a partir da medida padrão
  const effectiveCostPreview = useMemo(() => {
    const red = parseFloat(formData.reduction_percent.replace(',', '.'))
    return getEffectiveIngredientPrice(standardUnitPricePreview, isNaN(red) ? 0 : red)
  }, [standardUnitPricePreview, formData.reduction_percent])

  const loadIngredients = async () => {
    try {
      setLoading(true)
      const [data, cats] = await Promise.all([
        ingredientsService.getAll(),
        ingredientCategoriesService.getAll().catch(() => []),
      ])
      setIngredients(data)
      setAvailableCategories(cats)
    } catch (error) {
      console.error('Erro ao carregar insumos:', error)
      toast({
        title: 'Erro ao carregar insumos',
        description: 'Não foi possível buscar a lista de insumos.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadIngredients()
  }, [])

  const categories = useMemo(() => {
    const set = new Set<string>()
    availableCategories.forEach((c) => {
      if (c.name) set.add(c.name)
    })
    ingredients.forEach((ing) => {
      if (ing.category) set.add(ing.category)
      if (ing.expand?.category_id?.name) set.add(ing.expand.category_id.name)
    })
    return Array.from(set).sort()
  }, [ingredients, availableCategories])

  const filteredIngredients = useMemo(() => {
    const searchNorm = normalizeName(searchTerm)
    return ingredients.filter((ing) => {
      const matchesSearch =
        !searchNorm ||
        normalizeName(ing.name).includes(searchNorm) ||
        (ing.supplier && normalizeName(ing.supplier).includes(searchNorm))
      const matchesCategory =
        selectedCategory === 'all' ||
        ing.category === selectedCategory ||
        ing.category_id === selectedCategory ||
        ing.expand?.category_id?.name === selectedCategory ||
        ing.expand?.category_id?.id === selectedCategory
      return matchesSearch && matchesCategory
    })
  }, [ingredients, searchTerm, selectedCategory])

  const handleOpenCreate = () => {
    setEditingIngredient(null)
    setPriceHistory([])
    setFormData({
      name: '',
      price: '',
      reduction_percent: '',
      unit: 'kg',
      has_package: false,
      package_size: '',
      package_unit: 'kg',
      category: '',
      supplier: '',
      min_stock: '',
    })
    setIsModalOpen(true)
  }

  const handleOpenEdit = async (ing: Ingredient) => {
    setEditingIngredient(ing)
    setPriceHistory([])
    const hasPkg = Boolean(ing.package_size && ing.package_size > 0 && ing.package_unit)

    // Se o insumo tiver embalagem cadastrada, o preço original pago pela embalagem é reconstituído para facilitar a edição
    // ou se o usuário quiser editar direto o preço da embalagem:
    let initialPriceStr = ing.price.toString()
    if (hasPkg && ing.package_size && ing.package_unit) {
      // Se comprou 5kg e o preço por kg é R$ 4, o preço da embalagem de 5kg foi R$ 20
      // Calculamos o preço da embalagem com base na conversão reversa
      if (ing.package_unit === ing.unit) {
        initialPriceStr = (ing.price * ing.package_size).toFixed(2).replace(/\.00$/, '')
      } else if (ing.package_unit === 'g' && ing.unit === 'kg') {
        initialPriceStr = (ing.price * (ing.package_size / 1000)).toFixed(2).replace(/\.00$/, '')
      } else if (ing.package_unit === 'kg' && ing.unit === 'g') {
        initialPriceStr = (ing.price * (ing.package_size * 1000)).toFixed(2).replace(/\.00$/, '')
      } else if (ing.package_unit === 'mL' && ing.unit === 'L') {
        initialPriceStr = (ing.price * (ing.package_size / 1000)).toFixed(2).replace(/\.00$/, '')
      } else if (ing.package_unit === 'L' && ing.unit === 'mL') {
        initialPriceStr = (ing.price * (ing.package_size * 1000)).toFixed(2).replace(/\.00$/, '')
      } else {
        initialPriceStr = (ing.price * ing.package_size).toFixed(2).replace(/\.00$/, '')
      }
    }

    setFormData({
      name: ing.name,
      price: initialPriceStr,
      reduction_percent:
        ing.reduction_percent !== undefined && ing.reduction_percent !== null
          ? ing.reduction_percent.toString()
          : '',
      unit: ing.unit,
      has_package: hasPkg,
      package_size: hasPkg && ing.package_size ? ing.package_size.toString() : '',
      package_unit: (hasPkg && ing.package_unit ? ing.package_unit : ing.unit) as MeasurementUnit,
      category: ing.category,
      supplier: ing.supplier || '',
      min_stock:
        ing.min_stock !== undefined && ing.min_stock !== null ? ing.min_stock.toString() : '',
    })
    setIsModalOpen(true)

    try {
      setLoadingHistory(true)
      const hist = await ingredientsService.getPriceHistory(ing.id)
      setPriceHistory(hist)
    } catch (err) {
      console.error('Erro ao buscar histórico de preços:', err)
    } finally {
      setLoadingHistory(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim() || !formData.price || !formData.category.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha nome, preço e categoria do insumo.',
        variant: 'destructive',
      })
      return
    }

    const priceNum = parseFloat(formData.price.replace(',', '.'))
    if (isNaN(priceNum) || priceNum < 0) {
      toast({
        title: 'Preço inválido',
        description: 'Informe um valor numérico válido.',
        variant: 'destructive',
      })
      return
    }

    let reductionNum: number | undefined
    if (formData.reduction_percent.trim()) {
      const parsedRed = parseFloat(formData.reduction_percent.replace(',', '.'))
      if (isNaN(parsedRed) || parsedRed < 0 || parsedRed >= 100) {
        toast({
          title: 'Perda percentual inválida',
          description:
            'A perda no preparo deve ser um valor entre 0% e 99,9% (não pode ser 100% ou mais).',
          variant: 'destructive',
        })
        return
      }
      reductionNum = parsedRed
    } else {
      reductionNum = 0
    }

    const minStockNum = formData.min_stock
      ? parseFloat(formData.min_stock.replace(',', '.'))
      : undefined

    let finalStandardPrice = priceNum
    let packageSizeVal: number | undefined
    let packageUnitVal: MeasurementUnit | undefined

    if (formData.has_package) {
      const parsedPkgSize = parseFloat(formData.package_size.replace(',', '.'))
      if (isNaN(parsedPkgSize) || parsedPkgSize <= 0) {
        toast({
          title: 'Tamanho da embalagem inválido',
          description:
            'Informe um tamanho de embalagem maior que zero (ex: 5 para pacote de 5kg, 500 para garrafa de 500mL).',
          variant: 'destructive',
        })
        return
      }
      packageSizeVal = parsedPkgSize
      packageUnitVal = formData.package_unit
      finalStandardPrice = getStandardUnitPrice(
        priceNum,
        parsedPkgSize,
        formData.package_unit,
        formData.unit,
      )
    }

    try {
      setSaving(true)
      // Garante que a categoria exista na collection ingredient_categories
      let linkedCategoryId: string | undefined
      try {
        const catRecord = await ingredientCategoriesService.findOrCreate(formData.category.trim())
        linkedCategoryId = catRecord.id
      } catch (catErr) {
        console.warn('Erro ao auto-criar/obter categoria:', catErr)
      }

      // Verificação de duplicidade ignorando acentos
      const trimmedName = formData.name.trim()
      const duplicateIng = ingredients.find(
        (i) =>
          i.id !== editingIngredient?.id &&
          (areNamesEquivalent(i.name, trimmedName) ||
            normalizeName(i.name) === normalizeName(trimmedName)),
      )
      if (duplicateIng) {
        toast({
          title: 'Insumo já cadastrado',
          description: `Já existe um insumo com nome equivalente: "${duplicateIng.name}".`,
          variant: 'destructive',
        })
        setSaving(false)
        return
      }

      if (editingIngredient) {
        await ingredientsService.update(editingIngredient.id, {
          name: formData.name.trim(),
          price: finalStandardPrice,
          reduction_percent: reductionNum,
          unit: formData.unit,
          package_size: packageSizeVal,
          package_unit: packageUnitVal,
          category: formData.category.trim(),
          category_id: linkedCategoryId,
          supplier: formData.supplier.trim() || undefined,
          min_stock: minStockNum,
        } as any)
        toast({ title: 'Insumo atualizado com sucesso!' })
      } else {
        await ingredientsService.create({
          name: formData.name.trim(),
          price: finalStandardPrice,
          reduction_percent: reductionNum,
          unit: formData.unit,
          package_size: packageSizeVal,
          package_unit: packageUnitVal,
          category: formData.category.trim(),
          category_id: linkedCategoryId,
          supplier: formData.supplier.trim() || undefined,
          min_stock: minStockNum,
        } as any)
        toast({ title: 'Insumo cadastrado com sucesso!' })
      }
      setIsModalOpen(false)
      loadIngredients()
    } catch (error) {
      console.error('Erro ao salvar insumo:', error)
      toast({
        title: 'Erro ao salvar',
        description: 'Ocorreu um erro ao persistir as informações.',
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
      await ingredientsService.delete(deleteConfirmId)
      toast({ title: 'Insumo excluído com sucesso!' })
      setDeleteConfirmId(null)
      loadIngredients()
    } catch (error) {
      console.error('Erro ao excluir insumo:', error)
      toast({
        title: 'Erro ao excluir',
        description: 'Verifique se o insumo está vinculado a fichas técnicas ativas.',
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
            <Boxes className="h-6 w-6 text-amber-600" />
            Insumos & Ingredientes
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Cadastre os ingredientes, preços de compra por unidade e fornecedores para alimentar as
            fichas técnicas.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {selectedIngredientIds.length >= 2 && (
            <Button
              onClick={() => setIsMergeDialogOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm flex items-center gap-1.5 text-xs sm:text-sm animate-in fade-in"
            >
              <GitMerge className="h-4 w-4" />
              Unificar ({selectedIngredientIds.length}) Selecionados
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => setIsImportOpen(true)}
            className="border-amber-300 text-amber-900 hover:bg-amber-50 shadow-xs flex items-center gap-1.5 text-xs sm:text-sm"
          >
            <FileSpreadsheet className="h-4 w-4 text-amber-700" />
            Importar Insumos (.xlsx)
          </Button>
          <Button
            onClick={handleOpenCreate}
            className="bg-amber-600 hover:bg-amber-700 text-white shadow-sm flex items-center gap-1.5 text-xs sm:text-sm"
          >
            <Plus className="h-4 w-4" />
            Novo Insumo
          </Button>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="shadow-xs border-slate-200">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase font-semibold text-slate-500">
              Total de Insumos
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-slate-800">
              {ingredients.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            Itens cadastrados na despensa/estoque
          </CardContent>
        </Card>

        <Card className="shadow-xs border-slate-200">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase font-semibold text-slate-500">
              Categorias Ativas
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-slate-800">{categories.length}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            Carnes, Laticínios, Hortifruti, Temperos...
          </CardContent>
        </Card>

        <Card className="shadow-xs border-slate-200">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase font-semibold text-slate-500">
              Preço Médio por Insumo
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-amber-700">
              {ingredients.length > 0
                ? formatCurrency(
                    ingredients.reduce((acc, i) => acc + i.price, 0) / ingredients.length,
                  )
                : 'R$ 0,00'}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            Média ponderada nominal de compra
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar por nome do insumo ou fornecedor..."
            className="pl-9 bg-slate-50 border-slate-200 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400 shrink-0" />
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-full sm:w-[220px] text-sm bg-slate-50 border-slate-200">
              <SelectValue placeholder="Todas as categorias" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias ({ingredients.length})</SelectItem>
              {categories.map((cat) => {
                const count = ingredients.filter(
                  (i) => i.category === cat || i.expand?.category_id?.name === cat,
                ).length
                return (
                  <SelectItem key={cat} value={cat}>
                    {cat} {count > 0 ? `(${count})` : ''}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabela de Insumos */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-7 w-7 animate-spin text-amber-600" />
            <p className="text-sm">Carregando insumos...</p>
          </div>
        ) : filteredIngredients.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-800">Nenhum insumo encontrado</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
              {searchTerm || selectedCategory !== 'all'
                ? 'Tente ajustar os filtros ou a palavra-chave de busca.'
                : 'Comece adicionando os primeiros insumos e preços de compra do restaurante.'}
            </p>
            {!searchTerm && selectedCategory === 'all' && (
              <Button
                onClick={handleOpenCreate}
                variant="outline"
                className="mt-4 border-amber-300 text-amber-800 hover:bg-amber-50"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Cadastrar Primeiro Insumo
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/75">
                <TableRow>
                  <TableHead className="w-10 text-center">
                    <input
                      type="checkbox"
                      title="Selecionar todos os filtrados"
                      checked={
                        filteredIngredients.length > 0 &&
                        filteredIngredients.every((i) => selectedIngredientIds.includes(i.id))
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          const idsToAdd = filteredIngredients.map((i) => i.id)
                          setSelectedIngredientIds(
                            Array.from(new Set([...selectedIngredientIds, ...idsToAdd])),
                          )
                        } else {
                          const filteredSet = new Set(filteredIngredients.map((i) => i.id))
                          setSelectedIngredientIds(
                            selectedIngredientIds.filter((id) => !filteredSet.has(id)),
                          )
                        }
                      }}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                    />
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700">Insumo</TableHead>
                  <TableHead className="font-semibold text-slate-700">Categoria</TableHead>
                  <TableHead className="font-semibold text-slate-700 text-right">
                    Preço de Compra
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 text-center">
                    Perda no Preparo (%)
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 text-right text-amber-900 bg-amber-50/50">
                    Custo Utilizável
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700">Unidade Base</TableHead>
                  <TableHead className="font-semibold text-slate-700">Fornecedor</TableHead>
                  <TableHead className="font-semibold text-slate-700 text-center">
                    Estoque Mínimo
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredIngredients.map((ing) => {
                  const effectivePrice = getEffectiveIngredientPrice(
                    ing.price,
                    ing.reduction_percent,
                  )
                  const hasReduction = !!(ing.reduction_percent && ing.reduction_percent > 0)

                  const hasPackage = Boolean(
                    ing.package_size && ing.package_size > 0 && ing.package_unit,
                  )
                  const packageDesc =
                    hasPackage && ing.package_size && ing.package_unit
                      ? formatPackageInfo(ing.package_size, ing.package_unit)
                      : null

                  const isSelected = selectedIngredientIds.includes(ing.id)

                  return (
                    <TableRow
                      key={ing.id}
                      className={`hover:bg-slate-50/50 transition-colors ${
                        isSelected ? 'bg-indigo-50/30' : ''
                      }`}
                    >
                      <TableCell className="text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIngredientIds([...selectedIngredientIds, ing.id])
                            } else {
                              setSelectedIngredientIds(
                                selectedIngredientIds.filter((id) => id !== ing.id),
                              )
                            }
                          }}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                        />
                      </TableCell>
                      <TableCell className="font-medium text-slate-900">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{ing.name}</span>
                            {hasPackage && (
                              <Badge
                                variant="outline"
                                className="text-[10px] py-0 px-1.5 font-normal bg-amber-50 text-amber-800 border-amber-200"
                              >
                                Emb. {packageDesc}
                              </Badge>
                            )}
                          </div>
                          {hasReduction && (
                            <span className="block text-[11px] text-amber-700 font-medium">
                              +{formatCurrency(effectivePrice - ing.price)} / {ing.unit} utilizável
                              (perda de {ing.reduction_percent}%)
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className="bg-slate-100 text-slate-700 font-normal"
                        >
                          {ing.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium text-slate-700">
                        <div>
                          <span>{formatCurrency(ing.price)}</span>
                          <span className="text-xs text-slate-400 font-normal ml-1">
                            / {ing.unit}
                          </span>
                        </div>
                        {hasPackage && ing.package_size && ing.package_unit && (
                          <span className="block text-[10px] text-slate-500">
                            {(() => {
                              let pkgPrice = ing.price * ing.package_size
                              if (ing.package_unit === 'g' && ing.unit === 'kg') {
                                pkgPrice = ing.price * (ing.package_size / 1000)
                              } else if (ing.package_unit === 'mL' && ing.unit === 'L') {
                                pkgPrice = ing.price * (ing.package_size / 1000)
                              } else if (ing.package_unit === 'kg' && ing.unit === 'g') {
                                pkgPrice = ing.price * (ing.package_size * 1000)
                              } else if (ing.package_unit === 'L' && ing.unit === 'mL') {
                                pkgPrice = ing.price * (ing.package_size * 1000)
                              }
                              return `${ing.package_size} ${ing.package_unit} por ${formatCurrency(pkgPrice)}`
                            })()}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {hasReduction ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            {ing.reduction_percent}%
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">0%</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-bold text-slate-950 bg-amber-50/40">
                        <span
                          className={hasReduction ? 'text-amber-900 font-bold' : 'text-slate-900'}
                        >
                          {formatCurrency(effectivePrice)}
                        </span>
                        <span className="text-xs text-slate-400 font-normal ml-1">
                          / {ing.unit}
                        </span>
                      </TableCell>
                      <TableCell className="text-slate-600">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                          {ing.unit}
                        </span>
                      </TableCell>
                      <TableCell className="text-slate-500 text-sm">
                        {ing.supplier || (
                          <span className="text-slate-300 italic">Não informado</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center text-slate-600 text-sm">
                        {ing.min_stock !== undefined && ing.min_stock !== null ? (
                          <span>
                            {ing.min_stock} {ing.unit}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEdit(ing)}
                            className="h-8 w-8 text-slate-600 hover:text-amber-700 hover:bg-amber-50"
                            title="Editar insumo"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteConfirmId(ing.id)}
                            className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                            title="Excluir insumo"
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

      {/* Modal de Criação / Edição com Histórico de Preços */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-xl max-h-[92vh] flex flex-col overflow-hidden">
          <form onSubmit={handleSave} className="flex flex-col flex-1 overflow-hidden">
            <DialogHeader className="shrink-0">
              <DialogTitle>{editingIngredient ? 'Editar Insumo' : 'Novo Insumo'}</DialogTitle>
              <DialogDescription>
                Informe os detalhes do insumo e o preço de custo pago na compra.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4 overflow-y-auto flex-1 pr-1">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nome do Insumo *</Label>
                <Input
                  id="name"
                  placeholder="Ex: Filé Mignon Bovino, Arroz Arbóreo..."
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              {/* Opção de Embalagem (Toggle) */}
              <div className="rounded-xl border border-slate-200 p-3 bg-slate-50/70 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="has_package"
                      checked={formData.has_package}
                      onChange={(e) => {
                        const checked = e.target.checked
                        setFormData({
                          ...formData,
                          has_package: checked,
                          package_unit: checked ? formData.unit : formData.package_unit,
                        })
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                    />
                    <Label
                      htmlFor="has_package"
                      className="text-sm font-semibold text-slate-800 cursor-pointer"
                    >
                      Comprado por embalagem diferente da medida padrão
                    </Label>
                  </div>
                  {formData.has_package && (
                    <Badge
                      variant="outline"
                      className="bg-amber-100 text-amber-900 border-amber-300 text-xs font-semibold"
                    >
                      Conversão Ativada
                    </Badge>
                  )}
                </div>

                {formData.has_package && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-200">
                    <div className="space-y-1">
                      <Label htmlFor="package_size" className="text-xs text-slate-700 font-medium">
                        Tamanho / Capacidade da Embalagem *
                      </Label>
                      <Input
                        id="package_size"
                        type="number"
                        step="any"
                        min="0.0001"
                        placeholder="Ex: 5 (para 5kg) ou 500 (para 500mL)"
                        value={formData.package_size}
                        onChange={(e) => setFormData({ ...formData, package_size: e.target.value })}
                        required={formData.has_package}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="package_unit" className="text-xs text-slate-700 font-medium">
                        Unidade da Embalagem *
                      </Label>
                      <Select
                        value={formData.package_unit}
                        onValueChange={(val: MeasurementUnit) =>
                          setFormData({ ...formData, package_unit: val })
                        }
                      >
                        <SelectTrigger id="package_unit">
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
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="price">
                    {formData.has_package ? 'Preço da Embalagem (R$) *' : 'Preço de Compra (R$) *'}
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-400 text-sm">R$</span>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      className="pl-9"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      required
                    />
                  </div>
                  {formData.has_package && (
                    <span className="text-[11px] text-slate-500 block leading-snug">
                      Valor total pago pelo pacote/garrafa
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="unit">Medida Padrão das Fichas *</Label>
                  <Select
                    value={formData.unit}
                    onValueChange={(val: MeasurementUnit) =>
                      setFormData({ ...formData, unit: val })
                    }
                  >
                    <SelectTrigger id="unit">
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
                  <span className="text-[11px] text-slate-500 block leading-snug">
                    Unidade de cálculo do sistema (ex: kg ou L)
                  </span>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reduction_percent">Redução / Perda (%)</Label>
                  <div className="relative">
                    <Input
                      id="reduction_percent"
                      type="number"
                      step="0.1"
                      min="0"
                      max="99.9"
                      placeholder="0"
                      className="pr-8"
                      value={formData.reduction_percent}
                      onChange={(e) =>
                        setFormData({ ...formData, reduction_percent: e.target.value })
                      }
                    />
                    <span className="absolute right-3 top-2.5 text-slate-400 text-sm font-semibold">
                      %
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 block leading-snug">
                    Perda no preparo (apara/limpeza)
                  </span>
                </div>
              </div>

              {/* Card de Cálculo em Tempo Real do Preço Convertido e Custo Final */}
              <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-xs uppercase font-bold text-amber-900 tracking-wide block">
                      Preço por Medida Padrão ({formData.unit})
                    </span>
                    <span className="text-[11px] text-amber-700">
                      {formData.has_package && formData.package_size
                        ? `Preço embalagem (${formatCurrency(parseFloat(formData.price.replace(',', '.')) || 0)}) ÷ ${formData.package_size} ${formData.package_unit}`
                        : 'Preço base cadastrado'}
                    </span>
                  </div>
                  <div className="text-left sm:text-right">
                    <span className="text-base font-bold text-slate-900 font-mono">
                      {formatCurrency(standardUnitPricePreview)}
                    </span>
                    <span className="text-xs text-slate-600 ml-1">/ {formData.unit}</span>
                  </div>
                </div>

                <div className="border-t border-amber-200/80 pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-xs uppercase font-extrabold text-amber-950 tracking-wide block">
                      Custo Utilizável Final (alimenta as fichas)
                    </span>
                    <span className="text-[11px] text-amber-800">
                      {parseFloat(formData.reduction_percent) > 0
                        ? `Aplica perda de ${formData.reduction_percent}% no preparo sobre o preço por ${formData.unit}`
                        : `Sem perda registrada (custo igual ao preço por ${formData.unit})`}
                    </span>
                  </div>
                  <div className="text-left sm:text-right">
                    <span className="text-lg font-black text-amber-950 font-mono">
                      {formatCurrency(effectiveCostPreview)}
                    </span>
                    <span className="text-xs text-amber-800 font-semibold ml-1">
                      / {formData.unit} utilizável
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="category">Categoria *</Label>
                    <span className="text-[11px] text-slate-400">
                      Selecione da lista cadastrada
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={formData.category}
                      onValueChange={(val) => setFormData({ ...formData, category: val })}
                    >
                      <SelectTrigger id="category" className="flex-1">
                        <SelectValue placeholder="Selecione uma categoria..." />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Campo alternativo caso queira digitar uma categoria customizada */}
                  <div className="pt-1">
                    <Input
                      id="category-custom"
                      list="categories-datalist"
                      placeholder="Ou digite o nome de uma nova categoria..."
                      className="text-xs h-8 bg-slate-50"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    />
                    <datalist id="categories-datalist">
                      {categories.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="supplier">Fornecedor (opcional)</Label>
                  <Input
                    id="supplier"
                    placeholder="Ex: Frigorífico Central"
                    value={formData.supplier}
                    onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="min_stock">Estoque Mínimo Recomendado (opcional)</Label>
                <Input
                  id="min_stock"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Ex: 5"
                  value={formData.min_stock}
                  onChange={(e) => setFormData({ ...formData, min_stock: e.target.value })}
                />
              </div>

              {/* Seção de Histórico de Preços (exibida na edição) */}
              {editingIngredient && (
                <div className="pt-2 border-t border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <History className="h-4 w-4 text-amber-700" />
                      <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Histórico de Variação de Preços
                      </Label>
                    </div>
                    {priceHistory.length > 1 && (
                      <span className="text-[11px] text-slate-500">
                        {priceHistory.length} registros encontrados
                      </span>
                    )}
                  </div>

                  {loadingHistory ? (
                    <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                      Carregando histórico...
                    </div>
                  ) : priceHistory.length === 0 ? (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500 text-center">
                      Nenhuma alteração anterior registrada para este insumo.
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white max-h-48 overflow-y-auto">
                      <Table>
                        <TableHeader className="bg-slate-50">
                          <TableRow className="h-8">
                            <TableHead className="text-[11px] h-8 font-semibold">Data</TableHead>
                            <TableHead className="text-[11px] h-8 font-semibold text-right">
                              Preço
                            </TableHead>
                            <TableHead className="text-[11px] h-8 font-semibold text-center">
                              Variação
                            </TableHead>
                            <TableHead className="text-[11px] h-8 font-semibold">Motivo</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {priceHistory.map((item, idx) => {
                            const nextOlderItem = priceHistory[idx + 1]
                            let diff: number | null = null
                            if (nextOlderItem) {
                              diff = item.price - nextOlderItem.price
                            }

                            return (
                              <TableRow key={item.id} className="h-8 hover:bg-slate-50/50">
                                <TableCell className="text-xs font-mono py-1.5">
                                  {item.date
                                    ? item.date.split('-').reverse().join('/')
                                    : (item.created || '')
                                        .slice(0, 10)
                                        .split('-')
                                        .reverse()
                                        .join('/')}
                                </TableCell>
                                <TableCell className="text-xs text-right font-bold text-slate-900 py-1.5">
                                  {formatCurrency(item.price)}
                                </TableCell>
                                <TableCell className="text-center py-1.5">
                                  {diff === null ? (
                                    <span className="text-[11px] text-slate-400 font-mono">
                                      inicial
                                    </span>
                                  ) : Math.abs(diff) < 0.001 ? (
                                    <span className="inline-flex items-center text-[11px] text-slate-500">
                                      <Minus className="h-3 w-3 mr-0.5" /> 0%
                                    </span>
                                  ) : diff > 0 ? (
                                    <span className="inline-flex items-center text-[11px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                                      <TrendingUp className="h-3 w-3 mr-0.5" />+
                                      {formatCurrency(diff)}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                      <TrendingDown className="h-3 w-3 mr-0.5" />
                                      {formatCurrency(diff)}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="text-[11px] text-slate-500 truncate max-w-[150px] py-1.5">
                                  {item.notes || '-'}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="shrink-0 pt-3 border-t border-slate-100">
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
                {editingIngredient ? 'Salvar Alterações' : 'Cadastrar Insumo'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de Importação Excel de Insumos */}
      <ImportIngredientsDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        existingIngredients={ingredients}
        onSuccess={loadIngredients}
      />

      {/* Modal de Unificação (Merge) de Insumos */}
      <MergeIngredientsDialog
        open={isMergeDialogOpen}
        onOpenChange={setIsMergeDialogOpen}
        ingredientsToMerge={ingredients.filter((i) => selectedIngredientIds.includes(i.id))}
        categories={availableCategories}
        onSuccess={() => {
          setSelectedIngredientIds([])
          loadIngredients()
        }}
      />

      {/* Modal Confirmação de Exclusão */}
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir este insumo? Se houver fichas técnicas utilizando-o, o
              custo das mesmas pode ser afetado.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir Definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
