// Cascata de Decisão de Tráfego Pago — Mantora Lab (POP v1.0)
// Motor puro: sem DOM, sem rede, sem backend. Cada função devolve
// { decisao, diagnostico, evidencias[], responsaveis[] } para a UI e para os testes.

export const AREAS = {
  trafego: "Tráfego",
  copy: "Copy",
  estrategia: "Estratégia",
  tecnologia: "Tecnologia / Página",
  comercial: "Comercial",
  especialista: "Especialista",
  gestao: "Gestão",
};

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : NaN);
const has = (v) => v !== "" && v != null && Number.isFinite(Number(v));
const pct = (v) => `${(v * 100).toFixed(1).replace(".", ",")}%`;
export const brl = (v) =>
  Number.isFinite(v) ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const uniq = (a) => [...new Set(a)];

// ---------------------------------------------------------------- Low Ticket

export const PAPEIS_LOW = {
  lucro: { label: "Produto de lucro", min: 0.45, max: 0.5, ref: "45% a 50% do ticket" },
  aquisicao: { label: "Produto de aquisição", min: 0.5, max: 0.8, ref: "até 80% do ticket" },
  checkout: { label: "Monetização forte no checkout", min: 0.8, max: 1, ref: "pode chegar ao empate (100%) se os bumps compensarem" },
};

/** CPA esperado a partir do ticket e do papel econômico (seção 2). */
export function cpaEsperadoLow({ ticket, papel }) {
  const p = PAPEIS_LOW[papel];
  if (!p || !(ticket > 0)) return null;
  return { min: ticket * p.min, max: ticket * p.max, sugerido: ticket * (papel === "lucro" ? 0.5 : p.max), ref: p.ref };
}

/** Verba diária inicial por conjunto ≈ 1 CPA esperado, janela de 3 dias (seção 4). */
export function planoTesteAbo({ cpaEsperado, criativos = 3 }) {
  return {
    verbaDiariaPorConjunto: cpaEsperado,
    verbaDiariaTotal: cpaEsperado * criativos,
    investimentoJanela3d: cpaEsperado * criativos * 3,
    conjuntos: criativos,
    regra: "ABO: 1 campanha de teste, 1 conjunto por criativo, 3 dias. Cadência: 3 a 5 criativos novos por semana.",
  };
}

/** Cascata após 3 dias de teste (seção 5). */
export function decidirCriativoLow({ cpaEsperado, vendas, gasto }) {
  const v = num(vendas);
  const g = num(gasto);
  const cpa = v > 0 && g >= 0 ? g / v : NaN;
  const ev = [];
  if (Number.isFinite(cpa)) ev.push(`CPA real ${brl(cpa)} vs meta ${brl(cpaEsperado)}`);
  ev.push(`${v} venda(s) na janela`);

  if (v === 0)
    return {
      decisao: "DESLIGAR", tom: "red",
      diagnostico: "Sem tração na janela inicial. Registrar a hipótese de falha para alimentar a próxima leva; não insistir sem sinal.",
      evidencias: ev, responsaveis: [AREAS.copy, AREAS.trafego],
    };
  if (v === 1)
    return {
      decisao: "DIAGNOSTICAR", tom: "amber",
      diagnostico: "Sinal insuficiente para decisão direta. Ler CPM, CTR, retenção, connect rate, ida ao checkout e checkout antes de decidir.",
      evidencias: ev, responsaveis: [AREAS.trafego],
    };
  if (Number.isFinite(cpa) && cpa <= cpaEsperado && v >= 4)
    return {
      decisao: "PRÉ-ESCALA", tom: "green",
      diagnostico: "Vendas recorrentes com CPA abaixo do esperado. Lateralizar para nova campanha (CBO, ou ABO com mais de um criativo) somando ~1 a 2 CPAs de verba; manter o original no teste.",
      evidencias: ev, responsaveis: [AREAS.trafego],
    };
  return {
    decisao: "MANTER EM TESTE", tom: "blue",
    diagnostico: "Aproximadamente 0,7 a 1 venda/dia. Não escalar nem reduzir: dar mais dias para confirmar tração e estabilidade do CPA.",
    evidencias: ev, responsaveis: [AREAS.trafego],
  };
}

