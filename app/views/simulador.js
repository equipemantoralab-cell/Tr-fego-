// Simulador financeiro: economia unitária, CPA máximo/alvo, ROAS de equilíbrio, cenários de orçamento e projeção de escala.
import { api } from "../api.js";
import { h, montar, campo, entrada, seletor, kpi, brl, nf, pct, tabela, toast, estadoVazio, lerForm, rot, chip } from "../ui.js";
import { D, pode, produto, campanha, cliente, ultimaAnalise, carregar, comConflito } from "../estado.js";
import { economiaUnitaria, cenariosOrcamento, projecaoEscala } from "../../lib/finance.js";
import { toNum } from "../../lib/metrics.js";
import { modal } from "../ui.js";

const RS = { cpa_maximo: "CPA máximo", cpa_alvo: "CPA alvo" };

export async function render(ctx) {
  const raiz = h("div"), form = h("form", { novalidate: true }), saida = h("div");
  const p0 = ctx.query.produto ? produto(ctx.query.produto) : null, c0 = ctx.query.campanha ? campanha(ctx.query.campanha) : null;
  const prodSel = h("select", { name: "_produto" }, h("option", { value: "" }, "Digitar manualmente"), D().PRODUTOS.map((p) => h("option", { value: p.id, selected: p.id === (p0?.id || c0?.produto_id) }, `${cliente(p.cliente_id)?.nome || ""} — ${p.nome}`)));
  const campSel = h("select", { name: "_campanha" }, h("option", { value: "" }, "—"), D().CAMPANHAS.map((c) => h("option", { value: c.id, selected: c.id === c0?.id }, `${cliente(c.cliente_id)?.nome || ""} — ${c.nome}`)));
  const N = (n, v, r, dica) => campo(r, entrada(n, v ?? "", { modo: "decimal" }), { dica });
  const campos = {
    preco: N("preco", "", "Preço (R$) *"), receita_adicional_media: N("receita_adicional_media", "", "Receita adicional média por comprador (R$)", "Bumps/upsells."), reembolso_pct: N("reembolso_pct", "", "Reembolso estimado (%)"),
    taxas_pct: N("taxas_pct", "", "Taxas (% da receita)"), taxa_fixa: N("taxa_fixa", "", "Taxa fixa por venda (R$)"), impostos_pct: N("impostos_pct", "", "Impostos estimados (%)"), custo_variavel: N("custo_variavel", "", "Custo variável por venda (R$)"), lucro_desejado: N("lucro_desejado", "", "Lucro desejado por venda (R$)", "Define o CPA alvo = margem − lucro desejado."),
    orcamento_atual: N("orcamento_atual", "", "Orçamento atual (R$ no período)", "Ex.: gasto do mês ou do dia."), cpa_atual: N("cpa_atual", "", "CPA atual (R$)"), custom: N("custom", "", "Variação personalizada (%)", "Use negativo para reduzir."), piora: N("piora", "", "Piora hipotética do CPA nos cenários maiores (%)", "Em branco = CPA constante."),
    degrau: N("degrau", "20", "Degrau diário (%)"), dias: N("dias", "7", "Dias de projeção"), decaimento: N("decaimento", "", "Piora do CPA a cada degrau (%)"),
  };
  const preencher = () => {
    const p = produto(prodSel.value), c = campanha(campSel.value);
    if (p) for (const k of ["preco", "receita_adicional_media", "reembolso_pct", "taxas_pct", "taxa_fixa", "impostos_pct", "custo_variavel"]) { const el = form.querySelector(`[name="${k}"]`); if (p[k] !== null && p[k] !== undefined) el.value = String(p[k]).replace(".", ","); }
    if (c) { const u = ultimaAnalise(c.id); if (u?.cpa !== null && u?.cpa !== undefined) form.querySelector('[name="cpa_atual"]').value = String(u.cpa).replace(".", ","); if (c.orcamento_diario) form.querySelector('[name="orcamento_atual"]').value = String(c.orcamento_diario).replace(".", ","); }
    calcular();
  };
  prodSel.addEventListener("change", preencher); campSel.addEventListener("change", preencher);

  const calcular = () => {
    const v = lerForm(form), eco = economiaUnitaria(v);
    if (!eco.ok) { montar(saida, h("div", { class: "aviso-box", role: "alert" }, eco.erros.join("; "))); return; }
    const var_ = [20, 30, 50]; const cu = toNum(v.custom); if (cu !== null && Number.isFinite(cu)) var_.push(cu);
    const cen = cenariosOrcamento({ orcamento_atual: v.orcamento_atual, cpa_atual: v.cpa_atual, economia: eco, variacoes: var_.concat(toNum(v.custom) === null ? [-20] : []), piora_cpa_pct: v.piora });
    const proj = projecaoEscala({ orcamento_inicial: v.orcamento_atual, degrau_pct: v.degrau, dias: toNum(v.dias), cpa: v.cpa_atual, economia: eco, decaimento_cpa_pct_por_degrau: v.decaimento });
    const p = produto(prodSel.value);
    montar(saida,
      h("div", { class: "secao" }, h("h2", null, "Economia por comprador"),
        h("div", { class: "kpis-g" }, kpi("Ticket médio", brl(eco.ticket_medio)), kpi("Receita por comprador (após reembolso)", brl(eco.receita_por_comprador)), kpi("Margem de contribuição", brl(eco.margem_contribuicao), `${nf(eco.margem_pct, 1)}% da receita bruta`, eco.viavel ? "" : "alerta"), kpi("CPA máximo (equilíbrio)", brl(eco.cpa_maximo)), kpi("CPA alvo", brl(eco.cpa_alvo), eco.cpa_alvo === null ? "informe o lucro desejado" : ""), kpi("ROAS de equilíbrio", eco.roas_equilibrio === null ? "—" : `${nf(eco.roas_equilibrio, 2)}x`), kpi("ROAS alvo", eco.roas_alvo === null ? "—" : `${nf(eco.roas_alvo, 2)}x`)),
        eco.avisos.map((a) => h("div", { class: "aviso-box", role: "alert" }, a)),
        p && pode("atualizar", "PRODUTOS") ? h("button", { class: "act", type: "button", onclick: () => salvarNoProduto(p, eco) }, "Salvar CPA máximo/alvo no produto") : null,
        h("details", { class: "sub" }, h("summary", null, "Fórmulas e premissas"), h("ul", null, eco.formulas.map((f) => h("li", null, f))), h("ul", null, eco.premissas.map((f) => h("li", { class: "nota" }, f))))),
      cen.ok ? h("div", { class: "secao" }, h("h2", null, "Cenários de orçamento"), h("div", { class: "aviso-box" }, cen.premissas[0]),
        tabela([{ titulo: "Cenário", valor: (l) => l.rotulo }, { titulo: "Orçamento", num: true, valor: (l) => brl(l.orcamento) }, { titulo: "CPA assumido", num: true, valor: (l) => brl(l.cpa) }, { titulo: "Vendas", num: true, valor: (l) => nf(l.vendas, 1) }, { titulo: "Receita bruta", num: true, valor: (l) => brl(l.receita_bruta) }, { titulo: "ROAS", num: true, valor: (l) => (l.roas === null ? "—" : `${nf(l.roas, 2)}x`) }, { titulo: "Lucro (após mídia)", num: true, valor: (l) => h("span", { class: l.lucro >= 0 ? "dif-bom" : "dif-ruim" }, `${l.lucro >= 0 ? "▲" : "▼"} ${brl(l.lucro)}`) }], cen.linhas),
        h("p", { class: "nota" }, `Folga até o equilíbrio: o CPA pode piorar ${nf(cen.limite_piora_cpa_pct, 1)}% antes de a operação deixar de dar lucro por venda.`),
        cen.avisos.map((a) => h("div", { class: "aviso-box" }, a)),
        h("details", { class: "sub" }, h("summary", null, "Fórmulas e premissas"), h("ul", null, cen.formulas.map((f) => h("li", null, f))), h("ul", null, cen.premissas.map((f) => h("li", { class: "nota" }, f)))))
        : h("div", { class: "nota" }, `Cenários de orçamento: ${cen.erros.join("; ")}.`),
      proj.ok ? h("div", { class: "secao" }, h("h2", null, "Projeção de escala em degraus"), h("div", { class: "aviso-box" }, proj.premissas[0]),
        h("div", { class: "kpis-g" }, kpi("Gasto total projetado", brl(proj.gasto_total)), kpi("Lucro acumulado projetado", brl(proj.lucro_total), null, proj.lucro_total < 0 ? "alerta" : ""), kpi("1º dia com CPA acima do equilíbrio", proj.primeiro_dia_cpa_acima_do_equilibrio ? `dia ${proj.primeiro_dia_cpa_acima_do_equilibrio}` : "nenhum")),
        tabela([{ titulo: "Dia", valor: (l) => String(l.dia) }, { titulo: "Orçamento", num: true, valor: (l) => brl(l.orcamento) }, { titulo: "CPA", num: true, valor: (l) => brl(l.cpa) }, { titulo: "Vendas", num: true, valor: (l) => nf(l.vendas, 1) }, { titulo: "Lucro do dia", num: true, valor: (l) => brl(l.lucro) }, { titulo: "Lucro acumulado", num: true, valor: (l) => brl(l.lucro_acumulado) }], proj.linhas.slice(0, 31)))
        : h("div", { class: "nota" }, `Projeção de escala: ${proj.erros.join("; ")}.`));
  };
  async function salvarNoProduto(p, eco) {
    const patch = { cpa_maximo: Math.round(eco.cpa_maximo * 100) / 100, ...(eco.cpa_alvo !== null ? { cpa_alvo: Math.round(eco.cpa_alvo * 100) / 100 } : {}) };
    try { await comConflito((v) => api.atualizar("produtos", p.id, { ...patch, versao: v ?? p.versao }), { patch, rotulos: RS, modal, h, toast }); toast("Produto atualizado ✓"); await carregar({ silencioso: true }); }
    catch (e) { if (e?.descartado) return; toast(e.message, "erro"); }
  }
  form.addEventListener("input", calcular);
  montar(form, h("div", { class: "grupo-campos" }, h("h3", null, "Origem dos dados"), h("div", { class: "fields3" }, campo("Produto", prodSel), campo("Campanha (traz CPA e orçamento)", campSel))),
    h("div", { class: "grupo-campos" }, h("h3", null, "Economia do produto"), h("div", { class: "fields3" }, Object.values(campos).slice(0, 8))),
    h("div", { class: "grupo-campos" }, h("h3", null, "Cenários de orçamento"), h("div", { class: "fields3" }, Object.values(campos).slice(8, 12))),
    h("div", { class: "grupo-campos" }, h("h3", null, "Projeção de escala"), h("div", { class: "fields3" }, Object.values(campos).slice(12))));
  montar(raiz, h("h1", null, "Simulador financeiro"), h("p", { class: "sub" }, "Faturamento não é lucro. Todos os cálculos mostram fórmulas e premissas; projeções assumem CPA constante a menos que você informe uma piora."), form, saida);
  if (p0 || c0) preencher(); else calcular();
  return raiz;
}
