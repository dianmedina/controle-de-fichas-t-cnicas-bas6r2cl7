import React, { useEffect, useState, useMemo } from 'react'
import { salesService } from '@/services/sales'
import { recipesService } from '@/services/recipes'
import { Sale, Recipe, formatCurrency } from '@/types/restaurant'
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
import {
  TrendingUp,
  Plus,
  Calendar,
  Pencil,
  Trash2,
  Loader2,
  Utensils,
  CookingPot,
  Filter,
} from 'lucide-react'

export default function Vendas() {
  const { toast } = useToast()
  const [sales, setSales] = useState<Sale[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)

  // Filtros
  const [dateFilter, setDateFilter] = useState<string>('')
  const [selectedRecipeFilter, setSelectedRecipeFilter] = useState<string>('all')

  // Modal Novo / Edição
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingSale, setEditingSale] = useState<Sale | null>(null)
  const [saving, setSaving] = useState(false)

  // Form
  const todayStr = new Date().toISOString().slice(0, 10)
  const [formData, setFormData] = useState({
    recipe_id: '',
    date: todayStr,
    quantity: '1',
  })

  // Confirmação de exclusão
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadData = async () => {
    try {
      setLoading(true)
      const [salesData, recipesData] = await Promise.all([
        salesService.getAll(),
        recipesService.getAll(),
      ])
      setSales(salesData)
      setRecipes(recipesData)
    } catch (error) {
      console.error('Erro ao carregar vendas:', error)
      toast({
        title: 'Erro ao carregar vendas',
        description: 'Não foi possível buscar o histórico de vendas.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      const matchesDate = !dateFilter || sale.date === dateFilter
      const matchesRecipe =
        selectedRecipeFilter === 'all' || sale.recipe_id === selectedRecipeFilter
      return matchesDate && matchesRecipe
    })
  }, [sales, dateFilter, selectedRecipeFilter])

  // Métricas agregadas
  const metrics = useMemo(() => {
    const totalPratos = filteredSales.reduce((acc, s) => acc + s.quantity, 0)
    let faturamentoBruto = 0

    for (const sale of filteredSales) {
      const r = recipes.find((rec) => rec.id === sale.recipe_id)
      if (r && r.selling_price) {
        faturamentoBruto += sale.quantity * r.selling_price
      }
    }

    return { totalPratos, faturamentoBruto }
  }, [filteredSales, recipes])

  const handleOpenCreate = () => {
    setEditingSale(null)
    setFormData({
      recipe_id: recipes[0]?.id || '',
      date: todayStr,
      quantity: '1',
    })
    setIsModalOpen(true)
  }

  const handleOpenEdit = (sale: Sale) => {
    setEditingSale(sale)
    setFormData({
      recipe_id: sale.recipe_id,
      date: sale.date,
      quantity: sale.quantity.toString(),
    })
    setIsModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.recipe_id || !formData.date || !formData.quantity) {
      toast({
        title: 'Preencha todos os campos',
        description: 'Selecione o prato, informe a data e a quantidade vendida.',
        variant: 'destructive',
      })
      return
    }

    const qtyNum = parseInt(formData.quantity, 10)
    if (isNaN(qtyNum) || qtyNum <= 0) {
      toast({
        title: 'Quantidade inválida',
        description: 'Informe um número inteiro positivo.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSaving(true)
      if (editingSale) {
        await salesService.update(editingSale.id, {
          recipe_id: formData.recipe_id,
          date: formData.date,
          quantity: qtyNum,
        })
        toast({ title: 'Venda atualizada com sucesso!' })
      } else {
        await salesService.create({
          recipe_id: formData.recipe_id,
          date: formData.date,
          quantity: qtyNum,
        })
        toast({ title: 'Venda registrada com sucesso!' })
      }
      setIsModalOpen(false)
      loadData()
    } catch (error) {
      console.error('Erro ao salvar venda:', error)
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível registrar a venda.',
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
      await salesService.delete(deleteConfirmId)
      toast({ title: 'Venda excluída com sucesso!' })
      setDeleteConfirmId(null)
      loadData()
    } catch (error) {
      console.error('Erro ao excluir venda:', error)
      toast({
        title: 'Erro ao excluir',
        description: 'Não foi possível remover o registro de venda.',
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
            <TrendingUp className="h-6 w-6 text-amber-600" />
            Registro de Vendas Diárias
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Lance o volume diário vendido por prato para consolidar a receita, custos e lucro
            operacional.
          </p>
        </div>
        <Button
          onClick={handleOpenCreate}
          className="bg-amber-600 hover:bg-amber-700 text-white shadow-sm flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          Registrar Vendas
        </Button>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="shadow-xs border-slate-200">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase font-semibold text-slate-500">
              Pratos e Guarnições Vendidos
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-slate-800">
              {metrics.totalPratos} un.
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            Total acumulado nos filtros selecionados
          </CardContent>
        </Card>

        <Card className="shadow-xs border-slate-200">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase font-semibold text-slate-500">
              Receita Estimada Bruta
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-700">
              {formatCurrency(metrics.faturamentoBruto)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            Quantidade × Preço de Venda cadastrado
          </CardContent>
        </Card>

        <Card className="shadow-xs border-slate-200">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase font-semibold text-slate-500">
              Lançamentos Registrados
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-amber-700">
              {filteredSales.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-slate-500">
            Entradas de vendas registradas no sistema
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
            <Input
              type="date"
              className="w-full sm:w-[180px] text-sm bg-slate-50 border-slate-200"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
            {dateFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDateFilter('')}
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                Limpar data
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400 shrink-0" />
            <Select value={selectedRecipeFilter} onValueChange={setSelectedRecipeFilter}>
              <SelectTrigger className="w-full sm:w-[240px] text-sm bg-slate-50 border-slate-200">
                <SelectValue placeholder="Filtrar por prato" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os pratos e guarnições</SelectItem>
                {recipes.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Tabela de Vendas */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-7 w-7 animate-spin text-amber-600" />
            <p className="text-sm">Carregando lançamentos de vendas...</p>
          </div>
        ) : filteredSales.length === 0 ? (
          <div className="p-12 text-center">
            <TrendingUp className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-800">Nenhuma venda registrada</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
              {dateFilter || selectedRecipeFilter !== 'all'
                ? 'Nenhum lançamento corresponde ao filtro especificado.'
                : 'Lance as primeiras vendas do dia para acompanhar o desempenho dos pratos.'}
            </p>
            {!dateFilter && selectedRecipeFilter === 'all' && (
              <Button
                onClick={handleOpenCreate}
                variant="outline"
                className="mt-4 border-amber-300 text-amber-800 hover:bg-amber-50"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Registrar Primeira Venda
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/75">
                <TableRow>
                  <TableHead className="font-semibold text-slate-700">Data</TableHead>
                  <TableHead className="font-semibold text-slate-700">Prato / Guarnição</TableHead>
                  <TableHead className="font-semibold text-slate-700">Tipo</TableHead>
                  <TableHead className="font-semibold text-slate-700 text-center">
                    Qtd. Vendida
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 text-right">
                    Preço Unitário
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 text-right">
                    Total Bruto
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSales.map((sale) => {
                  const r = recipes.find((rec) => rec.id === sale.recipe_id)
                  const unitPrice = r?.selling_price || 0
                  const total = sale.quantity * unitPrice

                  return (
                    <TableRow key={sale.id} className="hover:bg-slate-50/50">
                      <TableCell className="font-medium text-slate-900 whitespace-nowrap">
                        {sale.date.split('-').reverse().join('/')}
                      </TableCell>

                      <TableCell className="font-semibold text-slate-900">
                        <div className="flex items-center gap-2">
                          {r?.type === 'prato' ? (
                            <Utensils className="h-4 w-4 text-amber-600 shrink-0" />
                          ) : (
                            <CookingPot className="h-4 w-4 text-orange-500 shrink-0" />
                          )}
                          <span>{r?.name || 'Prato não encontrado'}</span>
                        </div>
                      </TableCell>

                      <TableCell>
                        {r?.type === 'prato' ? (
                          <Badge className="bg-amber-100 text-amber-900 border-amber-200 font-medium">
                            Prato
                          </Badge>
                        ) : (
                          <Badge className="bg-orange-100 text-orange-900 border-orange-200 font-medium">
                            Guarnição
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell className="text-center font-bold text-slate-900">
                        {sale.quantity}
                      </TableCell>

                      <TableCell className="text-right text-slate-700 font-medium">
                        {unitPrice > 0 ? formatCurrency(unitPrice) : '-'}
                      </TableCell>

                      <TableCell className="text-right font-bold text-emerald-700">
                        {formatCurrency(total)}
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEdit(sale)}
                            className="h-8 w-8 text-slate-600 hover:text-amber-700 hover:bg-amber-50"
                            title="Editar lançamento"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteConfirmId(sale.id)}
                            className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                            title="Excluir lançamento"
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

      {/* Modal Novo / Editar Venda */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle>
                {editingSale ? 'Editar Lançamento de Venda' : 'Registrar Venda Diária'}
              </DialogTitle>
              <DialogDescription>
                Informe o prato vendido, a data do serviço e a quantidade de porções.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="s-recipe">Prato / Guarnição *</Label>
                <Select
                  value={formData.recipe_id}
                  onValueChange={(val) => setFormData({ ...formData, recipe_id: val })}
                >
                  <SelectTrigger id="s-recipe">
                    <SelectValue placeholder="Selecione o prato..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {recipes.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name} ({formatCurrency(r.selling_price || 0)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="s-date">Data da Venda *</Label>
                  <Input
                    id="s-date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="s-qty">Quantidade Vendida *</Label>
                  <Input
                    id="s-qty"
                    type="number"
                    min="1"
                    step="1"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    required
                  />
                </div>
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
                {editingSale ? 'Salvar Venda' : 'Confirmar Lançamento'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Exclusão */}
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir Lançamento</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir este registro de venda? Os cálculos consolidados de
              faturamento e lucro serão recalculados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir Registro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