/** Escala/redução (seções 6 e 7). `cpaSerie` = CPA diário mais recente por último. */
export function decidirEscala({ cpaEsperado, cpaSerie }) {
  const s = (cpaSerie || []).map(num).filter(Number.isFinite);
  if (s.length < 2) return { decisao: "DADOS INSUFICIENTES", tom: "amber", diagnostico: "Informe pelo menos 2 dias de CPA.", evidencias: [], responsaveis: [] };
  const acima = s.map((c) => c > cpaEsperado);
  const ultimo = s[s.length - 1];
  const folga = (cpaEsperado - ultimo) / cpaEsperado;
  const ev = [`CPA últimos dias: ${s.map(brl).join(" → ")}`, `Meta ${brl(cpaEsperado)}`];

  if (!acima.some(Boolean)) {
    const passo = folga >= 0.3 ? "50%" : folga >= 0.15 ? "30%" : "20%";
    return { decisao: `ESCALAR +${passo}/dia`, tom: "green",
      diagnostico: `CPA dentro da meta em todo o período (folga atual ${pct(Math.max(folga, 0))}). Aumentar orçamento em degraus de 20% a 50% ao dia conforme a folga.`,
      evidencias: ev, responsaveis: [AREAS.trafego] };
  }
  const consecutivos = (() => { let n = 0; for (let i = acima.length - 1; i >= 0 && acima[i]; i--) n++; return n; })();
  if (consecutivos <= 1)
    return { decisao: "OBSERVAR", tom: "amber",
      diagnostico: "Oscilação pontual: um dia fora da meta não é deterioração estrutural. Manter vigilância antes de intervir.",
      evidencias: ev, responsaveis: [AREAS.trafego] };
  if (consecutivos === 2)
    return { decisao: "REDUZIR EM DEGRAUS", tom: "amber",
      diagnostico: "CPA fora da meta por mais de um ciclo. Reduzir orçamento em degraus e observar se a eficiência volta; se melhorar, manter a nova faixa.",
      evidencias: ev, responsaveis: [AREAS.trafego] };
  return { decisao: "DIAGNÓSTICO SECUNDÁRIO", tom: "red",
    diagnostico: "CPA não recupera. Verificar fadiga, público, criativo, página, checkout e oferta; considerar sazonalidade do mês.",
    evidencias: ev, responsaveis: [AREAS.trafego, AREAS.copy, AREAS.estrategia] };
}

// Faixas do painel de métricas secundárias (seção 8). dir: "min" = maior é melhor.
export const METRICAS_LOW = [
  { id: "ctr", label: "CTR (%)", escala: 100, saudavel: 1, excelente: 1.5, critico: 0.7, fator: "criativo" },
  { id: "connect", label: "Connect Rate (%)", escala: 100, saudavel: 80, excelente: 90, critico: 80, fator: "tecnologia" },
  { id: "paginaCheckout", label: "Página → Checkout (%)", escala: 100, saudavel: 20, excelente: 25, critico: 20, fator: "pagina" },
  { id: "checkoutCompra", label: "Checkout → Compra (%)", escala: 100, saudavel: 40, excelente: 50, critico: 40, fator: "checkout" },
  { id: "bumpBarato", label: "Order bump barato (%)", escala: 100, saudavel: 25, excelente: 30, critico: 15, fator: "oferta" },
  { id: "bumpMaior", label: "Order bump maior (%)", escala: 100, saudavel: 5, excelente: 10, critico: 2, fator: "oferta" },
];

function faixa(m, v) {
  if (v >= m.excelente) return "excelente";
  if (v >= m.saudavel) return "saudavel";
  if (v >= m.critico) return "atencao";
  return "critica";
}

