import { describe, it } from 'node:test'
import assert from 'node:assert'
const expect = (a) => ({ toBe: (b) => assert.strictEqual(a, b), toEqual: (b) => assert.deepStrictEqual(a, b), toBeCloseTo: (b) => assert.ok(Math.abs(a - b) < 1e-2), toMatch: (r) => assert.match(a, r) })

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
    const e = E.economiaMedio({ ticket: 400, custosVariaveis: 40, custoComercial: 60, margemMinima: 100, folgaSeguranca: 0 })
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
