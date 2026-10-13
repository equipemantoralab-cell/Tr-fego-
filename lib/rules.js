// Motor de decisão determinístico e auditável (sem IA externa). Funções puras, isomórficas.
// Fluxo: 1) métrica-mãe  2) qualidade/quantidade dos dados  3) comparação com a meta  4) gargalo
//        5) métricas secundárias  6) recomendação  7) justificativa  8) verificações antes de executar.
// Cada afirmação carrega seu NÍVEL: "conclusao" (fato apoiado em dados suficientes), "hipotese" (causa provável,
// não confirmada) ou "recomendacao" (ação sugerida pelas regras). O motor nunca recomenda escala sem dados suficientes.

import { lerConfig } from "./config-defaults.js";
import { ROTULO_ACAO } from "./schema.js";
import { derivar, acumular, diasEntre, isNum, div, pct, soma, CAMPOS_BASE } from "./metrics.js";

export const VERSAO_MOTOR = "1.0.0";
const brl = (v) => (isNum(v) ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—");
const num = (v, d = 1) => (isNum(v) ? v.toLocaleString("pt-BR", { maximumFractionDigits: d }) : "—");
const AREAS = { trafego: "Tráfego", copy: "Copy", estrategia: "Estratégia", tecnologia: "Tecnologia / Página", comercial: "Comercial", especialista: "Especialista" };

const ACAO_PADRAO = {
  continuar_teste: { areas: [AREAS.trafego], esperado: "Acumular dados suficientes para decidir com segurança." },
  manter: { areas: [AREAS.trafego], esperado: "Manter o resultado dentro da meta, acompanhando a tendência." },
  novos_criativos: { areas: [AREAS.copy, AREAS.trafego], esperado: "Aumentar CTR/qualidade do clique e reduzir o custo por resultado." },
  revisar_copy: { areas: [AREAS.copy], esperado: "Melhorar a mensagem e a qualificação do clique." },
  revisar_pagina: { areas: [AREAS.copy, AREAS.estrategia], esperado: "Aumentar a taxa de visita → checkout/lead." },
  revisar_checkout: { areas: [AREAS.estrategia, AREAS.tecnologia, AREAS.copy], esperado: "Aumentar a conversão checkout → compra." },
  revisar_oferta: { areas: [AREAS.estrategia, AREAS.especialista], esperado: "Melhorar a economia da oferta (ticket, bumps, posicionamento)." },
  ajustar_segmentacao: { areas: [AREAS.trafego, AREAS.estrategia], esperado: "Atrair perfil mais aderente e reduzir o custo por resultado." },
  testar_novo_publico: { areas: [AREAS.trafego], esperado: "Encontrar público com CPM/conversão melhores." },
  reduzir_orcamento: { areas: [AREAS.trafego], esperado: "Proteger a margem enquanto a eficiência é restabelecida." },
  pausar: { areas: [AREAS.trafego], esperado: "Interromper a perda de verba e registrar a hipótese de falha." },
  escalar_vertical: { areas: [AREAS.trafego], esperado: "Aumentar o volume mantendo o resultado dentro da meta." },
  escalar_horizontal: { areas: [AREAS.trafego], esperado: "Testar o vencedor em nova estrutura (CBO/ABO) preservando o original." },
  corrigir_rastreio: { areas: [AREAS.tecnologia], esperado: "Connect rate e eventos dentro do mínimo, para interpretar o funil." },
  melhorar_processo_comercial: { areas: [AREAS.comercial, AREAS.estrategia], esperado: "Melhorar contato, qualificação e fechamento." },
  registrar_aprendizado: { areas: [AREAS.estrategia], esperado: "Alimentar a próxima rodada com o que foi aprendido." },
};

const VERIFICAR = {
  continuar_teste: ["Confirmar que o rastreamento (pixel/eventos) está funcionando antes de tirar conclusões.", "Não alterar criativo, público ou orçamento durante a janela de teste."],
  manter: ["Acompanhar a tendência nas próximas análises; um dia fora da meta não é deterioração."],
  novos_criativos: ["Confirmar que o rastreamento e o connect rate estão normais (não é problema técnico).", "Registrar a hipótese de falha do criativo atual para alimentar a próxima leva."],
  revisar_copy: ["Comparar a promessa do anúncio com a primeira dobra da página."],
  revisar_pagina: ["Testar a página em celular e desktop (carregamento, eventos, botão de compra).", "Conferir coerência entre anúncio e página."],
  revisar_checkout: ["Fazer uma compra-teste em cada meio de pagamento.", "Revisar preço, parcelamento, garantia e confiança."],
  revisar_oferta: ["Revisar margem, ticket médio e bumps antes de mexer na mídia."],
  ajustar_segmentacao: ["Conferir sobreposição de públicos e frequência antes de alterar."],
  testar_novo_publico: ["Manter o público atual ativo para preservar leitura e histórico."],
  reduzir_orcamento: ["Reduzir em degraus (não de uma vez) e observar se a eficiência volta.", "Considerar sazonalidade e momento do mês."],
  pausar: ["Confirmar que o rastreamento/conexão estão corretos: sem vendas por falha técnica não é falha de criativo.", "Registrar por que está sendo pausada e o que será testado em seguida."],
  escalar_vertical: ["Confirmar que o CPA permaneceu na meta nas últimas análises.", "Verificar frequência/saturação e capacidade de entrega (estoque, atendimento, comercial).", "Aumentar em degraus e reavaliar a cada ciclo; não dobrar de uma vez."],
  escalar_horizontal: ["Duplicar o vencedor para nova campanha; manter o original no teste.", "Adicionar ~1 a 2 “tickets” de CPA esperado de orçamento na estrutura nova."],
  corrigir_rastreio: ["Reproduzir o problema (prints, URLs, dispositivo, horário) antes de acionar Tecnologia."],
  melhorar_processo_comercial: ["Verificar SLA de primeira resposta, capacidade diária e motivos de perda no CRM."],
  registrar_aprendizado: ["Registrar o que funcionou e o que não funcionou, com dados."],
};

// ------------------------------------------------------------------ utilidades
function novoResultado(tipo, modelo) {
  return { versao_motor: VERSAO_MOTOR, tipo_funil: tipo, modelo, metrica_mae: null, qualidade_dados: { nivel: "suficiente", itens: [], faltantes: [] },
    situacao: "normal", etapas: [], gargalo: null, recomendacao: null, justificativa: [], verificar_antes: [], acoes: [], regras: [], avisos: [], estimativas: {} };
}
const J = (res, nivel, texto, regra) => { res.justificativa.push({ nivel, texto, regra: regra || null }); if (regra && !res.regras.includes(regra)) res.regras.push(regra); };
const Q = (res, ok, texto) => res.qualidade_dados.itens.push({ ok, texto });
const insuficiente = (res, motivo) => { res.qualidade_dados.nivel = "insuficiente"; res.situacao = "insuficiente"; if (motivo) Q(res, false, motivo); };

function recomendar(res, acao, nivel, texto, prioridade = "media") {
  res.recomendacao = { acao, rotulo: ROTULO_ACAO[acao], nivel_evidencia: nivel, texto, prioridade };
  res.verificar_antes = [...(VERIFICAR[acao] || [])];
}
function adicionarAcao(res, tipo, motivo, prioridade, nivel = "recomendacao", descricao) {
  if (res.acoes.some((a) => a.tipo === tipo)) return;
  const pad = ACAO_PADRAO[tipo] || { areas: [], esperado: "" };
  res.acoes.push({ tipo, descricao: descricao || ROTULO_ACAO[tipo], motivo, prioridade, nivel_evidencia: nivel, responsaveis_sugeridos: pad.areas, resultado_esperado: pad.esperado });
}

/** Etapa do funil comparada a um mínimo. status: ok | abaixo | sem_meta | sem_dado */
function etapa(id, rotulo, valor, meta, responsaveis, acao, texto) {
  const status = !isNum(valor) ? "sem_dado" : !isNum(meta) ? "sem_meta" : valor >= meta ? "ok" : "abaixo";
  return { id, rotulo, valor, meta, status, responsaveis, acao, texto };
}
function definirGargalo(res, etapas) {
  res.etapas = etapas;
  const g = etapas.find((e) => e.status === "abaixo");
  if (!g) return null;
  res.gargalo = { etapa: g.id, rotulo: g.rotulo, nivel_evidencia: "hipotese", texto: g.texto, acao: g.acao, responsaveis: g.responsaveis };
  J(res, "hipotese", `Provável gargalo: ${g.rotulo} (${num(g.valor)}% contra mínimo de ${num(g.meta)}%). ${g.texto}`, "GARGALO-" + g.id.toUpperCase());
  return g;
}
const semMeta = (res, etapas) => etapas.filter((e) => e.status === "sem_meta").forEach((e) => res.avisos.push(`Meta de "${e.rotulo}" não configurada: etapa não avaliada (Configurações → funis).`));

/** razão custo/meta → situação (apenas com dados suficientes) */
function situacaoCusto(valor, meta, cfg, persistente) {
  if (!isNum(valor) || !isNum(meta) || meta <= 0) return "insuficiente";
  const r = valor / meta;
  const at = cfg.get("global", "atencao_tolerancia_pct") ?? 10, cr = cfg.get("global", "critico_tolerancia_pct") ?? 50;
  if (r <= 1) return "normal";
  if (r <= 1 + at / 100) return "atencao";
  return r > 1 + cr / 100 && persistente ? "critica" : "atencao";
}
const pior = (a, b) => { const o = ["normal", "atencao", "critica"]; return o.indexOf(a) >= o.indexOf(b) ? a : b; };

/** quantas análises mais recentes consecutivas têm custo acima da meta (ignora períodos sem valor calculável) */
function acimaSeguidas(serie, campo, meta) {
  let n = 0;
  for (let i = serie.length - 1; i >= 0; i--) {
    const v = serie[i].d[campo];
    if (!isNum(v)) { if (isNum(serie[i].base.investimento) && serie[i].base.investimento > 0) break; continue; }
    if (v > meta) n++; else break;
  }
  return n;
}
const dentroSeguidas = (serie, campo, meta, n) => {
  const ult = serie.slice(-n);
  return ult.length >= n && ult.every((x) => isNum(x.d[campo]) && x.d[campo] <= meta);
};


const ROTULO_CONV = { compras: "O número de compras", leads: "O número de leads", vendas_comercial: "O número de vendas fechadas" };
function campoConversao(c, fase) {
  if (c.tipo_funil === "low_ticket") return "compras";
  if (c.tipo_funil === "medio_ticket") return c.modelo_funil === "leads" ? "leads" : c.modelo_funil === "comercial" ? "vendas_comercial" : "compras";
  if (c.tipo_funil === "high_ticket") return "vendas_comercial";
  if (c.tipo_funil === "lancamento") return fase === "captacao" ? "leads" : null;
  return null;
}

// ------------------------------------------------------------------ montagem do contexto
export function diagnosticar({ campanha, produto = null, analise, historico = [], configs = [], hoje = null }) {
  if (!campanha || !analise) throw new Error("campanha e analise são obrigatórias");
  const cfg = lerConfig(configs);
  const base = (x) => Object.fromEntries(CAMPOS_BASE.map((k) => [k, isNum(x?.[k]) ? x[k] : null]));
  const atual = { base: base(analise), periodo_inicio: analise.periodo_inicio, periodo_fim: analise.periodo_fim, fase: analise.fase_lancamento || null };
  atual.d = derivar(atual.base);
  const anteriores = (historico || []).filter((h) => h.status !== "anulada" && h.id !== analise.id)
    .map((h) => { const b = base(h); return { base: b, d: derivar(b), periodo_inicio: h.periodo_inicio, periodo_fim: h.periodo_fim, fase: h.fase_lancamento || null }; })
    .sort((x, y) => String(x.periodo_fim).localeCompare(String(y.periodo_fim)));
  // Campo de conversão exigido pelo funil. Período sem ele NÃO pode entrar no acumulado: somaria o gasto sem as conversões
  // correspondentes e inflaria CPA/CPL/CAC.
  const conv = campoConversao(campanha, atual.fase || campanha.fase_lancamento);
  const excluidas = conv ? anteriores.filter((s) => !isNum(s.base[conv])) : [];
  const serie = [...anteriores.filter((s) => !excluidas.includes(s)), atual];
  const acum = acumular(serie.map((s) => s.base));
  const ac = derivar(acum);
  const dias = diasEntre(campanha.data_inicio, analise.periodo_fim);
  const ctx = {
    c: campanha, p: produto, a: atual, serie, acum, ac, cfg, dias, hoje,
    metas: { cpa: campanha.cpa_alvo ?? produto?.cpa_alvo ?? null, roas: campanha.roas_alvo ?? null, cpl: campanha.cpl_alvo ?? null, cpql: campanha.cpql_alvo ?? null, cac: campanha.cac_alvo ?? null },
  };
  const fn = { low_ticket: low, medio_ticket: medio, high_ticket: high, lancamento: lancamento }[campanha.tipo_funil];
  if (!fn) throw new Error(`tipo de funil não suportado: ${campanha.tipo_funil}`);
  let res;
  if (conv && !isNum(atual.base[conv])) {
    res = novoResultado(campanha.tipo_funil, `${campanha.tipo_funil} — dados incompletos`);
    res.metrica_mae = { id: "indefinida", rotulo: "Métrica principal indisponível", valor: null, meta: null, unidade: "R$", periodo: null };
    insuficiente(res, `${ROTULO_CONV[conv]} deste período não informado (digite 0 se realmente foi zero).`);
    recomendar(res, "continuar_teste", "recomendacao", `Informe ${ROTULO_CONV[conv].toLowerCase()} do período para calcular o resultado. Vazio é tratado como “não informado”, nunca como zero.`, "alta");
    J(res, "recomendacao", "Sem a conversão do período, somar apenas o gasto ao acumulado distorceria o custo por resultado.", "DADOS-CONVERSAO");
  } else res = fn(ctx);
  if (excluidas.length) res.avisos.push(`${excluidas.length} análise(s) anterior(es) sem ${ROTULO_CONV[conv].toLowerCase()} informado(s) foram excluídas do acumulado para não distorcer o custo por resultado.`);
  // avisos gerais
  if (anteriores.some((s) => s.periodo_fim >= atual.periodo_inicio && s.periodo_inicio <= atual.periodo_fim)) res.avisos.push("O período desta análise se sobrepõe a uma análise anterior: os acumulados podem estar contando o mesmo dia duas vezes.");
  if (dias === null) res.avisos.push("Não foi possível calcular os dias de campanha (confira a data de início e o fim do período).");
  if (!res.recomendacao) recomendar(res, "continuar_teste", "recomendacao", "Sem regra conclusiva para este cenário: continuar acompanhando.");
  if (res.recomendacao) adicionarAcao(res, res.recomendacao.acao, res.recomendacao.texto, res.recomendacao.prioridade, res.recomendacao.nivel_evidencia);
  if (res.gargalo?.acao && res.situacao !== "normal") adicionarAcao(res, res.gargalo.acao, `Hipótese de gargalo: ${res.gargalo.rotulo}.`, "media", "hipotese");
  res.acumulado = { dias, analises: serie.length, investimento: acum.investimento, compras: acum.compras, vendas_comercial: acum.vendas_comercial, leads: acum.leads, cpa: ac.cpa, cpl: ac.cpl, cac: ac.cac, roas: ac.roas };
  res.resumo = resumo(res);
  return res;
}
function resumo(res) {
  const m = res.metrica_mae;
  const base = m ? `${m.rotulo}: ${m.unidade === "R$" ? brl(m.valor) : num(m.valor, 2)}${isNum(m.meta) ? ` (meta ${m.unidade === "R$" ? brl(m.meta) : num(m.meta, 2)})` : " (sem meta)"}` : "Sem métrica-mãe calculável";
  return `${base}. ${res.recomendacao?.rotulo || ""}.`;
}

// ------------------------------------------------------------------ rastreio / funil de compra (compartilhado)
function etapasCompra(ctx, T) {
  const { cfg, ac } = ctx;
  const ctr = isNum(ac.ctr_link) ? ac.ctr_link : ac.ctr;
  return [
    etapa("conexao", "Connect rate (visitas ÷ cliques no link)", ac.taxa_conexao, cfg.get(T, "connect_min_pct"), [AREAS.tecnologia], "corrigir_rastreio", "Falha técnica/experiência de carregamento: corrigir antes de interpretar o resto do funil."),
    etapa("ctr", "CTR", ctr, cfg.get(T, "ctr_saudavel_pct"), [AREAS.copy, AREAS.trafego], "novos_criativos", "O criativo não gera clique suficiente: nova leva de hooks, ângulos e criativos."),
    etapa("visita_checkout", "Visita → checkout", ac.taxa_visita_checkout, cfg.get(T, "visita_checkout_min_pct"), [AREAS.copy, AREAS.estrategia], "revisar_pagina", "As pessoas chegam, mas não avançam: revisar primeira dobra, oferta, provas e coerência anúncio → página."),
    etapa("checkout_compra", "Checkout → compra", ac.taxa_checkout_compra, cfg.get(T, "checkout_compra_min_pct"), [AREAS.estrategia, AREAS.tecnologia, AREAS.copy], "revisar_checkout", "O desejo existe, mas o fechamento falha: revisar preço, meios de pagamento, confiança e checkout."),
  ];
}

function qualidadeFunilCompra(res, ctx) {
  const { ac, acum } = ctx;
  const falt = [];
  if (!isNum(acum.impressoes)) falt.push("impressoes");
  if (!isNum(acum.cliques_link) && !isNum(acum.cliques)) falt.push("cliques_link");
  if (!isNum(acum.visitas_pagina)) falt.push("visitas_pagina");
  if (!isNum(acum.inicios_checkout)) falt.push("inicios_checkout");
  res.qualidade_dados.faltantes = falt;
  if (falt.length) { Q(res, false, `Métricas de funil não informadas: ${falt.join(", ")} — o gargalo não pode ser localizado com precisão.`); if (res.qualidade_dados.nivel === "suficiente") res.qualidade_dados.nivel = "parcial"; }
  else Q(res, true, "Métricas de funil completas (impressões, cliques, visitas, checkout).");
}

/** Ações de escala para funis de compra. conservador = limita o degrau ao mínimo (médio ticket). */
function decidirEscala(res, ctx, T, { meta, compras, conservador = false }) {
  const { cfg, serie, ac } = ctx;
  const dMin = cfg.get("global", "escala_degrau_min_pct") ?? 20, dMax = conservador ? (cfg.get(T, "escala_passo_conservador_pct") ?? 20) + 10 : (cfg.get("global", "escala_degrau_max_pct") ?? 50);
  const minVert = cfg.get(T, "compras_escala_vertical_min"), nEst = cfg.get(T, "analises_escala_estavel") ?? 2;
  const estavel = dentroSeguidas(serie, "cpa", meta, nEst);
  const folga = ((meta - ac.cpa) / meta) * 100;
  const roasOk = !isNum(ctx.metas.roas) || !isNum(ac.roas) || ac.roas >= ctx.metas.roas;
  const falta = [];
  if (isNum(minVert) && compras < minVert) falta.push(`${minVert - compras} compra(s) acumulada(s) a mais (mínimo ${minVert})`);
  if (!estavel) falta.push(`${nEst} análises consecutivas dentro da meta`);
  if (!roasOk) falta.push(`ROAS (${num(ac.roas, 2)}) abaixo do alvo (${num(ctx.metas.roas, 2)})`);
  if (!isNum(minVert)) falta.push("parâmetro compras_escala_vertical_min não configurado");
  if (falta.length === 0) {
    const forte = compras >= 2 * minVert && serie.length >= 3;
    const alto = cfg.get(T, "folga_degrau_alto_pct") ?? 30, medio = cfg.get(T, "folga_degrau_medio_pct") ?? 15;
    let degrau = dMin;
    if (forte && folga >= alto) degrau = dMax; else if (forte && folga >= medio) degrau = Math.min(dMax, Math.round((dMin + dMax) / 2));
    recomendar(res, "escalar_vertical", "recomendacao", `Aumentar o orçamento em ~${degrau}% por ajuste (folga atual de ${num(folga, 0)}% no CPA).`, "alta");
    res.estimativas.degrau_sugerido_pct = degrau;
    J(res, "conclusao", `CPA ${brl(ac.cpa)} dentro da meta (${brl(meta)}) em ${compras} compras e nas últimas ${nEst} análises.`, "ESCALA-VERT");
    if (!forte) J(res, "recomendacao", `Dados ainda não são fortes (menos de ${2 * minVert} compras ou menos de 3 análises): degrau limitado ao mínimo de ${dMin}%.`, "ESCALA-CAUTELA");
    adicionarAcao(res, "escalar_horizontal", "Lateralizar o vencedor em paralelo, preservando o criativo original no teste.", "media");
  } else {
    recomendar(res, "escalar_horizontal", "recomendacao", "Pré-escala: lateralizar o vencedor para uma nova estrutura (CBO ou ABO com vencedores) sem mexer na campanha original.", "alta");
    J(res, "conclusao", `CPA ${brl(ac.cpa)} dentro da meta (${brl(meta)}) com ${compras} compras.`, "PRE-ESCALA");
    J(res, "recomendacao", `Escala vertical (aumentar orçamento) ainda NÃO recomendada: faltam ${falta.join("; ")}.`, "ESCALA-BLOQUEADA");
  }
}

/** Deterioração: CPA acima da meta. Usa a sequência de análises para separar oscilação de tendência. */
function decidirDeterioracao(res, ctx, T, { campo, meta, valor, rotulo }) {
  const { cfg, serie } = ctx;
  const ciclos = cfg.get(T, "ciclos_deterioracao") ?? 2;
  const seg = acimaSeguidas(serie, campo, meta);
  const cr = cfg.get("global", "critico_tolerancia_pct") ?? 50;
  const gar = res.gargalo;
  const acaoGar = gar?.acao || "novos_criativos";
  const sit = situacaoCusto(valor, meta, cfg, seg >= ciclos);
  res.situacao = pior(res.situacao, sit === "insuficiente" ? "atencao" : sit);
  if (seg <= 1 && serie.length >= 2 && isNum(serie[serie.length - 2].d[campo]) && serie[serie.length - 2].d[campo] <= meta) {
    recomendar(res, "manter", "recomendacao", `${rotulo} saiu da meta em apenas 1 análise: oscilação pontual. Observar a tendência antes de intervir.`, "media");
    J(res, "hipotese", "Um único período acima da meta pode ser ruído; ainda não caracteriza deterioração estrutural.", "DET-OSCILACAO");
    return;
  }
  if (seg >= ciclos + 1 && valor > meta * (1 + cr / 100)) {
    recomendar(res, "pausar", "recomendacao", `${rotulo} está ${num(((valor / meta) - 1) * 100, 0)}% acima da meta há ${seg} análises seguidas: pausar e reconstruir a hipótese.`, "critica");
    J(res, "conclusao", `${rotulo} acima da meta por ${seg} análises consecutivas, sem recuperação, e mais de ${cr}% acima.`, "DET-PAUSAR");
    adicionarAcao(res, acaoGar, "Diagnóstico secundário antes de relançar.", "alta", "hipotese");
    return;
  }
  if (seg >= ciclos + 1) {
    recomendar(res, acaoGar === "corrigir_rastreio" ? "corrigir_rastreio" : acaoGar, "hipotese", `${rotulo} não recupera após ${seg} análises: entrar no diagnóstico secundário (fadiga, público, criativo, página, checkout, oferta).`, "alta");
    J(res, "conclusao", `${rotulo} acima da meta por ${seg} análises consecutivas.`, "DET-NAO-RECUPERA");
    adicionarAcao(res, "reduzir_orcamento", "Limitar a perda enquanto o diagnóstico é executado.", "media");
    return;
  }
  if (seg >= ciclos) {
    recomendar(res, "reduzir_orcamento", "recomendacao", `${rotulo} acima da meta por mais de um ciclo: reduzir o orçamento em degraus e observar se a eficiência retorna.`, "alta");
    J(res, "conclusao", `${rotulo} acima da meta em ${seg} análises seguidas (deterioração além de um ciclo).`, "DET-REDUZIR");
    if (gar) adicionarAcao(res, acaoGar, "Corrigir o gargalo provável enquanto reduz.", "media", "hipotese");
    return;
  }
  // primeira análise (sem histórico) fora da meta
  recomendar(res, gar ? acaoGar : "continuar_teste", gar ? "hipotese" : "recomendacao", gar ? `${gar.texto}` : `${rotulo} acima da meta, mas ainda sem histórico para separar oscilação de tendência.`, "media");
}

// ------------------------------------------------------------------ LOW TICKET
function low(ctx) {
  const T = "low_ticket", { cfg, ac, acum, dias, metas, serie } = ctx;
  const res = novoResultado(T, "Low ticket — venda direta");
  const meta = metas.cpa;
  res.metrica_mae = { id: "cpa", rotulo: "CPA por compra (acumulado)", valor: ac.cpa, meta, unidade: "R$", periodo: ctx.a.d.cpa };
  const diasTeste = cfg.get(T, "dias_teste"), mult = cfg.get(T, "gasto_min_cpa_mult");

  // 2) dados
  if (!isNum(acum.investimento) || acum.investimento <= 0) { insuficiente(res, "Investimento não informado."); recomendar(res, "continuar_teste", "recomendacao", "Informe o investimento do período para analisar.", "alta"); return res; }
  if (!isNum(meta)) { insuficiente(res, "CPA alvo não definido (campanha ou produto)."); recomendar(res, "continuar_teste", "recomendacao", "Defina o CPA alvo da campanha para comparar o resultado com a meta.", "alta"); return res; }
  if (!isNum(acum.compras)) { insuficiente(res, "Compras não informadas (use 0 se não houve)."); recomendar(res, "continuar_teste", "recomendacao", "Informe o número de compras (0 se não houve).", "alta"); return res; }
  const C = acum.compras;
  const janelaOk = isNum(dias) && dias >= diasTeste && acum.investimento >= mult * meta;
  Q(res, isNum(dias) && dias >= diasTeste, `Tempo de teste: ${dias ?? "?"} dia(s) (mínimo ${diasTeste}).`);
  Q(res, acum.investimento >= mult * meta, `Investimento acumulado ${brl(acum.investimento)} (mínimo ${brl(mult * meta)} = ${mult}x CPA alvo).`);
  qualidadeFunilCompra(res, ctx);
  const et = etapasCompra(ctx, T);

  if (!janelaOk) {
    insuficiente(res, "Janela de teste incompleta.");
    const faltaDias = isNum(dias) && dias < diasTeste ? `${diasTeste - dias} dia(s)` : null;
    const faltaVerba = acum.investimento < mult * meta ? `${brl(mult * meta - acum.investimento)} de investimento` : null;
    recomendar(res, "continuar_teste", "recomendacao", `Janela de teste ainda incompleta: faltam ${[faltaDias, faltaVerba].filter(Boolean).join(" e ") || "dados"}. Não tire conclusões nem altere a campanha.`, "media");
    J(res, "recomendacao", "O POP define 3 dias com verba ≈ 1 CPA por conjunto antes de decidir.", "LOW-JANELA");
    // sinais técnicos valem mesmo antes da janela
    const conx = et.find((e) => e.id === "conexao");
    if (conx.status === "abaixo") { res.gargalo = { etapa: "conexao", rotulo: conx.rotulo, nivel_evidencia: "hipotese", texto: conx.texto, acao: conx.acao, responsaveis: conx.responsaveis }; res.etapas = et; adicionarAcao(res, "corrigir_rastreio", conx.texto, "alta", "hipotese"); res.avisos.push("Connect rate abaixo do mínimo: vale corrigir já, sem esperar o fim da janela."); }
    return res;
  }

  // 3) resultado vs meta
  const cpaOk = isNum(ac.cpa) && ac.cpa <= meta;
  const garg = definirGargalo(res, et); semMeta(res, et);
  if (C === 0) {
    res.situacao = "critica";
    J(res, "conclusao", `Zero compras após ${dias} dias e ${brl(acum.investimento)} investidos (${num(acum.investimento / meta, 1)}x o CPA alvo).`, "LOW-ZERO");
    const conexao = et.find((e) => e.id === "conexao");
    if (conexao.status === "abaixo") {
      recomendar(res, "corrigir_rastreio", "hipotese", "Zero compras com connect rate abaixo do mínimo: corrigir a parte técnica antes de culpar o criativo.", "critica");
      adicionarAcao(res, "pausar", "Considerar pausar enquanto o problema técnico é corrigido, para não queimar verba.", "alta");
    } else {
      recomendar(res, "pausar", "recomendacao", "Sem tração na janela inicial: desligar o criativo/campanha e registrar a hipótese de falha para a próxima leva.", "critica");
      if (garg) adicionarAcao(res, garg.acao, `Hipótese sobre o motivo: ${garg.texto}`, "media", "hipotese"); else adicionarAcao(res, "novos_criativos", "Sem sinal que aponte outra causa: nova leva de hooks e ângulos.", "media", "hipotese");
    }
    return res;
  }
  res.situacao = situacaoCusto(ac.cpa, meta, cfg, false);
  if (res.situacao === "insuficiente") res.situacao = "atencao";
  if (C === 1) {
    res.situacao = pior("atencao", res.situacao);
    recomendar(res, garg?.acao === "corrigir_rastreio" ? "corrigir_rastreio" : "continuar_teste", garg ? "hipotese" : "recomendacao", "1 compra é sinal insuficiente para decidir: ler as métricas secundárias e continuar o teste.", "media");
    J(res, "conclusao", "Apenas 1 compra acumulada: amostra pequena demais para concluir sobre o CPA.", "LOW-UMA-VENDA");
    res.avisos.push("Com 1 compra o CPA é igual ao gasto total: não use esse número como veredito.");
    return res;
  }
  const manterMax = cfg.get(T, "compras_manter_max"), preMin = cfg.get(T, "compras_pre_escala_min");
  if (cpaOk) {
    J(res, "conclusao", `CPA ${brl(ac.cpa)} dentro da meta (${brl(meta)}) com ${C} compras em ${dias} dias.`, "LOW-CPA-OK");
    if (C >= preMin) decidirEscala(res, ctx, T, { meta, compras: C });
    else { recomendar(res, "continuar_teste", "recomendacao", `${C} compras (~0,7 a 1 venda/dia): manter em teste, sem escalar nem reduzir, até confirmar a tração.`, "media"); J(res, "recomendacao", `Pré-escala exige ${preMin}+ compras (parâmetro provisório; o POP diz “vendas recorrentes”).`, "LOW-AINDA-NAO-ESCALA"); }
    if (garg && res.situacao === "normal") res.avisos.push(`Métrica secundária fraca (${garg.rotulo}), mas o CPA está na meta: preserve a campanha e use como aprendizado.`);
    if (isNum(metas.roas) && isNum(ac.roas) && ac.roas < metas.roas) { res.situacao = pior(res.situacao, "atencao"); J(res, "hipotese", `CPA na meta, mas ROAS ${num(ac.roas, 2)} abaixo do alvo ${num(metas.roas, 2)}: o ticket médio pode estar baixo — revisar bumps/oferta.`, "LOW-ROAS"); adicionarAcao(res, "revisar_oferta", "ROAS abaixo do alvo com CPA na meta.", "media", "hipotese"); }
    return res;
  }
  // CPA acima da meta
  J(res, "conclusao", `CPA ${brl(ac.cpa)} acima da meta ${brl(meta)} (+${num((ac.cpa / meta - 1) * 100, 0)}%) com ${C} compras.`, "LOW-CPA-ACIMA");
  if (C <= manterMax && serie.length < 2) {
    res.situacao = pior(res.situacao, "atencao");
    recomendar(res, garg ? garg.acao : "continuar_teste", garg ? "hipotese" : "recomendacao", garg ? garg.texto : "CPA acima da meta com poucas compras: continuar o teste e acompanhar a estabilidade.", "media");
    return res;
  }
  decidirDeterioracao(res, ctx, T, { campo: "cpa", meta, valor: ac.cpa, rotulo: "CPA" });
  return res;
}

// ------------------------------------------------------------------ MÉDIO TICKET
function medio(ctx) {
  const m = ctx.c.modelo_funil || "pagina";
  if (m === "leads") return medioLeads(ctx);
  if (m === "comercial") return medioComercial(ctx);
  return medioCompra(ctx, m);
}

function sinaisIntermediarios(ctx, T) {
  const { ac, cfg } = ctx;
  const ctr = isNum(ac.ctr_link) ? ac.ctr_link : ac.ctr;
  const checks = [
    [ctr, cfg.get(T, "ctr_saudavel_pct")], [ac.taxa_visita_checkout, cfg.get(T, "visita_checkout_min_pct")],
  ].filter(([v, mn]) => isNum(v) && isNum(mn));
  return { avaliaveis: checks.length, abaixo: checks.filter(([v, mn]) => v < mn).length };
}

function medioCompra(ctx, modelo) {
  const T = "medio_ticket", { cfg, ac, acum, dias, metas } = ctx;
  const nomes = { pagina: "Médio ticket — venda direta por página", vsl: "Médio ticket — VSL", quiz: "Médio ticket — quiz" };
  const res = novoResultado(T, nomes[modelo] || nomes.pagina);
  const meta = metas.cpa;
  res.metrica_mae = { id: "cpa", rotulo: "CPA por compra (acumulado)", valor: ac.cpa, meta, unidade: "R$", periodo: ctx.a.d.cpa };
  if (!isNum(acum.investimento) || acum.investimento <= 0) { insuficiente(res, "Investimento não informado."); recomendar(res, "continuar_teste", "recomendacao", "Informe o investimento do período.", "alta"); return res; }
  if (!isNum(meta)) { insuficiente(res, "CPA alvo não definido."); recomendar(res, "continuar_teste", "recomendacao", "Defina o CPA alvo da campanha.", "alta"); return res; }
  if (!isNum(acum.compras)) { insuficiente(res, "Compras não informadas (use 0 se não houve)."); recomendar(res, "continuar_teste", "recomendacao", "Informe o número de compras (0 se não houve).", "alta"); return res; }
  const C = acum.compras, mult = acum.investimento / meta;
  Q(res, true, `Gasto acumulado = ${num(mult, 2)}x o CPA alvo (decisão começa em ${cfg.get(T, "mult_inicio")}x; pausa sem venda a partir de ${cfg.get(T, "mult_pausa")}x — parâmetros V0 do POP).`);
  qualidadeFunilCompra(res, ctx);
  const et = etapasCompra(ctx, T);
  if (modelo === "vsl") { et.splice(2, 0, etapa("play", "Play (plays ÷ visitas)", ac.taxa_play, cfg.get(T, "taxa_play_min_pct"), [AREAS.copy, AREAS.estrategia], "revisar_copy", "Headline, thumbnail ou promessa não geram o play."), etapa("cta", "CTA (cliques no CTA ÷ plays)", ac.taxa_cta, cfg.get(T, "taxa_cta_min_pct"), [AREAS.copy, AREAS.estrategia], "revisar_oferta", "A oferta não está conectada ao argumento da VSL.")); }
  if (modelo === "quiz") et.splice(2, 0, etapa("quiz", "Conclusão do quiz", ac.taxa_conclusao_quiz, cfg.get(T, "taxa_conclusao_quiz_min_pct"), [AREAS.estrategia, AREAS.copy], "revisar_pagina", "Quiz longo ou pouco relevante: reduzir passos e melhorar o valor percebido."));
  const garg = definirGargalo(res, et); semMeta(res, et);
  const cpaOk = isNum(ac.cpa) && ac.cpa <= meta;
  const sinais = sinaisIntermediarios(ctx, T);
  const fracos = sinais.avaliaveis > 0 && sinais.abaixo === sinais.avaliaveis;
  const intencao = isNum(acum.inicios_checkout) && acum.inicios_checkout > 0;

  if (C === 0) {
    if (mult < cfg.get(T, "mult_inicio")) { insuficiente(res, "Gasto ainda abaixo de 1 CPA alvo."); recomendar(res, "continuar_teste", "recomendacao", "Ainda cedo para declarar vencedor/perdedor: preserve o teste e observe cliques e avanço no funil.", "media"); J(res, "recomendacao", `Gasto de ${num(mult, 2)}x o CPA alvo.`, "MED-CEDO"); return res; }
    res.situacao = "atencao";
    const conexao = et.find((e) => e.id === "conexao");
    if (conexao.status === "abaixo") { recomendar(res, "corrigir_rastreio", "hipotese", "Sem vendas e connect rate abaixo do mínimo: corrigir antes de interpretar o funil.", "critica"); res.situacao = "critica"; return res; }
    if (mult >= cfg.get(T, "mult_pausa")) {
      if (fracos) { res.situacao = "critica"; recomendar(res, "pausar", "recomendacao", `Sem vendas com ${num(mult, 1)}x o CPA alvo e sinais fracos (${sinais.abaixo}/${sinais.avaliaveis} abaixo do mínimo): pausar e alimentar nova hipótese.`, "alta"); J(res, "conclusao", "Teste consumiu margem relevante sem evidência de tração.", "MED-PAUSAR"); adicionarAcao(res, "novos_criativos", "Nova hipótese de criativo/qualificação.", "media", "hipotese"); return res; }
      recomendar(res, intencao ? "continuar_teste" : (garg?.acao || "continuar_teste"), "hipotese", sinais.avaliaveis === 0 ? "Sem vendas, mas os sinais intermediários não foram informados: não dá para concluir. Informe CTR, visitas e checkouts antes de pausar." : "Sem vendas, porém os sinais intermediários não são todos fracos: decidir com critério lendo checkout e intenção antes de pausar.", "alta");
      J(res, "hipotese", intencao ? "Há inícios de checkout: existe intenção; o problema pode estar no fundo do funil." : "Sem inícios de checkout registrados.", "MED-CRITERIO");
      return res;
    }
    if (intencao && !fracos) { recomendar(res, "continuar_teste", "recomendacao", "Perto de 1 CPA sem venda, mas há checkout iniciado: existe intenção. Manter e diagnosticar o fundo do funil.", "media"); return res; }
    recomendar(res, garg?.acao || "novos_criativos", "hipotese", "Perto de 1 CPA sem venda e quase nenhum avanço relevante: revisar criativo e qualificação; pausar mais cedo se as métricas também forem ruins.", "media");
    return res;
  }
  res.situacao = situacaoCusto(ac.cpa, meta, cfg, false); if (res.situacao === "insuficiente") res.situacao = "atencao";
  if (cpaOk) {
    J(res, "conclusao", `CPA ${brl(ac.cpa)} dentro da meta (${brl(meta)}) com ${C} compra(s).`, "MED-CPA-OK");
    if (C >= cfg.get(T, "compras_pre_escala_min")) decidirEscala(res, ctx, T, { meta, compras: C, conservador: true });
    else { recomendar(res, "continuar_teste", "recomendacao", "Uma venda dentro do CPA não basta para escalar: manter o teste até confirmar a repetição.", "media"); J(res, "recomendacao", "O POP exige confirmar repetição antes de pré-escalar.", "MED-REPETIR"); }
    return res;
  }
  J(res, "conclusao", `CPA ${brl(ac.cpa)} acima da meta ${brl(meta)} (+${num((ac.cpa / meta - 1) * 100, 0)}%).`, "MED-CPA-ACIMA");
  decidirDeterioracao(res, ctx, T, { campo: "cpa", meta, valor: ac.cpa, rotulo: "CPA" });
  if (!garg && res.situacao !== "normal" && et.every((e) => e.status !== "sem_dado")) { J(res, "hipotese", "Etapas do funil dentro do mínimo, mas o CPA não fecha: a economia/oferta pode estar mal desenhada (ticket, margem, papel na esteira).", "MED-ECONOMIA"); adicionarAcao(res, "revisar_oferta", "CPA ruim apesar de etapas saudáveis.", "media", "hipotese"); }
  return res;
}

function medioLeads(ctx) {
  const T = "medio_ticket", { cfg, ac, acum, metas } = ctx;
  const res = novoResultado(T, "Médio ticket — captação de leads");
  const meta = metas.cpl;
  res.metrica_mae = { id: "cpl", rotulo: "CPL (acumulado)", valor: ac.cpl, meta, unidade: "R$", periodo: ctx.a.d.cpl };
  res.avisos.push("Campanha de leads: o CPA de compra não é aplicado. O custo por lead é só o controle inicial; a qualidade do lead decide.");
  if (!isNum(acum.investimento) || acum.investimento <= 0) { insuficiente(res, "Investimento não informado."); recomendar(res, "continuar_teste", "recomendacao", "Informe o investimento do período.", "alta"); return res; }
  if (!isNum(meta)) { insuficiente(res, "CPL alvo não definido."); recomendar(res, "continuar_teste", "recomendacao", "Defina o CPL alvo da campanha.", "alta"); return res; }
  if (!isNum(acum.leads)) { insuficiente(res, "Leads não informados (use 0 se não houve)."); recomendar(res, "continuar_teste", "recomendacao", "Informe o número de leads (0 se não houve).", "alta"); return res; }
  const gastoMult = acum.investimento / meta;
  if (acum.leads === 0 && gastoMult >= (cfg.get(T, "mult_pausa") ?? 1.5)) { res.situacao = "critica"; recomendar(res, "revisar_pagina", "hipotese", `Zero leads com ${num(gastoMult, 1)}x o CPL alvo investido: verificar formulário/página e rastreamento antes de culpar o criativo.`, "critica"); adicionarAcao(res, "pausar", "Considerar pausar até corrigir.", "alta"); J(res, "conclusao", "Nenhum lead gerado com investimento relevante.", "LEAD-ZERO"); return res; }
  if (acum.leads === 0 || gastoMult < cfg.get(T, "mult_inicio")) { insuficiente(res, "Poucos dados: gasto abaixo de 1x o CPL alvo ou nenhum lead."); recomendar(res, "continuar_teste", "recomendacao", "Ainda sem volume para avaliar o custo por lead.", "media"); return res; }
  const cplOk = ac.cpl <= meta;
  res.situacao = situacaoCusto(ac.cpl, meta, cfg, false); if (res.situacao === "insuficiente") res.situacao = "atencao";
  const qual = ac.taxa_qualificacao, minQ = cfg.get(T, "taxa_qualificacao_min_pct");
  const et = [etapa("ctr", "CTR", isNum(ac.ctr_link) ? ac.ctr_link : ac.ctr, cfg.get(T, "ctr_saudavel_pct"), [AREAS.copy, AREAS.trafego], "novos_criativos", "Criativo gera pouco clique: nova leva de criativos."), etapa("qualificacao", "Qualificação (qualificados ÷ leads)", qual, minQ, [AREAS.estrategia, AREAS.copy], "ajustar_segmentacao", "Leads de baixo perfil: rever promessa, filtros do formulário e segmentação.")];
  const garg = definirGargalo(res, et); semMeta(res, et);
  if (!isNum(qual)) { Q(res, false, "Leads qualificados não informados."); res.qualidade_dados.nivel = "parcial"; }
  if (cplOk) {
    J(res, "conclusao", `CPL ${brl(ac.cpl)} dentro da meta (${brl(meta)}).`, "LEAD-CPL-OK");
    if (isNum(qual) && isNum(minQ) && qual < minQ) { res.situacao = pior(res.situacao, "atencao"); recomendar(res, "ajustar_segmentacao", "hipotese", "CPL baixo, mas poucos leads qualificados: a campanha pode estar comprando curiosidade. Qualificar antes de escalar.", "alta"); }
    else if (!isNum(qual)) { recomendar(res, "manter", "recomendacao", "CPL dentro da meta, mas sem dados de qualificação: lead barato não é sucesso. Registre os leads qualificados antes de escalar.", "media"); J(res, "recomendacao", "Escalar captação sem medir qualidade pode encher o comercial de lead ruim.", "LEAD-SEM-QUALIDADE"); }
    else { recomendar(res, "manter", "recomendacao", "CPL e qualificação adequados. Escalar só até a capacidade de atendimento do comercial.", "media"); res.verificar_antes.push("Confirmar SLA e capacidade diária do comercial antes de aumentar a geração de leads."); }
  } else { J(res, "conclusao", `CPL ${brl(ac.cpl)} acima da meta ${brl(meta)}.`, "LEAD-CPL-ACIMA"); decidirDeterioracao(res, ctx, T, { campo: "cpl", meta, valor: ac.cpl, rotulo: "CPL" }); }
  return res;
}

function medioComercial(ctx) {
  const T = "medio_ticket", { cfg, ac, acum, metas } = ctx;
  const res = novoResultado(T, "Médio ticket — conversão comercial");
  const meta = metas.cac;
  res.metrica_mae = { id: "cac", rotulo: "CAC por venda (mídia + custo comercial informado)", valor: ac.cac, meta, unidade: "R$", periodo: ctx.a.d.cac };
  if (!isNum(acum.investimento) || acum.investimento <= 0) { insuficiente(res, "Investimento não informado."); recomendar(res, "continuar_teste", "recomendacao", "Informe o investimento do período.", "alta"); return res; }
  if (!isNum(meta)) { insuficiente(res, "CAC alvo não definido."); recomendar(res, "continuar_teste", "recomendacao", "Defina o CAC alvo da campanha.", "alta"); return res; }
  if (!isNum(acum.vendas_comercial)) { insuficiente(res, "Vendas comerciais não informadas (use 0 se não houve)."); recomendar(res, "continuar_teste", "recomendacao", "Informe as vendas fechadas pelo comercial (0 se nenhuma).", "alta"); return res; }
  if (!ac.cac_inclui_custo_comercial) res.avisos.push("Custo comercial não informado: o CAC considera só a mídia e pode estar subestimado.");
  const mult = acum.investimento / meta, V = acum.vendas_comercial;
  const taxaVendaQual = pct(div(acum.vendas_comercial, acum.leads_qualificados));
  const et = [
    etapa("ctr", "CTR", isNum(ac.ctr_link) ? ac.ctr_link : ac.ctr, cfg.get(T, "ctr_saudavel_pct"), [AREAS.copy, AREAS.trafego], "novos_criativos", "Criativo gera pouco clique."),
    etapa("qualificacao", "Qualificação (qualificados ÷ leads)", ac.taxa_qualificacao, cfg.get(T, "taxa_qualificacao_min_pct"), [AREAS.estrategia, AREAS.copy], "ajustar_segmentacao", "Os leads chegam sem perfil: corrigir criativo, formulário/quiz e promessa."),
    etapa("fechamento", "Fechamento (vendas ÷ qualificados)", taxaVendaQual, cfg.get(T, "taxa_fechamento_min_pct"), [AREAS.comercial, AREAS.estrategia], "melhorar_processo_comercial", "Qualificados não viram venda: revisar oferta, abordagem e treinamento."),
  ];
  const garg = definirGargalo(res, et); semMeta(res, et);
  if (V === 0) {
    if (mult < cfg.get(T, "mult_inicio")) { insuficiente(res, "Gasto abaixo de 1x o CAC alvo."); recomendar(res, "continuar_teste", "recomendacao", "Ainda cedo para julgar por vendas: acompanhe contato, qualificação e fechamento.", "media"); return res; }
    res.situacao = "atencao";
    recomendar(res, garg?.acao || "continuar_teste", "hipotese", "Sem vendas ainda: ler o pipeline (qualificação → fechamento) antes de mexer na mídia. Respeite o ciclo comercial.", "alta");
    if (mult >= cfg.get(T, "mult_pausa")) { res.situacao = "critica"; J(res, "conclusao", `Gasto de ${num(mult, 1)}x o CAC alvo sem nenhuma venda comercial.`, "COM-SEM-VENDA"); adicionarAcao(res, "pausar", "Pausar se o pipeline também estiver fraco.", "alta"); }
    return res;
  }
  const ok = ac.cac <= meta;
  res.situacao = situacaoCusto(ac.cac, meta, cfg, false); if (res.situacao === "insuficiente") res.situacao = "atencao";
  if (ok) { J(res, "conclusao", `CAC ${brl(ac.cac)} dentro da meta ${brl(meta)} com ${V} venda(s).`, "COM-CAC-OK"); recomendar(res, "manter", "recomendacao", "CAC dentro da meta. Só escale a mídia até a capacidade de atendimento (SLA e backlog do comercial).", "media"); res.verificar_antes.push("Confirmar SLA e capacidade do comercial antes de aumentar leads."); }
  else { J(res, "conclusao", `CAC ${brl(ac.cac)} acima da meta ${brl(meta)}.`, "COM-CAC-ACIMA"); decidirDeterioracao(res, ctx, T, { campo: "cac", meta, valor: ac.cac, rotulo: "CAC" }); }
  return res;
}

// ------------------------------------------------------------------ HIGH TICKET
function high(ctx) {
  const T = "high_ticket", { cfg, ac, acum, dias, metas, c } = ctx;
  const res = novoResultado(T, "High ticket — geração de demanda comercial");
  const meta = metas.cac;
  res.metrica_mae = { id: "cac", rotulo: "CAC por venda (mídia + custo comercial informado)", valor: ac.cac, meta, unidade: "R$", periodo: ctx.a.d.cac };
  if (!isNum(acum.investimento) || acum.investimento <= 0) { insuficiente(res, "Investimento não informado."); recomendar(res, "continuar_teste", "recomendacao", "Informe o investimento do período.", "alta"); return res; }
  if (!ac.cac_inclui_custo_comercial) res.avisos.push("Custo comercial não informado: o CAC considera só a mídia.");
  const ciclo = c.ciclo_venda_dias;
  if (!isNum(ciclo)) { Q(res, false, "Ciclo médio de venda não informado na campanha."); res.avisos.push("Informe o ciclo médio de venda na campanha: sem ele não dá para saber se a ausência de vendas já é um veredito."); }
  else Q(res, isNum(dias) && dias >= ciclo, `Campanha com ${dias ?? "?"} dia(s); ciclo médio de venda de ${ciclo} dia(s).`);
  const dentroCiclo = !isNum(ciclo) || !(isNum(dias) && dias >= ciclo);
  const V = acum.vendas_comercial;
  const et = [
    etapa("qualificacao", "Qualificação (qualificados ÷ leads)", ac.taxa_qualificacao, cfg.get(T, "taxa_qualificacao_min_pct"), [AREAS.estrategia, AREAS.copy, AREAS.trafego], "ajustar_segmentacao", "Promessa/público atraem perfil errado: rever mensagem, filtros e ICP."),
    etapa("agendamento", "Agendamento (agendamentos ÷ qualificados)", ac.taxa_agendamento, cfg.get(T, "taxa_agendamento_min_pct"), [AREAS.comercial, AREAS.estrategia], "melhorar_processo_comercial", "A reunião não parece valiosa ou há fricção: rever CTA, convite, agenda e abordagem."),
    etapa("comparecimento", "Comparecimento (comparecimentos ÷ agendamentos)", ac.taxa_comparecimento, cfg.get(T, "taxa_comparecimento_min_pct"), [AREAS.comercial], "melhorar_processo_comercial", "Expectativa/compromisso fracos: lembretes, confirmação e pré-frame."),
    etapa("fechamento", "Fechamento (vendas ÷ comparecimentos)", ac.taxa_fechamento, cfg.get(T, "taxa_fechamento_min_pct"), [AREAS.comercial, AREAS.estrategia], "melhorar_processo_comercial", "Quem comparece não compra: revisar script, diagnóstico, objeções, proposta e prova."),
  ];
  const leadsMin = cfg.get(T, "min_leads_avaliacao");

  if (!isNum(meta)) { insuficiente(res, "CAC alvo não definido."); recomendar(res, "continuar_teste", "recomendacao", "Defina o CAC alvo da campanha.", "alta"); res.etapas = et; semMeta(res, et); return res; }
  const garg = definirGargalo(res, et); semMeta(res, et);
  const mult = acum.investimento / meta;

  if (!isNum(V)) { insuficiente(res, "Vendas comerciais não informadas (use 0 se não houve)."); recomendar(res, "continuar_teste", "recomendacao", "Informe as vendas fechadas (0 se nenhuma) para calcular o CAC.", "alta"); return res; }
  if (V === 0) {
    if (dentroCiclo) {
      // baixa amostra de tempo ≠ ineficiência: só indicadores antecedentes
      insuficiente(res, "Ainda dentro do ciclo médio de venda: ausência de vendas não é veredito.");
      const cplAlvo = metas.cpl, cpl = ac.cpl;
      if (isNum(acum.leads) && isNum(leadsMin) && acum.leads >= leadsMin && isNum(acum.leads_qualificados) && acum.leads_qualificados === 0) { res.situacao = "atencao"; recomendar(res, "ajustar_segmentacao", "hipotese", `${acum.leads} leads e nenhum qualificado: o problema já aparece em aquisição/qualificação, antes de qualquer venda.`, "alta"); J(res, "hipotese", "Com volume suficiente de leads e zero qualificados, esperar o ciclo só acumula verba em leads fora do perfil.", "HIGH-QUALIF-ZERO"); }
      else recomendar(res, "continuar_teste", "recomendacao", `Ainda dentro do ciclo de venda: avalie por CPL/CPQL e qualidade dos primeiros leads (CPL ${brl(cpl)}${isNum(cplAlvo) ? ` vs alvo ${brl(cplAlvo)}` : ""}).`, "media");
      J(res, "recomendacao", "Pausar por falta de vendas antes do fim do ciclo é o erro mais comum em high ticket.", "HIGH-CICLO");
      return res;
    }
    const m = cfg.get(T, "mult_pausa");
    if (mult < m) { insuficiente(res, `Ciclo cumprido, mas gasto de ${num(mult, 1)}x o CAC alvo é pouco para concluir (mínimo ${m}x): baixo volume ≠ ineficiência.`); recomendar(res, garg ? garg.acao : "continuar_teste", garg ? "hipotese" : "recomendacao", "Poucos dados para concluir. Corrija o gargalo do pipeline, se houver, e continue acumulando.", "media"); J(res, "recomendacao", "Baixo volume de dados não é prova de ineficiência.", "HIGH-AMOSTRA"); return res; }
    res.situacao = "critica"; J(res, "conclusao", `Ciclo de venda cumprido e ${num(mult, 1)}x o CAC alvo investidos sem nenhuma venda.`, "HIGH-INEFICIENTE");
    recomendar(res, garg && garg.responsaveis.includes(AREAS.comercial) ? "melhorar_processo_comercial" : "pausar", garg ? "hipotese" : "recomendacao", garg ? `${garg.texto} Resolver antes de culpar a mídia.` : "Sem vendas após o ciclo e com gasto relevante, sem gargalo identificável no pipeline: pausar e rever público/oferta.", "critica");
    if (!garg) adicionarAcao(res, "revisar_oferta", "Sem gargalo localizável: revisar oferta, ICP e ticket.", "media", "hipotese");
    return res;
  }
  // há vendas
  const ok = ac.cac <= meta;
  res.situacao = situacaoCusto(ac.cac, meta, cfg, false); if (res.situacao === "insuficiente") res.situacao = "atencao";
  if (ok) {
    J(res, "conclusao", `CAC ${brl(ac.cac)} dentro da meta ${brl(meta)} com ${V} venda(s).`, "HIGH-CAC-OK");
    const vMin = cfg.get(T, "vendas_min_escala"), est = dentroSeguidas(ctx.serie, "cac", meta, 2);
    if (V >= vMin && est && !dentroCiclo) { recomendar(res, "escalar_vertical", "recomendacao", "CAC saudável e repetido: escalar de forma progressiva, acompanhando a degradação por etapa e a capacidade comercial.", "alta"); res.verificar_antes = ["Confirmar capacidade/agenda do comercial: com agenda saturada NÃO escalar mídia.", "Usar janela móvel coerente com o ciclo; poucos fechamentos oscilam muito.", "Aumentar em degraus e acompanhar CAC por coorte/origem."]; J(res, "conclusao", `${V} vendas acumuladas e CAC dentro da meta em análises consecutivas.`, "HIGH-ESCALA"); }
    else { recomendar(res, "manter", "recomendacao", `CAC dentro da meta, mas ainda sem amostra para escalar (mínimo ${vMin} vendas, 2 análises seguidas dentro da meta e ciclo cumprido).`, "media"); J(res, "recomendacao", "Poucos fechamentos: o CAC ainda pode oscilar muito.", "HIGH-AMOSTRA-ESCALA"); }
    return res;
  }
  J(res, "conclusao", `CAC ${brl(ac.cac)} acima da meta ${brl(meta)} (+${num((ac.cac / meta - 1) * 100, 0)}%) com ${V} venda(s).`, "HIGH-CAC-ACIMA");
  if (garg) { res.situacao = pior(res.situacao, "atencao"); recomendar(res, garg.acao, "hipotese", `${garg.texto} A queda parece começar em ${garg.rotulo}; resolver antes de culpar a mídia.`, "alta"); }
  else { res.situacao = pior(res.situacao, "atencao"); recomendar(res, "novos_criativos", "hipotese", "Pipeline dentro do mínimo (ou sem metas), mas o CAC não fecha: o topo pode estar caro para a economia atual. Otimizar aquisição ou aumentar ticket/margem.", "media"); adicionarAcao(res, "revisar_oferta", "Alternativa: aumentar monetização/ticket.", "media", "hipotese"); }
  return res;
}

// ------------------------------------------------------------------ LANÇAMENTO
function lancamento(ctx) {
  const T = "lancamento", { cfg, ac, acum, dias, metas, c, a } = ctx;
  const fase = a.fase || c.fase_lancamento;
  const res = novoResultado(T, `Lançamento — ${fase || "fase não informada"}`);
  if (!fase) { insuficiente(res, "Fase do lançamento não informada."); recomendar(res, "continuar_teste", "recomendacao", "Informe a fase do lançamento (captação, aquecimento, carrinho, recuperação ou consolidado): as regras dependem dela.", "alta"); return res; }
  res.fase = fase;
  const inv = acum.investimento;
  if (fase !== "consolidado" && (!isNum(inv) || inv <= 0)) { insuficiente(res, "Investimento não informado."); recomendar(res, "continuar_teste", "recomendacao", "Informe o investimento do período.", "alta"); return res; }

  if (fase === "captacao") {
    const meta = metas.cpl, metaLeads = c.meta_leads;
    res.metrica_mae = { id: "cpl", rotulo: "CPL (acumulado)", valor: ac.cpl, meta, unidade: "R$", periodo: a.d.cpl };
    const total = diasEntre(c.data_inicio, c.data_fim);
    const falta = [];
    if (!isNum(meta)) falta.push("CPL alvo"); if (!isNum(metaLeads)) falta.push("meta de leads"); if (!isNum(total)) falta.push("datas de início e fim da campanha"); if (!isNum(acum.leads)) falta.push("leads informados");
    if (falta.length) { insuficiente(res, `Faltam: ${falta.join(", ")}.`); recomendar(res, "continuar_teste", "recomendacao", "A captação precisa de meta de leads, CPL alvo e prazo para calcular ritmo.", "alta"); return res; }
    const decorrido = Math.min(Math.max(dias ?? 0, 1), total);
    const planejado = metaLeads * (decorrido / total), indice = planejado > 0 ? acum.leads / planejado : null;
    const rMin = cfg.get(T, "ritmo_min"), rMax = cfg.get(T, "ritmo_max");
    const ritmo = indice < rMin ? "abaixo" : indice > rMax ? "acima" : "dentro";
    const cplOk = ac.cpl <= meta;
    const restantes = Math.max(metaLeads - acum.leads, 0), diasRest = Math.max(total - decorrido, 0);
    res.estimativas = { indice_ritmo: Math.round(indice * 100) / 100, leads_planejados_ate_hoje: Math.round(planejado), leads_restantes: restantes, leads_por_dia_necessarios: diasRest > 0 ? Math.ceil(restantes / diasRest) : restantes, verba_diaria_necessaria: diasRest > 0 ? Math.round((restantes / diasRest) * meta * 100) / 100 : null };
    Q(res, true, `Dia ${decorrido} de ${total}; índice de ritmo ${num(indice, 2)} (${ritmo}; faixa ${rMin}–${rMax}).`);
    const M = {
      "abaixo|true": ["escalar_vertical", "green", "Ritmo abaixo com CPL dentro da meta: há espaço econômico para recuperar volume — aumentar a verba de forma controlada, priorizando criativos e fontes vencedores.", "alta", "atencao"],
      "abaixo|false": ["novos_criativos", "red", "Ritmo abaixo e CPL acima da meta: escalar pioraria a economia. Corrigir criativo, página, público e oferta de captação antes de aumentar verba; recalcular a projeção.", "alta", "critica"],
      "dentro|true": ["manter", "green", "Ritmo e CPL dentro do plano: manter e testar melhorias sem desorganizar os vencedores.", "media", "normal"],
      "dentro|false": ["novos_criativos", "amber", "Ritmo no plano, mas com CPL acima da meta: a meta de volume está sendo atingida com custo excessivo — otimizar e proteger o orçamento total.", "media", "atencao"],
      "acima|true": ["manter", "green", "Adiantado com CPL dentro da meta: decidir se amplia a meta, cria reserva ou estabiliza o gasto. Verifique a qualidade da coorte.", "media", "normal"],
      "acima|false": ["reduzir_orcamento", "red", "Adiantado, mas o volume foi comprado caro: reduzir o marginal, concentrar nos melhores segmentos e preservar caixa.", "alta", "atencao"],
    }[`${ritmo}|${cplOk}`];
    recomendar(res, M[0], "recomendacao", M[2], M[3]); res.situacao = M[4];
    J(res, "conclusao", `Leads ${num(acum.leads, 0)} contra ${num(planejado, 0)} planejados até hoje (ritmo ${ritmo}); CPL ${brl(ac.cpl)} vs meta ${brl(meta)}.`, "LAN-CAPTACAO");
    if (M[0] === "escalar_vertical" && dias < 3) { recomendar(res, "continuar_teste", "recomendacao", "Ritmo abaixo, mas com menos de 3 dias de captação a amostra é pequena: observe mais um ciclo antes de aumentar verba.", "media"); res.situacao = "atencao"; J(res, "recomendacao", "Escala bloqueada por dados insuficientes (menos de 3 dias).", "LAN-ESCALA-BLOQUEADA"); }
    res.verificar_antes.push("Separar volume de qualidade: conferir o engajamento/consumo da coorte antes de comemorar CPL baixo.");
    return res;
  }

  if (fase === "aquecimento") {
    res.metrica_mae = { id: "presenca", rotulo: "Presença (comparecimentos ÷ inscrições)", valor: ac.taxa_presenca, meta: cfg.get(T, "taxa_presenca_min_pct"), unidade: "%", periodo: a.d.taxa_presenca };
    const e = etapa("presenca", "Presença nas aulas/aquecimento", ac.taxa_presenca, cfg.get(T, "taxa_presenca_min_pct"), [AREAS.copy, AREAS.estrategia], "revisar_copy", "Baixa ativação: revisar formato, pauta, lembretes e promessa do aquecimento.");
    res.etapas = [e]; semMeta(res, [e]);
    if (!isNum(ac.taxa_presenca)) { insuficiente(res, "Inscrições e comparecimentos não informados."); recomendar(res, "continuar_teste", "recomendacao", "Informe inscrições e comparecimentos para acompanhar a ativação da base.", "media"); return res; }
    if (e.status === "sem_meta") { res.situacao = "insuficiente"; res.qualidade_dados.nivel = "parcial"; recomendar(res, "manter", "recomendacao", `Presença de ${num(ac.taxa_presenca)}%, mas sem meta configurada: configure "taxa_presenca_min_pct" para julgar. Acompanhe consumo, engajamento e intenção antes da abertura.`, "media"); return res; }
    if (e.status === "abaixo") { res.situacao = "atencao"; definirGargalo(res, [e]); recomendar(res, "revisar_copy", "hipotese", e.texto, "alta"); } else { recomendar(res, "manter", "recomendacao", "Ativação dentro do esperado: manter o aquecimento e preparar o pré-frame da oferta.", "media"); }
    return res;
  }

  if (fase === "carrinho" || fase === "recuperacao") {
    const meta = metas.cac, V = acum.total_vendas ?? soma(acum.compras, acum.vendas_comercial);
    res.metrica_mae = { id: "cac", rotulo: "CAC (acumulado)", valor: ac.cac, meta, unidade: "R$", periodo: a.d.cac };
    if (!isNum(meta)) { insuficiente(res, "CAC alvo não definido."); recomendar(res, "continuar_teste", "recomendacao", "Defina o CAC alvo para julgar o carrinho.", "alta"); return res; }
    if (!isNum(V)) { insuficiente(res, "Vendas não informadas (use 0 se não houve)."); recomendar(res, "continuar_teste", "recomendacao", "Informe as vendas para calcular o CAC.", "alta"); return res; }
    const et = [
      etapa("visita_checkout", "Visita à página → checkout", ac.taxa_visita_checkout, cfg.get(T, "carrinho_visita_checkout_min_pct"), [AREAS.copy, AREAS.estrategia], "revisar_pagina", "Cliques sem checkout: revisar headline, oferta, prova, bônus, preço e CTA."),
      etapa("checkout_compra", "Checkout → compra", ac.taxa_checkout_compra, cfg.get(T, "carrinho_checkout_compra_min_pct"), [AREAS.tecnologia, AREAS.estrategia, AREAS.copy], "revisar_checkout", "Fricção de fechamento: pagamento, condições, confiança, bugs e objeções."),
    ];
    const garg = definirGargalo(res, et); semMeta(res, et);
    const metaVendas = c.meta_conversoes;
    const ok = isNum(ac.cac) && ac.cac <= meta;
    res.situacao = V === 0 ? "critica" : situacaoCusto(ac.cac, meta, cfg, false); if (res.situacao === "insuficiente") res.situacao = "atencao";
    if (isNum(metaVendas)) Q(res, true, `Vendas ${num(V, 0)} de ${num(metaVendas, 0)} (${num((V / metaVendas) * 100, 0)}% da meta).`);
    else res.avisos.push("Meta de conversões não definida na campanha: ritmo de vendas não avaliado.");
    if (fase === "recuperacao") { adicionarAcao(res, "revisar_checkout", "Recuperar checkouts iniciados e pagamentos não concluídos (prioridade máxima de remarketing).", "alta"); }
    if (ok && (!isNum(metaVendas) || V >= metaVendas)) { recomendar(res, "escalar_vertical", "recomendacao", "Vendas na meta com CAC saudável: escalar com controle de margem e saturação.", "alta"); J(res, "conclusao", `CAC ${brl(ac.cac)} dentro da meta e vendas no ritmo.`, "LAN-CARRINHO-OK"); res.verificar_antes = ["Conferir margem e saturação do público antes de aumentar verba.", "Priorizar remarketing por intenção (checkout iniciado primeiro)."]; }
    else if (ok) { recomendar(res, garg?.acao || "manter", garg ? "hipotese" : "recomendacao", garg ? garg.texto : "Vendas abaixo do ritmo com CAC saudável: há espaço para acelerar remarketing/aquisição, focando em segmentos de maior intenção.", "alta"); if (!garg) adicionarAcao(res, "escalar_vertical", "CAC saudável permite acelerar remarketing por intenção.", "media"); }
    else { recomendar(res, garg?.acao || "revisar_oferta", "hipotese", garg ? `${garg.texto} Não resolver só com mais verba.` : "Vendas abaixo e CAC ruim: diagnosticar oferta, base, página e qualidade das coortes — não resolver só com mais verba.", "critica"); J(res, "conclusao", `CAC ${brl(ac.cac)} acima da meta ${brl(meta)}.`, "LAN-CARRINHO-CAC"); }
    return res;
  }

  // consolidado: resultado final (conclusão)
  const meta = metas.cac;
  res.metrica_mae = { id: "roas", rotulo: "ROAS (resultado consolidado)", valor: ac.roas, meta: metas.roas, unidade: "x", periodo: a.d.roas };
  const V = acum.total_vendas ?? soma(acum.compras, acum.vendas_comercial);
  if (!isNum(acum.receita) && !isNum(acum.receita_adicional)) { insuficiente(res, "Receita não informada."); recomendar(res, "registrar_aprendizado", "recomendacao", "Informe a receita final para consolidar o resultado.", "media"); return res; }
  const nota = [];
  if (isNum(c.meta_conversoes) && isNum(V)) nota.push(`vendas ${num(V, 0)}/${num(c.meta_conversoes, 0)}`);
  if (isNum(meta) && isNum(ac.cac)) nota.push(`CAC ${brl(ac.cac)} (alvo ${brl(meta)})`);
  if (isNum(metas.roas) && isNum(ac.roas)) nota.push(`ROAS ${num(ac.roas, 2)} (alvo ${num(metas.roas, 2)})`);
  const metaOk = (!isNum(meta) || (isNum(ac.cac) && ac.cac <= meta)) && (!isNum(metas.roas) || (isNum(ac.roas) && ac.roas >= metas.roas)) && (!isNum(c.meta_conversoes) || (isNum(V) && V >= c.meta_conversoes));
  res.situacao = metaOk ? "normal" : "atencao";
  J(res, "conclusao", `Resultado consolidado: ${nota.join("; ") || "sem metas configuradas"}. ${metaOk ? "Metas atingidas." : "Há metas não atingidas."}`, "LAN-CONSOLIDADO");
  recomendar(res, "registrar_aprendizado", "conclusao", "Lançamento encerrado: registre o pós-mortem (origens que geraram compradores, forecast vs realizado, CAC real e marginal, motivos de não compra).", "media");
  return res;
}
