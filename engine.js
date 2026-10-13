// Cascata de Decisão de Tráfego Pago — Mantora Lab (POP v1.0)
// Motor puro: sem DOM, sem rede, sem backend. Cada função devolve
// { decisao, tom, diagnostico, evidencias[], responsaveis[] } para a UI e os testes.

export const AREAS = {
  trafego: "Tráfego",
  copy: "Copy",
  estrategia: "Estratégia",
  tecnologia: "Tecnologia / Página",
  comercial: "Comercial",
  especialista: "Especialista",
  gestao: "Gestão",
};

// ------------------------------------------------------------------ Parâmetros
// fonte "POP": número escrito no documento. "provisorio": o POP não define o número;
// é um valor de trabalho editável (Governança → Parâmetros) a substituir pelo histórico real.
export const PARAMS = [
  { id: "ctrSaudavel", label: "CTR saudável (%)", def: 1, fonte: "POP", sec: "8" },
  { id: "ctrExcelente", label: "CTR excelente (%)", def: 1.5, fonte: "POP", sec: "8", nota: "POP: 1,5% a 2% ou mais." },
  { id: "connectMin", label: "Connect Rate mínimo (%)", def: 80, fonte: "POP", sec: "8" },
  { id: "pagCheckoutMin", label: "Página → Checkout mínimo (%)", def: 20, fonte: "POP", sec: "8" },
  { id: "checkoutCompraMin", label: "Checkout → Compra mínimo (%)", def: 40, fonte: "POP", sec: "8" },
  { id: "bumpBaratoMeta", label: "Order bump barato — meta (%)", def: 25, fonte: "POP", sec: "3", nota: "POP: 25% a 30%." },
  { id: "bumpBaratoExc", label: "Order bump barato — excelente (%)", def: 30, fonte: "POP", sec: "3" },
  { id: "bumpMaiorMin", label: "Order bump maior — piso (%)", def: 5, fonte: "POP", sec: "3" },
  { id: "bumpMaiorExc", label: "Order bump maior — excelente (%)", def: 10, fonte: "POP", sec: "3" },
  { id: "preEscalaVendasMin", label: "Pré-escala: vendas mínimas na janela de 3 dias", def: 4, fonte: "provisorio", sec: "5", nota: "O POP diz “vendas recorrentes” sem número (2–3 vendas = manter em teste)." },
  { id: "escalaFolgaMedia", label: "Escala: folga do CPA (%) a partir da qual subir ~30%/dia", def: 15, fonte: "provisorio", sec: "6", nota: "O POP diz 20% a 50% ao dia “conforme a folga”, sem tabela." },
  { id: "escalaFolgaAlta", label: "Escala: folga do CPA (%) a partir da qual subir ~50%/dia", def: 30, fonte: "provisorio", sec: "6" },
  { id: "medioMultInicio", label: "Médio Ticket: gasto (x CPA-alvo) para começar a decidir", def: 1, fonte: "POP", sec: "19", nota: "Parâmetro V0 do POP." },
  { id: "medioMultPausa", label: "Médio Ticket: gasto (x CPA-alvo) para pausar sem venda e com sinais fracos", def: 1.5, fonte: "POP", sec: "19", nota: "Parâmetro V0: 1,5–2 CPA." },
  { id: "folgaSeguranca", label: "Médio Ticket: margem de segurança do alvo sobre o máximo (%)", def: 15, fonte: "provisorio", sec: "18", nota: "O POP pede alvo abaixo do máximo, sem percentual." },
  { id: "ritmoMin", label: "Lançamento: índice de ritmo mínimo", def: 0.9, fonte: "POP", sec: "40" },
  { id: "ritmoMax", label: "Lançamento: índice de ritmo máximo", def: 1.1, fonte: "POP", sec: "40" },
  { id: "carrinhoAtivacaoMin", label: "Carrinho: ativação mínima (cliques ÷ base, %)", def: 15, fonte: "provisorio", sec: "46", nota: "O POP não dá número." },
  { id: "carrinhoPagCheckoutMin", label: "Carrinho: clique → checkout mínimo (%)", def: 20, fonte: "provisorio", sec: "46", nota: "Referência do Low Ticket; ajuste ao lançamento." },
  { id: "carrinhoCheckoutCompraMin", label: "Carrinho: checkout → compra mínimo (%)", def: 40, fonte: "provisorio", sec: "46", nota: "Referência do Low Ticket; ajuste ao lançamento." },
];
export const defaults = () => Object.fromEntries(PARAMS.map((p) => [p.id, p.def]));
const C = (cfg) => {
  const d = defaults();
  for (const [k, v] of Object.entries(cfg || {})) if (Number.isFinite(Number(v)) && v !== "") d[k] = Number(v);
  return d;
};

