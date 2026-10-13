import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { diagnosticar } from "../lib/rules.js";
import { CONFIG_PADRAO } from "../lib/config-defaults.js";

const cfg = CONFIG_PADRAO.map((c) => ({ ...c, id: `${c.tipo_funil}.${c.chave}` }));
const camp = (o = {}) => ({ id: "cmp_1", tipo_funil: "low_ticket", data_inicio: "2026-03-01", cpa_alvo: 30, ...o });
let n = 0;
const ana = (o = {}) => ({ id: `ana_${++n}`, periodo_inicio: "2026-03-01", periodo_fim: "2026-03-04", ...o });
// funil saudável por padrão
const FUNIL = { impressoes: 100000, cliques: 1800, cliques_link: 1500, visitas_pagina: 1350, inicios_checkout: 300 };
const run = (campanha, analise, historico = []) => diagnosticar({ campanha, analise, historico, configs: cfg });
const acoes = (r) => r.acoes.map((a) => a.tipo);

describe("LOW TICKET", () => {
  test("sem investimento → dados insuficientes (não assume zero)", () => {
    const r = run(camp(), ana({ compras: 3 }));
    assert.equal(r.situacao, "insuficiente"); assert.equal(r.qualidade_dados.nivel, "insuficiente");
  });
  test("sem CPA alvo → insuficiente e pede a meta", () => {
    const r = run(camp({ cpa_alvo: null }), ana({ investimento: 200, compras: 3 }));
    assert.equal(r.situacao, "insuficiente"); assert.match(r.recomendacao.texto, /CPA alvo/);
  });
  test("compras não informadas (null) NÃO é o mesmo que zero compras", () => {
    const r = run(camp(), ana({ investimento: 200, ...FUNIL }));
    assert.equal(r.situacao, "insuficiente"); assert.notEqual(r.recomendacao.acao, "pausar");
  });
  test("janela de teste incompleta → continuar teste, sem concluir", () => {
    const r = run(camp(), ana({ periodo_fim: "2026-03-02", investimento: 40, compras: 0, ...FUNIL }));
    assert.equal(r.recomendacao.acao, "continuar_teste"); assert.equal(r.situacao, "insuficiente");
    assert.match(r.recomendacao.texto, /faltam/);
  });
  test("zero vendas após a janela → pausar (crítica) e registra hipótese", () => {
    const r = run(camp(), ana({ investimento: 120, compras: 0, ...FUNIL }));
    assert.equal(r.recomendacao.acao, "pausar"); assert.equal(r.situacao, "critica");
    assert.ok(r.justificativa.some((j) => j.regra === "LOW-ZERO" && j.nivel === "conclusao"));
  });
  test("zero vendas com connect rate baixo → corrigir rastreio antes de culpar o criativo", () => {
    const r = run(camp(), ana({ investimento: 120, compras: 0, ...FUNIL, visitas_pagina: 600 }));
    assert.equal(r.recomendacao.acao, "corrigir_rastreio"); assert.equal(r.recomendacao.nivel_evidencia, "hipotese");
    assert.ok(acoes(r).includes("pausar"));
  });
  test("1 compra → continuar teste e alerta que a amostra é pequena", () => {
    const r = run(camp(), ana({ investimento: 100, compras: 1, ...FUNIL }));
    assert.equal(r.recomendacao.acao, "continuar_teste"); assert.ok(r.avisos.some((a) => /1 compra/.test(a)));
  });
  test("2–3 compras com CPA na meta → manter em teste, sem escalar", () => {
    const r = run(camp(), ana({ investimento: 80, compras: 3, receita: 141, ...FUNIL }));
    assert.equal(r.recomendacao.acao, "continuar_teste"); assert.ok(!acoes(r).some((a) => a.startsWith("escalar")));
  });
  test("recorrência abaixo da meta → pré-escala horizontal; vertical bloqueada por falta de dados", () => {
    const r = run(camp(), ana({ investimento: 130, compras: 5, receita: 235, ...FUNIL }));
    assert.equal(r.recomendacao.acao, "escalar_horizontal");
    assert.ok(r.justificativa.some((j) => j.regra === "ESCALA-BLOQUEADA"));
    assert.ok(!acoes(r).includes("escalar_vertical"));
  });
  test("nunca recomenda escala vertical sem dados suficientes (poucas compras e 1 análise)", () => {
    const r = run(camp(), ana({ investimento: 130, compras: 7, receita: 329, ...FUNIL }));
    assert.notEqual(r.recomendacao.acao, "escalar_vertical");
  });
  test("escala vertical só com compras, estabilidade e histórico", () => {
    const h = [ana({ id: "a1", periodo_inicio: "2026-03-01", periodo_fim: "2026-03-04", investimento: 130, compras: 5, ...FUNIL }), ana({ id: "a2", periodo_inicio: "2026-03-05", periodo_fim: "2026-03-08", investimento: 140, compras: 6, ...FUNIL })];
    const r = run(camp(), ana({ id: "a3", periodo_inicio: "2026-03-09", periodo_fim: "2026-03-12", investimento: 150, compras: 7, receita: 880, ...FUNIL }), h);
    assert.equal(r.recomendacao.acao, "escalar_vertical");
    assert.ok(r.estimativas.degrau_sugerido_pct >= 20 && r.estimativas.degrau_sugerido_pct <= 50);
  });
  test("CPA na meta com métricas secundárias fracas → preserva e avisa (não mexe)", () => {
    const r = run(camp(), ana({ investimento: 80, compras: 3, ...FUNIL, cliques_link: 400, cliques: 500 }));
    assert.notEqual(r.situacao, "critica"); assert.ok(r.avisos.some((a) => /preserve/.test(a)));
  });
  test("CPA acima da meta com checkout fraco → gargalo é hipótese e aponta revisar checkout", () => {
    const r = run(camp(), ana({ investimento: 300, compras: 5, ...FUNIL, inicios_checkout: 300 }));
    assert.equal(r.gargalo.etapa, "checkout_compra"); assert.equal(r.gargalo.nivel_evidencia, "hipotese");
  });
  test("oscilação de uma única análise não derruba campanha saudável", () => {
    const h = [ana({ id: "a1", periodo_fim: "2026-03-04", investimento: 120, compras: 6, ...FUNIL })];
    const r = run(camp(), ana({ id: "a2", periodo_inicio: "2026-03-05", periodo_fim: "2026-03-08", investimento: 200, compras: 4, ...FUNIL }), h);
    // acumulado: 320/10 = 32 (> 30) mas o período anterior estava dentro → oscilação
    assert.ok(["manter", "continuar_teste"].includes(r.recomendacao.acao), r.recomendacao.acao);
    assert.notEqual(r.situacao, "critica");
  });
  test("CPA acima da meta por 2 análises seguidas → reduzir orçamento em degraus", () => {
    const h = [ana({ id: "a1", periodo_fim: "2026-03-04", investimento: 200, compras: 5, ...FUNIL })];
    const r = run(camp(), ana({ id: "a2", periodo_inicio: "2026-03-05", periodo_fim: "2026-03-08", investimento: 220, compras: 5, ...FUNIL }), h);
    assert.equal(r.recomendacao.acao, "reduzir_orcamento");
  });
  test("CPA muito acima, por 3 análises → pausar", () => {
    const mk = (id, ini, fim) => ana({ id, periodo_inicio: ini, periodo_fim: fim, investimento: 300, compras: 5, ...FUNIL });
    const r = run(camp(), mk("a3", "2026-03-09", "2026-03-12"), [mk("a1", "2026-03-01", "2026-03-04"), mk("a2", "2026-03-05", "2026-03-08")]);
    assert.equal(r.recomendacao.acao, "pausar"); assert.equal(r.situacao, "critica");
  });
  test("ROAS abaixo do alvo mesmo com CPA na meta → atenção e revisar oferta", () => {
    const r = run(camp({ roas_alvo: 3 }), ana({ investimento: 100, compras: 4, receita: 188, ...FUNIL }));
    assert.equal(r.situacao, "atencao"); assert.ok(acoes(r).includes("revisar_oferta"));
  });
  test("divisão por zero e campos vazios não geram NaN/Infinity no resultado", () => {
    const r = run(camp(), ana({ investimento: 100, compras: 0, impressoes: 0, cliques: 0, cliques_link: 0, visitas_pagina: 0, inicios_checkout: 0 }));
    assert.ok(!/NaN|Infinity/.test(JSON.stringify(r)));
  });
  test("sobreposição de períodos gera aviso", () => {
    const h = [ana({ id: "a1", investimento: 100, compras: 3, ...FUNIL })];
    const r = run(camp(), ana({ id: "a2", investimento: 100, compras: 3, ...FUNIL }), h);
    assert.ok(r.avisos.some((a) => /sobrep/.test(a)));
  });
  test("análise anulada não entra no acumulado", () => {
    const h = [{ ...ana({ id: "a1", investimento: 5000, compras: 0 }), status: "anulada" }];
    const r = run(camp(), ana({ id: "a2", periodo_inicio: "2026-03-05", periodo_fim: "2026-03-08", investimento: 100, compras: 5, ...FUNIL }), h);
    assert.equal(r.acumulado.investimento, 100);
  });
});

