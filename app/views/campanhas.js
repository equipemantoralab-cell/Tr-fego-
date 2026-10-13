import { api } from "../api.js";
import { h, montar, tabela, rot, ROTULOS, opcoesDe, chip, selo, estadoVazio, modal, brl, nf, pct, data, dataHora, toast, kpi, confirmar, campo, textarea, lerForm } from "../ui.js";
import { D, pode, cliente, produto, analisesDe, ultimaAnalise, resultadoMotor, decisoesDe, vencida, responsaveis, carregar, comConflito } from "../estado.js";
import { abrirFormulario, PREFIXO } from "../forms.js";
import { cartaoDiagnostico } from "../ui-diag.js";
import { graficoLinha } from "../charts.js";
import { serieTemporal } from "../../lib/intel.js";
import { hoje } from "../ui.js";

// Quais metas fazem sentido para cada funil/modelo (os demais campos ficam desativados no formulário)
export const METAS_POR_FUNIL = (tipo, modelo) => {
  if (tipo === "low_ticket") return ["cpa_alvo", "roas_alvo", "meta_conversoes"];
  if (tipo === "medio_ticket") return modelo === "leads" ? ["cpl_alvo", "cpql_alvo", "meta_leads"] : modelo === "comercial" ? ["cac_alvo", "cpl_alvo", "cpql_alvo", "roas_alvo", "meta_conversoes"] : ["cpa_alvo", "roas_alvo", "meta_conversoes"];
  if (tipo === "high_ticket") return ["cac_alvo", "cpl_alvo", "cpql_alvo", "ciclo_venda_dias", "roas_alvo", "meta_conversoes"];
  if (tipo === "lancamento") return ["cpl_alvo", "cac_alvo", "meta_leads", "meta_conversoes", "roas_alvo", "data_fim", "fase_lancamento"];
  return [];
};
const TODAS_METAS = ["cpa_alvo", "roas_alvo", "meta_conversoes", "cpl_alvo", "cpql_alvo", "cac_alvo", "meta_leads", "ciclo_venda_dias", "data_fim", "fase_lancamento"];

export function camposCampanha(padroes = {}) {
  const clientes = D().CLIENTES.map((c) => [c.id, c.nome]);
  return [
    { nome: "nome", rotulo: "Nome da campanha", req: true, max: 200, full: true },
    { nome: "cliente_id", rotulo: "Cliente", tipo: "sel", opcoes: clientes, req: true, padrao: padroes.cliente_id },
    { nome: "produto_id", rotulo: "Produto", tipo: "sel", opcoes: D().PRODUTOS.filter((p) => p.status !== "arquivado").map((p) => [p.id, `${p.nome} (${cliente(p.cliente_id)?.nome || ""})`]), dica: "Opcional: traz CPA alvo do produto quando a campanha não define o seu." },
    { nome: "tipo_funil", rotulo: "Tipo de funil", tipo: "sel", opcoes: opcoesDe(ROTULOS.tipo_funil), req: true, padrao: "low_ticket" },
    { nome: "modelo_funil", rotulo: "Modelo (médio ticket)", tipo: "sel", opcoes: opcoesDe(ROTULOS.modelo_funil), dica: "Define a métrica principal: CPA de compra, CPL ou CAC." },
    { nome: "objetivo", rotulo: "Objetivo da campanha", max: 500, full: true },
    { nome: "data_inicio", rotulo: "Data de início", tipo: "data", req: true }, { nome: "data_fim", rotulo: "Data de término prevista", tipo: "data" },
    { nome: "status", rotulo: "Status", tipo: "sel", opcoes: opcoesDe(ROTULOS.status_campanha), req: true, padrao: "em_teste" },
    { nome: "responsavel", rotulo: "Responsável", max: 120 },
    { nome: "orcamento_diario", rotulo: "Orçamento diário (R$)", tipo: "num" }, { nome: "orcamento_total", rotulo: "Orçamento total previsto (R$)", tipo: "num" },
    { nome: "cpa_alvo", rotulo: "CPA alvo (R$)", tipo: "num" }, { nome: "roas_alvo", rotulo: "ROAS alvo (x)", tipo: "num" }, { nome: "meta_conversoes", rotulo: "Meta de conversões", tipo: "num" },
    { nome: "cpl_alvo", rotulo: "CPL alvo (R$)", tipo: "num" }, { nome: "cpql_alvo", rotulo: "CPQL alvo (R$)", tipo: "num" }, { nome: "cac_alvo", rotulo: "CAC alvo (R$)", tipo: "num" },
    { nome: "meta_leads", rotulo: "Meta de leads", tipo: "num" }, { nome: "ciclo_venda_dias", rotulo: "Ciclo médio de venda (dias)", tipo: "num", dica: "Essencial no high ticket: evita pausar antes de o ciclo terminar." },
    { nome: "fase_lancamento", rotulo: "Fase do lançamento", tipo: "sel", opcoes: opcoesDe(ROTULOS.fase_lancamento) },
    { nome: "observacoes", rotulo: "Observações", tipo: "area", full: true, max: 4000 },
  ];
}
function aoMontarCampanha(form) {
  const aplicar = () => {
    const tipo = form.querySelector('[name="tipo_funil"]').value, modelo = form.querySelector('[name="modelo_funil"]').value;
    const ativos = METAS_POR_FUNIL(tipo, modelo);
    for (const n of TODAS_METAS) { const el = form.querySelector(`[name="${n}"]`); const caixa = el.closest("div"); const on = ativos.includes(n); el.disabled = !on; caixa.style.display = on ? "" : "none"; }
    const mod = form.querySelector('[name="modelo_funil"]'); mod.disabled = tipo !== "medio_ticket"; mod.closest("div").style.display = tipo === "medio_ticket" ? "" : "none";
  };
  form.querySelector('[name="tipo_funil"]').addEventListener("change", aplicar); form.querySelector('[name="modelo_funil"]').addEventListener("change", aplicar); aplicar();
}
export const abrirFormCampanha = (o) => abrirFormulario({ titulo: o.registro ? "Editar campanha" : "Nova campanha", entidade: "campanhas", prefixo: PREFIXO.CAMPANHAS, campos: camposCampanha(o.padroes), registro: o.registro, padroes: o.padroes, aoSalvar: o.aoSalvar, aoMontar: aoMontarCampanha, largura: 820 });