/** Lê CPA + métricas secundárias e roteia o gargalo (seções 8, 9 e 10). */
export function diagnosticarLow(d) {
  const cpaOk = has(d.cpaReal) && has(d.cpaEsperado) ? num(d.cpaReal) <= num(d.cpaEsperado) : null;
  const leituras = [];
  for (const m of METRICAS_LOW) {
    if (!has(d[m.id])) continue;
    leituras.push({ ...m, valor: num(d[m.id]), faixa: faixa(m, num(d[m.id])) });
  }
  const f = Object.fromEntries(leituras.map((l) => [l.id, l.faixa]));
  const ruim = (id) => f[id] === "critica" || f[id] === "atencao";
  const ev = leituras.map((l) => `${l.label}: ${l.valor} (${l.faixa})`);
  if (cpaOk != null) ev.unshift(`CPA ${brl(num(d.cpaReal))} vs meta ${brl(num(d.cpaEsperado))}`);

  if (cpaOk === true)
    return {
      decisao: "PRESERVAR", tom: "green",
      diagnostico: "CPA dentro da meta: o funil está economicamente saudável. Métricas secundárias “feias” viram aprendizado, não motivo para mexer. Documentar e monitorar tendência.",
      evidencias: ev, responsaveis: [AREAS.trafego], leituras,
    };
  if (cpaOk == null)
    return { decisao: "INFORME CPA", tom: "amber", diagnostico: "Informe CPA real e CPA esperado.", evidencias: ev, responsaveis: [], leituras };

  // CPA fora da meta: seguir a ordem do funil — técnica primeiro (seção 9).
  if (f.connect === "critica")
    return { decisao: "CORRIGIR ANTES DE INTERPRETAR", tom: "red",
      diagnostico: "Connect Rate < 80% é prioridade técnica: falha de carregamento, rastreio ou experiência. Corrigir antes de ler o resto do funil.",
      evidencias: ev, responsaveis: [AREAS.tecnologia], leituras };
  if (ruim("ctr"))
    return { decisao: "NOVA LEVA DE CRIATIVOS", tom: "red",
      diagnostico: "CPA ruim com CTR baixo: o criativo não gera interesse suficiente. Nova leva de hooks, ângulos e criativos.",
      evidencias: ev, responsaveis: [AREAS.copy, AREAS.trafego], leituras };
  if (ruim("paginaCheckout"))
    return { decisao: "REVISAR PÁGINA / OFERTA", tom: "red",
      diagnostico: "Pessoas chegam, mas não avançam ao checkout. Revisar primeira dobra, oferta, promessa, provas e coerência anúncio → página.",
      evidencias: ev, responsaveis: [AREAS.copy, AREAS.estrategia], leituras };
  if (ruim("checkoutCompra"))
    return { decisao: "REVISAR FECHAMENTO", tom: "red",
      diagnostico: "O desejo existe, mas a decisão final falha. Revisar preço, meios de pagamento, objeções, confiança e checkout.",
      evidencias: ev, responsaveis: [AREAS.estrategia, AREAS.copy, AREAS.tecnologia], leituras };
  if (has(d.ctr) && f.ctr === "excelente" && leituras.length === 1)
    return { decisao: "REVISAR QUALIFICAÇÃO", tom: "amber",
      diagnostico: "CTR alto + CPA ruim: há interesse, mas possivelmente pouco qualificado ou ruptura depois do clique.",
      evidencias: ev, responsaveis: [AREAS.copy, AREAS.estrategia], leituras };
  if (leituras.length === 0)
    return { decisao: "INFORME MÉTRICAS", tom: "amber", diagnostico: "CPA fora da meta. Preencha as métricas secundárias para localizar o gargalo.", evidencias: ev, responsaveis: [AREAS.trafego], leituras };
  return { decisao: "REVER ECONOMIA", tom: "red",
    diagnostico: "Todas as etapas parecem saudáveis, mas o CPA segue inviável: o problema pode ser estrutural (ticket, posição na esteira, robustez ou papel da oferta).",
    evidencias: ev, responsaveis: [AREAS.estrategia, AREAS.especialista], leituras };
}

