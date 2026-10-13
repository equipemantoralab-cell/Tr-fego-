// Inteligência histórica: comparação antes/depois, padrões quantitativos e agregações ponderadas.
import { acumular, derivar, isNum, div, soma, diasEntre } from "./metrics.js";

const METRICA_MAE = { low_ticket: "cpa", medio_ticket: "cpa", high_ticket: "cac", lancamento: "cac" };
export const metricaMaeDoFunil = (tipo, modelo) => (tipo === "medio_ticket" && modelo === "leads" ? "cpl" : tipo === "medio_ticket" && modelo === "comercial" ? "cac" : METRICA_MAE[tipo] || "cpa");
// sentido: custo (menor é melhor) ou retorno (maior é melhor)
const SENTIDO = { cpa: "menor", cac: "menor", cpl: "menor", cpql: "menor", cpm: "menor", cpc: "menor", roas: "maior", ctr: "maior", ctr_link: "maior", taxa_conexao: "maior", taxa_visita_checkout: "maior", taxa_checkout_compra: "maior", taxa_qualificacao: "maior", ticket_medio: "maior", compras: "maior", receita_total: "maior" };
const METRICAS_COMPARADAS = ["investimento", "cpa", "cpl", "cac", "roas", "ctr_link", "cpm", "taxa_visita_checkout", "taxa_checkout_compra", "compras", "receita_total"];

const dataMais = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

function bloco(analises) {
  if (!analises.length) return null;
  const base = acumular(analises);
  return { n: analises.length, periodo_inicio: analises.map((a) => a.periodo_inicio).sort()[0], periodo_fim: analises.map((a) => a.periodo_fim).sort().slice(-1)[0], base, d: { ...derivar(base), investimento: base.investimento, compras: base.compras } };
}

/**
 * Compara o desempenho ANTES e DEPOIS de uma ação executada em `dataExecucao` (AAAA-MM-DD).
 * Antes: análises que terminam antes da execução. Depois: análises que começam na execução ou depois.
 * Nunca afirma causalidade: devolve ressalvas explícitas.
 */