describe("conversão não informada (não distorce o acumulado)", () => {
  test("período atual sem compras → insuficiente, mesmo havendo histórico com compras", () => {
    const h = [ana({ id: "a1", periodo_fim: "2026-03-04", investimento: 130, compras: 5, ...FUNIL })];
    const r = run(camp(), ana({ id: "a2", periodo_inicio: "2026-03-05", periodo_fim: "2026-03-09", investimento: 200, ...FUNIL }), h);
    assert.equal(r.situacao, "insuficiente"); assert.equal(r.recomendacao.acao, "continuar_teste"); assert.ok(r.regras.includes("DADOS-CONVERSAO"));
  });
  test("análise ANTERIOR sem compras é excluída do acumulado (e avisado)", () => {
    const h = [ana({ id: "a1", periodo_fim: "2026-03-04", investimento: 5000, ...FUNIL })];
    const r = run(camp(), ana({ id: "a2", periodo_inicio: "2026-03-05", periodo_fim: "2026-03-09", investimento: 130, compras: 5, receita: 470, ...FUNIL }), h);
    assert.equal(r.acumulado.investimento, 130); assert.ok(r.avisos.some((a) => /excluída/.test(a)));
  });
  test("zero explícito continua valendo como zero", () => {
    const r = run(camp(), ana({ investimento: 120, compras: 0, ...FUNIL }));
    assert.equal(r.recomendacao.acao, "pausar");
  });
  test("leads: período sem leads informados → insuficiente", () => {
    const r = run(camp({ tipo_funil: "medio_ticket", modelo_funil: "leads", cpl_alvo: 10, cpa_alvo: null }), ana({ investimento: 500, ...FUNIL }));
    assert.equal(r.situacao, "insuficiente"); assert.ok(r.regras.includes("DADOS-CONVERSAO"));
  });
});