// --------------------------------------------------------------- Médio Ticket

export const ARQUITETURAS_MEDIO = {
  pagina: { label: "Venda direta por página", metrica: "CPA por compra", etapas: ["Anúncio → página", "Página → checkout", "Checkout → compra"] },
  vsl: { label: "VSL", metrica: "CPA por compra", etapas: ["Clique → play", "Retenção", "CTA", "Checkout → compra"] },
  quiz: { label: "Quiz / diagnóstico", metrica: "CPA por compra ou CPL + CPA final", etapas: ["Início", "Conclusão", "Captura", "Resultado → CTA", "Checkout/compra"] },
  comercial: { label: "Lead para comercial", metrica: "CAC por venda", etapas: ["Lead", "Contato", "Qualificação", "Proposta", "Venda"] },
  hibrido: { label: "Híbrido", metrica: "CPA direto + CAC assistido", etapas: ["Self-service", "Assistido"] },
};

/** CPA/CAC máximo = receita líquida − custos variáveis − margem mínima (seção 18). */
export function economiaMedio({ ticket, descontoPct = 0, receitaExtraPorComprador = 0, reembolsoPct = 0, custosVariaveis = 0, custoComercial = 0, margemMinima = 0, folgaSeguranca = 0.15 }) {
  const receita = (ticket * (1 - descontoPct / 100) + receitaExtraPorComprador) * (1 - reembolsoPct / 100);
  const max = receita - custosVariaveis - custoComercial - margemMinima;
  const alvo = max * (1 - folgaSeguranca);
  return { receitaLiquida: receita, max, alvo, viavel: max > 0 };
}

/** Leitura de teste por múltiplos do CPA-alvo (seção 19; parâmetros V0). */
export function lerTesteMedio({ cpaAlvo, gasto, vendas, sinaisFracos, temIntencao }) {
  const mult = gasto / cpaAlvo;
  const ev = [`Gasto ${brl(gasto)} = ${mult.toFixed(2).replace(".", ",")}x CPA-alvo`, `${vendas} venda(s)`];
  const cpa = vendas > 0 ? gasto / vendas : NaN;
  if (vendas >= 2 && cpa <= cpaAlvo)
    return { decisao: "PRÉ-ESCALA", tom: "green", diagnostico: "Vendas recorrentes abaixo da meta: lateralizar e entrar em pré-escala.", evidencias: [...ev, `CPA ${brl(cpa)}`], responsaveis: [AREAS.trafego] };
  if (vendas === 1 && cpa <= cpaAlvo && !sinaisFracos)
    return { decisao: "MANTER ATÉ REPETIR", tom: "blue", diagnostico: "Venda dentro do CPA com sinais saudáveis. Uma venda não basta para declarar escala: confirmar repetição.", evidencias: [...ev, `CPA ${brl(cpa)}`], responsaveis: [AREAS.trafego] };
  if (vendas === 0) {
    if (mult < 1) return { decisao: "AGUARDAR", tom: "blue", diagnostico: "Ainda cedo para declarar vencedor/perdedor. Preservar o teste e observar clique e avanço.", evidencias: ev, responsaveis: [AREAS.trafego] };
    if (mult < 1.5) return temIntencao && !sinaisFracos
      ? { decisao: "MANTER E DIAGNOSTICAR FUNDO", tom: "amber", diagnostico: "Existe intenção (checkout/lead qualificado) mas falta confirmar fechamento. Dar mais dados e diagnosticar o fundo do funil.", evidencias: ev, responsaveis: [AREAS.trafego, AREAS.estrategia] }
      : { decisao: "REVISAR CRIATIVO", tom: "amber", diagnostico: "Perto de 1 CPA sem venda e quase nenhum avanço: revisar criativo/qualificação; pausar mais cedo se as métricas também forem ruins.", evidencias: ev, responsaveis: [AREAS.copy, AREAS.trafego] };
    if (sinaisFracos) return { decisao: "PAUSAR", tom: "red", diagnostico: "1,5–2x o CPA-alvo sem venda e com sinais fracos: o teste consumiu margem relevante sem evidência. Pausar e alimentar nova hipótese.", evidencias: ev, responsaveis: [AREAS.copy, AREAS.trafego] };
    return { decisao: "DECIDIR COM CRITÉRIO", tom: "amber", diagnostico: "Acima de 1,5x sem venda, mas sinais não são fracos: ler checkout/intenção antes de pausar.", evidencias: ev, responsaveis: [AREAS.trafego, AREAS.estrategia] };
  }
  return { decisao: "FORA DA META", tom: "amber", diagnostico: "Há venda, mas o CPA excede a meta. Diagnosticar a etapa que perde conversão.", evidencias: [...ev, `CPA ${brl(cpa)}`], responsaveis: [AREAS.trafego, AREAS.estrategia] };
}