export function compararAntesDepois({ analises, dataExecucao, tipoFunil, modeloFunil, meta = null, janelaDias = 14, minConversoes = 3, limiarPct = 5 }) {
  const validas = (analises || []).filter((a) => a.status !== "anulada").map((a) => ({ ...a }));
  const antes = validas.filter((a) => a.periodo_fim < dataExecucao && a.periodo_fim >= dataMais(dataExecucao, -janelaDias));
  const depois = validas.filter((a) => a.periodo_inicio >= dataExecucao && a.periodo_inicio <= dataMais(dataExecucao, janelaDias));
  const A = bloco(antes), D = bloco(depois);
  const mae = metricaMaeDoFunil(tipoFunil, modeloFunil);
  const out = { metrica_mae: mae, antes: A, depois: D, comparacoes: [], veredito: "sem_dados", confianca: "baixa", meta_atingida: null, ressalvas: [], texto: "" };
  out.ressalvas.push("Comparação temporal: mostra o que mudou depois da ação, não prova que ela foi a única causa (sazonalidade, público, orçamento e oferta também influenciam).");
  if (!A || !D) { out.texto = !A && !D ? "Sem análises antes e depois da data de execução." : !A ? "Falta ao menos uma análise ANTES da execução para comparar." : "Ainda não há análise DEPOIS da execução: registre uma nova análise para reavaliar."; return out; }
  for (const m of METRICAS_COMPARADAS) {
    const a = A.d[m], b = D.d[m];
    if (!isNum(a) && !isNum(b)) continue;
    const delta = isNum(a) && isNum(b) ? b - a : null;
    const deltaPct = isNum(a) && a !== 0 && isNum(b) ? ((b - a) / a) * 100 : null;
    const sentido = SENTIDO[m];
    const melhorou = deltaPct === null || !sentido ? null : sentido === "menor" ? deltaPct < -limiarPct : deltaPct > limiarPct;
    const piorou = deltaPct === null || !sentido ? null : sentido === "menor" ? deltaPct > limiarPct : deltaPct < -limiarPct;
    out.comparacoes.push({ metrica: m, antes: a ?? null, depois: b ?? null, delta, delta_pct: deltaPct, melhorou, piorou, principal: m === mae });
  }
  const conv = (x) => (mae === "cpl" ? x.base.leads : mae === "cac" ? soma(x.base.compras, x.base.vendas_comercial) : x.base.compras);
  const ca = conv(A), cd = conv(D);
  const menor = Math.min(isNum(ca) ? ca : 0, isNum(cd) ? cd : 0);
  out.confianca = menor >= 10 ? "alta" : menor >= minConversoes ? "media" : "baixa";
  const p = out.comparacoes.find((c) => c.principal);
  if (!p || !isNum(p.antes) || !isNum(p.depois)) { out.veredito = "inconclusivo"; out.texto = `Não foi possível calcular a métrica principal (${mae.toUpperCase()}) nos dois períodos.`; return out; }
  if (isNum(meta)) out.meta_atingida = SENTIDO[mae] === "menor" ? p.depois <= meta : p.depois >= meta;
  const f = (v) => (mae === "roas" ? v.toFixed(2) : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  if (out.confianca === "baixa") { out.veredito = "inconclusivo"; out.ressalvas.push(`Amostra pequena (${menor} conversões no menor período): variação de ${mae.toUpperCase()} pode ser ruído.`); out.texto = `${mae.toUpperCase()} foi de ${f(p.antes)} para ${f(p.depois)}, mas a amostra é pequena demais para concluir.`; return out; }
  out.veredito = p.melhorou ? "melhorou" : p.piorou ? "piorou" : "inconclusivo";
  const dir = out.veredito === "melhorou" ? "melhora observada" : out.veredito === "piorou" ? "piora observada" : "variação dentro da margem de ruído";
  out.texto = `${mae.toUpperCase()} foi de ${f(p.antes)} para ${f(p.depois)} (${p.delta_pct >= 0 ? "+" : ""}${p.delta_pct.toFixed(1)}%): ${dir}${isNum(meta) ? `; meta ${out.meta_atingida ? "atingida" : "não atingida"}` : ""}. Isso não prova, sozinho, que a ação foi a causa.`;
  return out;
}

/** Série temporal para gráficos (valores null preservados — lacuna, não zero). */
export function serieTemporal(analises, campos) {
  const o = (analises || []).filter((a) => a.status !== "anulada").sort((x, y) => String(x.periodo_fim).localeCompare(String(y.periodo_fim)));
  return o.map((a) => ({ data: a.periodo_fim, inicio: a.periodo_inicio, ...Object.fromEntries(campos.map((c) => [c, isNum(a[c]) ? a[c] : null])), id: a.id }));
}

/**
 * Razão agregada PONDERADA (nunca média de taxas): Σ numerador ÷ Σ denominador, usando somente
 * análises em que AMBOS foram informados (evita dividir um gasto total por conversões parciais).
 */
export function razaoPonderada(analises, num, den) {
  const ok = (analises || []).filter((a) => a.status !== "anulada" && isNum(a[num]) && isNum(a[den]));
  if (!ok.length) return { valor: null, n: 0 };
  const n = ok.reduce((s, a) => s + a[num], 0), d = ok.reduce((s, a) => s + a[den], 0);
  return { valor: div(n, d), n: ok.length, numerador: n, denominador: d };
}
export function totais(analises) {
  const v = (analises || []).filter((a) => a.status !== "anulada");
  const inv = soma(...v.map((a) => a.investimento)), rec = soma(...v.map((a) => a.receita_total));
  const comRec = v.filter((a) => isNum(a.receita_total) && isNum(a.investimento));
  const comCompra = v.filter((a) => isNum(a.compras) && isNum(a.investimento));
  return {
    investimento: inv, receita_atribuida: rec,
    cpa_agregado: razaoPonderada(v.map((a) => ({ ...a, _inv: a.investimento })), "investimento", "compras"),
    roas_agregado: razaoPonderada(comRec.map((a) => ({ ...a })), "receita_total", "investimento"),
    analises: v.length, analises_com_compras: comCompra.length, analises_com_receita: comRec.length,
  };
}

/**
 * Padrões quantitativos a partir das decisões reavaliadas. Cada padrão traz n e confiança:
 * com n < 3 é marcado como amostra pequena e NÃO deve ser lido como regra.
 */
export function padroes({ decisoes, campanhas }) {
  const porCamp = new Map((campanhas || []).map((c) => [c.id, c]));
  const g = new Map();
  for (const d of decisoes || []) {
    let dep; try { dep = d.desempenho_depois ? JSON.parse(d.desempenho_depois) : null; } catch { dep = null; }
    if (!dep?.veredito) continue;
    const funil = porCamp.get(d.campanha_id)?.tipo_funil || "desconhecido";
    const k = `${d.tipo_acao}|${funil}`;
    const x = g.get(k) || { tipo_acao: d.tipo_acao, tipo_funil: funil, n: 0, melhorou: 0, piorou: 0, inconclusivo: 0, deltas: [] };
    x.n++; x[dep.veredito === "melhorou" ? "melhorou" : dep.veredito === "piorou" ? "piorou" : "inconclusivo"]++;
    if (isNum(dep.delta_pct)) x.deltas.push(dep.delta_pct);
    g.set(k, x);
  }
  const mediana = (a) => { if (!a.length) return null; const s = [...a].sort((p, q) => p - q), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  return [...g.values()].map(({ deltas, ...x }) => ({ ...x, taxa_melhora: x.n ? x.melhorou / x.n : null, mediana_delta_pct: mediana(deltas), confianca: x.n >= 10 ? "alta" : x.n >= 3 ? "media" : "baixa", observacao: x.n < 3 ? "Amostra pequena: apenas indicativo." : "Associação histórica, não causalidade." }))
    .sort((a, b) => b.n - a.n);
}

/** Frequência de gargalos apontados pelo motor, por tipo de funil. */
export function gargalosFrequentes(analises, campanhas) {
  const porCamp = new Map((campanhas || []).map((c) => [c.id, c]));
  const m = new Map();
  for (const a of analises || []) {
    if (a.status === "anulada" || !a.resultado_motor) continue;
    let r; try { r = JSON.parse(a.resultado_motor); } catch { continue; }
    if (!r?.gargalo) continue;
    const funil = porCamp.get(a.campanha_id)?.tipo_funil || "desconhecido", k = `${funil}|${r.gargalo.etapa}`;
    const x = m.get(k) || { tipo_funil: funil, etapa: r.gargalo.etapa, rotulo: r.gargalo.rotulo, ocorrencias: 0, campanhas: new Set() };
    x.ocorrencias++; x.campanhas.add(a.campanha_id); m.set(k, x);
  }
  return [...m.values()].map((x) => ({ ...x, campanhas: x.campanhas.size })).sort((a, b) => b.ocorrencias - a.ocorrencias);
}