export async function render(ctx) {
  const [id] = ctx.params;
  return id ? detalhe(ctx, id) : lista(ctx);
}

// ---------------------------------------------------------------- lista
function lista(ctx) {
  const f = { cliente: ctx.query.cliente || "", status: "", funil: "", q: "" };
  const corpo = h("div");
  const desenhar = () => {
    const camps = D().CAMPANHAS.filter((c) => (!f.cliente || c.cliente_id === f.cliente) && (!f.status || c.status === f.status) && (!f.funil || c.tipo_funil === f.funil) && (!f.q || c.nome.toLowerCase().includes(f.q.toLowerCase())));
    montar(corpo, tabela([{ titulo: "Campanha", valor: (c) => c.nome }, { titulo: "Cliente", valor: (c) => cliente(c.cliente_id)?.nome || "—" }, { titulo: "Funil", valor: (c) => rot("tipo_funil", c.tipo_funil) + (c.modelo_funil ? ` · ${rot("modelo_funil", c.modelo_funil)}` : "") }, { titulo: "Status", valor: (c) => chip(rot("status_campanha", c.status)) }, { titulo: "Início", valor: (c) => data(c.data_inicio) }, { titulo: "Situação", valor: (c) => selo(ultimaAnalise(c.id)?.situacao || "insuficiente") }],
      camps, { aoClicar: (c) => { location.hash = `#/campanhas/${c.id}`; }, vazioTxt: "Nenhuma campanha encontrada." }));
  };
  const s = (nome, ops, vazio, chave) => { const el = h("select", { "aria-label": vazio }, h("option", { value: "" }, vazio), ops.map(([v, r]) => h("option", { value: v, selected: f[chave] === v }, r))); el.addEventListener("change", () => { f[chave] = el.value; desenhar(); }); return el; };
  const busca = h("input", { type: "search", placeholder: "Buscar por nome…", "aria-label": "Buscar" }); busca.addEventListener("input", () => { f.q = busca.value; desenhar(); });
  const r = h("div", null, h("h1", null, "Campanhas"), h("p", { class: "sub" }, "Selecione uma campanha para ver métricas, análises, plano de ação e histórico."),
    h("div", { class: "filtros" }, h("div", null, busca), h("div", null, s("c", D().CLIENTES.map((c) => [c.id, c.nome]), "Todos os clientes", "cliente")), h("div", null, s("s", opcoesDe(ROTULOS.status_campanha), "Todos os status", "status")), h("div", null, s("f", opcoesDe(ROTULOS.tipo_funil), "Todos os funis", "funil")),
      pode("criar", "CAMPANHAS") ? h("div", null, h("button", { class: "act primario", onclick: () => abrirFormCampanha({ padroes: f.cliente ? { cliente_id: f.cliente } : {}, aoSalvar: ctx.recarregar }) }, "+ Nova campanha")) : null), corpo);
  desenhar(); return r;
}