/** Modelo assistido: CAC total = (mídia + custo comercial) / vendas (seção 23). */
export function cacAssistido({ gastoMidia, custoComercial = 0, leads, contatados, qualificados, vendas, cacMax }) {
  const cac = vendas > 0 ? (gastoMidia + custoComercial) / vendas : NaN;
  const taxa = (a, b) => (b > 0 ? a / b : NaN);
  const cpl = taxa(gastoMidia, leads);
  const etapas = [
    { nome: "Contato", valor: taxa(contatados, leads), area: [AREAS.comercial, AREAS.gestao], msg: "Baixa taxa de contato: revisar dados, canal, velocidade e cadência." },
    { nome: "Qualificação", valor: taxa(qualificados, contatados), area: [AREAS.estrategia, AREAS.copy], msg: "Baixa qualificação: corrigir criativo, formulário/quiz e promessa." },
    { nome: "Fechamento", valor: taxa(vendas, qualificados), area: [AREAS.comercial, AREAS.estrategia], msg: "Baixo fechamento: revisar oferta, abordagem e treinamento." },
  ];
  const ev = [`CPL ${brl(cpl)}`, `CAC total ${brl(cac)}`, ...etapas.map((e) => `${e.nome}: ${pct(e.valor)}`)];
  if (Number.isFinite(cac) && cac <= cacMax)
    return { decisao: "CAC DENTRO DA META", tom: "green", diagnostico: "Modelo assistido saudável. Só escalar mídia até a capacidade de atendimento do comercial (SLA e backlog).", evidencias: ev, responsaveis: [AREAS.trafego, AREAS.comercial], etapas, cac, cpl };
  const pior = etapas.filter((e) => Number.isFinite(e.valor)).sort((a, b) => a.valor - b.valor)[0];
  return { decisao: "CAC ACIMA DA META", tom: "red", diagnostico: `CPL não é sucesso final. ${pior ? `Maior perda em ${pior.nome}: ${pior.msg}` : "Informe os volumes por etapa."}`, evidencias: ev, responsaveis: pior ? pior.area : [AREAS.estrategia], etapas, cac, cpl };
}

// ---------------------------------------------------------------- High Ticket

/** Metas intermediárias a partir do CAC máximo e taxas reais (seção 29). */
export function economiaReversa({ cacMax, leadVenda, qualVenda, agendVenda, showVenda }) {
  const m = (t) => (has(t) && t > 0 ? cacMax * (t / 100) : null);
  return { cplMax: m(leadVenda), cpqlMax: m(qualVenda), custoAgendamentoMax: m(agendVenda), custoComparecimentoMax: m(showVenda) };
}

