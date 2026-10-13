// Plano de ação: ações geradas pelos diagnósticos (ou manuais) por responsável, prazo e status; reavaliação antes/depois.
import { api } from "../api.js";
import { h, montar, campo, textarea, rot, ROTULOS, opcoesDe, chip, estadoVazio, modal, toast, hoje, somaDias, data, dataHora, tabela, nf, kpi, lerForm } from "../ui.js";
import { D, pode, campanha, cliente, responsaveis, vencida, ABERTAS, carregar, comConflito } from "../estado.js";
import { abrirFormulario, PREFIXO } from "../forms.js";
import { ROTULO_ACAO } from "../../lib/schema.js";

const CAMPOS = (campId) => [
  { nome: "campanha_id", rotulo: "Campanha", tipo: "sel", opcoes: D().CAMPANHAS.map((c) => [c.id, `${cliente(c.cliente_id)?.nome || ""} — ${c.nome}`]), req: true, padrao: campId },
  { nome: "tipo_acao", rotulo: "Tipo de ação", tipo: "sel", opcoes: Object.entries(ROTULO_ACAO), req: true, padrao: "outro" },
  { nome: "descricao", rotulo: "Descrição da ação", req: true, full: true, max: 2000 },
  { nome: "problema", rotulo: "Problema identificado / motivo", tipo: "area", full: true, max: 2000 },
  { nome: "prioridade", rotulo: "Prioridade", tipo: "sel", opcoes: opcoesDe(ROTULOS.prioridade), req: true, padrao: "media" },
  { nome: "responsavel", rotulo: "Responsável", max: 120 },
  { nome: "status", rotulo: "Status", tipo: "sel", opcoes: opcoesDe(ROTULOS.status_acao), req: true, padrao: "pendente" },
  { nome: "decisao_adotada", rotulo: "Decisão adotada", tipo: "sel", opcoes: opcoesDe(ROTULOS.decisao_adotada), padrao: "pendente" },
  { nome: "prazo", rotulo: "Prazo", tipo: "data" }, { nome: "data_execucao", rotulo: "Data de execução", tipo: "data", dica: "Necessária para comparar antes e depois." },
  { nome: "data_conclusao", rotulo: "Data de conclusão", tipo: "data" }, { nome: "data_reavaliacao", rotulo: "Reavaliar em", tipo: "data" },
  { nome: "resultado_esperado", rotulo: "Resultado esperado", tipo: "area", full: true, max: 2000 },
  { nome: "resultado_observado", rotulo: "Resultado observado", tipo: "area", full: true, max: 2000 },
  { nome: "justificativa", rotulo: "Justificativa da decisão", tipo: "area", full: true, max: 4000 },
  { nome: "conclusao_reavaliacao", rotulo: "Conclusão da reavaliação", tipo: "area", full: true, max: 4000 },
];