describe("MÉDIO TICKET", () => {
  const C = (o = {}) => camp({ tipo_funil: "medio_ticket", modelo_funil: "pagina", cpa_alvo: 150, ...o });
  test("gasto < 1 CPA e sem vendas → aguardar", () => {
    const r = run(C(), ana({ investimento: 100, compras: 0, ...FUNIL }));
    assert.equal(r.recomendacao.acao, "continuar_teste"); assert.equal(r.situacao, "insuficiente");
  });
  test("1,5–2x sem venda e sinais fracos → pausar", () => {
    const r = run(C(), ana({ investimento: 260, compras: 0, ...FUNIL, cliques_link: 600, cliques: 700, inicios_checkout: 5 }));
    assert.equal(r.recomendacao.acao, "pausar");
  });
  test("sem vendas e sinais NÃO informados → não pausa (não dá para concluir)", () => {
    const r = run(C(), ana({ investimento: 260, compras: 0 }));
    assert.notEqual(r.recomendacao.acao, "pausar"); assert.match(r.recomendacao.texto, /não dá para concluir|Informe/);
  });
  test("1 venda dentro do CPA não basta para escalar", () => {
    const r = run(C(), ana({ investimento: 140, compras: 1, ...FUNIL }));
    assert.equal(r.recomendacao.acao, "continuar_teste");
  });
  test("vendas recorrentes dentro da meta → pré-escala", () => {
    const r = run(C(), ana({ investimento: 400, compras: 3, receita: 1200, ...FUNIL }));
    assert.ok(["escalar_horizontal", "escalar_vertical"].includes(r.recomendacao.acao));
  });
  test("VSL avalia play e CTA", () => {
    const r = run(C({ modelo_funil: "vsl" }), ana({ investimento: 450, compras: 2, ...FUNIL, plays_video: 100, cliques_cta: 5 }), []);
    assert.ok(r.etapas.some((e) => e.id === "play") && r.etapas.some((e) => e.id === "cta"));
  });
  test("quiz avalia conclusão", () => {
    const r = run(C({ modelo_funil: "quiz" }), ana({ investimento: 450, compras: 2, ...FUNIL, quiz_inicios: 100, quiz_conclusoes: 40 }));
    assert.ok(r.etapas.some((e) => e.id === "quiz"));
  });
  test("campanha de LEADS não usa CPA de compra: usa CPL e exige qualidade antes de escalar", () => {
    const r = run(C({ modelo_funil: "leads", cpl_alvo: 10, cpa_alvo: null }), ana({ investimento: 500, leads: 70, ...FUNIL }));
    assert.equal(r.metrica_mae.id, "cpl"); assert.ok(r.avisos.some((a) => /CPA de compra não é aplicado/.test(a)));
    assert.equal(r.recomendacao.acao, "manter"); assert.ok(r.justificativa.some((j) => j.regra === "LEAD-SEM-QUALIDADE"));
  });
  test("leads: CPL bom com qualificação abaixo do mínimo configurado → ajustar segmentação", () => {
    const c2 = cfg.map((x) => (x.id === "medio_ticket.taxa_qualificacao_min_pct" ? { ...x, valor: 30 } : x));
    const r = diagnosticar({ campanha: C({ modelo_funil: "leads", cpl_alvo: 10, cpa_alvo: null }), analise: ana({ investimento: 500, leads: 70, leads_qualificados: 5, ...FUNIL }), configs: c2 });
    assert.equal(r.recomendacao.acao, "ajustar_segmentacao");
  });
  test("comercial: usa CAC com custo comercial", () => {
    const r = run(C({ modelo_funil: "comercial", cac_alvo: 400, cpa_alvo: null }), ana({ investimento: 1500, custo_comercial: 600, leads: 100, leads_qualificados: 40, vendas_comercial: 6, ...FUNIL }));
    assert.equal(r.metrica_mae.id, "cac"); assert.equal(r.metrica_mae.valor, 350); assert.equal(r.recomendacao.acao, "manter");
  });
});