/** Localiza a primeira etapa abaixo da meta no pipeline (seções 32–35). */
export function diagnosticarHighTicket(d) {
  const t = (a, b) => (b > 0 ? a / b : NaN);
  const etapas = [
    { nome: "Contato", real: t(d.contatados, d.leads), meta: d.metaContato, area: [AREAS.comercial, AREAS.gestao], acao: "Operação perde demanda quente: corrigir SLA, dados, canal e cadência." },
    { nome: "Qualificação", real: t(d.qualificados, d.contatados), meta: d.metaQualificacao, area: [AREAS.estrategia, AREAS.copy, AREAS.trafego], acao: "Promessa/público atraem perfil errado: rever mensagem, filtros e ICP." },
    { nome: "Agendamento", real: t(d.agendados, d.qualificados), meta: d.metaAgendamento, area: [AREAS.comercial, AREAS.estrategia], acao: "A call não parece valiosa ou há fricção: rever CTA, convite, agenda e abordagem." },
    { nome: "Comparecimento", real: t(d.compareceram, d.agendados), meta: d.metaShow, area: [AREAS.comercial], acao: "Expectativa/compromisso fracos: lembretes, confirmação, pré-frame e follow-up." },
    { nome: "Fechamento", real: t(d.vendas, d.compareceram), meta: d.metaFechamento, area: [AREAS.comercial, AREAS.estrategia], acao: "Problema comercial/oferta: revisar script, diagnóstico, objeções, proposta e prova." },
  ].map((e) => ({ ...e, meta: has(e.meta) ? num(e.meta) / 100 : NaN }));

  const cpl = t(d.gasto, d.leads);
  const cac = d.vendas > 0 ? d.gasto / d.vendas : NaN;
  const ev = [`CPL ${brl(cpl)}`, `CAC ${brl(cac)} vs máx. ${brl(d.cacMax)}`, ...etapas.map((e) => `${e.nome}: ${pct(e.real)}${Number.isFinite(e.meta) ? ` (meta ${pct(e.meta)})` : ""}`)];

  if (d.dentroDoCiclo)
    return { decisao: "NÃO JULGAR POR VENDA AINDA", tom: "blue", diagnostico: "O ciclo médio de venda não terminou: ausência de vendas não é veredito. Ler CPL/CPQL e a qualidade dos primeiros leads.", evidencias: ev, responsaveis: [AREAS.trafego], etapas };
  if (Number.isFinite(cac) && cac <= d.cacMax) {
    const sat = d.capacidadeSaturada;
    return { decisao: sat ? "NÃO ESCALAR MÍDIA" : "ESCALAR COM CONTROLE", tom: sat ? "amber" : "green", diagnostico: sat ? "CAC bom, mas a agenda está saturada: aumentar capacidade comercial ou controlar a entrada antes de comprar mais lead." : "CAC saudável: escalar progressivamente, acompanhando degradação por etapa e estabilidade das taxas.", evidencias: ev, responsaveis: [AREAS.trafego, AREAS.comercial], etapas };
  }
  const quebra = etapas.find((e) => Number.isFinite(e.real) && Number.isFinite(e.meta) && e.real < e.meta);
  if (quebra)
    return { decisao: `GARGALO: ${quebra.nome.toUpperCase()}`, tom: "red", diagnostico: `${quebra.acao} Resolver antes de culpar a mídia.`, evidencias: ev, responsaveis: quebra.area, etapas };
  return { decisao: "TOPO CARO", tom: "amber", diagnostico: "Etapas do pipeline dentro da meta, mas o CAC não fecha: o topo está caro para a economia atual. Otimizar aquisição ou aumentar ticket/margem.", evidencias: ev, responsaveis: [AREAS.trafego, AREAS.estrategia], etapas };
}

// ------------------------------------------------------------------ Lançamento