// ---------------------------------------------------------------- detalhe
async function detalhe(ctx, id) {
  const c = D().CAMPANHAS.find((x) => x.id === id);
  if (!c) return estadoVazio("Campanha não encontrada.", h("a", { class: "act", href: "#/campanhas" }, "Voltar"));
  const secao = ctx.query.aba || "resumo";
  const analises = analisesDe(c.id), ultima = ultimaAnalise(c.id), decs = decisoesDe(c.id);
  const corpo = h("div");
  const prod = c.produto_id ? produto(c.produto_id) : null;
  const abas = [["resumo", "Resumo e diagnóstico"], ["metricas", "Métricas"], ["analises", `Análises (${analises.length})`], ["acoes", `Plano de ação (${decs.length})`], ["historico", "Histórico"]];
  const ir = (a) => { location.hash = `#/campanhas/${c.id}?aba=${a}`; };
  const meta = [["CPA alvo", c.cpa_alvo ?? prod?.cpa_alvo, brl], ["ROAS alvo", c.roas_alvo, (v) => `${nf(v, 2)}x`], ["CPL alvo", c.cpl_alvo, brl], ["CAC alvo", c.cac_alvo, brl], ["Meta de conversões", c.meta_conversoes, (v) => nf(v, 0)], ["Meta de leads", c.meta_leads, (v) => nf(v, 0)], ["Ciclo de venda", c.ciclo_venda_dias, (v) => `${nf(v, 0)} dias`]].filter(([, v]) => v !== null && v !== undefined);
  const topo = h("div", null,
    h("p", { class: "nota" }, h("a", { href: "#/campanhas" }, "← Campanhas"), " · ", h("a", { href: `#/clientes?id=${c.cliente_id}` }, cliente(c.cliente_id)?.nome || "cliente")),
    h("div", { class: "barra-acoes" }, h("h1", { style: "margin:0" }, c.nome), chip(rot("tipo_funil", c.tipo_funil) + (c.modelo_funil ? ` · ${rot("modelo_funil", c.modelo_funil)}` : "")), chip(rot("status_campanha", c.status)), c.fase_lancamento ? chip(`Fase: ${rot("fase_lancamento", c.fase_lancamento)}`) : null, selo(ultima?.situacao || "insuficiente"), h("span", { class: "esp" }),
      pode("criar", "ANALISES") ? h("a", { class: "act primario", href: `#/nova-analise?campanha=${c.id}` }, "+ Nova análise") : null,
      pode("atualizar", "CAMPANHAS") ? h("button", { class: "act", onclick: () => abrirFormCampanha({ registro: c, aoSalvar: ctx.recarregar }) }, "Editar") : null),
    h("p", { class: "sub" }, `Início ${data(c.data_inicio)}${c.data_fim ? ` · término previsto ${data(c.data_fim)}` : ""} · responsável: ${c.responsavel || "—"}${prod ? ` · produto: ${prod.nome}` : ""}`),
    meta.length ? h("div", { class: "derivadas", style: "margin-bottom:14px" }, meta.map(([r, v, f]) => kpi(r, f(v)))) : h("div", { class: "aviso-box" }, "Nenhuma meta definida: o motor não consegue comparar o resultado. Edite a campanha e informe as metas."),
    c.observacoes ? h("p", { class: "nota pre-linhas" }, c.observacoes) : null,
    h("div", { class: "abas-internas", role: "tablist" }, abas.map(([a, t]) => h("button", { role: "tab", "aria-selected": String(secao === a), onclick: () => ir(a) }, t))));

  if (secao === "resumo") {
    montar(corpo, ultima ? [h("p", { class: "nota" }, `Baseado na análise de ${data(ultima.periodo_inicio)} a ${data(ultima.periodo_fim)} (registrada em ${dataHora(ultima.criado_em)} por ${ultima.responsavel_analise || "—"}).`), cartaoDiagnostico(resultadoMotor(ultima), { titulo: "Diagnóstico atual" })]
      : [estadoVazio("Esta campanha ainda não tem análises.", pode("criar", "ANALISES") ? h("a", { class: "act primario", href: `#/nova-analise?campanha=${c.id}` }, "Registrar a primeira análise") : null)]);
  } else if (secao === "metricas") {
    const marc = decs.filter((d) => d.data_execucao).map((d) => ({ x: d.data_execucao, rotulo: `Ação executada: ${d.descricao}` }));
    const mae = c.tipo_funil === "medio_ticket" && c.modelo_funil === "leads" ? ["cpl", "CPL", "brl", c.cpl_alvo] : ["high_ticket", "lancamento"].includes(c.tipo_funil) || c.modelo_funil === "comercial" ? ["cac", "CAC", "brl", c.cac_alvo] : ["cpa", "CPA", "brl", c.cpa_alvo ?? prod?.cpa_alvo];
    const g = (campo, tit, fmt, meta_) => graficoLinha({ titulo: tit, pontos: serieTemporal(analises, [campo]).map((p) => ({ x: p.data, y: p[campo] })), formato: fmt, meta: meta_ ?? null, marcadores: marc });
    montar(corpo, analises.length < 1 ? estadoVazio("Registre análises para ver a evolução.") : [
      h("p", { class: "nota" }, "Cada ponto é o valor da análise (período). Linhas verticais pontilhadas marcam ações executadas. Dados não informados aparecem como lacuna, não como zero."),
      h("div", { class: "graficos-g" }, g(mae[0], mae[1], mae[2], mae[3]), g("investimento", "Investimento", "brl"), g("roas", "ROAS", "x", c.roas_alvo), g("ctr_link", "CTR (link)", "pct"), g("compras", "Compras", "num"), g("receita_total", "Receita", "brl"), g("cpm", "CPM", "brl"), g("taxa_visita_checkout", "Visita → checkout", "pct"))]);
  } else if (secao === "analises") {
    montar(corpo, tabela([{ titulo: "Período", valor: (a) => `${data(a.periodo_inicio)} – ${data(a.periodo_fim)}` }, { titulo: "Investimento", num: true, valor: (a) => brl(a.investimento) }, { titulo: "Compras", num: true, valor: (a) => (a.compras === null ? "—" : nf(a.compras, 0)) }, { titulo: "CPA", num: true, valor: (a) => brl(a.cpa) }, { titulo: "ROAS", num: true, valor: (a) => (a.roas === null ? "—" : `${nf(a.roas, 2)}x`) }, { titulo: "Situação", valor: (a) => selo(a.situacao) }, { titulo: "Recomendação", valor: (a) => (a.recomendacao || "—").split("(")[0] },
      { titulo: "Status", valor: (a) => (a.status === "anulada" ? chip("Anulada") : "") }],
      [...D().ANALISES.filter((a) => a.campanha_id === c.id)].sort((x, y) => String(y.periodo_fim).localeCompare(String(x.periodo_fim))), { aoClicar: (a) => abrirAnalise(a, ctx), vazioTxt: "Sem análises." }));
  } else if (secao === "acoes") {
    montar(corpo, h("div", { class: "barra-acoes" }, h("span", { class: "esp" }), h("a", { class: "act", href: `#/plano?campanha=${c.id}` }, "Abrir no Plano de ação")),
      tabela([{ titulo: "Ação", valor: (d) => d.descricao }, { titulo: "Responsável", valor: (d) => d.responsavel || "—" }, { titulo: "Prazo", valor: (d) => (vencida(d, hoje()) ? h("span", { class: "no" }, `${data(d.prazo)} (vencida)`) : data(d.prazo)) }, { titulo: "Prioridade", valor: (d) => rot("prioridade", d.prioridade) }, { titulo: "Status", valor: (d) => chip(rot("status_acao", d.status)) }], decs, { aoClicar: () => { location.hash = `#/plano?campanha=${c.id}`; }, vazioTxt: "Nenhuma ação registrada." }));
  } else if (secao === "historico") {
    montar(corpo, carregandoHist());
    historico(c, corpo, decs);
  }
  return h("div", null, topo, corpo);
}
const carregandoHist = () => h("div", { class: "carregando" }, h("span", { class: "spinner" }), "Carregando histórico…");