describe("HIGH TICKET", () => {
  const H = (o = {}) => camp({ tipo_funil: "high_ticket", cac_alvo: 1500, cpa_alvo: null, ciclo_venda_dias: 30, ...o });
  test("dentro do ciclo, sem vendas → NÃO é veredito (baixo volume ≠ ineficiência)", () => {
    const r = run(H(), ana({ periodo_fim: "2026-03-12", investimento: 4000, leads: 40, leads_qualificados: 8, vendas_comercial: 0, ...FUNIL }));
    assert.equal(r.situacao, "insuficiente"); assert.equal(r.recomendacao.acao, "continuar_teste");
    assert.ok(r.justificativa.some((j) => j.regra === "HIGH-CICLO"));
  });
  test("dentro do ciclo, mas leads suficientes e zero qualificados → age antes da venda", () => {
    const r = run(H(), ana({ periodo_fim: "2026-03-12", investimento: 4000, leads: 60, leads_qualificados: 0, vendas_comercial: 0 }));
    assert.equal(r.recomendacao.acao, "ajustar_segmentacao"); assert.equal(r.situacao, "atencao");
  });
  test("ciclo cumprido, poucos dados → baixo volume, não ineficiente", () => {
    const r = run(H(), ana({ periodo_inicio: "2026-03-01", periodo_fim: "2026-04-05", investimento: 1500, leads: 20, vendas_comercial: 0 }));
    assert.equal(r.situacao, "insuficiente");
  });
  test("ciclo cumprido, gasto relevante e nenhuma venda → ineficiente (crítica)", () => {
    const r = run(H(), ana({ periodo_inicio: "2026-03-01", periodo_fim: "2026-04-05", investimento: 3600, leads: 120, leads_qualificados: 30, agendamentos: 20, comparecimentos: 12, vendas_comercial: 0 }));
    assert.equal(r.situacao, "critica");
  });
  test("CAC acima da meta localiza o gargalo no comercial usando metas configuradas", () => {
    const c2 = cfg.map((x) => (x.id === "high_ticket.taxa_fechamento_min_pct" ? { ...x, valor: 25 } : x));
    const r = diagnosticar({ campanha: H(), analise: ana({ periodo_inicio: "2026-03-01", periodo_fim: "2026-04-05", investimento: 6000, custo_comercial: 1000, leads: 100, leads_qualificados: 40, agendamentos: 25, comparecimentos: 20, vendas_comercial: 2 }), configs: c2 });
    assert.equal(r.gargalo.etapa, "fechamento"); assert.equal(r.recomendacao.acao, "melhorar_processo_comercial");
    assert.equal(r.metrica_mae.valor, 3500);
  });
  test("metas de etapa não configuradas → avisa e não inventa gargalo", () => {
    const r = run(H(), ana({ periodo_inicio: "2026-03-01", periodo_fim: "2026-04-05", investimento: 6000, leads: 100, leads_qualificados: 40, agendamentos: 25, comparecimentos: 20, vendas_comercial: 2 }));
    assert.equal(r.gargalo, null); assert.ok(r.avisos.some((a) => /não configurada/.test(a)));
  });
  test("sem ciclo informado → avisa", () => {
    const r = run(H({ ciclo_venda_dias: null }), ana({ investimento: 1000, vendas_comercial: 0 }));
    assert.ok(r.avisos.some((a) => /ciclo/i.test(a)));
  });
  test("CAC na meta com poucas vendas → manter, não escalar", () => {
    const r = run(H(), ana({ periodo_inicio: "2026-03-01", periodo_fim: "2026-04-05", investimento: 2800, leads: 80, vendas_comercial: 2 }));
    assert.equal(r.recomendacao.acao, "manter");
  });
});

