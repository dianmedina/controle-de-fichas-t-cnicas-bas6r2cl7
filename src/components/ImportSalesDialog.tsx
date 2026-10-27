import React, { useState, useRef } from 'react'
import { Recipe } from '@/types/restaurant'
import {
  parseExcelSalesFile,
  validateParsedRows,
  downloadSalesTemplate,
  SheetDetectionResult,
  ParsedSaleRow,
} from '@/lib/excelSales'
import { salesService } from '@/services/sales'
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
  ChevronRight,
  HelpCircle,
} from 'lucide-react'

interface ImportSalesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  recipes: Recipe[]
  onSuccess: () => void
}

export function ImportSalesDialog({
  open,
  onOpenChange,
  recipes,
  onSuccess,
}: ImportSalesDialogProps) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [sheetResult, setSheetResult] = useState<SheetDetectionResult | null>(null)
  const [columnMapping, setColumnMapping] = useState({
    dishCol: '',
    dateCol: '',
    quantityCol: '',
    priceCol: '',
  })
  const [previewRows, setPreviewRows] = useState<ParsedSaleRow[]>([])
  const [showColumnConfig, setShowColumnConfig] = useState(false)

  // Reset do estado ao fechar modal
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

  // Processa o arquivo selecionado
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setSelectedFile(file)
    try {
      setParsing(true)
      const detected = await parseExcelSalesFile(file)
      setSheetResult(detected)

      const initialMapping = {
        dishCol: detected.detectedColumns.dishCol,
        dateCol: detected.detectedColumns.dateCol,
        quantityCol: detected.detectedColumns.quantityCol,
        priceCol: detected.detectedColumns.priceCol || '',
      }
      setColumnMapping(initialMapping)

      const evaluated = validateParsedRows(detected.rows, initialMapping, recipes)
      setPreviewRows(evaluated)
    } catch (err: any) {
      console.error('Erro ao ler planilha:', err)
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

  // Recalcula validação quando o usuário remapeia colunas
  const handleRemap = (key: 'dishCol' | 'dateCol' | 'quantityCol' | 'priceCol', value: string) => {
    if (!sheetResult) return
    const updated = {
      ...columnMapping,
      [key]: value === 'none' ? '' : value,
    }
    setColumnMapping(updated)
    const evaluated = validateParsedRows(sheetResult.rows, updated, recipes)
    setPreviewRows(evaluated)
  }

  // Executa a importação dos registros válidos
  const handleConfirmImport = async () => {
    const validRows = previewRows.filter(
      (r) => r.isValid && r.matchedRecipe && r.normalizedDate && r.normalizedQuantity,
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
      const payload = validRows.map((r) => ({
        recipeId: r.matchedRecipe!.id,
        date: r.normalizedDate!,
        quantity: r.normalizedQuantity!,
      }))

      const result = await salesService.importBatch(payload)

      toast({
        title: 'Importação concluída com sucesso!',
        description: `${result.totalProcessed} vendas processadas (${result.createdCount} novos lançamentos, ${result.updatedCount} consolidadas/somadas a datas existentes).`,
      })

      handleDialogChange(false)
      onSuccess()
    } catch (err: any) {
      console.error('Erro ao salvar vendas importadas:', err)
      toast({
        title: 'Erro na importação',
        description: 'Não foi possível gravar as vendas no banco de dados.',
        variant: 'destructive',
      })
    } finally {
      setImporting(false)
    }
  }

  const validCount = previewRows.filter((r) => r.isValid).length
  const invalidCount = previewRows.filter((r) => !r.isValid).length

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg">Importar Vendas por Planilha Excel</DialogTitle>
                <DialogDescription className="text-xs">
                  Carregue um arquivo .xlsx com o histórico de vendas para lançamento em massa.
                </DialogDescription>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => downloadSalesTemplate(recipes)}
              className="text-xs h-8 gap-1.5 border-emerald-300 text-emerald-800 hover:bg-emerald-50 shrink-0"
              title="Baixar modelo de planilha Excel pré-formatada"
            >
              <Download className="h-3.5 w-3.5" />
              Baixar Planilha Modelo (.xlsx)
            </Button>
          </div>
        </DialogHeader>

        {/* Corpo com scroll */}
        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* Zona de upload / seleção de arquivo */}
          {!sheetResult ? (
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-emerald-500 hover:bg-emerald-50/20 transition-all flex flex-col items-center justify-center">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                className="hidden"
                id="excel-file-upload"
                onChange={handleFileChange}
                disabled={parsing}
              />
              <label
                htmlFor="excel-file-upload"
                className="cursor-pointer flex flex-col items-center justify-center w-full"
              >
                <div className="h-14 w-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                  {parsing ? (
                    <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
                  ) : (
                    <UploadCloud className="h-7 w-7" />
                  )}
                </div>
                <h4 className="text-base font-semibold text-slate-800">
                  {parsing ? 'Processando planilha...' : 'Clique para selecionar o arquivo .xlsx'}
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  Formatos suportados: .xlsx ou .xls. Reconhece automaticamente cabeçalhos com nomes
                  de pratos, datas e quantidades.
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
              {/* Arquivo carregado & Configuração de colunas */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileSpreadsheet className="h-6 w-6 text-emerald-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">
                      {selectedFile?.name}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {sheetResult.rows.length} linhas lidas • {validCount} prontas para importar •{' '}
                      {invalidCount} com pendências
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

              {/* Seção retrátil de remapeamento de colunas */}
              {showColumnConfig && (
                <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl space-y-3">
                  <div className="flex items-center gap-2">
                    <HelpCircle className="h-4 w-4 text-amber-700" />
                    <h5 className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                      Mapeamento de Colunas da Planilha
                    </h5>
                  </div>
                  <p className="text-xs text-amber-900/80">
                    Se a detecção automática errou alguma coluna, selecione abaixo qual coluna da
                    sua planilha corresponde a cada campo:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-700">Coluna do Prato *</Label>
                      <Select
                        value={columnMapping.dishCol}
                        onValueChange={(val) => handleRemap('dishCol', val)}
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
                      <Label className="text-xs text-slate-700">Coluna de Data *</Label>
                      <Select
                        value={columnMapping.dateCol}
                        onValueChange={(val) => handleRemap('dateCol', val)}
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
                      <Label className="text-xs text-slate-700">Coluna Preço (Opcional)</Label>
                      <Select
                        value={columnMapping.priceCol || 'none'}
                        onValueChange={(val) => handleRemap('priceCol', val)}
                      >
                        <SelectTrigger className="h-8 text-xs bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-xs text-slate-400">
                            (Nenhuma)
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

              {/* Dica sobre somatório inteligente de duplicidades */}
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-900 flex items-start gap-2">
                <ChevronRight className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Prevenção de duplicidade:</strong> Se a mesma data e prato já tiverem
                  vendas gravadas no sistema (ou aparecerem repetidos na mesma planilha), o sistema
                  vai somar a quantidade automaticamente em vez de criar linhas duplicadas.
                </span>
              </div>

              {/* Tabela de Pré-visualização */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <div className="max-h-[360px] overflow-y-auto">
                  <Table>
                    <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-xs">
                      <TableRow>
                        <TableHead className="w-12 text-center text-xs">Linha</TableHead>
                        <TableHead className="text-xs font-semibold text-slate-700">
                          Prato na Planilha
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-slate-700">
                          Ficha Identificada
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-slate-700">Data</TableHead>
                        <TableHead className="text-xs font-semibold text-slate-700 text-center">
                          Qtd
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
                          <TableCell className="text-xs font-medium text-slate-800">
                            {row.rawDish || <span className="text-slate-400">(vazio)</span>}
                          </TableCell>
                          <TableCell className="text-xs">
                            {row.matchedRecipe ? (
                              <span className="font-semibold text-emerald-800">
                                {row.matchedRecipe.name}
                              </span>
                            ) : (
                              <span className="text-red-600 italic">Não associado</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {row.normalizedDate ? (
                              row.normalizedDate.split('-').reverse().join('/')
                            ) : (
                              <span className="text-red-600">{row.rawDate || 'Inválida'}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-center font-bold">
                            {row.normalizedQuantity ?? (
                              <span className="text-red-600 font-normal">
                                {String(row.rawQuantity || '-')}
                              </span>
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

        {/* Rodapé de Ações */}
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
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            >
              {importing && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar Importação ({validCount} {validCount === 1 ? 'linha' : 'linhas'})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