/** Projeção reversa com cenários conservador/base/agressivo (seção 39). */
export function projecaoLancamento({ metaReceita, ticket, cacMax, conversoes, cplPlanejado }) {
  const vendas = Math.ceil(metaReceita / ticket);
  const cenarios = Object.entries(conversoes).map(([nome, taxa]) => {
    const leads = Math.ceil(vendas / (taxa / 100));
    const cplEconomicoMax = cacMax * (taxa / 100);
    const orcamento = leads * cplPlanejado;
    return { nome, taxa, leads, cplEconomicoMax, orcamento, cplViavel: cplPlanejado <= cplEconomicoMax, cacImplicito: orcamento / vendas };
  });
  return { vendas, cenarios };
}

/** Ritmo de captação (seção 40) + matriz ritmo × CPL (seção 41). */
export function ritmoCaptacao({ metaLeads, leadsAcumulados, diasTotais, diaAtual, cplAtual, cplMeta, mediaRecente }) {
  const diasRestantes = Math.max(diasTotais - diaAtual, 0);
  const planejado = metaLeads * (diaAtual / diasTotais);
  const indice = planejado > 0 ? leadsAcumulados / planejado : NaN;
  const restantes = Math.max(metaLeads - leadsAcumulados, 0);
  const porDia = diasRestantes > 0 ? restantes / diasRestantes : restantes;
  const projecao = leadsAcumulados + diasRestantes * (has(mediaRecente) ? num(mediaRecente) : leadsAcumulados / Math.max(diaAtual, 1));
  const ritmo = indice < 0.9 ? "abaixo" : indice > 1.1 ? "acima" : "dentro";
  const cplOk = cplAtual <= cplMeta;
  const M = {
    "abaixo|true": ["AUMENTAR VERBA COM CONTROLE", "green", "Há espaço econômico para recuperar volume: aumentar verba de forma controlada, priorizando criativos e fontes vencedores.", [AREAS.trafego]],
    "abaixo|false": ["CORRIGIR ANTES DE ESCALAR", "red", "Escalar pioraria a economia. Corrigir criativo, página, público e oferta de captação; recalcular a projeção.", [AREAS.copy, AREAS.estrategia, AREAS.trafego]],
    "dentro|true": ["MANTER PLANO", "green", "Plano saudável: manter e testar melhorias sem desorganizar vencedores.", [AREAS.trafego]],
    "dentro|false": ["OTIMIZAR CUSTO", "amber", "A meta de volume está sendo atingida com custo excessivo: otimizar e proteger o orçamento total.", [AREAS.trafego, AREAS.copy]],
    "acima|true": ["ADIANTAMENTO SAUDÁVEL", "green", "Decidir se vale ampliar a meta, criar reserva ou estabilizar o gasto. Checar a qualidade da coorte.", [AREAS.trafego, AREAS.estrategia]],
    "acima|false": ["REDUZIR MARGINAL", "red", "Volume foi comprado caro: reduzir o marginal, concentrar nos melhores segmentos e preservar caixa.", [AREAS.trafego]],
  }[`${ritmo}|${cplOk}`];
  return {
    decisao: M[0], tom: M[1], diagnostico: M[2], responsaveis: M[3],
    evidencias: [`Índice de ritmo ${indice.toFixed(2).replace(".", ",")} (${ritmo})`, `CPL ${brl(cplAtual)} vs meta ${brl(cplMeta)}`, `Faltam ${Math.ceil(restantes)} leads em ${diasRestantes} dia(s)`],
    metricas: { indice, restantes, porDia, verbaDiaria: porDia * cplMeta, projecao, planejado },
  };
}

