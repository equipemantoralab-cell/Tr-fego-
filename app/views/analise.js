// Nova análise: entrada manual dos indicadores do período → métricas calculadas na hora → diagnóstico → ações.
import { api, ApiErro, novoId } from "../api.js";
import { h, montar, campo, entrada, seletor, textarea, lerForm, toast, kpi, brl, nf, pct, hoje, somaDias, rot, ROTULOS, opcoesDe, estadoVazio, tabela, chip, data } from "../ui.js";
import { D, estado, pode, campanha, cliente, produto, carregar, ultimaAnalise } from "../estado.js";
import { derivar, normalizarBase, avisosConsistencia } from "../../lib/metrics.js";
import { cartaoDiagnostico } from "../ui-diag.js";

const GRUPOS = [
  { id: "midia", titulo: "Mídia", campos: [["investimento", "Investimento (R$)"], ["impressoes", "Impressões"], ["alcance", "Alcance"], ["cliques", "Cliques (todos)"], ["cliques_link", "Cliques no link"]] },
  { id: "compra", titulo: "Página, checkout e compra", campos: [["visitas_pagina", "Visitas à página"], ["visualizacoes_conteudo", "Visualizações de conteúdo"], ["inicios_checkout", "Inícios de checkout"], ["compras", "Compras"], ["plays_video", "Plays da VSL"], ["cliques_cta", "Cliques no CTA da VSL"], ["quiz_inicios", "Quiz: inícios"], ["quiz_conclusoes", "Quiz: conclusões"]] },
  { id: "leads", titulo: "Leads e processo comercial", campos: [["leads", "Leads"], ["leads_qualificados", "Leads qualificados"], ["agendamentos", "Agendamentos"], ["comparecimentos", "Comparecimentos (reuniões/aulas)"], ["oportunidades", "Oportunidades"], ["inscricoes", "Inscrições (lançamento)"], ["vendas_comercial", "Vendas fechadas pelo comercial"], ["custo_comercial", "Custo comercial no período (R$)"]] },
  { id: "receita", titulo: "Receita", campos: [["receita", "Receita das vendas (R$)"], ["receita_order_bumps", "Receita de order bumps (R$)"], ["receita_adicional", "Receita adicional / upsell (R$)"]] },
];
const VISIVEIS = (c) => {
  const t = c?.tipo_funil, m = c?.modelo_funil;
  const v = new Set(["midia", "receita"]);
  if (t === "low_ticket" || (t === "medio_ticket" && ["pagina", "vsl", "quiz", undefined, null].includes(m)) || t === "lancamento") v.add("compra");
  if (t === "high_ticket" || (t === "medio_ticket" && ["leads", "comercial"].includes(m)) || t === "lancamento") v.add("leads");
  return v;
};
const RASC = "mt_rascunho_analise_v1";
const DER = [["cpm", "CPM", brl], ["cpc", "CPC", brl], ["ctr", "CTR", (v) => pct(v, 2)], ["ctr_link", "CTR (link)", (v) => pct(v, 2)], ["cpl", "CPL", brl], ["cpql", "CPQL", brl], ["cpa", "CPA", brl], ["cac", "CAC", brl], ["roas", "ROAS", (v) => (v === null ? "—" : `${nf(v, 2)}x`)], ["ticket_medio", "Ticket médio", brl],
  ["taxa_conexao", "Connect rate", (v) => pct(v, 1)], ["taxa_visita_checkout", "Visita → checkout", (v) => pct(v, 1)], ["taxa_checkout_compra", "Checkout → compra", (v) => pct(v, 1)], ["taxa_qualificacao", "Qualificação", (v) => pct(v, 1)], ["taxa_agendamento", "Agendamento", (v) => pct(v, 1)], ["taxa_comparecimento", "Comparecimento", (v) => pct(v, 1)], ["taxa_fechamento", "Fechamento", (v) => pct(v, 1)]];

