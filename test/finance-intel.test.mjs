import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { economiaUnitaria, cenariosOrcamento, projecaoEscala } from "../lib/finance.js";
import { compararAntesDepois, razaoPonderada, totais, padroes, serieTemporal } from "../lib/intel.js";
import { derivar, normalizarBase, toNum, div, soma, avisosConsistencia, acumular } from "../lib/metrics.js";

describe("economia unitária", () => {
  const e = economiaUnitaria({ preco: 100, receita_adicional_media: 20, reembolso_pct: 10, taxas_pct: 5, taxa_fixa: 1, impostos_pct: 6, custo_variavel: 10, lucro_desejado: 15 });
  test("margem, CPA máximo/alvo e ROAS", () => {
    // bruta 120; reembolso 12 → 108; taxas 5,4+1=6,4; impostos 6,48; margem=108-6,4-6,48-10=85,12
    assert.ok(e.ok); assert.ok(Math.abs(e.margem_contribuicao - 85.12) < 1e-9);
    assert.equal(e.cpa_maximo, e.margem_contribuicao); assert.ok(Math.abs(e.cpa_alvo - 70.12) < 1e-9);
    assert.ok(Math.abs(e.roas_equilibrio - 120 / 85.12) < 1e-9); assert.ok(Math.abs(e.roas_alvo - 120 / 70.12) < 1e-9);
    assert.equal(e.ticket_medio, 120); assert.ok(e.formulas.length >= 6);
  });
  test("faturamento não é lucro: margem < receita", () => { assert.ok(e.margem_contribuicao < e.receita_bruta); });
  test("sinaliza custos não informados como tratados em 0", () => {
    const r = economiaUnitaria({ preco: 100 });
    assert.ok(r.premissas.some((p) => /Não informados/.test(p))); assert.equal(r.cpa_alvo, null);
  });
  test("margem ≤ 0 → inviável com aviso", () => {
    const r = economiaUnitaria({ preco: 50, custo_variavel: 60 });
    assert.equal(r.viavel, false); assert.ok(r.avisos.length);
  });
  test("entradas inválidas", () => {
    assert.equal(economiaUnitaria({ preco: 0 }).ok, false);
    assert.equal(economiaUnitaria({ preco: 100, reembolso_pct: 150 }).ok, false);
    assert.equal(economiaUnitaria({ preco: -5 }).ok, false);
    assert.equal(economiaUnitaria({ preco: "abc" }).ok, false);
    assert.equal(economiaUnitaria({}).ok, false);
  });
});

describe("cenários de orçamento", () => {
  const eco = economiaUnitaria({ preco: 100, custo_variavel: 10, taxas_pct: 5 });
  test("+20/+30/+50 com CPA constante, premissa explícita", () => {
    const r = cenariosOrcamento({ orcamento_atual: 1000, cpa_atual: 40, economia: eco, variacoes: [20, 30, 50] });
    assert.ok(r.ok); assert.equal(r.linhas.length, 4);
    const mais20 = r.linhas.find((l) => l.rotulo === "+20%");
    assert.equal(mais20.orcamento, 1200); assert.equal(mais20.vendas, 30);
    assert.ok(r.premissas[0].includes("CPA CONSTANTE"));
    assert.ok(Math.abs(mais20.lucro - (30 * eco.margem_contribuicao - 1200)) < 1e-9);
  });
  test("redução e percentual personalizado", () => {
    const r = cenariosOrcamento({ orcamento_atual: 1000, cpa_atual: 40, economia: eco, variacoes: [-30, 75] });
    assert.equal(r.linhas.find((l) => l.rotulo === "-30%").orcamento, 700); assert.equal(r.linhas.find((l) => l.rotulo === "+75%").orcamento, 1750);
  });
  test("piora hipotética do CPA muda a premissa e reduz o lucro", () => {
    const a = cenariosOrcamento({ orcamento_atual: 1000, cpa_atual: 40, economia: eco, variacoes: [50] });
    const b = cenariosOrcamento({ orcamento_atual: 1000, cpa_atual: 40, economia: eco, variacoes: [50], piora_cpa_pct: 20 });
    assert.ok(b.linhas[1].lucro < a.linhas[1].lucro); assert.ok(/20%/.test(b.premissas[0]));
  });
  test("CPA acima do equilíbrio é sinalizado; divisão por zero/entrada inválida é recusada", () => {
    const r = cenariosOrcamento({ orcamento_atual: 1000, cpa_atual: 200, economia: eco });
    assert.ok(r.avisos.length); assert.equal(r.linhas[0].no_lucro, false);
    assert.equal(cenariosOrcamento({ orcamento_atual: 1000, cpa_atual: 0, economia: eco }).ok, false);
    assert.equal(cenariosOrcamento({ orcamento_atual: 0, cpa_atual: 10, economia: eco }).ok, false);
    assert.equal(cenariosOrcamento({ orcamento_atual: 1000, cpa_atual: 10, economia: eco, variacoes: [-100] }).ok, false);
  });
});