/** Cascata durante o carrinho aberto (seção 46). */
export function carrinhoAberto({ vendas, metaVendasAteAgora, cac, cacMax, cliquesOferta, checkoutIniciado, compras, baseLeads }) {
  const t = (a, b) => (b > 0 ? a / b : NaN);
  const ativacao = t(cliquesOferta, baseLeads), pagCheckout = t(checkoutIniciado, cliquesOferta), checkoutCompra = t(compras, checkoutIniciado);
  const ev = [`Vendas ${vendas}/${metaVendasAteAgora} esperadas`, `CAC ${brl(cac)} vs máx. ${brl(cacMax)}`, `Ativação ${pct(ativacao)} · Página→checkout ${pct(pagCheckout)} · Checkout→compra ${pct(checkoutCompra)}`];
  const abaixo = vendas < metaVendasAteAgora, cacOk = cac <= cacMax;
  if (!abaixo && cacOk) return { decisao: "ESCALAR COM CONTROLE", tom: "green", diagnostico: "Lançamento responde bem: escalar com controle de margem e saturação.", evidencias: ev, responsaveis: [AREAS.trafego, AREAS.estrategia] };
  if (abaixo && !cacOk) return { decisao: "NÃO RESOLVER COM VERBA", tom: "red", diagnostico: "Vendas abaixo e CAC ruim: diagnosticar oferta, base, página e qualidade das coortes.", evidencias: ev, responsaveis: [AREAS.estrategia, AREAS.copy, AREAS.trafego] };
  if (checkoutCompra < 0.4) return { decisao: "FRICÇÃO DE FECHAMENTO", tom: "red", diagnostico: "Checkout alto + compra baixa: pagamento, condições, confiança, bugs e objeções.", evidencias: ev, responsaveis: [AREAS.tecnologia, AREAS.estrategia, AREAS.copy] };
  if (pagCheckout < 0.2) return { decisao: "PÁGINA NÃO CONVERTE", tom: "red", diagnostico: "Cliques altos + pouco checkout: revisar headline, oferta, prova, bônus, preço e CTA.", evidencias: ev, responsaveis: [AREAS.copy, AREAS.estrategia] };
  if (ativacao < 0.15) return { decisao: "BASE NÃO ATIVOU", tom: "amber", diagnostico: "Poucos cliques para a oferta: reforçar mensagens, prova, urgência legítima e segmentação.", evidencias: ev, responsaveis: [AREAS.copy, AREAS.estrategia] };
  return { decisao: "ACELERAR REMARKETING", tom: "green", diagnostico: "Vendas abaixo do ritmo com CAC saudável: aumentar verba focando segmentos de maior intenção (checkout iniciado primeiro).", evidencias: ev, responsaveis: [AREAS.trafego] };
}

export const REMARKETING = [
  { prioridade: 1, nivel: "Muito alta", publico: "Checkout iniciado / boleto-Pix não concluído", mensagem: "Resolver objeção/fricção e facilitar conclusão." },
  { prioridade: 2, nivel: "Alta", publico: "Visitou a página várias vezes ou clicou no CTA", mensagem: "Prova, FAQ, demonstração, comparação, garantia." },
  { prioridade: 3, nivel: "Média", publico: "Consumiu aulas/conteúdo e engajou", mensagem: "Conectar aprendizado à oferta e ao próximo passo." },
  { prioridade: 4, nivel: "Baixa", publico: "Lead com pouco comportamento posterior", mensagem: "Reativação e recap; evitar excesso de verba sem sinal." },
];

// --------------------------------------------------------- Comunicação interna

/** Mensagem no padrão da seção 52: números + hipótese + pedido claro. */
export function mensagemInterna({ modelo, meta, atual, etapa, metricas, hipotese, acaoFeita, pedido, responsaveis }) {
  const linhas = [
    `📌 ${modelo}`,
    `1. Meta econômica: ${meta}`,
    `2. Resultado atual: ${atual}`,
    `3. Etapa da anomalia: ${etapa}`,
    `4. Métricas: ${metricas.join("; ")}`,
    `5. Hipótese principal: ${hipotese}`,
    `6. Ação já executada: ${acaoFeita || "nenhuma até agora"}`,
    `7. Pedido: ${pedido}${responsaveis?.length ? ` (${uniq(responsaveis).join(" + ")})` : ""}`,
  ];
  return linhas.join("\n");
}