async function historico(c, corpo, decs) {
  const blocos = [h("h2", { style: "font-size:16px" }, "Ações: recomendado × executado × resultado")];
  const execs = decs.filter((d) => d.data_execucao);
  if (!decs.length) blocos.push(estadoVazio("Nenhuma ação registrada para esta campanha."));
  for (const d of decs) {
    let cmp = null; if (d.data_execucao) { try { cmp = (await api.comparacao(d.id)).comparacao; } catch { cmp = null; } }
    blocos.push(h("div", { class: "card" },
      h("div", { class: "barra-acoes" }, h("b", null, d.descricao), chip(rot("status_acao", d.status)), chip(rot("decisao_adotada", d.decisao_adotada))),
      h("p", { class: "nota" }, `Recomendado: ${d.acao_recomendada || d.tipo_acao} · ${rot("nivel_evidencia", d.nivel_evidencia)} · criada em ${dataHora(d.criado_em)}. Executada em: ${d.data_execucao ? data(d.data_execucao) : "ainda não executada"}.`),
      cmp && cmp.comparacoes?.length ? h("div", null, h("p", null, cmp.texto), tabela([{ titulo: "Métrica", valor: (x) => x.metrica.toUpperCase() + (x.principal ? " (principal)" : "") }, { titulo: "Antes", num: true, valor: (x) => nf(x.antes, 2) }, { titulo: "Depois", num: true, valor: (x) => nf(x.depois, 2) }, { titulo: "Variação", num: true, valor: (x) => (x.delta_pct === null ? "—" : h("span", { class: x.melhorou ? "dif-bom" : x.piorou ? "dif-ruim" : "" }, `${x.delta_pct > 0 ? "+" : ""}${nf(x.delta_pct, 1)}%`)) }], cmp.comparacoes), h("p", { class: "nota" }, `Confiança: ${cmp.confianca}. ${cmp.ressalvas.join(" ")}`)) : h("p", { class: "nota" }, cmp?.texto || "Sem comparação ainda."),
      d.conclusao_reavaliacao ? h("div", { class: "aviso-box" }, h("b", null, "Conclusão registrada: "), d.conclusao_reavaliacao) : null));
  }
  if (pode("ler", "HISTORICO_ALTERACOES")) {
    try {
      const ev = (await api.listar("historico")).registros.filter((e) => e.registro_id === c.id || (e.entidade === "ANALISES" && D().ANALISES.some((a) => a.id === e.registro_id && a.campanha_id === c.id)) || decs.some((d) => d.id === e.registro_id)).sort((a, b) => String(b.ts).localeCompare(String(a.ts))).slice(0, 80);
      blocos.push(h("h2", { style: "font-size:16px;margin-top:18px" }, "Alterações registradas"), tabela([{ titulo: "Quando", valor: (e) => dataHora(e.ts) }, { titulo: "Quem", valor: (e) => e.usuario }, { titulo: "Operação", valor: (e) => `${e.operacao} · ${e.entidade}` }, { titulo: "Resultado", valor: (e) => e.resultado }, { titulo: "Mudança", valor: (e) => (e.valores_novos ? `${Object.keys(JSON.parse(e.valores_novos)).slice(0, 4).join(", ")}` : "—") }], ev, { vazioTxt: "Sem eventos." }));
    } catch { /* sem permissão ou offline */ }
  }
  montar(corpo, blocos);
}