export async function render(ctx) {
  if (!pode("criar", "ANALISES")) return h("div", null, h("h1", null, "Nova análise"), estadoVazio("Seu perfil não permite registrar análises."));
  const raiz = h("div");
  let idAnalise = novoId("ana");
  let rasc = {}; try { rasc = JSON.parse(localStorage.getItem(RASC)) || {}; } catch { rasc = {}; }
  const campInicial = ctx.query.campanha || rasc.campanha_id || "";
  const form = h("form", { novalidate: true });
  const secResultado = h("div");
  const derBox = h("div", { class: "derivadas" }), avisoBox = h("div");
  let mostrarTodos = false;

  const selCli = seletor("cliente_id", D().CLIENTES.filter((c) => c.status !== "encerrado").map((c) => [c.id, c.nome]), campanha(campInicial)?.cliente_id || rasc.cliente_id || "", { vazio: "Selecione…" });
  const selCamp = h("select", { name: "campanha_id" });
  const preencherCamps = () => { montar(selCamp, h("option", { value: "" }, "Selecione…"), D().CAMPANHAS.filter((c) => c.cliente_id === selCli.value && c.status !== "encerrado").map((c) => h("option", { value: c.id, selected: c.id === (selCamp.dataset.sel || campInicial) }, `${c.nome} — ${rot("tipo_funil", c.tipo_funil)}`))); };
  selCli.addEventListener("change", () => { selCamp.dataset.sel = ""; preencherCamps(); aplicar(); });
  selCamp.addEventListener("change", () => { selCamp.dataset.sel = selCamp.value; aplicar(); sugerirPeriodo(); });
  preencherCamps();

  const iniEl = entrada("periodo_inicio", rasc.periodo_inicio || "", { tipo: "date" }), fimEl = entrada("periodo_fim", rasc.periodo_fim || hoje(), { tipo: "date" });
  const faseEl = seletor("fase_lancamento", opcoesDe(ROTULOS.fase_lancamento), rasc.fase_lancamento || "", { vazio: "—" });
  const respEl = entrada("responsavel_analise", rasc.responsavel_analise || estado.usuario.nome);
  const notasEl = textarea("notas", rasc.notas || "");
  const sugerirPeriodo = () => { const c = campanha(selCamp.value); if (!c) return; const u = ultimaAnalise(c.id); if (u && !iniEl.value) iniEl.value = somaDias(u.periodo_fim, 1); else if (!iniEl.value) iniEl.value = c.data_inicio; };

  const gruposEl = GRUPOS.map((g) => h("fieldset", { class: "grupo-campos", dataset: { grupo: g.id } }, h("legend", null, g.titulo), h("div", { class: "fields3" }, g.campos.map(([n, r]) => campo(r, entrada(n, rasc[n] ?? "", { modo: "decimal", ph: "não informado" }))))));
  const aplicar = () => {
    const c = campanha(selCamp.value), vis = VISIVEIS(c);
    gruposEl.forEach((g) => { const on = mostrarTodos || vis.has(g.dataset.grupo); g.style.display = on ? "" : "none"; g.querySelectorAll("input").forEach((i) => (i.disabled = !on)); });
    faseEl.closest("div").style.display = c?.tipo_funil === "lancamento" ? "" : "none"; faseEl.disabled = c?.tipo_funil !== "lancamento";
    if (c?.tipo_funil === "lancamento" && !faseEl.value && c.fase_lancamento) faseEl.value = c.fase_lancamento;
    recalcular();
  };
  const valores = () => { const o = lerForm(form); return o; };
  const recalcular = () => {
    const v = valores(), { valores: base, erros } = normalizarBase(v), d = derivar(base);
    montar(derBox, DER.filter(([k]) => d[k] !== null && d[k] !== undefined).map(([k, r, f]) => kpi(r, f(d[k]))));
    if (!derBox.firstChild) derBox.append(h("div", { class: "nota" }, "As métricas calculadas aparecem aqui conforme você preenche."));
    montar(avisoBox, erros.length ? h("div", { class: "aviso-box", role: "alert" }, h("b", null, "Corrija: "), erros.join("; ")) : null, avisosConsistencia(base).map((a) => h("div", { class: "aviso-box" }, "⚠ ", a)));
    try { localStorage.setItem(RASC, JSON.stringify(v)); } catch { /* rascunho é conveniência */ }
  };
  form.addEventListener("input", recalcular); form.addEventListener("change", recalcular);

  const corpoEnvio = () => { const v = valores(); const o = {}; for (const [k, val] of Object.entries(v)) { if (k === "cliente_id") continue; if (val === null && !["compras"].includes(k)) { o[k] = null; continue; } o[k] = val; } return o; };
  const btnPrev = h("button", { class: "act", type: "button" }, "Calcular diagnóstico (prévia, sem salvar)");
  const btnSalvar = h("button", { class: "act primario", type: "button" }, "Salvar análise");
  const exibirErro = (e) => { if (e instanceof ApiErro && e.erros) toast(e.erros.join(" · "), "erro", 8000); else toast(e.message, "erro", 6000); };
  btnPrev.addEventListener("click", async () => {
    if (!selCamp.value) return toast("Selecione a campanha.", "aviso");
    btnPrev.disabled = true; btnPrev.textContent = "Calculando…";
    try { const r = await api.preview(corpoEnvio()); montar(secResultado, h("p", { class: "nota" }, "Prévia: nada foi salvo ainda."), cartaoDiagnostico(r.resultado, { titulo: "Diagnóstico (prévia)" }), r.avisos.length ? h("div", { class: "aviso-box" }, r.avisos.map((a) => h("div", null, "⚠ ", a))) : null); secResultado.scrollIntoView({ behavior: "smooth", block: "start" }); }
    catch (e) { exibirErro(e); } finally { btnPrev.disabled = false; btnPrev.textContent = "Calcular diagnóstico (prévia, sem salvar)"; }
  });
  btnSalvar.addEventListener("click", async () => {
    if (!selCamp.value) return toast("Selecione a campanha.", "aviso");
    btnSalvar.disabled = true; btnSalvar.textContent = "Salvando…";
    try {
      const r = await api.criar("analises", { id: idAnalise, ...corpoEnvio() });
      toast(r.criado === false ? "Esta análise já havia sido salva (envio repetido ignorado)." : "Análise salva na planilha ✓");
      idAnalise = novoId("ana"); try { localStorage.removeItem(RASC); } catch { /* ok */ }
      await carregar({ silencioso: true });
      mostrarResultado(r);
    } catch (e) { exibirErro(e); } finally { btnSalvar.disabled = false; btnSalvar.textContent = "Salvar análise"; }
  });

  function mostrarResultado(r) {
    const reg = r.registro, res = r.resultado, c = campanha(reg.campanha_id);
    const sel = (res.acoes || []).map((a) => ({ a, marcada: a.nivel_evidencia !== "hipotese" || a === res.acoes[0], resp: a.responsaveis_sugeridos?.[0] || c?.responsavel || "", prazo: somaDias(hoje(), a.prioridade === "critica" ? 1 : a.prioridade === "alta" ? 3 : 7) }));
    const lista = h("div", null, sel.map((s, i) => h("div", { class: "card" },
      h("label", { class: "check" }, h("input", { type: "checkbox", checked: s.marcada, "data-i": i }), h("span", null, h("b", null, s.a.descricao), " ", chip(rot("nivel_evidencia", s.a.nivel_evidencia), `nivel-${s.a.nivel_evidencia}`), " ", chip(rot("prioridade", s.a.prioridade)))),
      h("p", { class: "nota" }, s.a.motivo), h("div", { class: "fields" }, campo("Responsável", entrada(`resp${i}`, s.resp)), campo("Prazo", entrada(`prazo${i}`, s.prazo, { tipo: "date" }))))));
    const criar = h("button", { class: "act primario", type: "button" }, "Criar ações selecionadas no Plano de ação");
    criar.addEventListener("click", async () => {
      criar.disabled = true; let n = 0;
      try {
        for (let i = 0; i < sel.length; i++) {
          if (!lista.querySelector(`input[data-i="${i}"]`).checked) continue;
          const a = sel[i].a;
          await api.criar("decisoes", { id: novoId("dec"), analise_id: reg.id, campanha_id: reg.campanha_id, tipo_acao: a.tipo, problema: res.gargalo?.texto || res.recomendacao?.texto || null, acao_recomendada: a.descricao, descricao: a.descricao, nivel_evidencia: a.nivel_evidencia, prioridade: a.prioridade, justificativa: a.motivo, responsavel: lista.querySelector(`[name="resp${i}"]`).value || null, prazo: lista.querySelector(`[name="prazo${i}"]`).value || null, resultado_esperado: a.resultado_esperado, data_reavaliacao: somaDias(hoje(), 14) });
          n++;
        }
        toast(`${n} ação(ões) criada(s) ✓`); await carregar({ silencioso: true }); location.hash = `#/plano?campanha=${reg.campanha_id}`;
      } catch (e) { exibirErro(e); criar.disabled = false; }
    });
    montar(secResultado, h("div", { class: "faixa", style: "background:var(--gbg);border-color:var(--green)" }, `Análise registrada para ${c?.nome}. `, h("a", { href: `#/campanhas/${reg.campanha_id}` }, "Abrir campanha")),
      cartaoDiagnostico(res, { titulo: "Diagnóstico registrado" }),
      h("div", { class: "secao" }, h("h2", null, "Transformar em plano de ação"), h("p", { class: "nota" }, "Marque o que fará sentido executar, ajuste responsável e prazo. Hipóteses não confirmadas aparecem como tal."), lista, criar));
    secResultado.scrollIntoView({ behavior: "smooth", block: "start" });
    form.reset(); aplicar();
  }

  montar(form,
    h("div", { class: "grupo-campos" }, h("h3", null, "Campanha e período"), h("div", { class: "fields3" }, campo("Cliente", selCli), campo("Campanha", selCamp), campo("Responsável pela análise", respEl), campo("Início do período", iniEl), campo("Fim do período", fimEl), campo("Fase do lançamento", faseEl))),
    h("p", { class: "nota" }, h("b", null, "Vazio = não informado. "), "Digite 0 apenas quando o valor realmente foi zero (por exemplo, 0 compras). O sistema trata os dois casos de forma diferente."),
    gruposEl,
    h("label", { class: "check" }, h("input", { type: "checkbox", onchange: (e) => { mostrarTodos = e.target.checked; aplicar(); } }), "Mostrar todos os campos (independente do tipo de funil)"),
    campo("Notas", notasEl, { full: true }),
    h("div", { class: "secao" }, h("h2", null, "Métricas calculadas automaticamente"), avisoBox, derBox),
    h("div", { class: "barra-acoes" }, btnPrev, btnSalvar));
  montar(raiz, h("h1", null, "Nova análise"), h("p", { class: "sub" }, "Informe os indicadores do período. As métricas são calculadas pelo sistema e o diagnóstico é feito pelo motor de regras da Cascata."), form, secResultado);
  aplicar(); sugerirPeriodo();
  return raiz;
}
