// Simulador financeiro. Lucro ≠ faturamento. Todas as premissas e fórmulas são devolvidas junto com os números.
import { toNum, isNum, div } from "./metrics.js";

const n0 = (v) => { const x = toNum(v); return x === null ? 0 : x; }; // custo/ taxa não informado = 0 SOMENTE aqui, e sinalizado nas premissas

/**
 * Economia unitária do produto (por comprador).
 * Premissas: reembolso reduz a receita; taxas (%) e impostos (%) incidem sobre a receita recebida após reembolso;
 * taxa fixa e custo variável são por venda.
 */
export function economiaUnitaria(e) {
  const erros = [];
  const preco = toNum(e.preco);
  for (const k of ["preco", "receita_adicional_media", "reembolso_pct", "taxas_pct", "taxa_fixa", "impostos_pct", "custo_variavel", "lucro_desejado"]) {
    const v = toNum(e[k]); if (Number.isNaN(v) || (v !== null && v < 0)) erros.push(`${k}: valor inválido`);
  }
  for (const k of ["reembolso_pct", "taxas_pct", "impostos_pct"]) { const v = toNum(e[k]); if (isNum(v) && v > 100) erros.push(`${k}: máximo 100`); }
  if (!isNum(preco) || preco <= 0) erros.push("preco é obrigatório e deve ser maior que zero");
  if (erros.length) return { ok: false, erros };

  const adicional = n0(e.receita_adicional_media), reemb = n0(e.reembolso_pct), taxasPct = n0(e.taxas_pct), taxaFixa = n0(e.taxa_fixa), imp = n0(e.impostos_pct), custo = n0(e.custo_variavel);
  const receitaBruta = preco + adicional;
  const reembolso = receitaBruta * (reemb / 100);
  const receitaLiquida = receitaBruta - reembolso;
  const taxas = receitaLiquida * (taxasPct / 100) + taxaFixa;
  const impostos = receitaLiquida * (imp / 100);
  const margem = receitaLiquida - taxas - impostos - custo;
  const lucroDesejado = toNum(e.lucro_desejado);
  const cpaMax = margem;
  const cpaAlvo = isNum(lucroDesejado) ? margem - lucroDesejado : null;
  const roasEq = div(receitaBruta, cpaMax);
  const roasAlvo = isNum(cpaAlvo) ? div(receitaBruta, cpaAlvo) : null;
  const naoInformados = ["custo_variavel", "taxas_pct", "taxa_fixa", "impostos_pct", "reembolso_pct"].filter((k) => toNum(e[k]) === null);
  return {
    ok: true,
    ticket_medio: receitaBruta, receita_adicional: adicional, receita_bruta: receitaBruta, reembolso_estimado: reembolso, receita_por_comprador: receitaLiquida,
    taxas, impostos, custo_variavel: custo, margem_contribuicao: margem, margem_pct: div(margem, receitaBruta) === null ? null : (margem / receitaBruta) * 100,
    cpa_maximo: cpaMax, cpa_alvo: cpaAlvo, roas_equilibrio: roasEq, roas_alvo: roasAlvo, viavel: margem > 0,
    formulas: [
      `Receita bruta por comprador = preço + receita adicional = ${fmt(preco)} + ${fmt(adicional)} = ${fmt(receitaBruta)}`,
      `Receita por comprador (após reembolso) = receita bruta × (1 − reembolso%) = ${fmt(receitaLiquida)}`,
      `Taxas = receita após reembolso × taxas% + taxa fixa = ${fmt(taxas)}; Impostos = receita após reembolso × impostos% = ${fmt(impostos)}`,
      `Margem de contribuição = receita após reembolso − taxas − impostos − custo variável = ${fmt(margem)}`,
      `CPA máximo (equilíbrio) = margem de contribuição = ${fmt(cpaMax)}`,
      isNum(cpaAlvo) ? `CPA alvo = margem − lucro desejado por venda (${fmt(lucroDesejado)}) = ${fmt(cpaAlvo)}` : "CPA alvo: informe o lucro desejado por venda para calculá-lo.",
      `ROAS de equilíbrio = receita bruta ÷ CPA máximo = ${isNum(roasEq) ? roasEq.toFixed(2) : "indefinido"}`,
    ],
    premissas: [
      "Reembolso reduz a receita; taxas e impostos incidem sobre a receita recebida (após reembolso).",
      "Receita adicional (bumps/upsells) é a média por comprador informada.",
      ...(naoInformados.length ? [`Não informados e tratados como 0 neste cálculo: ${naoInformados.join(", ")} — confirme antes de decidir.`] : []),
      "Faturamento NÃO é lucro: o lucro considera custos, taxas, impostos, reembolsos e o gasto em mídia.",
    ],
    avisos: margem <= 0 ? ["Margem de contribuição ≤ 0: cada venda não cobre seus custos; não existe CPA que dê lucro. Revise preço, custos ou oferta."] : [],
  };
}
const fmt = (v) => (isNum(v) ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—");

/**
 * Cenários de orçamento. ASSUME CPA CONSTANTE (aumentar verba não garante desempenho proporcional).
 * variacoes: percentuais (ex.: [20, 30, 50, -20]); piora_cpa_pct opcional aplica uma deterioração hipotética.
 */
export function cenariosOrcamento({ orcamento_atual, cpa_atual, economia, variacoes = [20, 30, 50], piora_cpa_pct = 0 }) {
  const orc = toNum(orcamento_atual), cpa = toNum(cpa_atual);
  const erros = [];
  if (!isNum(orc) || orc <= 0) erros.push("orcamento_atual é obrigatório e maior que zero");
  if (!isNum(cpa) || cpa <= 0) erros.push("cpa_atual é obrigatório e maior que zero");
  if (!economia?.ok) erros.push("economia unitária inválida");
  const piora = n0(piora_cpa_pct);
  if (piora < 0) erros.push("piora_cpa_pct não pode ser negativa");
  for (const v of variacoes) if (!Number.isFinite(Number(v)) || Number(v) <= -100) erros.push(`variação inválida: ${v}`);
  if (erros.length) return { ok: false, erros };

  const linhas = [{ rotulo: "Atual", variacao_pct: 0 }, ...variacoes.map((v) => ({ rotulo: v >= 0 ? `+${v}%` : `${v}%`, variacao_pct: Number(v) }))].map((l) => {
    const novo = orc * (1 + l.variacao_pct / 100);
    const cpaCenario = cpa * (1 + (l.variacao_pct === 0 ? 0 : piora) / 100);
    const vendas = novo / cpaCenario;
    const receitaBruta = vendas * economia.receita_bruta;
    const margemTotal = vendas * economia.margem_contribuicao;
    const lucro = margemTotal - novo;
    return { ...l, orcamento: novo, cpa: cpaCenario, vendas, receita_bruta: receitaBruta, margem_contribuicao_total: margemTotal, lucro, roas: div(receitaBruta, novo), no_lucro: cpaCenario <= economia.cpa_maximo };
  });
  const limitePiora = (economia.cpa_maximo / cpa - 1) * 100;
  return {
    ok: true, linhas,
    limite_piora_cpa_pct: limitePiora,
    premissas: [
      piora > 0 ? `Cenários com orçamento maior assumem CPA ${piora}% pior (hipótese informada).` : "Assume CPA CONSTANTE em todos os cenários: aumentar o orçamento não garante desempenho proporcional — o CPA tende a subir com a escala.",
      "Lucro = vendas × margem de contribuição − orçamento de mídia (considera taxas, impostos, reembolso e custo variável).",
      "Orçamento e resultado referem-se ao mesmo período (ex.: dia ou mês).",
    ],
    formulas: [`Vendas = orçamento ÷ CPA`, `Receita bruta = vendas × (preço + receita adicional)`, `Lucro = vendas × margem de contribuição − orçamento`, `Folga de CPA até o equilíbrio = CPA máximo ÷ CPA atual − 1 = ${limitePiora.toFixed(1)}%`],
    avisos: limitePiora < 0 ? ["O CPA atual já está acima do CPA máximo (equilíbrio): cada venda gera prejuízo."] : [],
  };
}

/** Projeção de escala em degraus diários compostos, com decaimento opcional de eficiência (CPA piora a cada degrau). */
export function projecaoEscala({ orcamento_inicial, degrau_pct, dias, cpa, economia, decaimento_cpa_pct_por_degrau = 0 }) {
  const o = toNum(orcamento_inicial), g = toNum(degrau_pct), d = toNum(dias), c = toNum(cpa), dec = n0(decaimento_cpa_pct_por_degrau);
  const erros = [];
  if (!isNum(o) || o <= 0) erros.push("orcamento_inicial inválido");
  if (!isNum(g) || g < 0 || g > 200) erros.push("degrau_pct inválido (0 a 200)");
  if (!isNum(d) || d < 1 || d > 60 || !Number.isInteger(d)) erros.push("dias deve ser inteiro entre 1 e 60");
  if (!isNum(c) || c <= 0) erros.push("cpa inválido");
  if (!economia?.ok) erros.push("economia unitária inválida");
  if (erros.length) return { ok: false, erros };
  const linhas = []; let orc = o, cp = c, lucroAc = 0, gastoAc = 0;
  for (let i = 1; i <= d; i++) {
    if (i > 1) { orc *= 1 + g / 100; cp *= 1 + dec / 100; }
    const vendas = orc / cp, lucro = vendas * economia.margem_contribuicao - orc;
    lucroAc += lucro; gastoAc += orc;
    linhas.push({ dia: i, orcamento: orc, cpa: cp, vendas, lucro, lucro_acumulado: lucroAc, no_lucro: cp <= economia.cpa_maximo });
  }
  const primeiroPrejuizo = linhas.find((l) => !l.no_lucro)?.dia ?? null;
  return { ok: true, linhas, gasto_total: gastoAc, lucro_total: lucroAc, primeiro_dia_cpa_acima_do_equilibrio: primeiroPrejuizo,
    premissas: [dec > 0 ? `CPA piora ${dec}% a cada degrau (hipótese).` : "CPA constante em toda a projeção (hipótese otimista: raramente se confirma em escala).", "Degraus compostos: o orçamento cresce o percentual informado a cada dia."] };
}