export function abrirAnalise(a, ctx) {
  const r = resultadoMotor(a);
  const m = modal(`Análise ${data(a.periodo_inicio)} – ${data(a.periodo_fim)}`, h("div", null,
    h("p", { class: "nota" }, `Registrada em ${dataHora(a.criado_em)} por ${a.responsavel_analise || "—"} · motor v${a.versao_motor || "?"}${a.status === "anulada" ? ` · ANULADA: ${a.motivo_anulacao}` : ""}`),
    h("div", { class: "derivadas" }, [["Investimento", brl(a.investimento)], ["Impressões", nf(a.impressoes, 0)], ["Cliques (link)", nf(a.cliques_link, 0)], ["Visitas", nf(a.visitas_pagina, 0)], ["Leads", nf(a.leads, 0)], ["Checkouts", nf(a.inicios_checkout, 0)], ["Compras", nf(a.compras, 0)], ["Receita total", brl(a.receita_total)], ["CPM", brl(a.cpm)], ["CPC", brl(a.cpc)], ["CTR", pct(a.ctr, 2)], ["CPL", brl(a.cpl)], ["CPA", brl(a.cpa)], ["CAC", brl(a.cac)], ["ROAS", a.roas === null ? "—" : `${nf(a.roas, 2)}x`]].map(([k, v]) => kpi(k, v))),
    a.notas ? h("p", { class: "nota" }, `Notas: ${a.notas}`) : null,
    cartaoDiagnostico(r, { titulo: "Diagnóstico registrado" })), { largura: 900, acoes: [
      a.status !== "anulada" && pode("anular", "ANALISES") ? h("button", { class: "act perigo", onclick: async () => {
        const motivo = prompt("Motivo da anulação (a análise permanece no histórico, mas deixa de contar nos acumulados):"); if (!motivo || motivo.trim().length < 5) return;
        try { await api.acao("analises", a.id, "anular", { versao: a.versao, motivo }); m.fechar(); toast("Análise anulada ✓"); await carregar({ silencioso: true }); ctx.recarregar(); } catch (e) { toast(e.message, "erro"); } } }, "Anular análise") : null,
      h("button", { class: "act", onclick: () => m.fechar() }, "Fechar")] });
}
