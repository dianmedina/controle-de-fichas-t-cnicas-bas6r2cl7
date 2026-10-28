import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, CheckCircle2, GitMerge, Loader2, ArrowRight } from 'lucide-react'
import { Ingredient, MeasurementUnit, IngredientCategory } from '@/types/restaurant'
import { ingredientsService } from '@/services/ingredients'
import { useToast } from '@/hooks/use-toast'

interface MergeIngredientsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  ingredientsToMerge: Ingredient[]
  categories: IngredientCategory[]
  onSuccess: () => void
}

export const MergeIngredientsDialog: React.FC<MergeIngredientsDialogProps> = ({
  open,
  onOpenChange,
  ingredientsToMerge,
  categories,
  onSuccess,
}) => {
  const { toast } = useToast()
  const [survivorId, setSurvivorId] = useState<string>('')
  const [loading, setLoading] = useState(false)

  // Campos consolidados que o usuário pode editar se desejar
  const [mergedForm, setMergedForm] = useState({
    name: '',
    price: 0,
    unit: 'kg' as MeasurementUnit,
    reduction_percent: 0,
    category: '',
    supplier: '',
    package_size: '' as string | number,
    package_unit: 'kg' as MeasurementUnit,
  })

  // Ao abrir ou mudar os insumos selecionados, inicializa com o primeiro como sobrevivente
  useEffect(() => {
    if (ingredientsToMerge.length > 0) {
      const defaultSurvivor = ingredientsToMerge[0]
      setSurvivorId(defaultSurvivor.id)
      syncFormWithSurvivor(defaultSurvivor)
    }
  }, [ingredientsToMerge, open])

  const syncFormWithSurvivor = (survivor: Ingredient) => {
    setMergedForm({
      name: survivor.name,
      price: survivor.price || 0,
      unit: survivor.unit || 'kg',
      reduction_percent: survivor.reduction_percent || 0,
      category: survivor.category || '',
      supplier: survivor.supplier || '',
      package_size: survivor.package_size || '',
      package_unit: survivor.package_unit || survivor.unit || 'kg',
    })
  }

  const handleSurvivorChange = (id: string) => {
    setSurvivorId(id)
    const selected = ingredientsToMerge.find((i) => i.id === id)
    if (selected) {
      syncFormWithSurvivor(selected)
    }
  }

  const survivor = ingredientsToMerge.find((i) => i.id === survivorId)
  const absorbedList = ingredientsToMerge.filter((i) => i.id !== survivorId)

  const handleConfirmMerge = async () => {
    if (!survivorId || absorbedList.length === 0) {
      toast({
        title: 'Selecione os insumos',
        description: 'Selecione pelo menos 2 insumos para unificar.',
        variant: 'destructive',
      })
      return
    }

    if (!mergedForm.name.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Informe o nome final do insumo.',
        variant: 'destructive',
      })
      return
    }

    try {
      setLoading(true)

      const result = await ingredientsService.mergeIngredients({
        survivorId,
        absorbedIds: absorbedList.map((i) => i.id),
        survivorData: {
          name: mergedForm.name.trim(),
          price: Number(mergedForm.price) || 0,
          unit: mergedForm.unit,
          reduction_percent: Number(mergedForm.reduction_percent) || 0,
          category: mergedForm.category || 'Geral',
          supplier: mergedForm.supplier || '',
          package_size: mergedForm.package_size ? Number(mergedForm.package_size) : undefined,
          package_unit: mergedForm.package_unit,
        },
      })

      toast({
        title: 'Insumos unificados com sucesso!',
        description: `O insumo "${result.survivor.name}" foi mantido. ${result.reassignedRecipeItemsCount} vínculo(s) em fichas técnicas e ${result.reassignedPriceHistoriesCount} registro(s) de histórico foram transferidos. ${result.deletedIngredientsCount} duplicado(s) removido(s).`,
      })

      onSuccess()
      onOpenChange(false)
    } catch (err: any) {
      console.error('Erro ao unificar insumos:', err)
      toast({
        title: 'Erro ao unificar insumos',
        description: err.message || 'Ocorreu um erro ao reatribuir fichas ou remover duplicatas.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  if (ingredientsToMerge.length < 2) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900 text-lg">
            <GitMerge className="h-5 w-5 text-indigo-600" />
            Unificar Insumos Duplicados
          </DialogTitle>
          <DialogDescription>
            Combine {ingredientsToMerge.length} insumos em um único cadastro. Todas as fichas
            técnicas e o histórico de compras serão reatribuídos para o registro principal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* 1. Escolha do registro principal (sobrevivente) */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
              1. Escolha o registro principal (Sobrevivente):
            </Label>
            <RadioGroup
              value={survivorId}
              onValueChange={handleSurvivorChange}
              className="space-y-2"
            >
              {ingredientsToMerge.map((ing) => {
                const isSelected = ing.id === survivorId
                return (
                  <label
                    key={ing.id}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/50 text-indigo-950 font-medium shadow-sm'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <RadioGroupItem value={ing.id} id={`radio-${ing.id}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{ing.name}</span>
                          <Badge variant="outline" className="text-[11px] font-normal">
                            {ing.unit}
                          </Badge>
                          {ing.category && (
                            <Badge variant="secondary" className="text-[10px] font-normal">
                              {ing.category}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Preço: R$ {Number(ing.price || 0).toFixed(2)}/{ing.unit} • Perda:{' '}
                          {ing.reduction_percent || 0}%
                          {ing.supplier ? ` • Forn.: ${ing.supplier}` : ''}
                        </p>
                      </div>
                    </div>
                    {isSelected && (
                      <Badge className="bg-indigo-600 text-white text-[11px] font-normal">
                        Principal
                      </Badge>
                    )}
                  </label>
                )
              })}
            </RadioGroup>
          </div>

          {/* 2. O que será unificado/absorvido */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5">
            <p className="font-semibold text-slate-800 flex items-center gap-1.5">
              <ArrowRight className="h-4 w-4 text-indigo-600" />
              Insumos que serão removidos e absorvidos:
            </p>
            <ul className="list-disc list-inside text-slate-600 space-y-0.5">
              {absorbedList.map((a) => (
                <li key={a.id}>
                  <strong>{a.name}</strong> (R$ {Number(a.price || 0).toFixed(2)}/{a.unit})
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-slate-500 pt-1">
              • Todas as fichas técnicas que utilizavam estes insumos passarão a usar o registro
              principal.
              <br />• Todo o histórico de alterações de preços dos absorvidos será transferido para
              o principal.
            </p>
          </div>

          {/* 3. Confirmação dos dados finais do insumo sobrevivente */}
          <div className="border border-slate-200 rounded-lg p-4 space-y-3 bg-white">
            <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
              2. Dados finais consolidados do insumo:
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Nome consolidado *</Label>
                <Input
                  value={mergedForm.name}
                  onChange={(e) => setMergedForm({ ...mergedForm, name: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Preço de compra (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={mergedForm.price}
                  onChange={(e) =>
                    setMergedForm({ ...mergedForm, price: parseFloat(e.target.value) || 0 })
                  }
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Unidade de Medida</Label>
                <Select
                  value={mergedForm.unit}
                  onValueChange={(val: MeasurementUnit) =>
                    setMergedForm({ ...mergedForm, unit: val })
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="g">g</SelectItem>
                    <SelectItem value="L">L</SelectItem>
                    <SelectItem value="mL">mL</SelectItem>
                    <SelectItem value="unidade">unidade</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Perda no preparo / Redução (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="99.9"
                  value={mergedForm.reduction_percent}
                  onChange={(e) =>
                    setMergedForm({
                      ...mergedForm,
                      reduction_percent: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Categoria</Label>
                <Select
                  value={mergedForm.category}
                  onValueChange={(val) => setMergedForm({ ...mergedForm, category: val })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Fornecedor (opcional)</Label>
                <Input
                  value={mergedForm.supplier}
                  onChange={(e) => setMergedForm({ ...mergedForm, supplier: e.target.value })}
                  placeholder="Ex: Distribuidora Central"
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleConfirmMerge}
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <GitMerge className="h-4 w-4" />
            )}
            Confirmar Unificação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
