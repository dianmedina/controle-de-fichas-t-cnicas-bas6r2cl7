import React from 'react'
import { RecipeWithCost } from '@/services/recipes'
import { recipesService } from '@/services/recipes'
import {
  Recipe,
  RecipeItem,
  calculateItemCost,
  formatCurrency,
  formatPercent,
  getEffectiveIngredientPrice,
  formatPackageInfo,
  formatPortionSize,
} from '@/types/restaurant'
import { ChefHat, CookingPot, Utensils, Scale, DollarSign, Image as ImageIcon } from 'lucide-react'

interface PrintableRecipeSheetProps {
  recipe: RecipeWithCost
  hideCosts?: boolean
  allRecipes?: Recipe[]
  allRecipeItems?: RecipeItem[]
}

export const PrintableRecipeSheet: React.FC<PrintableRecipeSheetProps> = ({
  recipe,
  hideCosts = false,
  allRecipes = [],
  allRecipeItems = [],
}) => {
  const photo1Url = recipe.photo_1 ? recipesService.getPhotoUrl(recipe, recipe.photo_1) : ''
  const photo2Url = recipe.photo_2 ? recipesService.getPhotoUrl(recipe, recipe.photo_2) : ''
  const hasPhotos = Boolean(photo1Url || photo2Url)

  const currentDate = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date())

  const ingredientItems = recipe.items.filter((it) => !it.sub_recipe_id)
  const garnishItems = recipe.items.filter((it) => !!it.sub_recipe_id)

  return (
    <div className="hidden print:block print-page-container font-sans text-slate-900 bg-white leading-tight">
      {/* Cabeçalho da Ficha */}
      <div className="border-b-2 border-slate-900 pb-2 mb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold">
              <ChefHat className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] tracking-widest uppercase font-bold text-slate-500">
                Ficha Técnica Operacional de Restaurante
              </span>
              <h1 className="text-xl font-black uppercase text-slate-950 tracking-tight leading-tight">
                {recipe.name}
              </h1>
            </div>
          </div>

          <div className="text-right">
            <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-slate-100 text-slate-800 border border-slate-300">
              {recipe.type === 'prato' ? 'Prato Principal' : 'Guarnição'}
            </span>
            <p className="text-[10px] text-slate-400 mt-0.5">Emissão: {currentDate}</p>
          </div>
        </div>

        {/* Resumo de Indicadores Compacto */}
        {(() => {
          const formattedPortion = formatPortionSize(
            recipe.portion_size_value,
            recipe.portion_size_unit,
          )

          if (hideCosts) {
            return (
              <div
                className={`grid ${
                  formattedPortion ? 'grid-cols-4' : 'grid-cols-3'
                } gap-2 mt-2 pt-2 border-t border-slate-200 text-center`}
              >
                <div className="bg-slate-50 border border-slate-200 rounded p-1.5">
                  <span className="block text-[9px] uppercase font-bold text-slate-500">
                    Rendimento
                  </span>
                  <span className="text-xs font-bold text-slate-900">
                    {recipe.yield_portions} {recipe.yield_portions > 1 ? 'porções' : 'porção'}
                  </span>
                </div>

                {formattedPortion && (
                  <div className="bg-amber-50/80 border border-amber-300 rounded p-1.5">
                    <span className="block text-[9px] uppercase font-bold text-amber-900">
                      Tamanho da Porção
                    </span>
                    <span className="text-xs font-extrabold text-amber-950">
                      {formattedPortion}
                    </span>
                  </div>
                )}

                <div className="bg-slate-50 border border-slate-200 rounded p-1.5">
                  <span className="block text-[9px] uppercase font-bold text-slate-500">
                    Total de Insumos
                  </span>
                  <span className="text-xs font-bold text-slate-900">
                    {recipe.items.length} {recipe.items.length === 1 ? 'item' : 'itens'}
                  </span>
                </div>

                <div className="bg-amber-50/70 border border-amber-300 rounded p-1.5">
                  <span className="block text-[9px] uppercase font-bold text-amber-900">
                    Finalidade
                  </span>
                  <span className="text-xs font-extrabold text-amber-950">Produção • Equipe</span>
                </div>
              </div>
            )
          }

          return (
            <div
              className={`grid ${
                formattedPortion ? 'grid-cols-6' : 'grid-cols-5'
              } gap-2 mt-2 pt-2 border-t border-slate-200 text-center`}
            >
              <div className="bg-slate-50 border border-slate-200 rounded p-1">
                <span className="block text-[9px] uppercase font-bold text-slate-500">
                  Rendimento
                </span>
                <span className="text-xs font-bold text-slate-900">
                  {recipe.yield_portions} {recipe.yield_portions > 1 ? 'porções' : 'porção'}
                </span>
              </div>

              {formattedPortion && (
                <div className="bg-amber-50/80 border border-amber-300 rounded p-1">
                  <span className="block text-[9px] uppercase font-bold text-amber-900">
                    Porção
                  </span>
                  <span className="text-xs font-extrabold text-amber-950">{formattedPortion}</span>
                </div>
              )}

              <div className="bg-slate-50 border border-slate-200 rounded p-1">
                <span className="block text-[9px] uppercase font-bold text-slate-500">
                  Custo total da receita
                </span>
                <span className="text-xs font-bold text-slate-900">
                  {formatCurrency(recipe.totalCost)}
                </span>
              </div>

              <div className="bg-amber-50/70 border border-amber-300 rounded p-1">
                <span className="block text-[9px] uppercase font-bold text-amber-900">
                  Custo / Porção
                </span>
                <span className="text-xs font-extrabold text-amber-950">
                  {formatCurrency(recipe.costPerPortion)}
                </span>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded p-1">
                <span className="block text-[9px] uppercase font-bold text-slate-500">
                  Preço de Venda
                </span>
                <span className="text-xs font-bold text-slate-900">
                  {recipe.selling_price > 0 ? formatCurrency(recipe.selling_price) : 'Não def.'}
                </span>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded p-1">
                <span className="block text-[9px] uppercase font-bold text-slate-500">Margem</span>
                <span className="text-xs font-bold text-emerald-800">
                  {recipe.selling_price > 0 ? formatPercent(recipe.marginPercent) : '-'}
                </span>
              </div>
            </div>
          )
        })()}
      </div>

      {/* Grid de 2 Colunas para caber perfeitamente em 1 página */}
      <div className="grid grid-cols-12 gap-3 items-start">
        {/* Coluna Esquerda: Guarnições e Ingredientes (e Custos se completo) */}
        <div className="col-span-7 flex flex-col gap-2">
          {/* Se houver guarnições vinculadas */}
          {garnishItems.length > 0 && (
            <div className="border border-amber-300 rounded overflow-hidden">
              <div className="bg-amber-900 text-white px-2 py-1 flex items-center justify-between text-[11px] font-bold uppercase">
                <span className="flex items-center gap-1.5">
                  <Utensils className="h-3.5 w-3.5 text-amber-300" />
                  Guarnições & Acompanhamentos (Sub-Fichas)
                </span>
                <span className="text-[10px] text-amber-200">
                  {garnishItems.length} componentes
                </span>
              </div>

              <table className="w-full text-left text-[11px] border-collapse">
                <thead>
                  <tr className="bg-amber-50 border-b border-amber-200 text-[10px] uppercase text-amber-950 font-bold">
                    <th className="py-1 px-1.5">Guarnição</th>
                    <th className={`py-1 px-1.5 ${hideCosts ? 'text-right' : 'text-center'}`}>
                      Qtd. Porções
                    </th>
                    {!hideCosts && (
                      <>
                        <th className="py-1 px-1.5 text-right">Custo / Porção</th>
                        <th className="py-1 px-1.5 text-right">Custo no Prato</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100">
                  {garnishItems.map((item, idx) => {
                    const subRecipe =
                      item.expand?.sub_recipe_id ||
                      allRecipes.find((r) => r.id === item.sub_recipe_id)

                    let garnishPortionCost = 0
                    if (subRecipe) {
                      const recipesMap = new Map<string, Recipe>()
                      allRecipes.forEach((r) => recipesMap.set(r.id, r))
                      recipesMap.set(subRecipe.id, subRecipe)
                      const itemsMap = new Map<string, RecipeItem[]>()
                      allRecipeItems.forEach((it) => {
                        const list = itemsMap.get(it.recipe_id) || []
                        list.push(it)
                        itemsMap.set(it.recipe_id, list)
                      })
                      const calc = recipesService.calculatePortionCost(
                        subRecipe.id,
                        recipesMap,
                        itemsMap,
                        new Set<string>([recipe.id]),
                      )
                      garnishPortionCost = calc.portionCost
                    }

                    const subCost = garnishPortionCost * item.quantity

                    return (
                      <tr
                        key={item.id || idx}
                        className={idx % 2 === 0 ? 'bg-white' : 'bg-amber-50/40'}
                      >
                        <td className="py-1 px-1.5 font-semibold text-slate-900 leading-tight">
                          {subRecipe?.name || 'Guarnição'}
                          <span className="block text-[9px] text-amber-800 font-normal">
                            Sub-ficha técnica
                          </span>
                        </td>
                        <td
                          className={`py-1 px-1.5 font-bold text-slate-800 whitespace-nowrap ${
                            hideCosts ? 'text-right text-xs' : 'text-center'
                          }`}
                        >
                          {item.quantity}{' '}
                          <span className="text-[9px] font-semibold text-slate-600">
                            {item.quantity === 1 ? 'porção' : 'porções'}
                          </span>
                        </td>
                        {!hideCosts && (
                          <>
                            <td className="py-1 px-1.5 text-right text-slate-700 text-[10px] whitespace-nowrap">
                              {formatCurrency(garnishPortionCost)}
                            </td>
                            <td className="py-1 px-1.5 text-right font-bold text-slate-950 whitespace-nowrap">
                              {formatCurrency(subCost)}
                            </td>
                          </>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
                {!hideCosts && (
                  <tfoot>
                    <tr className="bg-amber-100/70 border-t border-amber-300 text-[10px] font-bold">
                      <td colSpan={3} className="py-1 px-1.5 uppercase text-amber-950">
                        Subtotal Guarnições:
                      </td>
                      <td className="py-1 px-1.5 text-right text-amber-950 font-extrabold">
                        {formatCurrency(recipe.garnishesCost || 0)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {/* Tabela de Insumos */}
          <div className="border border-slate-300 rounded overflow-hidden">
            <div className="bg-slate-800 text-white px-2 py-1 flex items-center justify-between text-[11px] font-bold uppercase">
              <span className="flex items-center gap-1.5">
                <CookingPot className="h-3.5 w-3.5 text-amber-400" />
                Ingredientes & Insumos Próprios
              </span>
              <span className="text-[10px] text-slate-300">{ingredientItems.length} itens</span>
            </div>

            <table className="w-full text-left text-[11px] border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-[10px] uppercase text-slate-700 font-bold">
                  <th className="py-1 px-1.5">Insumo</th>
                  <th className={`py-1 px-1.5 ${hideCosts ? 'text-right' : 'text-center'}`}>
                    Qtd. / Unid.
                  </th>
                  {!hideCosts && (
                    <>
                      <th className="py-1 px-1 text-right">Preço Base</th>
                      <th className="py-1 px-1 text-right text-amber-900">Preço c/ Perda</th>
                      <th className="py-1 px-1.5 text-right">Custo</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {ingredientItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={hideCosts ? 2 : 5}
                      className="py-2 text-center text-slate-400 italic text-[10px]"
                    >
                      Nenhum ingrediente direto cadastrado.
                    </td>
                  </tr>
                ) : (
                  ingredientItems.map((item, idx) => {
                    const ing = item.expand?.ingredient_id
                    const cost = ing ? calculateItemCost(item.quantity, item.unit, ing) : 0
                    const effPrice = ing
                      ? getEffectiveIngredientPrice(ing.price, ing.reduction_percent)
                      : 0
                    const hasRed = !!(ing?.reduction_percent && ing.reduction_percent > 0)

                    return (
                      <tr
                        key={item.id || idx}
                        className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}
                      >
                        <td className="py-1 px-1.5 font-medium text-slate-900 leading-tight">
                          {ing?.name || 'Insumo'}
                          <span className="block text-[9px] text-slate-500 font-normal">
                            {ing?.category}
                            {ing?.package_size && ing?.package_unit && (
                              <span className="text-amber-800 ml-1">
                                (emb. {formatPackageInfo(ing.package_size, ing.package_unit)})
                              </span>
                            )}
                          </span>
                        </td>
                        <td
                          className={`py-1 px-1.5 font-bold text-slate-800 whitespace-nowrap ${hideCosts ? 'text-right text-xs' : 'text-center'}`}
                        >
                          {item.quantity}{' '}
                          <span className="text-[9px] font-semibold text-slate-600">
                            {item.unit}
                          </span>
                        </td>
                        {!hideCosts && (
                          <>
                            <td className="py-1 px-1 text-right text-slate-500 text-[10px] whitespace-nowrap">
                              {ing ? `${formatCurrency(ing.price)}/${ing.unit}` : '-'}
                            </td>
                            <td className="py-1 px-1 text-right font-medium text-slate-900 text-[10px] whitespace-nowrap">
                              {ing ? (
                                <span>
                                  <span className="font-bold text-amber-900">
                                    {formatCurrency(effPrice)}
                                  </span>
                                  {hasRed && (
                                    <span className="text-[8px] text-amber-700 ml-0.5">
                                      (+{ing.reduction_percent}%)
                                    </span>
                                  )}
                                </span>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="py-1 px-1.5 text-right font-bold text-slate-950 whitespace-nowrap">
                              {formatCurrency(cost)}
                            </td>
                          </>
                        )}
                      </tr>
                    )
                  })
                )}
              </tbody>
              {!hideCosts ? (
                <tfoot>
                  <tr className="bg-slate-100 border-t-2 border-slate-300 text-[10px] font-bold">
                    <td colSpan={4} className="py-1 px-1.5 uppercase text-slate-700">
                      Subtotal Insumos Diretos:
                    </td>
                    <td className="py-1 px-1.5 text-right text-slate-900 font-extrabold">
                      {formatCurrency(recipe.ingredientsCost)}
                    </td>
                  </tr>
                  {recipe.garnishesCost > 0 && (
                    <tr className="bg-slate-100 border-t border-slate-200 text-[10px] font-bold">
                      <td colSpan={4} className="py-1 px-1.5 uppercase text-amber-900">
                        Subtotal Guarnições Inclusas:
                      </td>
                      <td className="py-1 px-1.5 text-right text-amber-900 font-extrabold">
                        {formatCurrency(recipe.garnishesCost)}
                      </td>
                    </tr>
                  )}
                  {recipe.laborCost > 0 && (
                    <tr className="bg-slate-100 border-t border-slate-200 text-[10px] font-bold">
                      <td colSpan={4} className="py-1 px-1.5 uppercase text-slate-700">
                        Mão de Obra de Preparo:
                      </td>
                      <td className="py-1 px-1.5 text-right text-slate-900 font-extrabold">
                        {formatCurrency(recipe.laborCost)}
                      </td>
                    </tr>
                  )}
                  <tr className="bg-amber-100/70 border-t border-amber-300 text-[11px] font-extrabold text-amber-950">
                    <td colSpan={4} className="py-1 px-1.5 uppercase">
                      Custo total da receita:
                    </td>
                    <td className="py-1 px-1.5 text-right">{formatCurrency(recipe.totalCost)}</td>
                  </tr>
                </tfoot>
              ) : (
                <tfoot>
                  <tr className="bg-slate-100 border-t border-slate-300 text-[10px] font-bold text-slate-700">
                    <td className="py-1 px-1.5 uppercase">Total de Itens & Guarnições:</td>
                    <td className="py-1 px-1.5 text-right text-slate-900 font-extrabold">
                      {recipe.items.length}{' '}
                      {recipe.items.length === 1 ? 'componente' : 'componentes'}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Destaque do Custo Unitário (somente na versão Completa) */}
          {!hideCosts ? (
            <div className="border border-slate-300 rounded p-1.5 bg-slate-50 flex items-center justify-between text-[11px]">
              <div>
                <span className="text-[9px] uppercase font-bold text-slate-500 block">
                  Custo de Produção por Porção
                </span>
                <span className="font-extrabold text-sm text-slate-950">
                  {formatCurrency(recipe.costPerPortion)}
                </span>
              </div>
              {recipe.selling_price > 0 && (
                <div className="text-right">
                  <span className="text-[9px] uppercase font-bold text-slate-500 block">
                    Lucro Bruto por Porção
                  </span>
                  <span className="font-bold text-xs text-emerald-800">
                    {formatCurrency(recipe.profitPerPortion)} ({formatPercent(recipe.marginPercent)}
                    )
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="border border-slate-300 rounded p-1.5 bg-slate-50 flex items-center justify-between text-[11px]">
              <div>
                <span className="text-[9px] uppercase font-bold text-slate-500 block">
                  Rendimento Programado
                </span>
                <span className="font-bold text-xs text-slate-900">
                  {recipe.yield_portions}{' '}
                  {recipe.yield_portions > 1 ? 'porções padronizadas' : 'porção padronizada'}
                  {formatPortionSize(recipe.portion_size_value, recipe.portion_size_unit) && (
                    <span className="text-amber-900 font-extrabold ml-1.5">
                      ({formatPortionSize(recipe.portion_size_value, recipe.portion_size_unit)}
                      /porção)
                    </span>
                  )}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[9px] uppercase font-bold text-slate-500 block">
                  Controle Operacional
                </span>
                <span className="font-medium text-[10px] text-slate-600">
                  Respeitar rigorosamente as pesagens
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Coluna Direita: Modo de Fazer e Fotos (5 colunas) */}
        <div className="col-span-5 flex flex-col gap-2">
          {/* Fotos do Prato Finalizado */}
          <div className="border border-slate-300 rounded overflow-hidden">
            <div className="bg-slate-800 text-white px-2 py-1 flex items-center justify-between text-[11px] font-bold uppercase">
              <span className="flex items-center gap-1.5">
                <Utensils className="h-3.5 w-3.5 text-amber-400" />
                Apresentação do Prato
              </span>
              <span className="text-[10px] text-slate-300">Padrão Visual</span>
            </div>

            <div className="p-2 bg-slate-50">
              {hasPhotos ? (
                <div
                  className={`grid ${
                    photo1Url && photo2Url ? 'grid-cols-2 gap-1.5' : 'grid-cols-1'
                  }`}
                >
                  {photo1Url && (
                    <div className="rounded overflow-hidden border border-slate-300 bg-white">
                      <img
                        src={photo1Url}
                        alt={`Foto 1 de ${recipe.name}`}
                        className="w-full h-32 object-cover block"
                      />
                      <span className="block text-[8px] text-center font-bold uppercase py-0.5 bg-slate-100 text-slate-600">
                        Foto 1: Prato Finalizado
                      </span>
                    </div>
                  )}
                  {photo2Url && (
                    <div className="rounded overflow-hidden border border-slate-300 bg-white">
                      <img
                        src={photo2Url}
                        alt={`Foto 2 de ${recipe.name}`}
                        className="w-full h-32 object-cover block"
                      />
                      <span className="block text-[8px] text-center font-bold uppercase py-0.5 bg-slate-100 text-slate-600">
                        Foto 2: Empratamento
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-24 border border-dashed border-slate-300 rounded flex flex-col items-center justify-center text-slate-400 gap-1 bg-white">
                  <ImageIcon className="h-6 w-6 text-slate-300" />
                  <span className="text-[10px] italic">Sem fotos do prato cadastradas</span>
                </div>
              )}
            </div>
          </div>

          {/* Modo de Fazer / Preparo */}
          <div className="border border-slate-300 rounded overflow-hidden flex-1">
            <div className="bg-slate-800 text-white px-2 py-1 flex items-center justify-between text-[11px] font-bold uppercase">
              <span className="flex items-center gap-1.5">
                <CookingPot className="h-3.5 w-3.5 text-amber-400" />
                Modo de Fazer & Montagem
              </span>
              <span className="text-[10px] text-slate-300">Cozinha</span>
            </div>

            <div className="p-2 bg-white text-[11px] leading-relaxed text-slate-800 min-h-[160px] whitespace-pre-wrap">
              {recipe.notes?.trim() ? (
                recipe.notes.trim()
              ) : (
                <span className="text-slate-400 italic">
                  Nenhuma instrução de modo de preparo informada nesta ficha.
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Rodapé da folha de impressão */}
      <div className="mt-3 pt-1 border-t border-slate-300 flex items-center justify-between text-[9px] text-slate-400">
        <span>Sistema de Controle de Fichas Técnicas • Gestão Gastronômica</span>
        <span>Folha Única de Produção • Cozinha & Salão</span>
      </div>
    </div>
  )
}