const num = (v) => (v === "" || v == null ? NaN : Number(v));
const has = (v) => v !== "" && v != null && Number.isFinite(Number(v));
const pct = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(1).replace(".", ",")}%` : "—");
export const brl = (v) => (Number.isFinite(v) ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—");
const uniq = (a) => [...new Set(a)];
const div = (a, b) => (b > 0 ? a / b : NaN);
const sem = (areas) => ({ responsaveis: areas });

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

/**
 * Economia dos order bumps (seção 3). bumps: [{preco, adesao(%)}].
 * Ticket médio de carrinho = ticket + Σ preço × adesão.
 */
export function economiaBumps({ ticket, cpa, bumps, cfg }) {
  const c = C(cfg);
  const lista = (bumps || []).filter((b) => has(b.preco) && has(b.adesao));
  const extra = lista.reduce((s, b) => s + num(b.preco) * (num(b.adesao) / 100), 0);
  const ticketMedio = ticket + extra;
  const ev = [];
  const [barato, , maior] = bumps || [];
  if (barato && has(barato.adesao)) ev.push(`Bump barato: ${barato.adesao}% (meta ${c.bumpBaratoMeta}–${c.bumpBaratoExc}%) → ${num(barato.adesao) >= c.bumpBaratoMeta ? "dentro" : "abaixo da meta"}`);
  if (maior && has(maior.adesao)) ev.push(`Bump maior: ${maior.adesao}% (piso ${c.bumpMaiorMin}%, excelente ${c.bumpMaiorExc}%) → ${num(maior.adesao) >= c.bumpMaiorExc ? "excelente" : num(maior.adesao) >= c.bumpMaiorMin ? "dentro do piso" : "abaixo do piso"}`);
  const margemSemBump = ticket - cpa;
  const margemComBump = ticketMedio - cpa;
  return { ticketMedio, extra, margemSemBump, margemComBump, ev, aumento: ticket > 0 ? extra / ticket : NaN };
}

/** Cascata após 3 dias de teste (seção 5). */
export function decidirCriativoLow({ cpaEsperado, vendas, gasto }, cfg) {
  const c = C(cfg);
  const v = num(vendas);
  const g = num(gasto);
  const cpa = v > 0 && g >= 0 ? g / v : NaN;
  const ev = [];
  if (Number.isFinite(cpa)) ev.push(`CPA real ${brl(cpa)} vs meta ${brl(cpaEsperado)}`);
  ev.push(`${v} venda(s) na janela`);

  if (v === 0)
    return { decisao: "DESLIGAR", tom: "red", diagnostico: "Sem tração na janela inicial. Registrar a hipótese de falha para alimentar a próxima leva; não insistir sem sinal.", evidencias: ev, ...sem([AREAS.copy, AREAS.trafego]) };
  if (v === 1)
    return { decisao: "DIAGNOSTICAR", tom: "amber", diagnostico: "Sinal insuficiente para decisão direta. Ler CPM, CTR, retenção, connect rate, ida ao checkout e checkout antes de decidir.", evidencias: ev, ...sem([AREAS.trafego]) };
  if (Number.isFinite(cpa) && cpa <= cpaEsperado && v >= c.preEscalaVendasMin)
    return { decisao: "PRÉ-ESCALA", tom: "green", diagnostico: "Vendas recorrentes com CPA abaixo do esperado. Lateralizar para nova campanha (CBO, ou ABO com mais de um criativo) somando ~1 a 2 CPAs de verba; manter o original no teste.", evidencias: [...ev, `Corte de “recorrência” em ${c.preEscalaVendasMin} vendas é parâmetro provisório (Governança)`], ...sem([AREAS.trafego]) };
  return { decisao: "MANTER EM TESTE", tom: "blue", diagnostico: "Aproximadamente 0,7 a 1 venda/dia. Não escalar nem reduzir: dar mais dias para confirmar tração e estabilidade do CPA.", evidencias: ev, ...sem([AREAS.trafego]) };
}

/** Escala/redução (seções 6 e 7). `cpaSerie` = CPA diário, mais recente por último. */
export function decidirEscala({ cpaEsperado, cpaSerie }, cfg) {
  const c = C(cfg);
  const s = (cpaSerie || []).map(num).filter(Number.isFinite);
  if (s.length < 2) return { decisao: "DADOS INSUFICIENTES", tom: "amber", diagnostico: "Informe pelo menos 2 dias de CPA.", evidencias: [], responsaveis: [] };
  const acima = s.map((x) => x > cpaEsperado);
  const ultimo = s[s.length - 1];
  const folga = (cpaEsperado - ultimo) / cpaEsperado;
  const ev = [`CPA últimos dias: ${s.map(brl).join(" → ")}`, `Meta ${brl(cpaEsperado)}`];

  if (!acima.some(Boolean)) {
    const passo = folga * 100 >= c.escalaFolgaAlta ? "50%" : folga * 100 >= c.escalaFolgaMedia ? "30%" : "20%";
    return { decisao: `ESCALAR +${passo}/dia`, tom: "green", diagnostico: `CPA dentro da meta em todo o período (folga atual ${pct(Math.max(folga, 0))}). Aumentar orçamento em degraus de 20% a 50% ao dia conforme a folga.`, evidencias: [...ev, "Degrau exato por folga é parâmetro provisório (Governança)"], ...sem([AREAS.trafego]) };
  }
  let consecutivos = 0;
  for (let i = acima.length - 1; i >= 0 && acima[i]; i--) consecutivos++;
  if (consecutivos <= 1)
    return { decisao: "OBSERVAR", tom: "amber", diagnostico: "Oscilação pontual: um dia fora da meta não é deterioração estrutural. Manter vigilância antes de intervir.", evidencias: ev, ...sem([AREAS.trafego]) };
  if (consecutivos === 2)
    return { decisao: "REDUZIR EM DEGRAUS", tom: "amber", diagnostico: "CPA fora da meta por mais de um ciclo. Reduzir orçamento em degraus e observar se a eficiência volta; se melhorar, manter a nova faixa e buscar nova escala com estabilidade.", evidencias: ev, ...sem([AREAS.trafego]) };
  return { decisao: "DIAGNÓSTICO SECUNDÁRIO", tom: "red", diagnostico: "CPA não recupera. Verificar fadiga, público, criativo, página, checkout e oferta; considerar sazonalidade do mês.", evidencias: ev, ...sem([AREAS.trafego, AREAS.copy, AREAS.estrategia]) };
}

/**
 * Lê CPA + métricas secundárias e roteia o gargalo (seções 8, 9 e 10).
 * Retenção: retGancho ∈ {ok, queda, forte}; retCriativo ∈ {ok, queda, forte}.
 */
export function diagnosticarLow(d, cfg) {
  const c = C(cfg);
  const cpaReal = num(d.cpaReal), cpaEsp = num(d.cpaEsperado);
  if (!Number.isFinite(cpaReal) || !Number.isFinite(cpaEsp))
    return { decisao: "INFORME CPA", tom: "amber", diagnostico: "Informe CPA real e CPA esperado.", evidencias: [], responsaveis: [], leituras: [] };
  const cpaOk = cpaReal <= cpaEsp;

  const defs = [
    { id: "ctr", label: "CTR (%)", saud: c.ctrSaudavel, exc: c.ctrExcelente },
    { id: "connect", label: "Connect Rate (%)", saud: c.connectMin },
    { id: "paginaCheckout", label: "Página → Checkout (%)", saud: c.pagCheckoutMin },
    { id: "checkoutCompra", label: "Checkout → Compra (%)", saud: c.checkoutCompraMin },
    { id: "bumpBarato", label: "Order bump barato (%)", saud: c.bumpBaratoMeta, exc: c.bumpBaratoExc },
    { id: "bumpMaior", label: "Order bump maior (%)", saud: c.bumpMaiorMin, exc: c.bumpMaiorExc },
  ];
  const leituras = defs.filter((m) => has(d[m.id])).map((m) => {
    const valor = num(d[m.id]);
    const faixa = m.exc != null && valor >= m.exc ? "excelente" : valor >= m.saud ? "saudável" : "abaixo";
    return { ...m, valor, faixa };
  });
  const f = Object.fromEntries(leituras.map((l) => [l.id, l.faixa]));
  const abaixo = (id) => f[id] === "abaixo";
  const ev = leituras.map((l) => `${l.label}: ${String(l.valor).replace(".", ",")} (${l.faixa}${l.faixa === "abaixo" ? `; mínimo ${l.saud}` : ""})`);
  const retG = d.retGancho || "", retC = d.retCriativo || "";
  if (retG) ev.push(`Retenção de gancho: ${{ ok: "sem queda relevante", queda: "queda precoce perceptível", forte: "abandono forte no início" }[retG]}`);
  if (retC) ev.push(`Retenção ao longo do criativo: ${{ ok: "mantém até o CTA", queda: "perde atenção no desenvolvimento", forte: "queda forte antes do CTA" }[retC]}`);
  const cpm = num(d.cpm);
  if (Number.isFinite(cpm)) ev.push(`CPM ${brl(cpm)} (${cpm <= cpaEsp ? "abaixo" : "acima"} do CPA esperado)`);
  ev.unshift(`CPA ${brl(cpaReal)} vs meta ${brl(cpaEsp)}`);

  if (cpaOk) {
    const extra = [];
    if (abaixo("ctr")) extra.push("CTR baixo + vendas boas: poucos cliques, porém qualificados. Entender o que filtra bem o público antes de tentar ampliar o CTR (Copy + Estratégia).");
    if (leituras.some((l) => l.faixa === "abaixo") || retG === "queda" || retG === "forte")
      extra.push("Há métricas secundárias fracas, mas o CPA está na meta: não mexer na campanha por elas; registrar como aprendizado.");
    return { decisao: "PRESERVAR", tom: "green", diagnostico: "CPA dentro da meta: o funil está economicamente saudável. Métricas secundárias “feias” viram aprendizado, não motivo para mexer. Documentar e monitorar tendência.", evidencias: [...ev, ...extra], ...sem(abaixo("ctr") ? [AREAS.trafego, AREAS.copy, AREAS.estrategia] : [AREAS.trafego]), leituras };
  }

  // CPA fora da meta: seguir a ordem do funil — técnica primeiro (seção 9).
  const F = [];
  if (abaixo("connect"))
    F.push({ decisao: "CORRIGIR ANTES DE INTERPRETAR", tom: "red", diag: "Connect Rate abaixo do mínimo é prioridade técnica: falha de carregamento, rastreio ou experiência. Corrigir antes de ler o resto do funil.", a: [AREAS.tecnologia] });
  if (retG === "queda" || retG === "forte")
    F.push({ decisao: "NOVOS HOOKS", tom: "red", diag: "A abertura não sustenta atenção. Criar novos hooks e primeiros segundos.", a: [AREAS.copy] });
  else if (retG === "ok" && (retC === "queda" || retC === "forte"))
    F.push({ decisao: "REESCREVER DESENVOLVIMENTO", tom: "amber", diag: "Gancho bom + queda no desenvolvimento: preservar o hook e reestruturar corpo, ritmo e prova.", a: [AREAS.copy, AREAS.estrategia] });
  if (abaixo("ctr"))
    F.push({ decisao: "NOVA LEVA DE CRIATIVOS", tom: "red", diag: "CPA ruim com CTR baixo: o criativo não gera interesse suficiente. Nova leva de hooks, ângulos e criativos.", a: [AREAS.copy, AREAS.trafego] });
  if (abaixo("paginaCheckout") && !abaixo("connect"))
    F.push({ decisao: "REVISAR PÁGINA / OFERTA", tom: "red", diag: "Pessoas chegam, mas não avançam ao checkout. Revisar primeira dobra, oferta, promessa, provas e coerência anúncio → página.", a: [AREAS.copy, AREAS.estrategia] });
  if (abaixo("checkoutCompra"))
    F.push({ decisao: "REVISAR FECHAMENTO", tom: "red", diag: "O desejo existe, mas a decisão final falha. Revisar preço, meios de pagamento, objeções, confiança e checkout.", a: [AREAS.estrategia, AREAS.copy, AREAS.tecnologia] });
  if (Number.isFinite(cpm) && cpm > cpaEsp && F.length > 0)
    F.push({ decisao: "LEILÃO / PÚBLICO CARO", tom: "amber", diag: "CPM alto junto de demais métricas fracas: público caro, criativo pouco competitivo ou contexto de leilão. CPM alto sozinho não invalida se a conversão compensa.", a: [AREAS.trafego, AREAS.copy] });
  if (abaixo("bumpBarato") || abaixo("bumpMaior"))
    F.push({ decisao: "AVALIAR BUMPS", tom: "amber", diag: "Adesão de bump abaixo da meta: avaliar aderência e obviedade do complemento, julgando pelo impacto no ticket médio. Bump não conserta produto principal fraco.", a: [AREAS.estrategia] });
  if (f.ctr === "excelente" && F.length === 0)
    F.push({ decisao: "REVISAR QUALIFICAÇÃO", tom: "amber", diag: "CTR alto + CPA ruim: há interesse, mas possivelmente pouco qualificado ou ruptura depois do clique. Revisar qualificação da mensagem e coerência anúncio → página.", a: [AREAS.copy, AREAS.estrategia] });

  const temDados = leituras.length > 0 || retG || retC || Number.isFinite(cpm);
  if (F.length === 0)
    return temDados
      ? { decisao: "REVER ECONOMIA", tom: "red", diagnostico: "Todos os pontos parecem saudáveis, mas o CPA segue inviável: o problema pode ser estrutural (ticket, posição na esteira, robustez ou papel da oferta).", evidencias: ev, ...sem([AREAS.estrategia, AREAS.especialista]), leituras }
      : { decisao: "INFORME MÉTRICAS", tom: "amber", diagnostico: "CPA fora da meta. Preencha as métricas secundárias para localizar o gargalo.", evidencias: ev, ...sem([AREAS.trafego]), leituras };
  const [p, ...resto] = F;
  return { decisao: p.decisao, tom: p.tom, diagnostico: p.diag, evidencias: [...ev, ...resto.map((r) => `Também observar: ${r.decisao} — ${r.diag}`)], ...sem(p.a), leituras, achados: F };
}

// --------------------------------------------------------------- Médio Ticket

/** CPA/CAC máximo = receita líquida − custos variáveis − custo comercial − margem mínima (seção 18). */
export function economiaMedio({ ticket, descontoPct = 0, receitaExtraPorComprador = 0, reembolsoPct = 0, custosVariaveis = 0, custoComercial = 0, margemMinima = 0 }, cfg) {
  const c = C(cfg);
  const receita = (ticket * (1 - descontoPct / 100) + receitaExtraPorComprador) * (1 - reembolsoPct / 100);
  const max = receita - custosVariaveis - custoComercial - margemMinima;
  const alvo = max * (1 - c.folgaSeguranca / 100);
  return { receitaLiquida: receita, max, alvo, viavel: max > 0 };
}

/** Leitura de teste por múltiplos do CPA-alvo (seção 19; parâmetros V0). */
export function lerTesteMedio({ cpaAlvo, gasto, vendas, sinaisFracos, temIntencao }, cfg) {
  const c = C(cfg);
  const mult = gasto / cpaAlvo;
  const ev = [`Gasto ${brl(gasto)} = ${mult.toFixed(2).replace(".", ",")}x CPA-alvo`, `${vendas} venda(s)`];
  const cpa = vendas > 0 ? gasto / vendas : NaN;
  if (vendas >= 2 && cpa <= cpaAlvo)
    return { decisao: "PRÉ-ESCALA", tom: "green", diagnostico: "Vendas recorrentes abaixo da meta: lateralizar e entrar em pré-escala.", evidencias: [...ev, `CPA ${brl(cpa)}`], ...sem([AREAS.trafego]) };
  if (vendas === 1 && cpa <= cpaAlvo && !sinaisFracos)
    return { decisao: "MANTER ATÉ REPETIR", tom: "blue", diagnostico: "Venda dentro do CPA com sinais saudáveis. Uma venda não basta para declarar escala: manter o teste até confirmar repetição.", evidencias: [...ev, `CPA ${brl(cpa)}`], ...sem([AREAS.trafego]) };
  if (vendas === 0) {
    if (mult < c.medioMultInicio) return { decisao: "AGUARDAR", tom: "blue", diagnostico: "Ainda cedo para declarar vencedor/perdedor. Preservar o teste e observar sinais de clique e avanço.", evidencias: ev, ...sem([AREAS.trafego]) };
    if (mult < c.medioMultPausa) return temIntencao && !sinaisFracos
      ? { decisao: "MANTER E DIAGNOSTICAR FUNDO", tom: "amber", diagnostico: "Existe intenção (checkout/lead qualificado) mas falta confirmar fechamento. Manter mais dados e diagnosticar o fundo do funil.", evidencias: ev, ...sem([AREAS.trafego, AREAS.estrategia]) }
      : { decisao: "REVISAR CRIATIVO", tom: "amber", diagnostico: "Perto de 1 CPA sem venda e quase nenhum avanço relevante: revisar criativo/qualificação; considerar pausa mais cedo se as métricas também forem ruins.", evidencias: ev, ...sem([AREAS.copy, AREAS.trafego]) };
    if (sinaisFracos) return { decisao: "PAUSAR", tom: "red", diagnostico: "1,5–2x o CPA-alvo sem venda e com sinais fracos: o teste consumiu margem relevante sem evidência. Pausar por padrão e alimentar nova hipótese.", evidencias: ev, ...sem([AREAS.copy, AREAS.trafego]) };
    return { decisao: "DECIDIR COM CRITÉRIO", tom: "amber", diagnostico: "Acima de 1,5x sem venda, mas os sinais não são fracos: ler checkout/intenção antes de pausar.", evidencias: ev, ...sem([AREAS.trafego, AREAS.estrategia]) };
  }
  return { decisao: "FORA DA META", tom: "amber", diagnostico: "Há venda, mas o CPA excede a meta. Diagnosticar a etapa que perde conversão.", evidencias: [...ev, `CPA ${brl(cpa)}`], ...sem([AREAS.trafego, AREAS.estrategia]) };
}

/**
 * Diagnóstico genérico por etapas de funil (páginas, VSL, quiz — seções 20–22).
 * etapas: [{nome, real(%), meta(%), area[], acao}]. Se CPA na meta, preserva.
 */
export function diagnosticarEtapas({ cpaReal, cpaMeta, etapas }) {
  const lista = etapas.map((e) => ({ ...e, real: num(e.real), meta: num(e.meta) }));
  const ev = lista.filter((e) => Number.isFinite(e.real)).map((e) => `${e.nome}: ${String(e.real).replace(".", ",")}%${Number.isFinite(e.meta) ? ` (meta ${String(e.meta).replace(".", ",")}%)` : ""}`);
  const temCpa = has(cpaReal) && has(cpaMeta);
  if (temCpa) ev.unshift(`CPA ${brl(num(cpaReal))} vs meta ${brl(num(cpaMeta))}`);
  if (temCpa && num(cpaReal) <= num(cpaMeta))
    return { decisao: "PRESERVAR", tom: "green", diagnostico: "CPA dentro da meta: economia saudável. Preservar e buscar escala progressiva; métricas de etapa servem de aprendizado.", evidencias: ev, ...sem([AREAS.trafego]) };
  const comMeta = lista.filter((e) => Number.isFinite(e.real) && Number.isFinite(e.meta));
  if (comMeta.length === 0)
    return { decisao: "INFORME AS METAS DE ETAPA", tom: "amber", diagnostico: "Preencha real e meta de cada etapa (metas de etapa vêm do histórico do cliente; o POP não fixa números).", evidencias: ev, responsaveis: [] };
  const quebra = comMeta.find((e) => e.real < e.meta);
  if (quebra)
    return { decisao: `GARGALO: ${quebra.nome.toUpperCase()}`, tom: "red", diagnostico: quebra.acao, evidencias: [...ev, ...comMeta.filter((e) => e !== quebra && e.real < e.meta).map((e) => `Também abaixo da meta: ${e.nome}`)], ...sem(quebra.area) };
  return { decisao: "REVER ECONOMIA / OFERTA", tom: "red", diagnostico: "CPA ruim apesar de etapas saudáveis: a economia/oferta pode estar mal desenhada. Reavaliar ticket, margem, proposta e papel na esteira.", evidencias: ev, ...sem([AREAS.estrategia, AREAS.especialista]) };
}

export const ETAPAS_PAGINA = [
  { nome: "CTR", area: [AREAS.copy, AREAS.trafego], acao: "CTR fraco: o criativo não gera clique. Nova leva de hooks e ângulos (sem “embelezar” CTR se o CPA já é bom)." },
  { nome: "Connect Rate", area: [AREAS.tecnologia], acao: "Connect Rate abaixo do mínimo é prioridade técnica: corrigir carregamento, rastreio e experiência antes de atribuir queda à oferta." },
  { nome: "Página → Checkout", area: [AREAS.copy, AREAS.estrategia], acao: "A página não transforma interesse em decisão: revisar promessa, primeira dobra, oferta, prova, mecanismo, preço e CTA." },
  { nome: "Checkout → Compra", area: [AREAS.estrategia, AREAS.tecnologia, AREAS.copy], acao: "Fricção no fim: revisar preço, parcelamento, garantia, meios de pagamento, confiança e checkout." },
];
export const ETAPAS_VSL = [
  { nome: "Entrada (CTR + Connect)", area: [AREAS.trafego, AREAS.copy, AREAS.tecnologia], acao: "Criativo desalinhado, página lenta ou primeira impressão fraca." },
  { nome: "Play", area: [AREAS.copy, AREAS.estrategia], acao: "Headline, thumbnail/primeiro frame ou promessa não geram ação." },
  { nome: "Retenção inicial", area: [AREAS.copy], acao: "Hook/VSL demora para entrar no problema ou promessa." },
  { nome: "Desenvolvimento (retenção)", area: [AREAS.copy, AREAS.estrategia], acao: "Gancho forte + queda no meio: preservar a abertura e reescrever desenvolvimento (argumentação, ritmo, prova, mecanismo)." },
  { nome: "Chegada ao CTA", area: [AREAS.copy, AREAS.estrategia], acao: "Oferta não está forte/claramente conectada ao argumento." },
  { nome: "Clique no CTA", area: [AREAS.copy, AREAS.estrategia], acao: "Boa retenção + pouco CTA: revisar a transição para a oferta." },
  { nome: "Checkout → Compra", area: [AREAS.estrategia, AREAS.tecnologia], acao: "Muito CTA + pouca compra: o problema está depois da VSL (preço, confiança, condições ou fricção final)." },
];
export const ETAPAS_QUIZ = [
  { nome: "Clique → início", area: [AREAS.copy], acao: "Promessa do anúncio não está coerente com o início: revisar headline e primeira pergunta." },
  { nome: "Início → conclusão", area: [AREAS.estrategia, AREAS.copy], acao: "Quiz longo, cansativo, invasivo ou pouco relevante: reduzir passos e melhorar progressão e valor percebido." },
  { nome: "Conclusão → captura", area: [AREAS.copy, AREAS.estrategia], acao: "Usuário não vê motivo para deixar contato: melhorar a promessa do resultado/diagnóstico." },
  { nome: "Resultado → CTA", area: [AREAS.copy, AREAS.estrategia], acao: "Diagnóstico informa, mas não cria necessidade de agir: conectar resultado ao custo de não resolver e à solução." },
  { nome: "CTA → compra", area: [AREAS.estrategia, AREAS.tecnologia], acao: "Oferta/preço/checkout quebram a intenção: revisar oferta e fundo do funil." },
];

/** Modelo assistido: CAC total = (mídia + custo comercial) / vendas (seção 23). */
export function cacAssistido({ gastoMidia, custoComercial = 0, leads, contatados, qualificados, vendas, cacMax }) {
  const cac = vendas > 0 ? (gastoMidia + custoComercial) / vendas : NaN;
  const cpl = div(gastoMidia, leads);
  const etapas = [
    { nome: "Contato", valor: div(contatados, leads), area: [AREAS.comercial, AREAS.gestao], msg: "Baixa taxa de contato: revisar dados, canal, velocidade e cadência." },
    { nome: "Qualificação", valor: div(qualificados, contatados), area: [AREAS.estrategia, AREAS.copy], msg: "Baixa qualificação: corrigir criativo, formulário/quiz e promessa." },
    { nome: "Fechamento", valor: div(vendas, qualificados), area: [AREAS.comercial, AREAS.estrategia], msg: "Baixo fechamento: revisar oferta, abordagem e treinamento." },
  ];
  const ev = [`CPL ${brl(cpl)}`, `CAC total ${brl(cac)}`, ...etapas.map((e) => `${e.nome}: ${pct(e.valor)}`)];
  if (Number.isFinite(cac) && cac <= cacMax)
    return { decisao: "CAC DENTRO DA META", tom: "green", diagnostico: "Modelo assistido saudável. Só escalar mídia até a capacidade de atendimento do comercial (SLA e backlog).", evidencias: ev, ...sem([AREAS.trafego, AREAS.comercial]), etapas, cac, cpl };
  const pior = etapas.filter((e) => Number.isFinite(e.valor)).sort((a, b) => a.valor - b.valor)[0];
  return { decisao: "CAC ACIMA DA META", tom: "red", diagnostico: `CPL não é sucesso final. ${pior ? `Menor taxa em ${pior.nome}: ${pior.msg}` : "Informe os volumes por etapa."}`, evidencias: ev, ...sem(pior ? pior.area : [AREAS.estrategia]), etapas, cac, cpl };
}

/** Híbrido: CPA da venda direta e CAC da assistida SEPARADOS (seção 24). */
export function hibrido({ gastoDireto, vendasDiretas, gastoAssistido, custoComercial = 0, vendasAssistidas, cpaMax, cacMax }) {
  const cpaDireto = div(gastoDireto, vendasDiretas);
  const cacAssist = div(gastoAssistido + custoComercial, vendasAssistidas);
  const total = div(gastoDireto + gastoAssistido + custoComercial, vendasDiretas + vendasAssistidas);
  const ev = [`CPA venda direta ${brl(cpaDireto)} (máx. ${brl(cpaMax)})`, `CAC venda assistida ${brl(cacAssist)} (máx. ${brl(cacMax)})`, `CAC misturado ${brl(total)} — não decidir por ele: esconde o que funciona`];
  const dOk = Number.isFinite(cpaDireto) && cpaDireto <= cpaMax, aOk = Number.isFinite(cacAssist) && cacAssist <= cacMax;
  const quem = [AREAS.trafego, ...(aOk ? [] : [AREAS.comercial, AREAS.estrategia])];
  if (dOk && aOk) return { decisao: "AS DUAS ROTAS FECHAM", tom: "green", diagnostico: "Escalar cada rota separadamente. Identificar quais segmentos continuam na compra autônoma e quais se beneficiam de contato humano.", evidencias: ev, ...sem([AREAS.trafego, AREAS.comercial]) };
  if (dOk && !aOk) return { decisao: "ROTA ASSISTIDA FORA DA META", tom: "amber", diagnostico: "A venda direta fecha; a assistida não. Investigar qualidade do lead e o comercial antes de escalar a rota assistida; usar remarketing para recuperar intenção sem virar lead manual por padrão.", evidencias: ev, ...sem(quem) };
  if (!dOk && aOk) return { decisao: "ROTA DIRETA FORA DA META", tom: "amber", diagnostico: "A assistida fecha; a direta não. Diagnosticar a etapa da página/VSL/quiz; avaliar se esse público se beneficia de contato humano.", evidencias: ev, ...sem([AREAS.trafego, AREAS.copy, AREAS.estrategia]) };
  return { decisao: "NENHUMA ROTA FECHA", tom: "red", diagnostico: "Etapas parecem boas e o CAC não fecha? Reavaliar economia/ticket/produto.", evidencias: ev, ...sem([AREAS.estrategia, AREAS.especialista]) };
}

// ---------------------------------------------------------------- High Ticket

/** Metas intermediárias a partir do CAC máximo e taxas reais (seção 29). */
export function economiaReversa({ cacMax, leadVenda, qualVenda, agendVenda, showVenda }) {
  const m = (t) => (has(t) && num(t) > 0 ? cacMax * (num(t) / 100) : null);
  return { cplMax: m(leadVenda), cpqlMax: m(qualVenda), custoAgendamentoMax: m(agendVenda), custoComparecimentoMax: m(showVenda) };
}

/** Localiza a primeira etapa abaixo da meta no pipeline (seções 28, 32–35). */
export function diagnosticarHighTicket(d) {
  const etapas = [
    { nome: "Contato", real: div(d.contatados, d.leads), meta: d.metaContato, area: [AREAS.comercial, AREAS.gestao], acao: "Operação perde demanda quente: corrigir SLA, dados, canal e cadência." },
    { nome: "Qualificação", real: div(d.qualificados, d.contatados), meta: d.metaQualificacao, area: [AREAS.estrategia, AREAS.copy, AREAS.trafego], acao: "Promessa/público atraem perfil errado: rever mensagem, filtros e ICP." },
    { nome: "Agendamento", real: div(d.agendados, d.qualificados), meta: d.metaAgendamento, area: [AREAS.comercial, AREAS.estrategia], acao: "A call não parece valiosa ou há fricção: rever CTA, convite, agenda e abordagem." },
    { nome: "Comparecimento", real: div(d.compareceram, d.agendados), meta: d.metaShow, area: [AREAS.comercial], acao: "Expectativa/compromisso fracos: lembretes, confirmação, pré-frame e follow-up." },
    { nome: "Fechamento", real: div(d.vendas, d.compareceram), meta: d.metaFechamento, area: [AREAS.comercial, AREAS.estrategia], acao: "Problema comercial/oferta: revisar script, diagnóstico, objeções, proposta e prova." },
  ].map((e) => ({ ...e, meta: has(e.meta) ? num(e.meta) / 100 : NaN }));

  const cpl = div(d.gasto, d.leads);
  const cac = d.vendas > 0 ? d.gasto / d.vendas : NaN;
  const ev = [`CPL ${brl(cpl)}`, `CAC ${brl(cac)} vs máx. ${brl(d.cacMax)}`, ...etapas.map((e) => `${e.nome}: ${pct(e.real)}${Number.isFinite(e.meta) ? ` (meta ${pct(e.meta)})` : ""}`)];

  if (d.dentroDoCiclo)
    return { decisao: "NÃO JULGAR POR VENDA AINDA", tom: "blue", diagnostico: "O ciclo médio de venda não terminou: ausência de vendas não é veredito. Ler CPL/CPQL e a qualidade dos primeiros leads; se há leads suficientes e quase nenhum qualificado, já dá para agir em aquisição/qualificação.", evidencias: ev, ...sem([AREAS.trafego]), etapas };
  if (Number.isFinite(cac) && cac <= d.cacMax) {
    const sat = d.capacidadeSaturada;
    return { decisao: sat ? "NÃO ESCALAR MÍDIA" : "ESCALAR COM CONTROLE", tom: sat ? "amber" : "green", diagnostico: sat ? "CAC bom, mas a agenda está saturada: aumentar capacidade comercial ou controlar a entrada antes de comprar mais lead." : "CAC saudável: escalar progressivamente, acompanhando degradação por etapa e estabilidade das taxas. Com poucos fechamentos, use janela móvel coerente com o ciclo.", evidencias: ev, ...sem([AREAS.trafego, AREAS.comercial]), etapas };
  }
  const quebra = etapas.find((e) => Number.isFinite(e.real) && Number.isFinite(e.meta) && e.real < e.meta);
  if (quebra)
    return { decisao: `GARGALO: ${quebra.nome.toUpperCase()}`, tom: "red", diagnostico: `${quebra.acao} Resolver antes de culpar a mídia.`, evidencias: ev, ...sem(quebra.area), etapas };
  return { decisao: "TOPO CARO", tom: "amber", diagnostico: "Etapas do pipeline dentro da meta, mas o CAC não fecha: o topo está caro para a economia atual. Otimizar aquisição ou aumentar ticket/margem.", evidencias: ev, ...sem([AREAS.trafego, AREAS.estrategia]), etapas };
}

/** Distribuição dos motivos de perda e destino da ação (seção 34). Mapa de área = provisório. */
export function analisarMotivosPerda(contagens, motivos) {
  const lista = motivos.map((m) => ({ ...m, n: num(contagens[m.id]) || 0 })).filter((m) => m.n > 0).sort((a, b) => b.n - a.n);
  const total = lista.reduce((s, m) => s + m.n, 0);
  if (!total) return { total: 0, lista: [], porArea: [] };
  const areas = {};
  lista.forEach((m) => (areas[m.area] = (areas[m.area] || 0) + m.n));
  const porArea = Object.entries(areas).map(([area, n]) => ({ area, n, p: n / total })).sort((a, b) => b.n - a.n);
  return { total, lista: lista.map((m) => ({ ...m, p: m.n / total })), porArea };
}

// ------------------------------------------------------------------ Lançamento

/** Projeção reversa com cenários conservador/base/agressivo (seção 39). */
export function projecaoLancamento({ metaReceita, ticket, cacMax, conversoes, cplPlanejado }) {
  const vendas = Math.ceil(metaReceita / ticket);
  const cenarios = Object.entries(conversoes).filter(([, t]) => t > 0).map(([nome, taxa]) => {
    const leads = Math.ceil(vendas / (taxa / 100));
    const cplEconomicoMax = cacMax * (taxa / 100);
    const orcamento = leads * cplPlanejado;
    return { nome, taxa, leads, cplEconomicoMax, orcamento, cplViavel: cplPlanejado <= cplEconomicoMax, cacImplicito: orcamento / vendas };
  });
  return { vendas, cenarios };
}

/** Ritmo de captação (seção 40) + matriz ritmo × CPL (seção 41). */
export function ritmoCaptacao({ metaLeads, leadsAcumulados, diasTotais, diaAtual, cplAtual, cplMeta, mediaRecente }, cfg) {
  const c = C(cfg);
  const diasRestantes = Math.max(diasTotais - diaAtual, 0);
  const planejado = metaLeads * (diaAtual / diasTotais);
  const indice = planejado > 0 ? leadsAcumulados / planejado : NaN;
  const restantes = Math.max(metaLeads - leadsAcumulados, 0);
  const porDia = diasRestantes > 0 ? restantes / diasRestantes : restantes;
  const projecao = leadsAcumulados + diasRestantes * (has(mediaRecente) ? num(mediaRecente) : leadsAcumulados / Math.max(diaAtual, 1));
  const ritmo = indice < c.ritmoMin ? "abaixo" : indice > c.ritmoMax ? "acima" : "dentro";
  const cplOk = cplAtual <= cplMeta;
  const M = {
    "abaixo|true": ["AUMENTAR VERBA COM CONTROLE", "green", "Há espaço econômico para recuperar volume: aumentar verba de forma controlada, priorizando criativos e fontes vencedores.", [AREAS.trafego]],
    "abaixo|false": ["CORRIGIR ANTES DE ESCALAR", "red", "Escalar pioraria a economia. Corrigir criativo, página, público e oferta de captação; recalcular a projeção.", [AREAS.copy, AREAS.estrategia, AREAS.trafego]],
    "dentro|true": ["MANTER PLANO", "green", "Plano saudável: manter e testar melhorias sem desorganizar vencedores.", [AREAS.trafego]],
    "dentro|false": ["OTIMIZAR CUSTO", "amber", "A meta de volume está sendo atingida com custo excessivo: otimizar e proteger o orçamento total do lançamento.", [AREAS.trafego, AREAS.copy]],
    "acima|true": ["ADIANTAMENTO SAUDÁVEL", "green", "Decidir se vale ampliar a meta, criar reserva ou estabilizar o gasto. Checar a qualidade da coorte.", [AREAS.trafego, AREAS.estrategia]],
    "acima|false": ["REDUZIR MARGINAL", "red", "Volume foi comprado caro: reduzir o marginal, concentrar nos melhores segmentos e preservar caixa.", [AREAS.trafego]],
  }[`${ritmo}|${cplOk}`];
  return {
    decisao: M[0], tom: M[1], diagnostico: M[2], responsaveis: M[3],
    evidencias: [`Índice de ritmo ${indice.toFixed(2).replace(".", ",")} (${ritmo}; faixa ${c.ritmoMin}–${c.ritmoMax})`, `CPL ${brl(cplAtual)} vs meta ${brl(cplMeta)}`, `Faltam ${Math.ceil(restantes)} leads em ${diasRestantes} dia(s)`],
    metricas: { indice, restantes, porDia, verbaDiaria: porDia * cplMeta, projecao, planejado },
  };
}

/**
 * Origem/coorte (seções 42, 43 e 48): compara custo de lead com receita gerada.
 * rows: [{origem, gasto, leads, vendas, receita}]. "Não cortar origem só pelo CPL".
 */
export function analiseOrigens(rows) {
  const r = rows.map((x) => {
    const gasto = num(x.gasto), leads = num(x.leads), vendas = num(x.vendas) || 0, receita = num(x.receita) || 0;
    return { origem: x.origem, gasto, leads, vendas, receita, cpl: div(gasto, leads), rpl: div(receita, leads), cac: vendas > 0 ? gasto / vendas : NaN, roas: div(receita, gasto), conv: div(vendas, leads) };
  }).filter((x) => x.origem && Number.isFinite(x.gasto) && Number.isFinite(x.leads) && x.leads > 0);
  if (!r.length) return { linhas: [] };
  const tg = r.reduce((s, x) => s + x.gasto, 0), tl = r.reduce((s, x) => s + x.leads, 0), tr = r.reduce((s, x) => s + x.receita, 0);
  const mediaCpl = tg / tl, mediaRpl = tr / tl;
  const linhas = r.map((x) => {
    const compra = x.rpl >= mediaRpl, caro = x.cpl > mediaCpl;
    const status = compra && caro ? ["PRESERVAR", "green", "CPL acima da média, mas a coorte compra mais: avaliar por CAC/receita, não por CPL."]
      : compra ? ["ESCALAR", "green", "CPL baixo e receita por lead acima da média."]
      : caro ? ["REDUZIR", "red", "CPL alto e receita por lead abaixo da média."]
      : ["QUALIFICAR", "amber", "CPL baixo, mas coorte fraca: não premiar volume vazio; qualificar ou reduzir."];
    return { ...x, status: status[0], tom: status[1], leitura: status[2] };
  });
  return { linhas, mediaCpl, mediaRpl, roasTotal: tr / tg };
}

/** Forecast × realizado (seção 48). Taxas em %. */
export function forecastVsRealizado({ plan, real }) {
  const itens = [
    ["CPL", plan.cpl, real.cpl, false, brl],
    ["Conversão lead→venda (%)", plan.conv, real.conv, true, (v) => `${String(v).replace(".", ",")}%`],
    ["Ticket médio", plan.ticket, real.ticket, true, brl],
    ["Leads", plan.leads, real.leads, true, (v) => Math.round(v).toLocaleString("pt-BR")],
  ].filter(([, p, r]) => Number.isFinite(p) && Number.isFinite(r) && p > 0);
  const linhas = itens.map(([nome, p, r, maiorMelhor, fmt]) => {
    const delta = (r - p) / p;
    return { nome, plano: fmt(p), real: fmt(r), delta, bom: maiorMelhor ? delta >= 0 : delta <= 0 };
  });
  const recPlan = plan.leads * (plan.conv / 100) * plan.ticket, recReal = real.leads * (real.conv / 100) * real.ticket;
  const erros = linhas.filter((l) => Math.abs(l.delta) > 0.1);
  return { linhas, receitaPlanejada: recPlan, receitaProjetadaPeloReal: recReal, premissasErradas: erros.map((l) => l.nome),
    leitura: erros.length ? `Premissas com desvio acima de 10%: ${erros.map((l) => l.nome).join(", ")}. Recalibrar o forecast da próxima edição com esses valores.` : "Forecast aderente (desvios ≤ 10% em todas as premissas informadas)." };
}

/** Cascata durante o carrinho aberto + métricas da seção 45 (seção 46). */
export function carrinhoAberto(d, cfg) {
  const c = C(cfg);
  const { vendas, metaVendasAteAgora, cac, cacMax, cliquesOferta, checkoutIniciado, compras, baseLeads } = d;
  const ativacao = div(cliquesOferta, baseLeads), pagCheckout = div(checkoutIniciado, cliquesOferta), checkoutCompra = div(compras, checkoutIniciado);
  const ev = [`Vendas ${vendas}/${metaVendasAteAgora} esperadas`, `CAC ${brl(cac)} vs máx. ${brl(cacMax)}`, `Ativação ${pct(ativacao)} · Clique→checkout ${pct(pagCheckout)} · Checkout→compra ${pct(checkoutCompra)}`];
  const extras = {};
  if (has(d.gastoTotal) && vendas > 0) { extras.cacAcumulado = num(d.gastoTotal) / vendas; ev.push(`CAC acumulado ${brl(extras.cacAcumulado)}`); }
  if (has(d.gastoRecente) && has(d.vendasRecentes)) { extras.cacMarginal = div(num(d.gastoRecente), num(d.vendasRecentes)); ev.push(`CAC marginal (verba recente) ${brl(extras.cacMarginal)}${extras.cacMarginal > cacMax ? " — acima do máximo" : ""}`); }
  if (has(d.receita) && baseLeads > 0) { extras.receitaPorLead = num(d.receita) / baseLeads; ev.push(`Receita por lead ${brl(extras.receitaPorLead)}`); }
  if (has(d.receita) && has(d.gastoTotal)) { extras.roas = num(d.receita) / num(d.gastoTotal); ev.push(`ROAS ${extras.roas.toFixed(2).replace(".", ",")}`); }
  const abaixo = vendas < metaVendasAteAgora, cacOk = cac <= cacMax;
  const R = (decisao, tom, diagnostico, a) => ({ decisao, tom, diagnostico, evidencias: ev, ...sem(a), extras });
  if (!abaixo && cacOk) return R("ESCALAR COM CONTROLE", "green", "Lançamento responde bem: escalar com controle de margem e saturação.", [AREAS.trafego, AREAS.estrategia]);
  if (abaixo && !cacOk) return R("NÃO RESOLVER COM VERBA", "red", "Vendas abaixo e CAC ruim: diagnosticar oferta, base, página e qualidade das coortes.", [AREAS.estrategia, AREAS.copy, AREAS.trafego]);
  if (checkoutCompra * 100 < c.carrinhoCheckoutCompraMin) return R("FRICÇÃO DE FECHAMENTO", "red", "Checkout alto + compra baixa: revisar pagamento, condições, confiança, bugs e objeções.", [AREAS.tecnologia, AREAS.estrategia, AREAS.copy]);
  if (pagCheckout * 100 < c.carrinhoPagCheckoutMin) return R("PÁGINA NÃO CONVERTE", "red", "Cliques altos + pouco checkout: revisar headline, oferta, prova, bônus, preço e CTA.", [AREAS.copy, AREAS.estrategia]);
  if (ativacao * 100 < c.carrinhoAtivacaoMin) return R("BASE NÃO ATIVOU", "amber", "Poucos cliques para a oferta: reforçar mensagens, prova, urgência legítima e segmentação.", [AREAS.copy, AREAS.estrategia]);
  if (abaixo && cacOk) return R("ACELERAR REMARKETING", "green", "Vendas abaixo do ritmo com CAC saudável: há espaço para acelerar remarketing/aquisição, aumentando verba em segmentos de maior intenção (checkout iniciado primeiro).", [AREAS.trafego]);
  return R("ESCALAR COM CONTROLE", "green", "Vendas no ritmo e CAC saudável.", [AREAS.trafego, AREAS.estrategia]);
}

// ----------------------------------------------------------- Inteligência / portfólio

/** Cascata do radar de demanda emergente (seção 14). */
export function radarDemanda({ crescendo, intencao, solucoes }) {
  if (crescendo !== "sim") return { decisao: "ACOMPANHAR", tom: "blue", diagnostico: "O termo/dor não está crescendo: acompanhar sem priorização.", evidencias: [], responsaveis: [AREAS.estrategia] };
  if (intencao !== "sim") return { decisao: "ACOMPANHAR (CURIOSIDADE)", tom: "blue", diagnostico: "Há crescimento, mas sem intenção de resolver o problema: curiosidade não é oportunidade. Continuar observando sinais de intenção.", evidencias: [], responsaveis: [AREAS.estrategia] };
  if (solucoes === "fortes") return { decisao: "BENCHMARK + DIFERENCIAÇÃO", tom: "amber", diagnostico: "Já existem soluções fortes: levantar o padrão do mercado e identificar como a Mantora pode construir algo claramente superior (especificidade, método, suporte, integração com a esteira).", evidencias: [], responsaveis: [AREAS.estrategia, AREAS.especialista] };
  return { decisao: "HIPÓTESE DE PRODUTO", tom: "green", diagnostico: "Demanda crescente + baixa oferta de solução = oportunidade. Criar MVP suficientemente bom → oferta → tráfego → validação → evoluir, ajustar ou descartar.", evidencias: [], responsaveis: [AREAS.especialista, AREAS.estrategia, AREAS.copy, AREAS.trafego] };
}

/** Próxima revisão do portfólio: janela de 30 a 45 dias (seção 12). Datas AAAA-MM-DD. */
export function proximaRevisaoPortfolio(ultima, hoje) {
  const d0 = new Date(ultima + "T12:00:00Z"), h = new Date(hoje + "T12:00:00Z");
  if (isNaN(d0) || isNaN(h)) return null;
  const add = (n) => new Date(d0.getTime() + n * 86400000).toISOString().slice(0, 10);
  const dias = Math.floor((h - d0) / 86400000);
  const estado = dias < 30 ? "dentro do ciclo" : dias <= 45 ? "janela de revisão aberta" : "atrasada";
  return { janelaInicio: add(30), janelaFim: add(45), dias, estado };
}

// --------------------------------------------------------- Comunicação interna

/** Mensagem no padrão da seção 52: números + hipótese + pedido claro. */
export function mensagemInterna({ modelo, meta, atual, etapa, metricas, hipotese, hipoteseAlternativa, acaoFeita, pedido, responsaveis }) {
  return [
    `📌 ${modelo}`,
    `1. Meta econômica: ${meta}`,
    `2. Resultado atual: ${atual}`,
    `3. Etapa onde aparece a anomalia: ${etapa}`,
    `4. Métricas que sustentam o diagnóstico: ${(metricas || []).join("; ")}`,
    `5. Hipótese principal: ${hipotese}${hipoteseAlternativa ? ` | Alternativa: ${hipoteseAlternativa}` : ""}`,
    `6. Ação já executada: ${acaoFeita || "nenhuma até agora"}`,
    `7. Pedido${responsaveis?.length ? ` para ${uniq(responsaveis).join(" + ")}` : ""}: ${pedido}`,
  ].join("\n");
}