describe("projeção de escala", () => {
  const eco = economiaUnitaria({ preco: 100 });
  test("degraus compostos e decaimento", () => {
    const r = projecaoEscala({ orcamento_inicial: 100, degrau_pct: 20, dias: 3, cpa: 40, economia: eco });
    assert.ok(r.ok); assert.ok(Math.abs(r.linhas[2].orcamento - 144) < 1e-9); assert.ok(/CONSTANTE|constante/.test(r.premissas[0]));
    const d = projecaoEscala({ orcamento_inicial: 100, degrau_pct: 20, dias: 5, cpa: 80, economia: eco, decaimento_cpa_pct_por_degrau: 10 });
    assert.ok(d.primeiro_dia_cpa_acima_do_equilibrio > 1);
  });
  test("validações", () => { assert.equal(projecaoEscala({ orcamento_inicial: 100, degrau_pct: 20, dias: 0, cpa: 40, economia: eco }).ok, false); });
});

describe("métricas: nulo ≠ zero", () => {
  test("derivar", () => {
    const d = derivar({ investimento: 100, impressoes: 10000, cliques: 200, cliques_link: 150, visitas_pagina: 120, inicios_checkout: 30, compras: 3, receita: 300, receita_order_bumps: 30 });
    assert.equal(d.cpm, 10); assert.equal(d.ctr, 2); assert.ok(Math.abs(d.cpa - 33.3333) < 1e-3); assert.equal(d.roas, 3.3); assert.equal(d.taxa_conexao, 80); assert.equal(d.taxa_checkout_compra, 10);
  });
  test("denominador zero/nulo → null, nunca 0 ou Infinity", () => {
    const d = derivar({ investimento: 100, compras: 0, impressoes: 0, cliques: null });
    assert.strictEqual(d.cpa, null); assert.strictEqual(d.cpm, null); assert.strictEqual(d.ctr, null); assert.strictEqual(d.roas, null);
    assert.ok(Object.values(d).every((v) => v === null || typeof v === "boolean" || Number.isFinite(v)));
  });
  test("investimento 0 é diferente de não informado", () => {
    assert.strictEqual(derivar({ investimento: 0, compras: 5 }).cpa, 0); assert.strictEqual(derivar({ investimento: null, compras: 5 }).cpa, null);
  });
  test("toNum", () => { assert.equal(toNum("1.234,56"), 1234.56); assert.equal(toNum("R$ 10,5"), 10.5); assert.equal(toNum(""), null); assert.ok(Number.isNaN(toNum("x"))); assert.equal(toNum(0), 0); });
  test("normalizarBase: negativo e texto inválido viram erro; vazio vira null", () => {
    const r = normalizarBase({ investimento: -1, leads: "abc", compras: "" });
    assert.equal(r.erros.length, 2); assert.strictEqual(r.valores.compras, null);
  });
  test("soma ignora nulos mas devolve null se todos nulos", () => { assert.equal(soma(1, null, 2), 3); assert.strictEqual(soma(null, null), null); assert.strictEqual(div(1, 0), null); });
  test("avisos de consistência", () => { assert.ok(avisosConsistencia({ compras: 5, inicios_checkout: 2 }).length); assert.ok(avisosConsistencia({ comparecimentos: 9, agendamentos: 3 }).length); });
  test("CAC inclui custo comercial só quando informado", () => {
    assert.equal(derivar({ investimento: 100, vendas_comercial: 2, custo_comercial: 50 }).cac, 75);
    const d = derivar({ investimento: 100, vendas_comercial: 2 }); assert.equal(d.cac, 50); assert.equal(d.cac_inclui_custo_comercial, false);
  });
});