describe("LANÇAMENTO", () => {
  const L = (o = {}) => camp({ tipo_funil: "lancamento", data_inicio: "2026-03-01", data_fim: "2026-03-14", cpl_alvo: 3.5, meta_leads: 10000, cac_alvo: 200, meta_conversoes: 200, cpa_alvo: null, fase_lancamento: "captacao", ...o });
  test("sem fase → insuficiente", () => { assert.equal(run(L({ fase_lancamento: null }), ana({ investimento: 100 })).situacao, "insuficiente"); });
  test("captação: ritmo abaixo + CPL ok → aumentar verba com controle (após 3 dias)", () => {
    const r = run(L(), ana({ periodo_fim: "2026-03-06", investimento: 9000, leads: 3000 }));
    assert.equal(r.recomendacao.acao, "escalar_vertical");
    assert.ok(r.estimativas.leads_por_dia_necessarios > 0);
  });
  test("captação: ritmo abaixo + CPL ruim → corrigir antes de escalar", () => {
    const r = run(L(), ana({ periodo_fim: "2026-03-06", investimento: 14000, leads: 3000 }));
    assert.equal(r.recomendacao.acao, "novos_criativos"); assert.equal(r.situacao, "critica");
  });
  test("captação: dentro do plano → manter", () => {
    const r = run(L(), ana({ periodo_fim: "2026-03-07", investimento: 8000, leads: 5000 }));
    assert.equal(r.recomendacao.acao, "manter");
  });
  test("captação: adiantado e caro → reduzir marginal", () => {
    const r = run(L(), ana({ periodo_fim: "2026-03-07", investimento: 30000, leads: 7500 }));
    assert.equal(r.recomendacao.acao, "reduzir_orcamento");
  });
  test("captação sem meta de leads/datas → pede configuração", () => {
    const r = run(L({ meta_leads: null }), ana({ investimento: 1000, leads: 100 }));
    assert.equal(r.situacao, "insuficiente");
  });
  test("aquecimento sem meta de presença → informa e não julga", () => {
    const r = run(L({ fase_lancamento: "aquecimento" }), ana({ investimento: 1000, inscricoes: 1000, comparecimentos: 300 }));
    assert.equal(r.situacao, "insuficiente"); assert.match(r.recomendacao.texto, /taxa_presenca_min_pct/);
  });
  test("carrinho: vendas abaixo e CAC ruim → não resolver só com verba", () => {
    const r = run(L({ fase_lancamento: "carrinho" }), ana({ periodo_fim: "2026-03-20", investimento: 40000, compras: 100, ...FUNIL }));
    assert.ok(/verba|oferta/i.test(r.recomendacao.texto));
  });
  test("carrinho: sem vendas → crítica", () => {
    const r = run(L({ fase_lancamento: "carrinho" }), ana({ periodo_fim: "2026-03-20", investimento: 5000, compras: 0, ...FUNIL }));
    assert.equal(r.situacao, "critica");
  });
  test("consolidado → conclusão e registrar aprendizado", () => {
    const r = run(L({ fase_lancamento: "consolidado", roas_alvo: 3 }), ana({ periodo_fim: "2026-03-30", investimento: 30000, compras: 210, receita: 104370, ...FUNIL }));
    assert.equal(r.recomendacao.acao, "registrar_aprendizado"); assert.equal(r.recomendacao.nivel_evidencia, "conclusao"); assert.equal(r.situacao, "normal");
  });
});

