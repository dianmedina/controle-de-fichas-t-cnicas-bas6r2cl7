migrate(
  (app) => {
    // Higieniza registros da coleção 'recipes' que possuem rendimento fracionário
    // gerado por erro de parsing (ex: divisão da massa da batelada pela gramatura da porção
    // na planilha original resultando em 5.625, 10.588, 13.083, 8.75, 17.5, 24.5, 2.5).
    // Na cozinha, o rendimento esperado é um número coerente de porções (ex.: 6, 11, 13, 9, 18, 25, 3).
    // Operação segura e idempotente: no-op se a tabela estiver vazia ou já saneada.
    const records = app.findRecordsByFilter('recipes', 'yield_portions > 0', '', 500, 0)

    for (let i = 0; i < records.length; i++) {
      const rec = records[i]
      const currentYield = rec.getFloat('yield_portions')
      if (currentYield > 0 && Math.abs(currentYield - Math.round(currentYield)) > 0.0001) {
        const rounded = Math.round(currentYield)
        if (rounded >= 1) {
          rec.set('yield_portions', rounded)
          app.save(rec)
        }
      }
    }
  },
  () => {
    // Reversão não é necessária pois trata-se de higienização de dados corrompidos.
  },
)
