// Apresentação do resultado do motor de regras: tudo é explicado (por quê, com que nível de certeza, o que verificar).
import { h, selo, chip, rot, brl, nf, pct, tabela } from "./ui.js";

const fmt = (v, un) => (v === null || v === undefined ? "—" : un === "R$" ? brl(v) : un === "%" ? pct(v, 2) : un === "x" ? `${nf(v, 2)}x` : nf(v, 2));
const ST = { ok: "dentro", abaixo: "abaixo do mínimo", sem_meta: "sem meta configurada", sem_dado: "não informado" };

export function cartaoDiagnostico(r, { titulo = "Diagnóstico" } = {}) {
  if (!r) return h("div", { class: "empty" }, "Sem diagnóstico para esta análise.");
  const rec = r.recomendacao, m = r.metrica_mae;
  const raiz = h("div", { class: "card diag" });
  raiz.append(h("div", { class: "barra-acoes" }, h("h2", { style: "margin:0" }, titulo), selo(r.situacao), r.modelo ? chip(r.modelo) : null));
  if (rec) raiz.append(h("div", { class: `res ${{ normal: "green", atencao: "amber", critica: "red", insuficiente: "blue" }[r.situacao] || "blue"}` },
    h("span", { class: "tag" }, rec.rotulo), " ", chip(rot("nivel_evidencia", rec.nivel_evidencia), `nivel-${rec.nivel_evidencia}`), " ", chip(`Prioridade ${rot("prioridade", rec.prioridade).toLowerCase()}`),
    h("p", { style: "margin-top:8px" }, rec.texto)));
  if (m) raiz.append(h("div", { class: "kpis-g" },
    h("div", { class: "kpi" }, h("small", null, m.rotulo), h("b", null, fmt(m.valor, m.unidade)), h("small", { class: "sub" }, `Período: ${fmt(m.periodo, m.unidade)}`)),
    h("div", { class: "kpi" }, h("small", null, "Meta"), h("b", null, fmt(m.meta, m.unidade)), h("small", { class: "sub" }, m.meta === null ? "não definida" : "configurada na campanha")),
    r.acumulado ? h("div", { class: "kpi" }, h("small", null, "Acumulado"), h("b", null, `${r.acumulado.analises} análise(s)`), h("small", { class: "sub" }, `${r.acumulado.dias ?? "?"} dia(s) · ${brl(r.acumulado.investimento)} investidos`)) : null));

  const q = r.qualidade_dados;
  raiz.append(h("div", { class: "secao" }, h("h3", { style: "font-size:14px;margin:0 0 6px" }, "Qualidade e quantidade dos dados ", chip({ suficiente: "Suficiente", parcial: "Parcial", insuficiente: "Insuficiente" }[q.nivel])),
    h("ul", { class: "lista-just" }, q.itens.map((i) => h("li", null, h("span", { "aria-hidden": "true", class: i.ok ? "ok" : "no" }, i.ok ? "✓" : "✗"), h("span", null, i.texto))))));

  if (r.etapas?.length) raiz.append(h("div", { class: "secao" }, h("h3", { style: "font-size:14px;margin:0 0 6px" }, "Etapas do funil (métricas secundárias)"),
    tabela([{ titulo: "Etapa", valor: (e) => e.rotulo }, { titulo: "Valor", num: true, valor: (e) => (e.valor === null ? "—" : pct(e.valor, 2)) }, { titulo: "Mínimo", num: true, valor: (e) => (e.meta === null ? "—" : pct(e.meta, 2)) },
      { titulo: "Leitura", valor: (e) => h("span", { class: e.status === "abaixo" ? "no" : e.status === "ok" ? "ok" : "" }, ST[e.status]) }], r.etapas)));
  if (r.gargalo) raiz.append(h("div", { class: "aviso-box" }, h("b", null, "Provável gargalo "), chip("Hipótese", "nivel-hipotese"), h("div", null, `${r.gargalo.rotulo}. ${r.gargalo.texto}`), h("div", { class: "nota" }, `Quem acionar: ${r.gargalo.responsaveis.join(", ")}`)));

  if (r.justificativa?.length) raiz.append(h("div", { class: "secao" }, h("h3", { style: "font-size:14px;margin:0 0 6px" }, "Por que esta recomendação"),
    h("ul", { class: "lista-just" }, r.justificativa.map((j) => h("li", null, chip(rot("nivel_evidencia", j.nivel), `nivel-${j.nivel}`), h("span", null, j.texto, j.regra ? h("span", { class: "nota" }, ` [${j.regra}]`) : null))))));
  if (r.verificar_antes?.length) raiz.append(h("div", { class: "secao" }, h("h3", { style: "font-size:14px;margin:0 0 6px" }, "Verifique antes de executar"), h("ul", null, r.verificar_antes.map((v) => h("li", null, v)))));
  if (r.avisos?.length) raiz.append(h("div", { class: "aviso-box" }, h("b", null, "Avisos"), h("ul", { style: "margin:4px 0 0;padding-left:18px" }, r.avisos.map((a) => h("li", null, a)))));
  if (r.acoes?.length) raiz.append(h("div", { class: "secao" }, h("h3", { style: "font-size:14px;margin:0 0 6px" }, "Ações sugeridas"),
    tabela([{ titulo: "Ação", valor: (a) => a.descricao }, { titulo: "Nível", valor: (a) => chip(rot("nivel_evidencia", a.nivel_evidencia), `nivel-${a.nivel_evidencia}`) }, { titulo: "Prioridade", valor: (a) => rot("prioridade", a.prioridade) }, { titulo: "Quem", valor: (a) => a.responsaveis_sugeridos.join(", ") }, { titulo: "Resultado esperado", valor: (a) => a.resultado_esperado }], r.acoes)));
  if (r.regras?.length) raiz.append(h("p", { class: "nota" }, `Regras acionadas: ${r.regras.join(", ")} · motor v${r.versao_motor} (determinístico, sem IA externa).`));
  return raiz;
}
