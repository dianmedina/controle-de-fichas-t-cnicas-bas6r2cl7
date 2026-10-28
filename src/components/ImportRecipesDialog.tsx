import React, { useState, useRef } from 'react'
import {
  Recipe,
  Ingredient,
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
  onSuccess: () => void
}

export function ImportRecipesDialog({
  open,
  onOpenChange,
  existingRecipes,
  existingIngredients,
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
    )
    setPreviewGroups(groups)
  }

  const handleConfirmImport = async () => {
    const validGroups = previewGroups.filter((g) => g.isValid)

    if (validGroups.length === 0) {
      toast({
        title: 'Nenhuma ficha técnica válida para importar',
        description:
          'Corrija os erros na planilha ou verifique se os insumos necessários estão cadastrados no sistema.',
        variant: 'destructive',
      })
      return
    }

    try {
      setImporting(true)
      let createdCount = 0
      let updatedCount = 0

      for (const group of validGroups) {
        let recipeId: string

        if (group.matchedExistingRecipe) {
          recipeId = group.matchedExistingRecipe.id
          // Atualiza dados da ficha existente (sem duplicar!)
          await recipesService.update(recipeId, {
            type: group.recipeType,
            yield_portions: group.yieldPortions,
            selling_price: group.sellingPrice,
            labor_cost: group.laborCost !== undefined ? group.laborCost : 0,
            notes: group.notes,
          })

          // Sincroniza composição: remove itens antigos e insere os novos
          const currentItems = await recipesService.getItemsByRecipeId(recipeId)
          for (const item of currentItems) {
            await recipesService.deleteItem(item.id)
          }

          updatedCount++
        } else {
          // Cria nova ficha técnica com o nome exato preservado
          const newRecipe = await recipesService.create({
            name: group.recipeName,
            type: group.recipeType,
            yield_portions: group.yieldPortions,
            selling_price: group.sellingPrice,
            labor_cost: group.laborCost !== undefined ? group.laborCost : 0,
            notes: group.notes,
          })
          recipeId = newRecipe.id
          createdCount++
        }

        // Insere os ingredientes da ficha
        for (const item of group.items) {
          if (item.matchedIngredient) {
            await recipesService.addItem({
              recipe_id: recipeId,
              ingredient_id: item.matchedIngredient.id,
              quantity: item.quantity,
              unit: item.unit,
            })
          }
        }
      }

      toast({
        title: 'Importação de Fichas Técnicas concluída!',
        description: `${validGroups.length} fichas importadas (${createdCount} criadas, ${updatedCount} atualizadas). O custo por porção foi calculado com base nos insumos do sistema e na mão de obra.`,
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

  // Estatística de insumos não encontrados para alertar o usuário
  const missingIngredientsSet = new Set<string>()
  previewGroups.forEach((g) => {
    g.items.forEach((it) => {
      if (!it.matchedIngredient && it.ingredientName) {
        missingIngredientsSet.add(it.ingredientName)
      }
    })
  })

  // Calcula custo estimado dos insumos pelo sistema para cada grupo
  const computeGroupSystemCost = (group: GroupedRecipePreview) => {
    let ingCost = 0
    let allPriced = true
    for (const item of group.items) {
      if (item.matchedIngredient) {
        const c = calculateItemCost(item.quantity, item.unit, item.matchedIngredient)
        ingCost += c
      } else {
        allPriced = false
      }
    }
    const labor = group.laborCost || 0
    const total = ingCost + labor
    const portions = group.yieldPortions > 0 ? group.yieldPortions : 1
    const perPortion = total / portions
    return { ingCost, labor, total, perPortion, allPriced }
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

              {/* Alerta de Insumos não cadastrados */}
              {missingIngredientsSet.size > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-950 flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold">
                      {missingIngredientsSet.size} insumo(s) citado(s) na planilha não estão no
                      cadastro:
                    </p>
                    <p className="text-amber-800 text-[11px]">
                      {Array.from(missingIngredientsSet).slice(0, 8).join(', ')}
                      {missingIngredientsSet.size > 8 &&
                        ` e mais ${missingIngredientsSet.size - 8}`}
                    </p>
                    <p className="text-[11px] text-amber-700">
                      Cadastre esses insumos previamente na tela de <strong>Insumos</strong> com
                      seus preços de compra para habilitar a importação completa com cálculo de
                      custo.
                    </p>
                  </div>
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

                          {group.portionDescription && (
                            <Badge
                              variant="outline"
                              className="text-[11px] bg-slate-100 text-slate-700 font-medium shrink-0"
                            >
                              {group.portionDescription}
                            </Badge>
                          )}

                          <Badge
                            variant="secondary"
                            className="text-[11px] bg-slate-100 text-slate-700 font-normal shrink-0"
                          >
                            {group.recipeType === 'prato' ? 'Prato' : 'Guarnição'} •{' '}
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
                                  Insumo Planilha
                                </TableHead>
                                <TableHead className="text-[11px] font-semibold text-slate-700 h-7">
                                  Insumo Reconhecido no Sistema
                                </TableHead>
                                <TableHead className="text-[11px] font-semibold text-slate-700 text-center h-7">
                                  Qtd / Unidade
                                </TableHead>
                                <TableHead className="text-[11px] font-semibold text-slate-700 text-right h-7">
                                  Preço de Compra
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
                                const ing = it.matchedIngredient
                                const itemCost = ing
                                  ? calculateItemCost(it.quantity, it.unit, ing)
                                  : null
                                const effPrice = ing
                                  ? getEffectiveIngredientPrice(ing.price, ing.reduction_percent)
                                  : 0
                                const hasRed = !!(
                                  ing?.reduction_percent && ing.reduction_percent > 0
                                )

                                return (
                                  <TableRow
                                    key={idx}
                                    className={it.isValid ? 'hover:bg-white' : 'bg-red-100/50'}
                                  >
                                    <TableCell className="text-center text-xs text-slate-500 font-mono py-1.5">
                                      {it.rowIndex}
                                    </TableCell>
                                    <TableCell className="text-xs font-medium text-slate-900 py-1.5">
                                      {it.ingredientName || (
                                        <span className="text-slate-400">(vazio)</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-xs py-1.5">
                                      {ing ? (
                                        <div>
                                          <span className="text-emerald-800 font-semibold">
                                            {ing.name}{' '}
                                            <span className="text-[11px] text-slate-400 font-normal">
                                              ({ing.unit})
                                            </span>
                                          </span>
                                          {hasRed && (
                                            <span className="block text-[10px] text-emerald-700">
                                              c/ {ing.reduction_percent}% de redução (efetivo:{' '}
                                              {formatCurrency(effPrice)}/{ing.unit})
                                            </span>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="text-red-600 font-medium">
                                          Não cadastrado
                                        </span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-xs text-center font-bold py-1.5">
                                      {it.quantity} {it.unit}
                                    </TableCell>
                                    <TableCell className="text-xs text-right text-slate-600 py-1.5">
                                      {ing ? (
                                        hasRed ? (
                                          <span
                                            title={`Base: ${formatCurrency(ing.price)} c/ -${ing.reduction_percent}%`}
                                          >
                                            <span className="font-bold text-emerald-800">
                                              {formatCurrency(effPrice)}
                                            </span>
                                            <span className="text-[10px] text-slate-400 block line-through">
                                              {formatCurrency(ing.price)}
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
                                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
                                          <CheckCircle2 className="h-3 w-3" /> OK
                                        </span>
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