export async function render(ctx) {
  const f = { campanha: ctx.query.campanha || "", cliente: "", responsavel: "", status: "", prioridade: "", visao: ctx.query.visao || "responsavel", ocultarEncerradas: true };
  const corpo = h("div"), raiz = h("div");
  const hj = hoje();

  function filtradas() {
    return D().DECISOES.filter((d) => (!f.campanha || d.campanha_id === f.campanha) && (!f.cliente || d.cliente_id === f.cliente) && (!f.responsavel || (d.responsavel || "") === f.responsavel) && (!f.status || d.status === f.status) && (!f.prioridade || d.prioridade === f.prioridade) && (!f.ocultarEncerradas || ABERTAS.includes(d.status) || f.status));
  }
  const cartao = (d) => h("div", { class: `tarefa ${vencida(d, hj) ? "vencida" : ""}`, tabindex: "0", role: "button", onclick: () => abrirTarefa(d), onkeydown: (e) => { if (e.key === "Enter") abrirTarefa(d); } },
    h("div", null, h("div", { class: "t-titulo" }, d.descricao), h("div", { class: "t-meta" }, h("span", null, campanha(d.campanha_id)?.nome || "—"), h("span", null, cliente(d.cliente_id)?.nome || ""), h("span", null, `Resp.: ${d.responsavel || "—"}`), h("span", null, vencida(d, hj) ? `⚠ vencida em ${data(d.prazo)}` : `Prazo: ${data(d.prazo)}`))),
    h("div", { style: "display:flex;flex-direction:column;gap:4px;align-items:flex-end" }, chip(rot("status_acao", d.status)), chip(rot("prioridade", d.prioridade)), d.nivel_evidencia ? chip(rot("nivel_evidencia", d.nivel_evidencia), `nivel-${d.nivel_evidencia}`) : null));
  const grupo = (titulo, lista) => (lista.length ? h("div", { class: "coluna-grupo" }, h("h3", null, `${titulo} (${lista.length})`), lista.map(cartao)) : null);
  const ORD = { critica: 0, alta: 1, media: 2, baixa: 3 };
  const ordenar = (l) => [...l].sort((a, b) => (a.prazo || "9999").localeCompare(b.prazo || "9999") || ORD[a.prioridade] - ORD[b.prioridade]);

  function desenhar() {
    const l = ordenar(filtradas());
    const abertas = l.filter((d) => ABERTAS.includes(d.status));
    let blocos;
    if (f.visao === "responsavel") { const por = new Map(); l.forEach((d) => { const k = d.responsavel || "Sem responsável"; por.set(k, [...(por.get(k) || []), d]); }); blocos = [...por.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => grupo(k, v)); }
    else if (f.visao === "prazo") {
      const fim7 = somaDias(hj, 7);
      blocos = [grupo("Vencidas", abertas.filter((d) => vencida(d, hj))), grupo("Hoje", abertas.filter((d) => d.prazo === hj)), grupo("Próximos 7 dias", abertas.filter((d) => d.prazo > hj && d.prazo <= fim7)), grupo("Mais adiante", abertas.filter((d) => d.prazo > fim7)), grupo("Sem prazo", abertas.filter((d) => !d.prazo)), grupo("Concluídas / canceladas", l.filter((d) => !ABERTAS.includes(d.status)))];
    } else blocos = Object.keys(ROTULOS.status_acao).map((s) => grupo(rot("status_acao", s), l.filter((d) => d.status === s)));
    const resumo = h("div", { class: "kpis-g" }, kpi("Em aberto", String(abertas.length)), kpi("Vencidas", String(abertas.filter((d) => vencida(d, hj)).length), null, abertas.some((d) => vencida(d, hj)) ? "alerta" : ""), kpi("Aguardando reavaliação", String(l.filter((d) => d.status === "aguardando_reavaliacao").length)), kpi("Concluídas", String(l.filter((d) => d.status === "concluida").length)));
    montar(corpo, resumo, blocos.filter(Boolean).length ? blocos : estadoVazio("Nenhuma ação com estes filtros.", pode("criar", "DECISOES") ? h("button", { class: "act primario", onclick: nova }, "+ Nova ação") : null));
  }
  const nova = () => abrirFormulario({ titulo: "Nova ação", entidade: "decisoes", prefixo: PREFIXO.DECISOES, campos: CAMPOS(f.campanha), aoSalvar: ctx.recarregar });

  async function abrirTarefa(d) {
    const c = campanha(d.campanha_id);
    const comp = h("div", null, h("div", { class: "carregando" }, h("span", { class: "spinner" }), "Comparando antes e depois…"));
    const m = modal(d.descricao, h("div", null,
      h("div", { class: "barra-acoes" }, chip(rot("status_acao", d.status)), chip(rot("prioridade", d.prioridade)), chip(rot("decisao_adotada", d.decisao_adotada)), d.nivel_evidencia ? chip(rot("nivel_evidencia", d.nivel_evidencia), `nivel-${d.nivel_evidencia}`) : null),
      h("p", { class: "nota" }, `${c?.nome || ""} · ${cliente(d.cliente_id)?.nome || ""} · criada em ${dataHora(d.criado_em)} · responsável: ${d.responsavel || "—"} · prazo ${data(d.prazo)} · execução ${data(d.data_execucao)} · reavaliar em ${data(d.data_reavaliacao)}`),
      d.problema ? h("p", null, h("b", null, "Motivo: "), d.problema) : null, d.resultado_esperado ? h("p", null, h("b", null, "Resultado esperado: "), d.resultado_esperado) : null,
      d.resultado_observado ? h("p", null, h("b", null, "Resultado observado: "), d.resultado_observado) : null, d.conclusao_reavaliacao ? h("div", { class: "aviso-box" }, h("b", null, "Conclusão da reavaliação: "), d.conclusao_reavaliacao) : null,
      h("h3", { style: "font-size:14px" }, "Antes × depois"), comp), { largura: 800, acoes: [
        c ? h("a", { class: "act", href: `#/campanhas/${c.id}`, onclick: () => m.fechar() }, "Abrir campanha") : null,
        pode("atualizar", "DECISOES") ? h("button", { class: "act", onclick: () => { m.fechar(); abrirFormulario({ titulo: "Editar ação", entidade: "decisoes", prefixo: PREFIXO.DECISOES, campos: CAMPOS(), registro: d, aoSalvar: ctx.recarregar, largura: 820 }); } }, "Editar") : null,
        pode("atualizar", "DECISOES") && d.data_execucao ? h("button", { class: "act primario", onclick: () => reavaliar(d, m) }, "Registrar reavaliação") : null] });
    if (!d.data_execucao) { montar(comp, h("p", { class: "nota" }, "Informe a data de execução (Editar) para comparar o desempenho antes e depois da ação.")); return; }
    try {
      const r = (await api.comparacao(d.id)).comparacao;
      montar(comp, h("p", null, r.texto), r.comparacoes?.length ? tabela([{ titulo: "Métrica", valor: (x) => x.metrica.toUpperCase() + (x.principal ? " ★" : "") }, { titulo: "Antes", num: true, valor: (x) => nf(x.antes, 2) }, { titulo: "Depois", num: true, valor: (x) => nf(x.depois, 2) }, { titulo: "Variação", num: true, valor: (x) => (x.delta_pct === null ? "—" : h("span", { class: x.melhorou ? "dif-bom" : x.piorou ? "dif-ruim" : "" }, `${x.delta_pct > 0 ? "+" : ""}${nf(x.delta_pct, 1)}%`)) }], r.comparacoes) : null,
        h("p", { class: "nota" }, `Confiança: ${r.confianca}. ${(r.ressalvas || []).join(" ")}`));
    } catch (e) { montar(comp, h("div", { class: "faixa faixa-erro" }, e.message)); }
  }
  async function reavaliar(d, mAnterior) {
    let r; try { r = (await api.comparacao(d.id)).comparacao; } catch (e) { return toast(e.message, "erro"); }
    const conc = textarea("conclusao", d.conclusao_reavaliacao || (r.veredito === "melhorou" || r.veredito === "piorou" ? `${r.texto}` : ""), { maxlen: 4000, linhas: 5 }), obs = textarea("obs", d.resultado_observado || "", { maxlen: 2000 });
    const m2 = modal("Registrar reavaliação", h("div", null, h("p", null, r.texto), h("p", { class: "nota" }, "Ao salvar, o desempenho antes/depois e o veredito ficam gravados nesta ação (base da inteligência histórica). Revise a conclusão: o sistema não afirma causalidade."), campo("Resultado observado", obs), campo("Conclusão da reavaliação", conc)), { largura: 700, acoes: [
      h("button", { class: "act", onclick: () => m2.fechar() }, "Cancelar"),
      h("button", { class: "act primario", onclick: async () => {
        const corpo = { conclusao_reavaliacao: conc.value.trim() || null, resultado_observado: obs.value.trim() || null };
        try { await comConflito((v) => api.acao("decisoes", d.id, "reavaliar", { ...corpo, versao: v ?? d.versao }), { patch: corpo, modal, h, toast }); m2.fechar(); mAnterior.fechar(); toast("Reavaliação registrada ✓"); await carregar({ silencioso: true }); ctx.recarregar(); } catch (e) { if (!e?.descartado) toast(e.message, "erro"); } } }, "Salvar reavaliação")] });
  }

  const sel = (chave, ops, vazio) => { const el = h("select", { "aria-label": vazio }, h("option", { value: "" }, vazio), ops.map(([v, r]) => h("option", { value: v, selected: f[chave] === v }, r))); el.addEventListener("change", () => { f[chave] = el.value; desenhar(); }); return el; };
  const enc = h("input", { type: "checkbox", checked: true }); enc.addEventListener("change", () => { f.ocultarEncerradas = enc.checked; desenhar(); });
  const abas = h("div", { class: "abas-internas", role: "tablist" }, [["responsavel", "Por responsável"], ["prazo", "Por prazo"], ["status", "Por status"]].map(([v, t]) => h("button", { role: "tab", "aria-selected": String(f.visao === v), onclick: (e) => { f.visao = v; abas.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b === e.currentTarget))); desenhar(); } }, t)));
  montar(raiz, h("h1", null, "Plano de ação"), h("p", { class: "sub" }, "Cada diagnóstico pode gerar ações com responsável e prazo. Registre a execução e reavalie depois."),
    h("div", { class: "filtros" }, h("div", null, sel("campanha", D().CAMPANHAS.map((c) => [c.id, c.nome]), "Todas as campanhas")), h("div", null, sel("cliente", D().CLIENTES.map((c) => [c.id, c.nome]), "Todos os clientes")), h("div", null, sel("responsavel", responsaveis().map((r) => [r, r]), "Todos os responsáveis")), h("div", null, sel("status", opcoesDe(ROTULOS.status_acao), "Todos os status")), h("div", null, sel("prioridade", opcoesDe(ROTULOS.prioridade), "Todas as prioridades")),
      h("div", null, h("label", { class: "check" }, enc, "Ocultar concluídas/canceladas")), pode("criar", "DECISOES") ? h("div", null, h("button", { class: "act primario", onclick: nova }, "+ Nova ação")) : null),
    abas, corpo);
  desenhar();
  return raiz;
}
