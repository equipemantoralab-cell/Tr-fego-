// Parâmetros iniciais dos funis (aba CONFIGURACOES_FUNIS).
// fonte "POP"       = número que está escrito no documento da metodologia.
// fonte "provisorio" = valor de trabalho; o POP não define o número. Substituir pelo histórico real do cliente.
// fonte "a_definir"  = sem valor: a regra correspondente fica desativada (o motor avisa) até a equipe configurar.
const p = (tipo_funil, chave, valor, unidade, fonte, descricao) => ({ tipo_funil, chave, valor, unidade, fonte, descricao });

export const CONFIG_PADRAO = [
  // ---- global (todas as metodologias)
  p("global", "ctr_saudavel_pct", 1, "%", "POP", "CTR saudável: acima de 1% (POP §8)."),
  p("global", "ctr_excelente_pct", 1.5, "%", "POP", "CTR excelente: 1,5% a 2% ou mais (POP §8)."),
  p("global", "connect_min_pct", 80, "%", "POP", "Connect rate mínimo; abaixo disso é prioridade técnica (POP §8)."),
  p("global", "visita_checkout_min_pct", 20, "%", "POP", "Página → checkout mínimo (POP §8)."),
  p("global", "checkout_compra_min_pct", 40, "%", "POP", "Checkout → compra mínimo (POP §8)."),
  p("global", "escala_degrau_min_pct", 20, "%", "POP", "Menor degrau de aumento de orçamento por dia (POP §6)."),
  p("global", "escala_degrau_max_pct", 50, "%", "POP", "Maior degrau de aumento de orçamento por dia (POP §6)."),
  p("global", "atencao_tolerancia_pct", 10, "%", "provisorio", "CPA/CAC até X% acima da meta = atenção (acima disso = crítico em dados suficientes)."),
  p("global", "critico_tolerancia_pct", 50, "%", "provisorio", "CPA/CAC mais de X% acima da meta, de forma persistente = crítico."),

  // ---- low ticket
  p("low_ticket", "dias_teste", 3, "dias", "POP", "Janela inicial de teste (POP §4)."),
  p("low_ticket", "gasto_min_cpa_mult", 1, "x CPA", "POP", "Gasto mínimo para ler o teste: ~1 CPA esperado (POP §4)."),
  p("low_ticket", "compras_manter_max", 3, "compras", "POP", "2 a 3 vendas na janela: manter em teste (POP §5)."),
  p("low_ticket", "compras_pre_escala_min", 4, "compras", "provisorio", "O POP diz “vendas recorrentes” sem número; 4 é valor de trabalho."),
  p("low_ticket", "compras_escala_vertical_min", 8, "compras", "provisorio", "Compras acumuladas mínimas para recomendar aumento de orçamento."),
  p("low_ticket", "analises_escala_estavel", 2, "análises", "provisorio", "Análises consecutivas dentro da meta exigidas antes de escalar."),
  p("low_ticket", "ciclos_deterioracao", 2, "análises", "POP", "CPA acima da meta por mais de um ciclo = deterioração (POP §7)."),
  p("low_ticket", "folga_degrau_medio_pct", 15, "%", "provisorio", "Folga do CPA a partir da qual o degrau sobe para ~30%."),
  p("low_ticket", "folga_degrau_alto_pct", 30, "%", "provisorio", "Folga do CPA a partir da qual o degrau sobe para ~50%."),

  // ---- médio ticket
  p("medio_ticket", "mult_inicio", 1, "x CPA", "POP", "Gasto a partir do qual a decisão começa (POP §19, parâmetro V0)."),
  p("medio_ticket", "mult_pausa", 1.5, "x CPA", "POP", "Sem venda e sinais fracos a partir de 1,5–2x: pausar (POP §19, parâmetro V0)."),
  p("medio_ticket", "compras_pre_escala_min", 2, "compras", "provisorio", "Vendas recorrentes abaixo da meta para pré-escala (POP: “uma venda não basta”)."),
  p("medio_ticket", "escala_passo_conservador_pct", 20, "%", "POP", "Referência conservadora de 20–30% por ajuste (POP §25)."),
  p("medio_ticket", "taxa_qualificacao_min_pct", null, "%", "a_definir", "Leads qualificados ÷ leads (campanhas de leads/comercial)."),
  p("medio_ticket", "taxa_fechamento_min_pct", null, "%", "a_definir", "Vendas ÷ comparecimentos/qualificados (conversão comercial)."),
  p("medio_ticket", "taxa_play_min_pct", null, "%", "a_definir", "VSL: plays ÷ visitas."),
  p("medio_ticket", "taxa_cta_min_pct", null, "%", "a_definir", "VSL: cliques no CTA ÷ plays."),
  p("medio_ticket", "taxa_conclusao_quiz_min_pct", null, "%", "a_definir", "Quiz: conclusões ÷ inícios."),

  // ---- high ticket
  p("high_ticket", "mult_pausa", 2, "x CAC", "provisorio", "Gasto (x CAC alvo) sem nenhuma venda, após o ciclo, a partir do qual a campanha é considerada ineficiente."),
  p("high_ticket", "min_leads_avaliacao", 30, "leads", "provisorio", "Leads mínimos para avaliar qualidade antes da venda."),
  p("high_ticket", "vendas_min_escala", 3, "vendas", "provisorio", "Vendas acumuladas mínimas para recomendar escala."),
  p("high_ticket", "taxa_qualificacao_min_pct", null, "%", "a_definir", "Qualificados ÷ leads (histórico do CRM)."),
  p("high_ticket", "taxa_agendamento_min_pct", null, "%", "a_definir", "Agendamentos ÷ qualificados."),
  p("high_ticket", "taxa_comparecimento_min_pct", null, "%", "a_definir", "Comparecimentos ÷ agendamentos."),
  p("high_ticket", "taxa_fechamento_min_pct", null, "%", "a_definir", "Vendas ÷ comparecimentos."),

  // ---- lançamento
  p("lancamento", "ritmo_min", 0.9, "índice", "POP", "Índice de ritmo mínimo (POP §40)."),
  p("lancamento", "ritmo_max", 1.1, "índice", "POP", "Índice de ritmo máximo (POP §40)."),
  p("lancamento", "carrinho_visita_checkout_min_pct", 20, "%", "provisorio", "Referência do Low Ticket; ajustar ao lançamento."),
  p("lancamento", "carrinho_checkout_compra_min_pct", 40, "%", "provisorio", "Referência do Low Ticket; ajustar ao lançamento."),
  p("lancamento", "taxa_presenca_min_pct", null, "%", "a_definir", "Presença (comparecimentos ÷ inscrições) esperada no aquecimento."),
];

/** Constrói um leitor de configuração: get(funil, chave) com fallback para "global". null = não configurado. */
export function lerConfig(linhas) {
  const m = new Map();
  for (const l of linhas || []) m.set(`${l.tipo_funil}.${l.chave}`, l.valor);
  for (const l of CONFIG_PADRAO) if (!m.has(`${l.tipo_funil}.${l.chave}`)) m.set(`${l.tipo_funil}.${l.chave}`, l.valor);
  return {
    get(funil, chave) {
      const v = m.has(`${funil}.${chave}`) ? m.get(`${funil}.${chave}`) : m.get(`global.${chave}`);
      return typeof v === "number" ? v : null;
    },
    fonte(funil, chave) {
      const l = (linhas || []).find((x) => x.id === `${funil}.${chave}`) || CONFIG_PADRAO.find((x) => `${x.tipo_funil}.${x.chave}` === `${funil}.${chave}`) || (linhas || []).find((x) => x.id === `global.${chave}`);
      return l?.fonte || "a_definir";
    },
  };
}
