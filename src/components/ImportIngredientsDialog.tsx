import React, { useState, useRef } from 'react'
import { Ingredient, formatCurrency, getEffectiveIngredientPrice } from '@/types/restaurant'
import {
  parseExcelIngredientsFile,
  validateIngredientRows,
  downloadIngredientsTemplate,
  IngredientSheetDetectionResult,
  ParsedIngredientRow,
} from '@/lib/excelIngredients'
import { ingredientsService } from '@/services/ingredients'
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
  TrendingUp,
  TrendingDown,
  Info,
  Plus,
} from 'lucide-react'

interface ImportIngredientsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingIngredients: Ingredient[]
  onSuccess: () => void
}

export function ImportIngredientsDialog({
  open,
  onOpenChange,
  existingIngredients,
  onSuccess,
}: ImportIngredientsDialogProps) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [sheetResult, setSheetResult] = useState<IngredientSheetDetectionResult | null>(null)
  const [columnMapping, setColumnMapping] = useState({
    nameCol: '',
    priceCol: '',
    reductionCol: '',
    packageSizeCol: '',
    packageUnitCol: '',
    unitCol: '',
    categoryCol: '',
    supplierCol: '',
    minStockCol: '',
  })
  const [previewRows, setPreviewRows] = useState<ParsedIngredientRow[]>([])
  const [showColumnConfig, setShowColumnConfig] = useState(false)

  const handleDialogChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedFile(null)
      setSheetResult(null)
      setPreviewRows([])
      setShowColumnConfig(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
    onOpenChange(isOpen)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setSelectedFile(file)
    try {
      setParsing(true)
      const detected = await parseExcelIngredientsFile(file)
      setSheetResult(detected)

      const initialMapping = {
        nameCol: detected.detectedColumns.nameCol,
        priceCol: detected.detectedColumns.priceCol,
        reductionCol: detected.detectedColumns.reductionCol || '',
        packageSizeCol: detected.detectedColumns.packageSizeCol || '',
        packageUnitCol: detected.detectedColumns.packageUnitCol || '',
        unitCol: detected.detectedColumns.unitCol,
        categoryCol: detected.detectedColumns.categoryCol || '',
        supplierCol: detected.detectedColumns.supplierCol || '',
        minStockCol: detected.detectedColumns.minStockCol || '',
      }
      setColumnMapping(initialMapping)

      const evaluated = validateIngredientRows(detected.rows, initialMapping, existingIngredients)
      setPreviewRows(evaluated)
    } catch (err: any) {
      console.error('Erro ao ler planilha de insumos:', err)
      toast({
        title: 'Falha ao processar arquivo',
        description: err.message || 'Verifique se o arquivo é um formato válido .xlsx ou .xls.',
        variant: 'destructive',
      })
      setSelectedFile(null)
      setSheetResult(null)
      setPreviewRows([])
    } finally {
      setParsing(false)
    }
  }

  const handleRemap = (
    key:
      | 'nameCol'
      | 'priceCol'
      | 'reductionCol'
      | 'packageSizeCol'
      | 'packageUnitCol'
      | 'unitCol'
      | 'categoryCol'
      | 'supplierCol'
      | 'minStockCol',
    value: string,
  ) => {
    if (!sheetResult) return
    const updated = {
      ...columnMapping,
      [key]: value === 'none' ? '' : value,
    }
    setColumnMapping(updated)
    const evaluated = validateIngredientRows(sheetResult.rows, updated, existingIngredients)
    setPreviewRows(evaluated)
  }

  const handleConfirmImport = async () => {
    const validRows = previewRows.filter(
      (r) => r.isValid && r.normalizedName && r.normalizedPrice !== undefined && r.normalizedUnit,
    )

    if (validRows.length === 0) {
      toast({
        title: 'Nenhuma linha válida para importar',
        description: 'Corrija os erros na planilha ou remapeie as colunas correspondentes.',
        variant: 'destructive',
      })
      return
    }

    try {
      setImporting(true)
      let createdCount = 0
      let updatedCount = 0

      for (const row of validRows) {
        if (row.matchedExisting) {
          // Insumo já existe: atualiza dados e preço (service alimenta histórico automaticamente)
          const oldEff = row.matchedExisting
            ? formatCurrency(
                getEffectiveIngredientPrice(
                  row.matchedExisting.price,
                  row.matchedExisting.reduction_percent,
                ),
              )
            : ''
          const pkgNote =
            row.normalizedPackageSize && row.normalizedPackageUnit
              ? ` [emb: ${row.normalizedPackageSize} ${row.normalizedPackageUnit}]`
              : ''
          await ingredientsService.update(
            row.matchedExisting.id,
            {
              price: row.normalizedPrice!,
              reduction_percent: row.normalizedReductionPercent ?? 0,
              unit: row.normalizedUnit!,
              package_size: row.normalizedPackageSize,
              package_unit: row.normalizedPackageUnit,
              category: row.normalizedCategory || row.matchedExisting.category,
              supplier: row.normalizedSupplier || row.matchedExisting.supplier,
              min_stock:
                row.normalizedMinStock !== undefined
                  ? row.normalizedMinStock
                  : row.matchedExisting.min_stock,
            },
            row.isPriceChange
              ? `Importação Excel: Preço anterior ${oldEff} -> Atual ${formatCurrency(row.effectivePrice)}${pkgNote} (base R$ ${row.normalizedPrice?.toFixed(2)}/${row.normalizedUnit}, perda ${row.normalizedReductionPercent || 0}%)`
              : 'Atualização via planilha Excel',
          )
          updatedCount++
        } else {
          // Novo insumo (service grava registro inicial de preço no histórico com preço efetivo)
          const pkgNote =
            row.normalizedPackageSize && row.normalizedPackageUnit
              ? ` (emb: ${row.normalizedPackageSize} ${row.normalizedPackageUnit} -> R$ ${row.normalizedPrice?.toFixed(2)}/${row.normalizedUnit})`
              : ''
          await ingredientsService.create(
            {
              name: row.normalizedName!,
              price: row.normalizedPrice!,
              reduction_percent: row.normalizedReductionPercent ?? 0,
              unit: row.normalizedUnit!,
              package_size: row.normalizedPackageSize,
              package_unit: row.normalizedPackageUnit,
              category: row.normalizedCategory || 'Geral',
              supplier: row.normalizedSupplier,
              min_stock: row.normalizedMinStock,
            },
            `Cadastro inicial via importação Excel${pkgNote} (efetivo: ${formatCurrency(row.effectivePrice)})`,
          )
          createdCount++
        }
      }

      toast({
        title: 'Importação de insumos concluída!',
        description: `${validRows.length} insumos processados: ${createdCount} novos cadastros e ${updatedCount} atualizados (com histórico de preço registrado).`,
      })

      handleDialogChange(false)
      onSuccess()
    } catch (err: any) {
      console.error('Erro ao importar insumos:', err)
      toast({
        title: 'Erro na importação',
        description: 'Ocorreu um erro ao gravar os insumos no banco de dados.',
        variant: 'destructive',
      })
    } finally {
      setImporting(false)
    }
  }

  const validCount = previewRows.filter((r) => r.isValid).length
  const invalidCount = previewRows.filter((r) => !r.isValid).length
  const updateCount = previewRows.filter((r) => r.isValid && r.matchedExisting).length
  const newCount = previewRows.filter((r) => r.isValid && !r.matchedExisting).length

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg">Importar Insumos por Planilha Excel</DialogTitle>
                <DialogDescription className="text-xs">
                  Envie sua planilha de ingredientes e preços para cadastro ou atualização em massa.
                </DialogDescription>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => downloadIngredientsTemplate(existingIngredients)}
              className="text-xs h-8 gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-50 shrink-0"
              title="Baixar planilha de exemplo pré-formatada"
            >
              <Download className="h-3.5 w-3.5" />
              Baixar Planilha Modelo (.xlsx)
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {!sheetResult ? (
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-amber-500 hover:bg-amber-50/20 transition-all flex flex-col items-center justify-center">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                className="hidden"
                id="excel-ingredients-file-upload"
                onChange={handleFileChange}
                disabled={parsing}
              />
              <label
                htmlFor="excel-ingredients-file-upload"
                className="cursor-pointer flex flex-col items-center justify-center w-full"
              >
                <div className="h-14 w-14 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mb-3">
                  {parsing ? (
                    <Loader2 className="h-7 w-7 animate-spin text-amber-600" />
                  ) : (
                    <UploadCloud className="h-7 w-7" />
                  )}
                </div>
                <h4 className="text-base font-semibold text-slate-800">
                  {parsing
                    ? 'Processando planilha...'
                    : 'Clique para selecionar a planilha de insumos'}
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  Detecta automaticamente colunas com nome do insumo, preço de compra, unidade base
                  (kg, g, L, mL, unidade) e categoria.
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
              {/* Card Resumo do arquivo */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileSpreadsheet className="h-6 w-6 text-amber-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">
                      {selectedFile?.name}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {sheetResult.rows.length} linhas analisadas • {validCount} válidas ({newCount}{' '}
                      novos, {updateCount} atualizações) • {invalidCount} com pendências
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
                      setPreviewRows([])
                    }}
                    className="text-xs h-7 text-slate-600 hover:text-red-600"
                  >
                    Trocar Arquivo
                  </Button>
                </div>
              </div>

              {/* Seção retrátil de mapeamento de colunas */}
              {showColumnConfig && (
                <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl space-y-3">
                  <h5 className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                    Mapeamento de Colunas de Insumos
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-700">Nome do Insumo *</Label>
                      <Select
                        value={columnMapping.nameCol}
                        onValueChange={(val) => handleRemap('nameCol', val)}
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
                      <Label className="text-xs text-slate-700">Preço Compra / Embalagem *</Label>
                      <Select
                        value={columnMapping.priceCol}
                        onValueChange={(val) => handleRemap('priceCol', val)}
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
                      <Label className="text-xs text-slate-700">Tamanho Embalagem (Opcional)</Label>
                      <Select
                        value={columnMapping.packageSizeCol || 'none'}
                        onValueChange={(val) => handleRemap('packageSizeCol', val)}
                      >
                        <SelectTrigger className="h-8 text-xs bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-xs text-slate-400">
                            (Nenhum / Sem embalagem)
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
                      <Label className="text-xs text-slate-700">Unidade Embalagem (Opcional)</Label>
                      <Select
                        value={columnMapping.packageUnitCol || 'none'}
                        onValueChange={(val) => handleRemap('packageUnitCol', val)}
                      >
                        <SelectTrigger className="h-8 text-xs bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-xs text-slate-400">
                            (Mesma da unidade base)
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
                      <Label className="text-xs text-slate-700">
                        Medida Padrão (Unidade Base) *
                      </Label>
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
                      <Label className="text-xs text-slate-700">
                        Perda / Redução (%) (Opcional)
                      </Label>
                      <Select
                        value={columnMapping.reductionCol || 'none'}
                        onValueChange={(val) => handleRemap('reductionCol', val)}
                      >
                        <SelectTrigger className="h-8 text-xs bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-xs text-slate-400">
                            (Nenhuma / 0%)
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
                      <Label className="text-xs text-slate-700">Categoria</Label>
                      <Select
                        value={columnMapping.categoryCol || 'none'}
                        onValueChange={(val) => handleRemap('categoryCol', val)}
                      >
                        <SelectTrigger className="h-8 text-xs bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-xs text-slate-400">
                            (Nenhuma / Padrão Geral)
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
                      <Label className="text-xs text-slate-700">Fornecedor (Opcional)</Label>
                      <Select
                        value={columnMapping.supplierCol || 'none'}
                        onValueChange={(val) => handleRemap('supplierCol', val)}
                      >
                        <SelectTrigger className="h-8 text-xs bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-xs text-slate-400">
                            (Nenhum)
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

              {/* Informação sobre reconciliação e histórico */}
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2">
                <Info className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                <span>
                  <strong>Reconciliação e Histórico de Preços:</strong> Se o insumo já estiver
                  cadastrado, ele será atualizado em vez de duplicado. Caso o preço seja diferente
                  do preço atual, uma entrada de histórico com data e valor será automaticamente
                  registrada no sistema.
                </span>
              </div>

              {/* Tabela de pré-visualização */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <div className="max-h-[360px] overflow-y-auto">
                  <Table>
                    <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-xs">
                      <TableRow>
                        <TableHead className="w-12 text-center text-xs">Linha</TableHead>
                        <TableHead className="text-xs font-semibold text-slate-700">
                          Insumo
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-slate-700 text-right">
                          Preço Compra
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-slate-700 text-center">
                          Embalagem
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-slate-700 text-right">
                          Preço / Padrão
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-slate-700 text-center">
                          Perda (%)
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-slate-700 text-right">
                          Custo Utilizável
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-slate-700">
                          Unidade
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-slate-700">
                          Categoria
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-slate-700">
                          Reconciliação
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-slate-700">
                          Status
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.map((row) => (
                        <TableRow
                          key={row.rowIndex}
                          className={row.isValid ? 'hover:bg-slate-50/60' : 'bg-red-50/40'}
                        >
                          <TableCell className="text-center text-xs text-slate-500 font-mono">
                            {row.rowIndex}
                          </TableCell>
                          <TableCell className="text-xs font-medium text-slate-900">
                            {row.rawName || <span className="text-slate-400">(vazio)</span>}
                          </TableCell>
                          <TableCell className="text-xs text-right font-medium text-slate-700">
                            {row.rawPackagePrice !== undefined ? (
                              formatCurrency(row.rawPackagePrice)
                            ) : (
                              <span className="text-red-600 font-normal">
                                {String(row.rawPrice || '-')}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-center">
                            {row.normalizedPackageSize && row.normalizedPackageUnit ? (
                              <span className="inline-flex px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-900 border border-amber-200">
                                {row.normalizedPackageSize} {row.normalizedPackageUnit}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-right font-bold text-slate-900">
                            {row.normalizedPrice !== undefined
                              ? formatCurrency(row.normalizedPrice)
                              : '-'}
                            {row.normalizedUnit && (
                              <span className="text-[10px] text-slate-400 font-normal ml-0.5">
                                /{row.normalizedUnit}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-center">
                            {row.normalizedReductionPercent &&
                            row.normalizedReductionPercent > 0 ? (
                              <span className="inline-flex px-1.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                {row.normalizedReductionPercent}%
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">0%</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-right font-black text-amber-950">
                            {row.effectivePrice !== undefined
                              ? formatCurrency(row.effectivePrice)
                              : '-'}
                          </TableCell>
                          <TableCell className="text-xs">
                            {row.normalizedUnit ? (
                              <span className="inline-flex px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                                {row.normalizedUnit}
                              </span>
                            ) : (
                              <span className="text-red-600 font-semibold">{row.rawUnit}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-slate-600">
                            {row.normalizedCategory}
                          </TableCell>
                          <TableCell className="text-xs">
                            {row.matchedExisting ? (
                              <div className="flex items-center gap-1.5">
                                <Badge className="bg-blue-100 text-blue-900 border-blue-200 text-[11px]">
                                  Atualizar existente
                                </Badge>
                                {row.isPriceChange && (
                                  <span
                                    className="flex items-center text-[11px] text-amber-700 font-medium"
                                    title={`Preço anterior: ${formatCurrency(row.matchedExisting.price)}`}
                                  >
                                    {row.normalizedPrice! > row.matchedExisting.price ? (
                                      <TrendingUp className="h-3 w-3 mr-0.5 text-red-500" />
                                    ) : (
                                      <TrendingDown className="h-3 w-3 mr-0.5 text-emerald-600" />
                                    )}
                                    {formatCurrency(row.matchedExisting.price)}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <Badge className="bg-emerald-100 text-emerald-900 border-emerald-200 text-[11px] gap-1">
                                <Plus className="h-3 w-3" />
                                Novo cadastro
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {row.isValid ? (
                              <Badge className="bg-emerald-100 text-emerald-900 border-emerald-200 gap-1 text-[11px]">
                                <CheckCircle2 className="h-3 w-3 text-emerald-700" />
                                Válido
                              </Badge>
                            ) : (
                              <Badge
                                variant="destructive"
                                className="bg-red-100 text-red-900 border-red-200 gap-1 text-[11px]"
                                title={row.error}
                              >
                                <AlertCircle className="h-3 w-3 text-red-700" />
                                {row.error || 'Erro'}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
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
              className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
            >
              {importing && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar Importação ({validCount} {validCount === 1 ? 'insumo' : 'insumos'})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
