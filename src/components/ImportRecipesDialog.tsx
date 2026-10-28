import React, { useState, useRef } from 'react'
import {
  Recipe,
  Ingredient,
  MeasurementUnit,
  formatCurrency,
  calculateItemCost,
  getEffectiveIngredientPrice,
} from '@/types/restaurant'
import {
  parseExcelRecipesFile,
  validateAndGroupRecipeRows,
  downloadRecipesTemplate,
  RecipeSheetDetectionResult,
  GroupedRecipePreview,
} from '@/lib/excelRecipes'
import { recipesService } from '@/services/recipes'
import { ingredientsService } from '@/services/ingredients'
import { dishTypesService } from '@/services/dishTypes'
import { normalizeName } from '@/lib/stringUtils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Info,
  ChevronDown,
  ChevronRight,
  Utensils,
  CookingPot,
  Plus,
  Layers,
  Clock,
  DollarSign,
  AlertTriangle,
} from 'lucide-react'

interface ImportRecipesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingRecipes: Recipe[]
  existingIngredients: Ingredient[]
  dishTypes?: import('@/types/restaurant').DishType[]
  onSuccess: () => void
}

export function ImportRecipesDialog({
  open,
  onOpenChange,
  existingRecipes,
  existingIngredients,
  dishTypes = [],
  onSuccess,
}: ImportRecipesDialogProps) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [sheetResult, setSheetResult] = useState<RecipeSheetDetectionResult | null>(null)
  const [columnMapping, setColumnMapping] = useState<
    NonNullable<RecipeSheetDetectionResult['detectedColumns']>
  >({
    recipeNameCol: '',
    ingredientCol: '',
    quantityCol: '',
    unitCol: '',
    typeCol: '',
    yieldCol: '',
    sellingPriceCol: '',
    laborCostCol: '',
    notesCol: '',
  })
  const [autoCreateMissingIngredients, setAutoCreateMissingIngredients] = useState(true)
  const [previewGroups, setPreviewGroups] = useState<GroupedRecipePreview[]>([])
  const [showColumnConfig, setShowColumnConfig] = useState(false)
  const [expandedRecipes, setExpandedRecipes] = useState<Record<string, boolean>>({})

  const handleDialogChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedFile(null)
      setSheetResult(null)
      setPreviewGroups([])
      setShowColumnConfig(false)
      setExpandedRecipes({})
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
    onOpenChange(isOpen)
  }

  const toggleExpand = (recipeName: string) => {
    setExpandedRecipes((prev) => ({
      ...prev,
      [recipeName]: !prev[recipeName],
    }))
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setSelectedFile(file)
    try {
      setParsing(true)
      const detected = await parseExcelRecipesFile(file)
      setSheetResult(detected)

      const initialMapping: NonNullable<RecipeSheetDetectionResult['detectedColumns']> = {
        recipeNameCol: detected.detectedColumns?.recipeNameCol || '',
        ingredientCol: detected.detectedColumns?.ingredientCol || '',
        quantityCol: detected.detectedColumns?.quantityCol || '',
        unitCol: detected.detectedColumns?.unitCol || '',
        typeCol: detected.detectedColumns?.typeCol || '',
        yieldCol: detected.detectedColumns?.yieldCol || '',
        sellingPriceCol: detected.detectedColumns?.sellingPriceCol || '',
        laborCostCol: detected.detectedColumns?.laborCostCol || '',
        notesCol: detected.detectedColumns?.notesCol || '',
      }
      setColumnMapping(initialMapping)

      const groups = validateAndGroupRecipeRows(
        detected,
        initialMapping,
        existingRecipes,
        existingIngredients,
        dishTypes,
      )
      setPreviewGroups(groups)

      // Abre automaticamente se tiver poucos pratos (<= 5)
      const initExpanded: Record<string, boolean> = {}
      groups.slice(0, 5).forEach((g) => {
        initExpanded[g.recipeName] = true
      })
      setExpandedRecipes(initExpanded)
    } catch (err: any) {
      console.error('Erro ao ler planilha de fichas:', err)
      toast({
        title: 'Falha ao processar arquivo',
        description: err.message || 'Verifique se o arquivo é um formato válido .xlsx ou .xls.',
        variant: 'destructive',
      })
      setSelectedFile(null)
      setSheetResult(null)
      setPreviewGroups([])
    } finally {
      setParsing(false)
    }
  }

  const handleRemap = (
    key: keyof NonNullable<RecipeSheetDetectionResult['detectedColumns']>,
    value: string,
  ) => {
    if (!sheetResult) return
    const updated = {
      ...columnMapping,
      [key]: value === 'none' ? undefined : value,
    }
    setColumnMapping(updated)
    const groups = validateAndGroupRecipeRows(
      sheetResult,
      updated,
      existingRecipes,
      existingIngredients,
      dishTypes,
    )
    setPreviewGroups(groups)
  }

  const handleConfirmImport = async () => {
    // Fichas elegíveis para importação
    const groupsToProcess = previewGroups.filter((g) => {
      if (g.isValid) return true
      // Se tiver erro real (ex: sem nome ou sem itens válidos), não processa
      return false
    })

    if (groupsToProcess.length === 0) {
      toast({
        title: 'Nenhuma ficha técnica válida para importar',
        description:
          'Verifique as fichas na planilha: é necessário ao menos o nome do prato e uma linha de ingrediente com quantidade maior que zero.',
        variant: 'destructive',
      })
      return
    }

    try {
      setImporting(true)
      let createdCount = 0
      let updatedCount = 0
      const autoCreatedIngredientsList: string[] = []
      const normalizedUnitsList: { from: string; to: string }[] = []

      // Mapa de ingredientes criados nesta importação ou já existentes
      // Indexado pelo normalizeName
      const knownIngredientsMap = new Map<string, Ingredient>()
      existingIngredients.forEach((ing) => {
        knownIngredientsMap.set(normalizeName(ing.name), ing)
      })

      // 1. Se autoCreateMissingIngredients estiver ativo, cria primeiro todos os insumos desconhecidos citados
      // Apenas para itens que NÃO são guarnições vinculadas
      if (autoCreateMissingIngredients) {
        for (const group of groupsToProcess) {
          for (const item of group.items) {
            if (item.itemKind === 'sub_recipe') {
              // É guarnição vinculada existente, não cria insumo
              continue
            }

            const rawName = item.ingredientName?.trim()
            if (!rawName) continue
            const norm = normalizeName(rawName)
            if (!knownIngredientsMap.has(norm) && !item.matchedIngredient) {
              // Converte unidade se fornecida (ex: g -> kg, mL -> L, ou mantém unidade/kg/L)
              let baseUnit: MeasurementUnit = 'kg'
              if (item.unit === 'g' || item.unit === 'kg') baseUnit = 'kg'
              else if (item.unit === 'mL' || item.unit === 'L') baseUnit = 'L'
              else if (item.unit === 'unidade') baseUnit = 'unidade'

              try {
                const createdIng = await ingredientsService.create(
                  {
                    name: rawName,
                    price: 0, // Preço inicial 0 para ser completado depois
                    reduction_percent: 0,
                    unit: baseUnit,
                    category: 'Geral',
                  } as any,
                  'Criado automaticamente pela importação de fichas técnicas (preço R$ 0,00 a definir)',
                )
                knownIngredientsMap.set(norm, createdIng)
                if (!autoCreatedIngredientsList.includes(rawName)) {
                  autoCreatedIngredientsList.push(rawName)
                }
              } catch (createErr) {
                console.error(`Erro ao auto-criar insumo "${rawName}":`, createErr)
              }
            }
          }
        }
      }

      // Rastreia unidades normalizadas que divergiram do original
      for (const group of groupsToProcess) {
        for (const item of group.items) {
          if (item.originalUnit && item.originalUnit.toLowerCase() !== item.unit.toLowerCase()) {
            const alreadyInList = normalizedUnitsList.some(
              (u) => u.from === item.originalUnit && u.to === item.unit,
            )
            if (!alreadyInList) {
              normalizedUnitsList.push({ from: item.originalUnit, to: item.unit })
            }
          }
        }
      }

      // Cache de tipos de prato para associar/criar automaticamente
      const dishTypeCache: Record<string, string> = {}

      // Carrega itens de todas as receitas existentes para verificação rigorosa de ciclos
      let currentAllRecipeItems = await recipesService.getAllRecipeItems().catch(() => [])

      let linkedGarnishesSavedCount = 0
      const cycleWarningsList: string[] = []

      // Mapa para correlacionar o nome ou id temporário das receitas criadas neste lote com seus IDs reais salvos
      const savedRecipesByName = new Map<string, Recipe>()
      existingRecipes.forEach((r) => {
        savedRecipesByName.set(normalizeName(r.name), r)
      })

      // FASE 1: Salva ou atualiza os cabeçalhos de todas as fichas técnicas do lote
      // Ordena garantindo que guarnições sejam salvas primeiro, mas mesmo se não forem,
      // a amarração dos itens acontecerá na FASE 2 após todas terem IDs no banco!
      const recipeIdMap = new Map<GroupedRecipePreview, string>()

      for (const group of groupsToProcess) {
        let recipeId: string
        const typeRaw = (
          group.rawDetectedType?.trim() ||
          group.matchedDishType?.name ||
          (group.recipeType === 'guarnicao' ? 'Guarnição' : 'Prato')
        ).trim()

        const normTypeKey = normalizeName(typeRaw)
        let linkedTypeId: string | undefined =
          group.dishTypeId || group.matchedDishType?.id || dishTypeCache[normTypeKey]

        const isGarnishType =
          group.recipeType === 'guarnicao' ||
          normTypeKey.includes('guarn') ||
          normTypeKey.includes('acompanh')

        if (!linkedTypeId && typeRaw) {
          try {
            const dtRecord = await dishTypesService.findOrCreate(typeRaw, {
              is_garnish: isGarnishType,
            })
            linkedTypeId = dtRecord.id
            dishTypeCache[normTypeKey] = dtRecord.id
            dishTypeCache[typeRaw.toLowerCase()] = dtRecord.id
          } catch (e) {
            console.warn('Falha ao associar/criar tipo de prato durante importação:', e)
          }
        }

        if (group.matchedExistingRecipe) {
          recipeId = group.matchedExistingRecipe.id
          await recipesService.update(recipeId, {
            type: group.recipeType,
            type_id: linkedTypeId || group.matchedExistingRecipe.type_id,
            yield_portions: group.yieldPortions,
            portion_size_value:
              group.portionSizeValue ?? group.matchedExistingRecipe.portion_size_value,
            portion_size_unit:
              group.portionSizeUnit ?? group.matchedExistingRecipe.portion_size_unit,
            selling_price: group.sellingPrice,
            labor_cost: group.laborCost !== undefined ? group.laborCost : 0,
            notes: group.notes,
          } as any)

          // Limpa itens antigos da ficha existente
          const currentItems = await recipesService.getItemsByRecipeId(recipeId)
          for (const item of currentItems) {
            await recipesService.deleteItem(item.id)
          }

          currentAllRecipeItems = currentAllRecipeItems.filter((it) => it.recipe_id !== recipeId)
          updatedCount++
          savedRecipesByName.set(normalizeName(group.recipeName), {
            ...group.matchedExistingRecipe,
            id: recipeId,
            name: group.recipeName,
            type: group.recipeType,
          } as Recipe)
        } else {
          const newRecipe = await recipesService.create({
            name: group.recipeName,
            type: group.recipeType,
            type_id: linkedTypeId,
            yield_portions: group.yieldPortions,
            portion_size_value: group.portionSizeValue,
            portion_size_unit: group.portionSizeUnit,
            selling_price: group.sellingPrice,
            labor_cost: group.laborCost !== undefined ? group.laborCost : 0,
            notes: group.notes,
          } as any)
          recipeId = newRecipe.id
          createdCount++
          savedRecipesByName.set(normalizeName(group.recipeName), newRecipe)
        }

        recipeIdMap.set(group, recipeId)
      }

      // FASE 2: Insere todos os itens (insumos e guarnições vinculadas).
      // Agora TODAS as guarnições do arquivo já existem no banco de dados com seus IDs definitivos!
      for (const group of groupsToProcess) {
        const recipeId = recipeIdMap.get(group)!

        for (const item of group.items) {
          if (item.itemKind === 'sub_recipe' && item.matchedSubRecipe) {
            // Resolve ID definitivo da guarnição (caso tenha sido criada nesta mesma importação)
            let realSubRecipe = item.matchedSubRecipe
            if (realSubRecipe.id.startsWith('batch_recipe_')) {
              const fromMap = savedRecipesByName.get(normalizeName(realSubRecipe.name))
              if (fromMap) {
                realSubRecipe = fromMap
              }
            }

            // Prevenção de dependência circular
            const wouldCycle = recipesService.wouldCreateCycle(
              recipeId,
              realSubRecipe.id,
              currentAllRecipeItems,
            )

            if (wouldCycle) {
              cycleWarningsList.push(
                `Guarnição "${realSubRecipe.name}" não pôde ser vinculada ao prato "${group.recipeName}" pois geraria ciclo.`,
              )
              continue
            }

            const garnishQty =
              typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1

            const addedSub = await recipesService.addItem({
              recipe_id: recipeId,
              sub_recipe_id: realSubRecipe.id,
              quantity: garnishQty,
              unit: 'unidade',
            })
            currentAllRecipeItems.push(addedSub)
            linkedGarnishesSavedCount++
          } else {
            const matched =
              item.matchedIngredient ||
              (item.ingredientName
                ? knownIngredientsMap.get(normalizeName(item.ingredientName))
                : undefined)

            if (matched && item.quantity > 0) {
              const addedIng = await recipesService.addItem({
                recipe_id: recipeId,
                ingredient_id: matched.id,
                quantity: item.quantity,
                unit: item.unit,
              })
              currentAllRecipeItems.push(addedIng)
            }
          }
        }
      }

      // Monta resumo detalhado
      const summaryParts: string[] = [
        `${groupsToProcess.length} fichas importadas (${createdCount} novas, ${updatedCount} atualizadas).`,
      ]

      if (linkedGarnishesSavedCount > 0) {
        summaryParts.push(
          `${linkedGarnishesSavedCount} guarnição(ões) vinculada(s) como sub-fichas aos pratos.`,
        )
      }

      if (cycleWarningsList.length > 0) {
        summaryParts.push(cycleWarningsList.join(' '))
      }

      if (autoCreatedIngredientsList.length > 0) {
        summaryParts.push(
          `${autoCreatedIngredientsList.length} novos insumos criados com preço R$ 0,00: ${autoCreatedIngredientsList.slice(0, 5).join(', ')}${autoCreatedIngredientsList.length > 5 ? ` (+${autoCreatedIngredientsList.length - 5})` : ''}.`,
        )
      }

      if (normalizedUnitsList.length > 0) {
        const unitsDesc = normalizedUnitsList
          .slice(0, 4)
          .map((u) => `"${u.from}" → "${u.to}"`)
          .join(', ')
        summaryParts.push(
          `${normalizedUnitsList.length} unidade(s) normalizada(s) para o padrão (${unitsDesc}${normalizedUnitsList.length > 4 ? '...' : ''}).`,
        )
      }

      toast({
        title: 'Importação de Fichas Técnicas concluída!',
        description: summaryParts.join(' '),
      })

      handleDialogChange(false)
      onSuccess()
    } catch (err: any) {
      console.error('Erro ao importar fichas técnicas:', err)
      toast({
        title: 'Erro na importação',
        description: err.message || 'Não foi possível gravar as fichas técnicas no banco de dados.',
        variant: 'destructive',
      })
    } finally {
      setImporting(false)
    }
  }

  const validCount = previewGroups.filter((g) => g.isValid).length
  const invalidCount = previewGroups.filter((g) => !g.isValid).length
  const totalItemsCount = previewGroups.reduce((acc, g) => acc + g.items.length, 0)
  const isBlockMode = sheetResult?.format === 'blocks'

  // Estatística de guarnições vinculadas e não encontradas
  const linkedGarnishesCount = previewGroups.reduce(
    (acc, g) => acc + g.items.filter((it) => it.itemKind === 'sub_recipe').length,
    0,
  )

  // Estatística de insumos não encontrados para alertar o usuário (excluindo guarnições vinculadas)
  const missingIngredientsSet = new Set<string>()
  previewGroups.forEach((g) => {
    g.items.forEach((it) => {
      if (it.itemKind !== 'sub_recipe' && !it.matchedIngredient && it.ingredientName) {
        missingIngredientsSet.add(it.ingredientName)
      }
    })
  })

  // Cache de custo de porção de cada ficha técnica existente (especialmente guarnições)
  // para compor com precisão o custo da receita importada
  const recipesMap = new Map<string, Recipe>()
  existingRecipes.forEach((r) => recipesMap.set(r.id, r))

  // Calcula custo estimado dos itens (insumos + guarnições vinculadas) pelo sistema para cada grupo
  const computeGroupSystemCost = (group: GroupedRecipePreview) => {
    let ingCost = 0
    let garnishesCost = 0
    let allPriced = true

    for (const item of group.items) {
      if (item.itemKind === 'sub_recipe' && item.matchedSubRecipe) {
        // Custo por porção da guarnição vinculada
        const sub = item.matchedSubRecipe
        const subItems = (sub as any).items || []
        // Se a receita tem items embutidos ou cálculo rápido
        let subPortionCost = 0
        if (typeof (sub as any).costPerPortion === 'number' && (sub as any).costPerPortion > 0) {
          subPortionCost = (sub as any).costPerPortion
        } else {
          // Calcula a partir do calculatePortionCost do recipesService
          const calc = recipesService.calculatePortionCost(sub.id, recipesMap, new Map())
          subPortionCost = calc.portionCost
        }
        const gCost = (item.quantity || 1) * subPortionCost
        garnishesCost += gCost
      } else if (item.matchedIngredient) {
        const c = calculateItemCost(item.quantity, item.unit, item.matchedIngredient)
        ingCost += c
      } else {
        allPriced = false
      }
    }

    const labor = group.laborCost || 0
    const total = ingCost + garnishesCost + labor
    const portions = group.yieldPortions > 0 ? group.yieldPortions : 1
    const perPortion = total / portions
    return { ingCost, garnishesCost, labor, total, perPortion, allPriced }
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-10 w-10 rounded-xl bg-orange-100 text-orange-800 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg">Importar Fichas Técnicas por Excel</DialogTitle>
                <DialogDescription className="text-xs">
                  Aceita tanto o <strong>modelo de blocos</strong> (com mão de obra, porções e
                  cabeçalhos) quanto o <strong>formato tabular</strong> tradicional.
                </DialogDescription>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => downloadRecipesTemplate(existingRecipes, existingIngredients)}
              className="text-xs h-8 gap-1.5 border-orange-300 text-orange-900 hover:bg-orange-50 shrink-0"
              title="Baixar planilha modelo com aba em blocos e aba tabular"
            >
              <Download className="h-3.5 w-3.5" />
              Baixar Modelo (.xlsx)
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {!sheetResult ? (
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-orange-500 hover:bg-orange-50/20 transition-all flex flex-col items-center justify-center">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                className="hidden"
                id="excel-recipes-file-upload"
                onChange={handleFileChange}
                disabled={parsing}
              />
              <label
                htmlFor="excel-recipes-file-upload"
                className="cursor-pointer flex flex-col items-center justify-center w-full"
              >
                <div className="h-14 w-14 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center mb-3">
                  {parsing ? (
                    <Loader2 className="h-7 w-7 animate-spin text-orange-600" />
                  ) : (
                    <UploadCloud className="h-7 w-7" />
                  )}
                </div>
                <h4 className="text-base font-semibold text-slate-800">
                  {parsing
                    ? 'Processando e analisando planilha...'
                    : 'Clique para selecionar a planilha de fichas'}
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-md">
                  Suporta formato de <strong>Blocos Verticais</strong> (com "FICHA TECNICA", Mão de
                  Obra, SubTotal e Rendimento) e formato <strong>Tabular Linha por Linha</strong>.
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <Badge variant="outline" className="text-[11px] text-slate-600 bg-slate-50">
                    Formato de Blocos (ex: ficha-5977d)
                  </Badge>
                  <Badge variant="outline" className="text-[11px] text-slate-600 bg-slate-50">
                    Formato Tabular
                  </Badge>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-4 pointer-events-none text-xs"
                >
                  Procurar arquivo (.xlsx / .xls)
                </Button>
              </label>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Banner de Resumo da Leitura */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileSpreadsheet className="h-6 w-6 text-orange-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-bold text-slate-800 truncate">
                        {selectedFile?.name}
                      </p>
                      {isBlockMode ? (
                        <Badge className="bg-orange-100 text-orange-900 border-orange-200 text-[10px] gap-1">
                          <Layers className="h-3 w-3" /> Formato de Bloco Detectado
                        </Badge>
                      ) : (
                        <Badge className="bg-blue-100 text-blue-900 border-blue-200 text-[10px]">
                          Formato Tabular Detectado
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {previewGroups.length} fichas técnicas identificadas ({totalItemsCount} linhas
                      de ingredientes) • {validCount} prontas • {invalidCount} com pendências
                      {sheetResult.globalRates?.laborPerMinute && (
                        <span>
                          {' '}
                          • Taxa Mão de Obra:{' '}
                          <strong>
                            {formatCurrency(sheetResult.globalRates.laborPerMinute)}/min
                          </strong>
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!isBlockMode && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowColumnConfig(!showColumnConfig)}
                      className="text-xs h-7 text-slate-600 hover:text-slate-900"
                    >
                      <RefreshCw className="h-3.5 w-3.5 mr-1" />
                      {showColumnConfig ? 'Ocultar Colunas' : 'Mapeamento'}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSheetResult(null)
                      setSelectedFile(null)
                      setPreviewGroups([])
                    }}
                    className="text-xs h-7 text-slate-600 hover:text-red-600"
                  >
                    Trocar Arquivo
                  </Button>
                </div>
              </div>

              {/* Alerta de Insumos não cadastrados e Opção de Auto-criação */}
              {missingIngredientsSet.size > 0 && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-950 space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-semibold">
                        {missingIngredientsSet.size} insumo(s) citado(s) na planilha não constam no
                        cadastro:
                      </p>
                      <p className="text-amber-800 text-[11px]">
                        {Array.from(missingIngredientsSet).slice(0, 8).join(', ')}
                        {missingIngredientsSet.size > 8 &&
                          ` e mais ${missingIngredientsSet.size - 8}`}
                      </p>
                    </div>
                  </div>

                  <div className="bg-white/80 p-2.5 rounded-lg border border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-900">
                      <input
                        type="checkbox"
                        checked={autoCreateMissingIngredients}
                        onChange={(e) => setAutoCreateMissingIngredients(e.target.checked)}
                        className="rounded text-amber-600 focus:ring-amber-500 h-4 w-4"
                      />
                      <span>
                        Criar insumos automaticamente com <strong>Preço R$ 0,00</strong> para
                        preencher depois
                      </span>
                    </label>
                    <span className="text-[11px] text-amber-800">
                      {autoCreateMissingIngredients
                        ? 'Permite importar as fichas agora mesmo e calcular os custos conforme cadastrar os preços'
                        : 'Apenas fichas com 100% dos insumos cadastrados serão importadas'}
                    </span>
                  </div>
                </div>
              )}

              {/* Informação sobre guarnições vinculadas */}
              {linkedGarnishesCount > 0 && (
                <div className="p-3 bg-amber-50/70 border border-amber-300 rounded-lg text-xs text-amber-950 flex items-start gap-2">
                  <CookingPot className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                  <span className="text-[11px] leading-relaxed">
                    <strong>Guarnições Detectadas:</strong> Identificamos{' '}
                    <strong>{linkedGarnishesCount} item(ns)</strong> correspondente(s) a guarnições
                    já salvas no sistema. Eles serão vinculados diretamente como{' '}
                    <strong>sub-fichas</strong> do prato, computando suas porções e custos
                    automaticamente.
                  </span>
                </div>
              )}

              {/* Informação sobre preços e regras */}
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-950 flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-700 shrink-0 mt-0.5" />
                <span className="text-[11px] leading-relaxed">
                  <strong>Regra de Cálculo:</strong> Preços unitários da planilha (#REF! ou vazios)
                  são ignorados. O custo da receita é calculado exclusivamente pelos insumos
                  cadastrados no sistema somados à <strong>mão de obra</strong> e divididos pelo{' '}
                  <strong>rendimento (porções)</strong>.
                </span>
              </div>

              {/* Seção retrátil de mapeamento de colunas (modo tabular) */}
              {showColumnConfig && !isBlockMode && sheetResult.headers && (
                <div className="p-4 bg-orange-50/60 border border-orange-200 rounded-xl space-y-3">
                  <h5 className="text-xs font-bold text-orange-950 uppercase tracking-wide">
                    Mapeamento de Colunas de Fichas Técnicas
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-700">Coluna da Ficha *</Label>
                      <Select
                        value={columnMapping.recipeNameCol}
                        onValueChange={(val) => handleRemap('recipeNameCol', val)}
                      >
                        <SelectTrigger className="h-8 text-xs bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {sheetResult.headers.map((h) => (
                            <SelectItem key={h} value={h} className="text-xs">
                              {h}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-slate-700">Coluna Insumo *</Label>
                      <Select
                        value={columnMapping.ingredientCol}
                        onValueChange={(val) => handleRemap('ingredientCol', val)}
                      >
                        <SelectTrigger className="h-8 text-xs bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {sheetResult.headers.map((h) => (
                            <SelectItem key={h} value={h} className="text-xs">
                              {h}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-slate-700">Coluna Quantidade *</Label>
                      <Select
                        value={columnMapping.quantityCol}
                        onValueChange={(val) => handleRemap('quantityCol', val)}
                      >
                        <SelectTrigger className="h-8 text-xs bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {sheetResult.headers.map((h) => (
                            <SelectItem key={h} value={h} className="text-xs">
                              {h}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-slate-700">Coluna Unidade *</Label>
                      <Select
                        value={columnMapping.unitCol}
                        onValueChange={(val) => handleRemap('unitCol', val)}
                      >
                        <SelectTrigger className="h-8 text-xs bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {sheetResult.headers.map((h) => (
                            <SelectItem key={h} value={h} className="text-xs">
                              {h}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-slate-700">Rendimento (porções)</Label>
                      <Select
                        value={columnMapping.yieldCol || 'none'}
                        onValueChange={(val) => handleRemap('yieldCol', val)}
                      >
                        <SelectTrigger className="h-8 text-xs bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-xs text-slate-400">
                            (Padrão: 1)
                          </SelectItem>
                          {sheetResult.headers.map((h) => (
                            <SelectItem key={h} value={h} className="text-xs">
                              {h}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-slate-700">Tamanho da Porção (opcional)</Label>
                      <Select
                        value={(columnMapping as any).portionCol || 'none'}
                        onValueChange={(val) => handleRemap('portionCol', val)}
                      >
                        <SelectTrigger className="h-8 text-xs bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-xs text-slate-400">
                            (Detectar em Observações)
                          </SelectItem>
                          {sheetResult.headers.map((h) => (
                            <SelectItem key={h} value={h} className="text-xs">
                              {h}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-slate-700">Mão de Obra (R$)</Label>
                      <Select
                        value={columnMapping.laborCostCol || 'none'}
                        onValueChange={(val) => handleRemap('laborCostCol', val)}
                      >
                        <SelectTrigger className="h-8 text-xs bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-xs text-slate-400">
                            (Opcional: R$ 0,00)
                          </SelectItem>
                          {sheetResult.headers.map((h) => (
                            <SelectItem key={h} value={h} className="text-xs">
                              {h}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-slate-700">Tipo (prato/guarnição)</Label>
                      <Select
                        value={columnMapping.typeCol || 'none'}
                        onValueChange={(val) => handleRemap('typeCol', val)}
                      >
                        <SelectTrigger className="h-8 text-xs bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-xs text-slate-400">
                            (Padrão: prato)
                          </SelectItem>
                          {sheetResult.headers.map((h) => (
                            <SelectItem key={h} value={h} className="text-xs">
                              {h}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-slate-700">Observações / Modo</Label>
                      <Select
                        value={columnMapping.notesCol || 'none'}
                        onValueChange={(val) => handleRemap('notesCol', val)}
                      >
                        <SelectTrigger className="h-8 text-xs bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-xs text-slate-400">
                            (Opcional)
                          </SelectItem>
                          {sheetResult.headers.map((h) => (
                            <SelectItem key={h} value={h} className="text-xs">
                              {h}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              {/* Lista de Fichas Técnicas Detectadas */}
              <div className="space-y-3">
                {previewGroups.map((group) => {
                  const isExpanded = !!expandedRecipes[group.recipeName]
                  const cost = computeGroupSystemCost(group)

                  return (
                    <div
                      key={group.recipeName}
                      className={`border rounded-xl overflow-hidden transition-all ${
                        group.isValid ? 'border-slate-200 bg-white' : 'border-red-300 bg-red-50/20'
                      }`}
                    >
                      {/* Cabeçalho do Bloco da Ficha */}
                      <div
                        onClick={() => toggleExpand(group.recipeName)}
                        className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 cursor-pointer hover:bg-slate-50 select-none"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                          )}
                          <div className="flex items-center gap-2 min-w-0">
                            {group.recipeType === 'prato' ? (
                              <Utensils className="h-4 w-4 text-amber-600 shrink-0" />
                            ) : (
                              <CookingPot className="h-4 w-4 text-orange-500 shrink-0" />
                            )}
                            <span className="font-bold text-sm text-slate-900 truncate">
                              {group.recipeName}
                            </span>
                          </div>

                          {group.portionSizeValue ? (
                            <Badge
                              variant="outline"
                              className="text-[11px] bg-amber-50 text-amber-900 border-amber-200 font-medium shrink-0"
                            >
                              Porção: {group.portionSizeValue} {group.portionSizeUnit || 'g'}
                            </Badge>
                          ) : group.portionDescription ? (
                            <Badge
                              variant="outline"
                              className="text-[11px] bg-slate-100 text-slate-700 font-medium shrink-0"
                            >
                              {group.portionDescription}
                            </Badge>
                          ) : null}

                          {/* Tipo detectado / associado */}
                          {group.rawDetectedType ? (
                            <Badge
                              variant="outline"
                              className={`text-[11px] font-medium shrink-0 ${
                                group.recipeType === 'guarnicao'
                                  ? 'bg-orange-50 text-orange-900 border-orange-200'
                                  : 'bg-emerald-50 text-emerald-900 border-emerald-200'
                              }`}
                              title={`Tipo extraído da planilha: "${group.rawDetectedType}"${group.matchedDishType ? ` (Casado com cadastro: "${group.matchedDishType.name}")` : ' (Novo tipo a cadastrar)'}`}
                            >
                              Tipo: {group.rawDetectedType}
                              {group.recipeType === 'guarnicao' &&
                                !group.rawDetectedType.toLowerCase().includes('guarn') && (
                                  <span className="ml-1 opacity-75">(Guarnição)</span>
                                )}
                            </Badge>
                          ) : group.matchedDishType ? (
                            <Badge
                              variant="outline"
                              className="text-[11px] bg-slate-50 text-slate-700 border-slate-200 font-medium shrink-0"
                            >
                              Tipo: {group.matchedDishType.name}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[11px] bg-amber-50/60 text-amber-800 border-amber-200/80 font-normal shrink-0 gap-1"
                              title="Planilha não declarou o tipo deste bloco. Classificado com o tipo padrão."
                            >
                              <Info className="h-3 w-3 text-amber-600" />
                              Tipo:{' '}
                              {group.recipeType === 'guarnicao'
                                ? 'Guarnição (padrão)'
                                : 'Prato (padrão)'}
                            </Badge>
                          )}

                          <Badge
                            variant="secondary"
                            className="text-[11px] bg-slate-100 text-slate-700 font-normal shrink-0"
                          >
                            {group.yieldPortions} {group.yieldPortions === 1 ? 'porção' : 'porções'}
                          </Badge>

                          {group.laborCost !== undefined && group.laborCost > 0 && (
                            <Badge className="bg-amber-50 text-amber-900 border-amber-200 text-[11px] gap-1 font-normal shrink-0">
                              <Clock className="h-3 w-3 text-amber-700" />
                              M.O.: {formatCurrency(group.laborCost)}
                              {group.laborMinutes ? ` (${group.laborMinutes}min)` : ''}
                            </Badge>
                          )}

                          {cost.allPriced && (
                            <span className="text-xs text-slate-700 font-semibold shrink-0">
                              Custo/porção: {formatCurrency(cost.perPortion)}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                          {group.isUpdate ? (
                            <Badge className="bg-blue-100 text-blue-900 border-blue-200 text-[11px]">
                              Atualiza composição existente
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-900 border-emerald-200 text-[11px] gap-1">
                              <Plus className="h-3 w-3" />
                              Nova ficha
                            </Badge>
                          )}

                          {group.warnings && group.warnings.length > 0 && (
                            <Badge
                              variant="outline"
                              className="bg-amber-50 text-amber-900 border-amber-300 gap-1 text-[11px]"
                              title={group.warnings.join(' • ')}
                            >
                              <AlertTriangle className="h-3 w-3 text-amber-700" />
                              {group.warnings.length === 1
                                ? group.warnings[0]
                                : `${group.warnings.length} avisos`}
                            </Badge>
                          )}

                          {group.isValid ? (
                            <Badge className="bg-emerald-100 text-emerald-900 border-emerald-200 gap-1 text-[11px]">
                              <CheckCircle2 className="h-3 w-3 text-emerald-700" />
                              {group.items.length} {group.items.length === 1 ? 'insumo' : 'insumos'}
                            </Badge>
                          ) : (
                            <Badge
                              variant="destructive"
                              className="bg-red-100 text-red-900 border-red-200 gap-1 text-[11px]"
                              title={group.errors.join('; ')}
                            >
                              <AlertCircle className="h-3 w-3 text-red-700" />
                              {group.errors[0] || 'Insumo pendente'}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Tabela de Ingredientes do Bloco */}
                      {isExpanded && (
                        <div className="border-t border-slate-200 bg-slate-50/50 p-3 space-y-2.5">
                          <Table>
                            <TableHeader className="bg-transparent">
                              <TableRow className="border-none">
                                <TableHead className="w-12 text-center text-[11px] h-7">
                                  Linha
                                </TableHead>
                                <TableHead className="text-[11px] font-semibold text-slate-700 h-7">
                                  Item na Planilha
                                </TableHead>
                                <TableHead className="text-[11px] font-semibold text-slate-700 h-7">
                                  Reconhecimento no Sistema
                                </TableHead>
                                <TableHead className="text-[11px] font-semibold text-slate-700 text-center h-7">
                                  Qtd / Unidade
                                </TableHead>
                                <TableHead className="text-[11px] font-semibold text-slate-700 text-right h-7">
                                  Preço / Custo Unit.
                                </TableHead>
                                <TableHead className="text-[11px] font-semibold text-slate-700 text-right h-7">
                                  Custo Calculado
                                </TableHead>
                                <TableHead className="text-[11px] font-semibold text-slate-700 text-center h-7">
                                  Status
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {group.items.map((it, idx) => {
                                const isGarnish = it.itemKind === 'sub_recipe'
                                const sub = it.matchedSubRecipe
                                const ing = it.matchedIngredient

                                // Custo do item
                                let itemCost: number | null = null
                                if (isGarnish && sub) {
                                  const calc = recipesService.calculatePortionCost(
                                    sub.id,
                                    recipesMap,
                                    new Map(),
                                  )
                                  itemCost = (it.quantity || 1) * calc.portionCost
                                } else if (ing) {
                                  itemCost = calculateItemCost(it.quantity, it.unit, ing)
                                }

                                const effPrice = ing
                                  ? getEffectiveIngredientPrice(ing.price, ing.reduction_percent)
                                  : 0
                                const hasRed = !!(
                                  ing?.reduction_percent && ing.reduction_percent > 0
                                )

                                return (
                                  <TableRow
                                    key={idx}
                                    className={
                                      !it.isValid
                                        ? 'bg-red-100/50'
                                        : isGarnish
                                          ? 'bg-amber-50/40 hover:bg-amber-50/70'
                                          : 'hover:bg-white'
                                    }
                                  >
                                    <TableCell className="text-center text-xs text-slate-500 font-mono py-1.5">
                                      {it.rowIndex}
                                    </TableCell>
                                    <TableCell className="text-xs font-medium text-slate-900 py-1.5">
                                      <div className="flex items-center gap-1.5">
                                        {isGarnish && (
                                          <CookingPot className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                        )}
                                        <span>
                                          {it.ingredientName || (
                                            <span className="text-slate-400">(vazio)</span>
                                          )}
                                        </span>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-xs py-1.5">
                                      {isGarnish && sub ? (
                                        <div className="space-y-0.5">
                                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-semibold text-[11px]">
                                            <CookingPot className="h-3 w-3 text-amber-700" />
                                            Guarnição vinculada: {sub.name}
                                          </span>
                                          {it.sizeModifier && (
                                            <span className="block text-[10px] text-amber-800 font-medium">
                                              Tamanho detectado: {it.sizeModifier}
                                            </span>
                                          )}
                                        </div>
                                      ) : ing ? (
                                        <div>
                                          <span className="text-emerald-800 font-semibold">
                                            {ing.name}{' '}
                                            <span className="text-[11px] text-slate-400 font-normal">
                                              ({ing.unit})
                                            </span>
                                          </span>
                                          {hasRed && (
                                            <span className="block text-[10px] text-amber-700">
                                              c/ {ing.reduction_percent}% perda (custo utilizável:{' '}
                                              {formatCurrency(effPrice)}/{ing.unit})
                                            </span>
                                          )}
                                        </div>
                                      ) : (
                                        <div>
                                          <span className="text-amber-800 font-medium">
                                            Será criado (R$ 0,00)
                                          </span>
                                          <span className="block text-[10px] text-amber-600">
                                            Insumo novo a cadastrar preço depois
                                          </span>
                                        </div>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-xs text-center font-bold py-1.5">
                                      {isGarnish ? (
                                        <span>
                                          {it.quantity} {it.quantity === 1 ? 'porção' : 'porções'}
                                        </span>
                                      ) : (
                                        <span>
                                          {it.quantity} {it.unit}
                                        </span>
                                      )}
                                      {it.originalUnit &&
                                        it.originalUnit.toLowerCase() !== it.unit.toLowerCase() && (
                                          <span
                                            className="block text-[10px] text-blue-700 font-normal"
                                            title={`Normalizado de "${it.originalUnit}" para "${it.unit}"`}
                                          >
                                            (de: {it.originalUnit})
                                          </span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-xs text-right text-slate-600 py-1.5">
                                      {isGarnish && sub ? (
                                        (() => {
                                          const calc = recipesService.calculatePortionCost(
                                            sub.id,
                                            recipesMap,
                                            new Map(),
                                          )
                                          return `${formatCurrency(calc.portionCost)}/porção`
                                        })()
                                      ) : ing ? (
                                        hasRed ? (
                                          <span
                                            title={`Base: ${formatCurrency(ing.price)} c/ perda ${ing.reduction_percent}%`}
                                          >
                                            <span className="font-bold text-amber-900">
                                              {formatCurrency(effPrice)}
                                            </span>
                                            <span className="text-[10px] text-slate-500 block">
                                              Base: {formatCurrency(ing.price)}
                                            </span>
                                          </span>
                                        ) : (
                                          `${formatCurrency(ing.price)}/${ing.unit}`
                                        )
                                      ) : (
                                        '-'
                                      )}
                                    </TableCell>
                                    <TableCell className="text-xs text-right font-semibold text-slate-900 py-1.5">
                                      {itemCost !== null ? formatCurrency(itemCost) : '-'}
                                    </TableCell>
                                    <TableCell className="text-xs text-center py-1.5">
                                      {it.isValid ? (
                                        it.warning ? (
                                          <span
                                            className="inline-flex items-center gap-1 text-[11px] text-amber-800 font-medium"
                                            title={it.warning}
                                          >
                                            <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
                                            Aviso
                                          </span>
                                        ) : isGarnish ? (
                                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-900 font-semibold bg-amber-100/70 px-1.5 py-0.5 rounded">
                                            <CookingPot className="h-3 w-3 text-amber-700" />{' '}
                                            Guarnição
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
                                            <CheckCircle2 className="h-3 w-3" /> OK
                                          </span>
                                        )
                                      ) : (
                                        <span
                                          className="inline-flex items-center gap-1 text-[11px] text-red-600 font-medium"
                                          title={it.error}
                                        >
                                          <AlertCircle className="h-3 w-3 shrink-0" />
                                          {it.error}
                                        </span>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>

                          {/* Rodapé do Bloco com Totais e Mão de Obra */}
                          <div className="pt-2 border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-600 gap-2 px-1">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span>
                                Insumos: <strong>{formatCurrency(cost.ingCost)}</strong>
                              </span>
                              {cost.garnishesCost > 0 && (
                                <span>
                                  + Guarnições:{' '}
                                  <strong>{formatCurrency(cost.garnishesCost)}</strong>
                                </span>
                              )}
                              {group.laborCost !== undefined && (
                                <span>
                                  + Mão de Obra: <strong>{formatCurrency(group.laborCost)}</strong>
                                </span>
                              )}
                              <span>
                                = Custo Total: <strong>{formatCurrency(cost.total)}</strong>
                              </span>
                            </div>
                            <div className="font-bold text-slate-900 text-sm">
                              Custo por Porção: {formatCurrency(cost.perPortion)}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 pt-3 border-t border-slate-100 gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleDialogChange(false)}
            disabled={importing || parsing}
          >
            Cancelar
          </Button>

          {sheetResult && (
            <Button
              type="button"
              onClick={handleConfirmImport}
              disabled={importing || parsing || validCount === 0}
              className="bg-orange-600 hover:bg-orange-700 text-white gap-1.5"
            >
              {importing && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar Importação ({validCount} {validCount === 1 ? 'ficha' : 'fichas'})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
