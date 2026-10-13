import { describe, it } from 'node:test'
import assert from 'node:assert'
const expect=(a)=>({toBe:(b)=>assert.strictEqual(a,b),toEqual:(b)=>assert.deepStrictEqual(a,b),toBeCloseTo:(b)=>assert.ok(Math.abs(a-b)<5e-2),toMatch:(r)=>assert.match(a,r)})
import * as E from '../engine.js'

describe('Low Ticket', () => {
  it('CPA esperado por papel', () => {
    expect(E.cpaEsperadoLow({ ticket: 47, papel: 'lucro' }).min).toBeCloseTo(21.15)
    expect(E.cpaEsperadoLow({ ticket: 100, papel: 'aquisicao' }).max).toBe(80)
  })
  it('cascata de 3 dias', () => {
    expect(E.decidirCriativoLow({ cpaEsperado: 23, vendas: 0, gasto: 69 }).decisao).toBe('DESLIGAR')
    expect(E.decidirCriativoLow({ cpaEsperado: 23, vendas: 1, gasto: 69 }).decisao).toBe('DIAGNOSTICAR')
    expect(E.decidirCriativoLow({ cpaEsperado: 23, vendas: 3, gasto: 69 }).decisao).toBe('MANTER EM TESTE')
    expect(E.decidirCriativoLow({ cpaEsperado: 23, vendas: 4, gasto: 69 }).decisao).toBe('PRÉ-ESCALA')
  })
  it('exemplo do POP: CPA 34 vs 23, CTR 1,8, connect 91, checkout 11% → página/oferta', () => {
    const r = E.diagnosticarLow({ cpaReal: 34, cpaEsperado: 23, ctr: 1.8, connect: 91, paginaCheckout: 11 })
    expect(r.decisao).toBe('REVISAR PÁGINA / OFERTA')
    expect(r.responsaveis).toEqual(['Copy', 'Estratégia'])
  })
  it('CPA bom com métricas feias preserva', () => {
    expect(E.diagnosticarLow({ cpaReal: 20, cpaEsperado: 23, ctr: 0.5 }).decisao).toBe('PRESERVAR')
  })
  it('connect < 80 vem antes de tudo', () => {
    expect(E.diagnosticarLow({ cpaReal: 40, cpaEsperado: 23, ctr: 0.5, connect: 70 }).responsaveis).toEqual(['Tecnologia / Página'])
  })
  it('escala: oscilação de 1 dia só observa', () => {
    expect(E.decidirEscala({ cpaEsperado: 23, cpaSerie: [20, 21, 30] }).decisao).toBe('OBSERVAR')
    expect(E.decidirEscala({ cpaEsperado: 23, cpaSerie: [20, 30, 31] }).decisao).toBe('REDUZIR EM DEGRAUS')
    expect(E.decidirEscala({ cpaEsperado: 23, cpaSerie: [20, 21, 22] }).decisao).toMatch(/^ESCALAR/)
  })
})

describe('Médio / High Ticket', () => {
  it('CAC máximo', () => {
    const e = E.economiaMedio({ ticket: 400, custosVariaveis: 40, custoComercial: 60, margemMinima: 100 }, { folgaSeguranca: 0 })
    expect(e.max).toBe(200)
  })
  it('teste médio por múltiplos do CPA', () => {
    expect(E.lerTesteMedio({ cpaAlvo: 100, gasto: 60, vendas: 0 }).decisao).toBe('AGUARDAR')
    expect(E.lerTesteMedio({ cpaAlvo: 100, gasto: 180, vendas: 0, sinaisFracos: true }).decisao).toBe('PAUSAR')
  })
  it('economia reversa do POP (CAC 1500)', () => {
    const r = E.economiaReversa({ cacMax: 1500, leadVenda: 5, qualVenda: 12, agendVenda: 20, showVenda: 25 })
    expect([r.cplMax, r.cpqlMax, r.custoAgendamentoMax, r.custoComparecimentoMax]).toEqual([75, 180, 300, 375])
  })
  it('high ticket localiza o gargalo', () => {
    const r = E.diagnosticarHighTicket({ gasto: 3000, cacMax: 1500, leads: 100, contatados: 90, qualificados: 10, agendados: 5, compareceram: 4, vendas: 0, metaContato: 80, metaQualificacao: 30, metaAgendamento: 40, metaShow: 60, metaFechamento: 25 })
    expect(r.decisao).toBe('GARGALO: QUALIFICAÇÃO')
  })
})

describe('Lançamento', () => {
  it('projeção reversa', () => {
    const p = E.projecaoLancamento({ metaReceita: 100000, ticket: 500, cacMax: 200, conversoes: { base: 2 }, cplPlanejado: 3 })
    expect(p.vendas).toBe(200)
    expect(p.cenarios[0].leads).toBe(10000)
    expect(p.cenarios[0].cplEconomicoMax).toBe(4)
  })
  it('ritmo × CPL', () => {
    const r = E.ritmoCaptacao({ metaLeads: 1000, leadsAcumulados: 300, diasTotais: 10, diaAtual: 5, cplAtual: 2, cplMeta: 3 })
    expect(r.decisao).toBe('AUMENTAR VERBA COM CONTROLE')
    expect(r.metricas.porDia).toBe(140)
  })
})