describe("antes/depois (histórico)", () => {
  const A = (id, ini, fim, inv, compras, extra = {}) => ({ id, periodo_inicio: ini, periodo_fim: fim, investimento: inv, compras, ...extra });
  test("exemplo do enunciado: CPA 38 → 26 registra melhora sem afirmar causa única", () => {
    const r = compararAntesDepois({ analises: [A("a1", "2026-03-01", "2026-03-07", 380, 10), A("a2", "2026-03-09", "2026-03-15", 260, 10)], dataExecucao: "2026-03-08", tipoFunil: "low_ticket", meta: 30 });
    assert.equal(r.veredito, "melhorou"); assert.equal(r.antes.d.cpa, 38); assert.equal(r.depois.d.cpa, 26);
    assert.equal(r.meta_atingida, true); assert.equal(r.confianca, "alta");
    assert.match(r.texto, /não prova/); assert.ok(r.ressalvas.some((x) => /única causa/.test(x)));
  });
  test("amostra pequena → inconclusivo mesmo com variação grande", () => {
    const r = compararAntesDepois({ analises: [A("a1", "2026-03-01", "2026-03-07", 380, 1), A("a2", "2026-03-09", "2026-03-15", 100, 2)], dataExecucao: "2026-03-08", tipoFunil: "low_ticket" });
    assert.equal(r.veredito, "inconclusivo"); assert.equal(r.confianca, "baixa");
  });
  test("piora é detectada", () => {
    const r = compararAntesDepois({ analises: [A("a1", "2026-03-01", "2026-03-07", 300, 10), A("a2", "2026-03-09", "2026-03-15", 500, 10)], dataExecucao: "2026-03-08", tipoFunil: "low_ticket" });
    assert.equal(r.veredito, "piorou");
  });
  test("variação pequena (±5%) é ruído", () => {
    const r = compararAntesDepois({ analises: [A("a1", "2026-03-01", "2026-03-07", 300, 10), A("a2", "2026-03-09", "2026-03-15", 310, 10)], dataExecucao: "2026-03-08", tipoFunil: "low_ticket" });
    assert.equal(r.veredito, "inconclusivo");
  });
  test("sem análise depois → sem_dados com orientação; anuladas são ignoradas", () => {
    const r = compararAntesDepois({ analises: [A("a1", "2026-03-01", "2026-03-07", 300, 10), { ...A("a2", "2026-03-09", "2026-03-15", 10, 10), status: "anulada" }], dataExecucao: "2026-03-08", tipoFunil: "low_ticket" });
    assert.equal(r.veredito, "sem_dados"); assert.match(r.texto, /DEPOIS/);
  });
  test("lead: usa CPL como métrica principal; ROAS maior é melhor", () => {
    assert.equal(compararAntesDepois({ analises: [], dataExecucao: "2026-03-08", tipoFunil: "medio_ticket", modeloFunil: "leads" }).metrica_mae, "cpl");
  });
});

describe("agregação ponderada e padrões", () => {
  test("CPA agregado é ponderado e ignora análises sem compras informadas", () => {
    const an = [{ investimento: 100, compras: 10 }, { investimento: 900, compras: 30 }, { investimento: 500, compras: null }];
    const t = totais(an);
    assert.equal(t.cpa_agregado.valor, 1000 / 40); // não é a média de 10 e 30 (=20), nem 1500/40
    assert.notEqual(t.cpa_agregado.valor, 20); assert.equal(t.investimento, 1500);
  });
  test("ROAS agregado ponderado", () => { assert.equal(razaoPonderada([{ receita_total: 300, investimento: 100 }, { receita_total: 100, investimento: 100 }], "receita_total", "investimento").valor, 2); });
  test("padrões sinalizam amostra pequena", () => {
    const dec = [{ campanha_id: "c1", tipo_acao: "novos_criativos", desempenho_depois: JSON.stringify({ veredito: "melhorou", delta_pct: -20 }) }, { campanha_id: "c1", tipo_acao: "novos_criativos", desempenho_depois: JSON.stringify({ veredito: "inconclusivo" }) }];
    const p = padroes({ decisoes: dec, campanhas: [{ id: "c1", tipo_funil: "low_ticket" }] });
    assert.equal(p[0].n, 2); assert.equal(p[0].confianca, "baixa"); assert.match(p[0].observacao, /Amostra pequena/);
  });
  test("série temporal mantém lacunas como null", () => {
    const s = serieTemporal([{ periodo_fim: "2026-03-02", cpa: 30 }, { periodo_fim: "2026-03-01", cpa: null }], ["cpa"]);
    assert.equal(s[0].data, "2026-03-01"); assert.strictEqual(s[0].cpa, null);
  });
});
