// Métricas derivadas — funções puras e isomórficas (navegador + servidor).
// Regra central: "não informado" (null) NUNCA é tratado como zero.
//  - entrada vazia/ausente => null
//  - denominador null, 0 ou negativo => resultado null (indefinido)
//  - taxas em PERCENTUAL (1,8 = 1,8%)

/** Converte entrada em número. null = não informado; NaN = valor inválido. */
export function toNum(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  if (typeof v !== "string") return NaN;
  let s = v.trim().replace(/^R\$\s*/, "").replace(/%$/, "").trim();
  if (s === "") return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", "."); // pt-BR: 1.234,56
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** Divisão segura: null se algum operando não for número ou se o divisor for ≤ 0. */
export function div(a, b) {
  if (!isNum(a) || !isNum(b) || b <= 0) return null;
  return a / b;
}
export const pct = (v) => (isNum(v) ? v * 100 : null);

/** Soma ignorando null; devolve null se TODOS forem null. */
export function soma(...xs) {
  let tem = false, s = 0;
  for (const x of xs) if (isNum(x)) { tem = true; s += x; }
  return tem ? s : null;
}

export const arred = (v, c = 4) => (isNum(v) ? Math.round(v * 10 ** c) / 10 ** c : null);

/** Campos básicos (informados manualmente) das análises. */
export const CAMPOS_BASE = [
  "investimento", "impressoes", "alcance", "cliques", "cliques_link", "visitas_pagina", "visualizacoes_conteudo",
  "leads", "leads_qualificados", "agendamentos", "comparecimentos", "oportunidades", "inscricoes",
  "plays_video", "cliques_cta", "quiz_inicios", "quiz_conclusoes",
  "inicios_checkout", "compras", "vendas_comercial",
  "receita", "receita_order_bumps", "receita_adicional", "custo_comercial",
];

export const CAMPOS_DERIVADOS = [
  "cpm", "cpc", "ctr", "ctr_link", "cpl", "cpql", "custo_agendamento", "cpa", "cac", "roas",
  "total_vendas", "receita_total", "ticket_medio", "frequencia",
  "taxa_conexao", "taxa_visita_checkout", "taxa_checkout_compra", "taxa_visita_compra",
  "taxa_lead_visita", "taxa_qualificacao", "taxa_agendamento", "taxa_comparecimento", "taxa_fechamento",
  "taxa_lead_venda", "taxa_presenca", "taxa_play", "taxa_cta", "taxa_conclusao_quiz",
];

/**
 * Calcula as métricas derivadas a partir dos campos básicos.
 * CAC = (investimento + custo_comercial informado) / total de vendas.
 * `cac_inclui_custo_comercial` indica se o custo comercial entrou na conta.
 */
export function derivar(b) {
  const inv = b.investimento;
  const total = soma(b.compras, b.vendas_comercial);
  const receitaTotal = soma(b.receita, b.receita_order_bumps, b.receita_adicional);
  const custoBase = isNum(inv) ? inv + (isNum(b.custo_comercial) ? b.custo_comercial : 0) : null;
  const d = {
    cpm: isNum(div(inv, b.impressoes)) ? div(inv, b.impressoes) * 1000 : null,
    cpc: div(inv, b.cliques),
    ctr: pct(div(b.cliques, b.impressoes)),
    ctr_link: pct(div(b.cliques_link, b.impressoes)),
    frequencia: div(b.impressoes, b.alcance),
    cpl: div(inv, b.leads),
    cpql: div(inv, b.leads_qualificados),
    custo_agendamento: div(inv, b.agendamentos),
    cpa: div(inv, b.compras),
    cac: div(custoBase, total),
    total_vendas: total,
    receita_total: receitaTotal,
    roas: div(receitaTotal, inv),
    ticket_medio: div(receitaTotal, total),
    taxa_conexao: pct(div(b.visitas_pagina, b.cliques_link)),
    taxa_visita_checkout: pct(div(b.inicios_checkout, b.visitas_pagina)),
    taxa_checkout_compra: pct(div(b.compras, b.inicios_checkout)),
    taxa_visita_compra: pct(div(b.compras, b.visitas_pagina)),
    taxa_lead_visita: pct(div(b.leads, b.visitas_pagina)),
    taxa_qualificacao: pct(div(b.leads_qualificados, b.leads)),
    taxa_agendamento: pct(div(b.agendamentos, b.leads_qualificados)),
    taxa_comparecimento: pct(div(b.comparecimentos, b.agendamentos)),
    taxa_fechamento: pct(div(b.vendas_comercial, b.comparecimentos)),
    taxa_lead_venda: pct(div(b.vendas_comercial, b.leads)),
    taxa_presenca: pct(div(b.comparecimentos, b.inscricoes)),
    taxa_play: pct(div(b.plays_video, b.visitas_pagina)),
    taxa_cta: pct(div(b.cliques_cta, b.plays_video)),
    taxa_conclusao_quiz: pct(div(b.quiz_conclusoes, b.quiz_inicios)),
  };
  for (const k of Object.keys(d)) d[k] = arred(d[k]);
  d.cac_inclui_custo_comercial = isNum(inv) && isNum(b.custo_comercial);
  return d;
}

/** Normaliza campos básicos: devolve {valores, erros}. Negativos e textos inválidos são erros. */
export function normalizarBase(entrada) {
  const valores = {}, erros = [];
  for (const k of CAMPOS_BASE) {
    const n = toNum(entrada?.[k]);
    if (Number.isNaN(n)) erros.push(`${k}: valor numérico inválido`);
    else if (n !== null && n < 0) erros.push(`${k}: não pode ser negativo`);
    else valores[k] = n;
  }
  return { valores, erros };
}

/** Avisos de consistência entre campos (não impedem o registro). */
export function avisosConsistencia(b) {
  const a = [];
  const gt = (x, y, msg) => { if (isNum(b[x]) && isNum(b[y]) && b[x] > b[y]) a.push(msg); };
  gt("cliques_link", "cliques", "Cliques no link maiores que cliques totais.");
  gt("alcance", "impressoes", "Alcance maior que impressões.");
  gt("compras", "inicios_checkout", "Compras maiores que inícios de checkout.");
  gt("inicios_checkout", "visitas_pagina", "Inícios de checkout maiores que visitas à página.");
  gt("leads_qualificados", "leads", "Leads qualificados maiores que leads.");
  gt("agendamentos", "leads_qualificados", "Agendamentos maiores que leads qualificados.");
  gt("comparecimentos", "agendamentos", "Comparecimentos maiores que agendamentos.");
  gt("vendas_comercial", "comparecimentos", "Vendas comerciais maiores que comparecimentos.");
  if (isNum(b.investimento) && b.investimento > 0 && b.impressoes === 0) a.push("Investimento com zero impressões: confira os dados.");
  if (isNum(b.compras) && b.compras > 0 && !isNum(b.receita)) a.push("Há compras, mas a receita não foi informada: ROAS e ticket médio ficarão indefinidos.");
  return a;
}

/** Dias corridos entre duas datas AAAA-MM-DD (inclusivo). null se inválido. */
export function diasEntre(inicio, fim) {
  const a = Date.parse(`${inicio}T12:00:00Z`), b = Date.parse(`${fim}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 86400000) + 1;
}

/** Soma campos básicos de várias análises (acúmulo), preservando null quando nenhuma informou. */
export function acumular(analises) {
  const out = {};
  for (const k of CAMPOS_BASE) out[k] = soma(...analises.map((x) => x[k]));
  return out;
}
