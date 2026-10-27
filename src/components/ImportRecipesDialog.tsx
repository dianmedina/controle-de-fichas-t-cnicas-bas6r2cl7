import React, { useState, useRef } from 'react'
import { Recipe, Ingredient, formatCurrency } from '@/types/restaurant'
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
  const [columnMapping, setColumnMapping] = useState<RecipeSheetDetectionResult['detectedColumns']>(
    {
      recipeNameCol: '',
      ingredientCol: '',
      quantityCol: '',
      unitCol: '',
      typeCol: '',
      yieldCol: '',
      sellingPriceCol: '',
      notesCol: '',
    },
  )
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

      const initialMapping: RecipeSheetDetectionResult['detectedColumns'] = {
        recipeNameCol: detected.detectedColumns.recipeNameCol,
        ingredientCol: detected.detectedColumns.ingredientCol,
        quantityCol: detected.detectedColumns.quantityCol,
        unitCol: detected.detectedColumns.unitCol,
        typeCol: detected.detectedColumns.typeCol || '',
        yieldCol: detected.detectedColumns.yieldCol || '',
        sellingPriceCol: detected.detectedColumns.sellingPriceCol || '',
        notesCol: detected.detectedColumns.notesCol || '',
      }
      setColumnMapping(initialMapping)

      const groups = validateAndGroupRecipeRows(
        detected.rows,
        initialMapping,
        existingRecipes,
        existingIngredients,
      )
      setPreviewGroups(groups)

      // Abre automaticamente se tiver poucos pratos
      const initExpanded: Record<string, boolean> = {}
      groups.forEach((g) => {
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

  const handleRemap = (key: keyof RecipeSheetDetectionResult['detectedColumns'], value: string) => {
    if (!sheetResult) return
    const updated = {
      ...columnMapping,
      [key]: value === 'none' ? undefined : value,
    }
    setColumnMapping(updated)
    const groups = validateAndGroupRecipeRows(
      sheetResult.rows,
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
        description: 'Corrija os erros na planilha ou verifique se os insumos estão cadastrados.',
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
          // Atualiza dados da ficha
          await recipesService.update(recipeId, {
            type: group.recipeType,
            yield_portions: group.yieldPortions,
            selling_price: group.sellingPrice,
            notes: group.notes,
          })

          // Remove itens antigos para sincronizar com a composição da planilha
          const currentItems = await recipesService.getItemsByRecipeId(recipeId)
          for (const item of currentItems) {
            await recipesService.deleteItem(item.id)
          }

          updatedCount++
        } else {
          // Cria nova ficha
          const newRecipe = await recipesService.create({
            name: group.recipeName,
            type: group.recipeType,
            yield_portions: group.yieldPortions,
            selling_price: group.sellingPrice,
            notes: group.notes,
          })
          recipeId = newRecipe.id
          createdCount++
        }

        // Adiciona os ingredientes da ficha
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
        description: `${validGroups.length} fichas técnicas importadas: ${createdCount} criadas e ${updatedCount} atualizadas com sua composição.`,
      })

      handleDialogChange(false)
      onSuccess()
    } catch (err: any) {
      console.error('Erro ao importar fichas técnicas:', err)
      toast({
        title: 'Erro na importação',
        description: 'Não foi possível gravar as fichas técnicas no banco de dados.',
        variant: 'destructive',
      })
    } finally {
      setImporting(false)
    }
  }

  const validCount = previewGroups.filter((g) => g.isValid).length
  const invalidCount = previewGroups.filter((g) => !g.isValid).length
  const totalItemsCount = previewGroups.reduce((acc, g) => acc + g.items.length, 0)

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-orange-100 text-orange-800 flex items-center justify-center">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg">Importar Fichas Técnicas por Planilha</DialogTitle>
                <DialogDescription className="text-xs">
                  Carregue um arquivo .xlsx com pratos e sua composição de ingredientes.
                </DialogDescription>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => downloadRecipesTemplate(existingRecipes, existingIngredients)}
              className="text-xs h-8 gap-1.5 border-orange-300 text-orange-800 hover:bg-orange-50 shrink-0"
              title="Baixar planilha de exemplo com composição de pratos"
            >
              <Download className="h-3.5 w-3.5" />
              Baixar Planilha Modelo (.xlsx)
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
                    ? 'Processando planilha...'
                    : 'Clique para selecionar a planilha de fichas'}
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  A planilha deve conter colunas de Ficha Técnica, Tipo (prato/guarnição),
                  Rendimento, Insumo, Quantidade e Unidade. Linhas com a mesma ficha são agrupadas.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-4 pointer-events-none text-xs"
                >
                  Procurar arquivo no computador
                </Button>
              </label>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Resumo do Arquivo */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileSpreadsheet className="h-6 w-6 text-orange-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">
                      {selectedFile?.name}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {previewGroups.length} fichas técnicas identificadas ({totalItemsCount} linhas
                      de ingredientes) • {validCount} prontas • {invalidCount} com erros
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowColumnConfig(!showColumnConfig)}
                    className="text-xs h-7 text-slate-600 hover:text-slate-900"
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1" />
                    {showColumnConfig ? 'Ocultar Mapeamento' : 'Ajustar Colunas'}
                  </Button>
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

              {/* Seção retrátil de mapeamento de colunas */}
              {showColumnConfig && (
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
                      <Label className="text-xs text-slate-700">Preço de Venda</Label>
                      <Select
                        value={columnMapping.sellingPriceCol || 'none'}
                        onValueChange={(val) => handleRemap('sellingPriceCol', val)}
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

              {/* Informação sobre reconciliação */}
              <div className="p-3 bg-orange-50/70 border border-orange-200 rounded-lg text-xs text-orange-950 flex items-start gap-2">
                <Info className="h-4 w-4 text-orange-700 shrink-0 mt-0.5" />
                <span>
                  <strong>Reconciliação de Fichas:</strong> Se a ficha já existir, sua composição de
                  ingredientes será atualizada conforme a planilha. Todos os insumos devem existir
                  no cadastro de insumos para garantir o cálculo automático de custo.
                </span>
              </div>

              {/* Lista Agrupada de Fichas */}
              <div className="space-y-3">
                {previewGroups.map((group) => {
                  const isExpanded = !!expandedRecipes[group.recipeName]
                  return (
                    <div
                      key={group.recipeName}
                      className={`border rounded-xl overflow-hidden transition-all ${
                        group.isValid ? 'border-slate-200 bg-white' : 'border-red-300 bg-red-50/20'
                      }`}
                    >
                      {/* Cabeçalho do Card da Ficha */}
                      <div
                        onClick={() => toggleExpand(group.recipeName)}
                        className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 cursor-pointer hover:bg-slate-50 select-none"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
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
                            <span className="font-semibold text-sm text-slate-900 truncate">
                              {group.recipeName}
                            </span>
                          </div>

                          <Badge
                            variant="secondary"
                            className="text-[11px] bg-slate-100 text-slate-700 font-normal shrink-0"
                          >
                            {group.recipeType === 'prato' ? 'Prato' : 'Guarnição'} •{' '}
                            {group.yieldPortions} porç.
                          </Badge>

                          {group.sellingPrice > 0 && (
                            <span className="text-xs text-slate-500 shrink-0">
                              Venda: {formatCurrency(group.sellingPrice)}
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
                              {group.errors[0] || 'Erro'}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Tabela de Ingredientes da Ficha */}
                      {isExpanded && (
                        <div className="border-t border-slate-200 bg-slate-50/50 p-2.5">
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
                                  Insumo Reconhecido
                                </TableHead>
                                <TableHead className="text-[11px] font-semibold text-slate-700 text-center h-7">
                                  Qtd / Unidade
                                </TableHead>
                                <TableHead className="text-[11px] font-semibold text-slate-700 h-7">
                                  Status do Insumo
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {group.items.map((it, idx) => (
                                <TableRow
                                  key={idx}
                                  className={it.isValid ? 'hover:bg-white' : 'bg-red-100/40'}
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
                                    {it.matchedIngredient ? (
                                      <span className="text-emerald-800 font-semibold">
                                        {it.matchedIngredient.name}{' '}
                                        <span className="text-[11px] text-slate-400 font-normal">
                                          ({it.matchedIngredient.unit})
                                        </span>
                                      </span>
                                    ) : (
                                      <span className="text-red-600 italic">Não encontrado</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-xs text-center font-bold py-1.5">
                                    {it.quantity} {it.unit}
                                  </TableCell>
                                  <TableCell className="text-xs py-1.5">
                                    {it.isValid ? (
                                      <span className="text-emerald-700 font-medium flex items-center gap-1 text-[11px]">
                                        <CheckCircle2 className="h-3 w-3" /> OK
                                      </span>
                                    ) : (
                                      <span
                                        className="text-red-600 font-medium flex items-center gap-1 text-[11px]"
                                        title={it.error}
                                      >
                                        <AlertCircle className="h-3 w-3 shrink-0" />
                                        {it.error}
                                      </span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
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