describe('Novas regras (POP completo)', () => {
  it('parâmetro provisório de pré-escala é editável', () => {
    expect(E.decidirCriativoLow({ cpaEsperado: 23, vendas: 3, gasto: 60 }).decisao).toBe('MANTER EM TESTE')
    expect(E.decidirCriativoLow({ cpaEsperado: 23, vendas: 3, gasto: 60 }, { preEscalaVendasMin: 3 }).decisao).toBe('PRÉ-ESCALA')
  })
  it('retenção: gancho fraco → Copy; gancho bom + queda → Copy + Estratégia', () => {
    expect(E.diagnosticarLow({ cpaReal: 40, cpaEsperado: 23, retGancho: 'forte' }).responsaveis).toEqual(['Copy'])
    expect(E.diagnosticarLow({ cpaReal: 40, cpaEsperado: 23, retGancho: 'ok', retCriativo: 'queda' }).responsaveis).toEqual(['Copy', 'Estratégia'])
  })
  it('CTR baixo + vendas boas orienta entender o filtro', () => {
    const r = E.diagnosticarLow({ cpaReal: 20, cpaEsperado: 23, ctr: 0.6 })
    expect(r.decisao).toBe('PRESERVAR')
    expect(r.evidencias.join(' ')).toMatch(/qualificados/)
  })
  it('bumps: ticket médio', () => {
    const r = E.economiaBumps({ ticket: 47, cpa: 23.5, bumps: [{ preco: 10, adesao: 30 }, { preco: 20, adesao: 10 }, { preco: 60, adesao: 5 }] })
    expect(r.extra).toBeCloseTo(8)
  })
  it('etapas: primeira abaixo da meta; CPA bom preserva', () => {
    const etapas = [{ nome: 'A', real: 50, meta: 40, area: ['Copy'], acao: 'x' }, { nome: 'B', real: 10, meta: 20, area: ['Estratégia'], acao: 'y' }]
    expect(E.diagnosticarEtapas({ cpaReal: 200, cpaMeta: 100, etapas }).decisao).toBe('GARGALO: B')
    expect(E.diagnosticarEtapas({ cpaReal: 90, cpaMeta: 100, etapas }).decisao).toBe('PRESERVAR')
  })
  it('híbrido separa rotas', () => {
    const r = E.hibrido({ gastoDireto: 1000, vendasDiretas: 10, gastoAssistido: 1000, custoComercial: 200, vendasAssistidas: 2, cpaMax: 150, cacMax: 400 })
    expect(r.decisao).toBe('ROTA ASSISTIDA FORA DA META')
  })
  it('origem cara que compra é preservada; barata e fraca é qualificada', () => {
    const r = E.analiseOrigens([{ origem: 'A', gasto: 2000, leads: 400, vendas: 12, receita: 12000 }, { origem: 'B', gasto: 600, leads: 400, vendas: 1, receita: 1000 }])
    expect(r.linhas[0].status).toBe('PRESERVAR')
    expect(r.linhas[1].status).toBe('QUALIFICAR')
  })
  it('radar de demanda', () => {
    expect(E.radarDemanda({ crescendo: 'nao' }).decisao).toBe('ACOMPANHAR')
    expect(E.radarDemanda({ crescendo: 'sim', intencao: 'sim', solucoes: 'fortes' }).decisao).toBe('BENCHMARK + DIFERENCIAÇÃO')
    expect(E.radarDemanda({ crescendo: 'sim', intencao: 'sim', solucoes: 'poucas' }).decisao).toBe('HIPÓTESE DE PRODUTO')
  })
  it('revisão do portfólio: janela 30–45 dias', () => {
    expect(E.proximaRevisaoPortfolio('2026-01-01', '2026-01-20').estado).toBe('dentro do ciclo')
    expect(E.proximaRevisaoPortfolio('2026-01-01', '2026-02-10').estado).toBe('janela de revisão aberta')
    expect(E.proximaRevisaoPortfolio('2026-01-01', '2026-03-01').estado).toBe('atrasada')
  })
  it('forecast × realizado', () => {
    const r = E.forecastVsRealizado({ plan: { leads: 1000, cpl: 3, conv: 2, ticket: 500 }, real: { leads: 1000, cpl: 4, conv: 2, ticket: 500 } })
    expect(r.premissasErradas).toEqual(['CPL'])
  })
  it('motivos de perda agrupam por área', () => {
    const r = E.analisarMotivosPerda({ semPerfil: 6, preco: 4 }, [{ id: 'semPerfil', label: 'Sem perfil', area: 'Aquisição' }, { id: 'preco', label: 'Preço', area: 'Oferta' }])
    expect(r.porArea[0].area).toBe('Aquisição')
  })
  it('carrinho: CAC marginal e ROAS', () => {
    const r = E.carrinhoAberto({ vendas: 100, metaVendasAteAgora: 100, cac: 150, cacMax: 200, baseLeads: 5000, cliquesOferta: 1500, checkoutIniciado: 400, compras: 160, gastoTotal: 15000, receita: 50000, gastoRecente: 3000, vendasRecentes: 10 })
    expect(r.extras.roas).toBeCloseTo(3.33, 1)
    expect(r.extras.cacMarginal).toBe(300)
  })
})