describe("Propriedades gerais do motor", () => {
  test("toda recomendação traz justificativa, verificações e nível de evidência válido", () => {
    const casos = [
      [camp(), ana({ investimento: 120, compras: 0, ...FUNIL })], [camp(), ana({ investimento: 130, compras: 5, receita: 235, ...FUNIL })],
      [camp({ tipo_funil: "medio_ticket", modelo_funil: "pagina", cpa_alvo: 150 }), ana({ investimento: 400, compras: 3, ...FUNIL })],
      [camp({ tipo_funil: "high_ticket", cac_alvo: 1500, ciclo_venda_dias: 30 }), ana({ investimento: 3000, leads: 50 })],
    ];
    for (const [c, a] of casos) {
      const r = run(c, a);
      assert.ok(r.recomendacao && ["recomendacao", "hipotese", "conclusao"].includes(r.recomendacao.nivel_evidencia));
      assert.ok(r.justificativa.length > 0 || r.qualidade_dados.itens.length > 0);
      assert.ok(r.verificar_antes.length > 0, r.recomendacao.acao);
      assert.ok(r.acoes.length > 0); assert.ok(r.regras.length > 0 || r.situacao === "insuficiente");
      assert.ok(!/NaN|Infinity|undefined/.test(JSON.stringify(r)));
    }
  });
  test("determinístico: mesma entrada, mesma saída", () => {
    const a = ana({ investimento: 130, compras: 5, receita: 235, ...FUNIL });
    assert.deepEqual(run(camp(), a), run(camp(), a));
  });
  test("tipo de funil desconhecido lança erro claro", () => { assert.throws(() => run(camp({ tipo_funil: "x" }), ana({})), /não suportado/); });
});
