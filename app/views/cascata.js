// Cascata de decisão: motor de regras aplicado às campanhas + a calculadora original do POP (preservada).
import { api } from "../api.js";
import { h, montar, campo, rot, data, estadoVazio, tabela, chip, nf, selo } from "../ui.js";
import { D, campanha, cliente, ultimaAnalise, resultadoMotor } from "../estado.js";
import { cartaoDiagnostico } from "../ui-diag.js";
import { CAMPOS_BASE } from "../../lib/metrics.js";
import { montarCalculadora } from "../calc.js";

const PASSOS = ["Identifica a métrica-mãe do funil (CPA, CPL ou CAC).", "Valida quantidade e qualidade dos dados (janela de teste, volume, campos informados).", "Compara o resultado com as metas configuradas.", "Localiza o provável gargalo no funil.", "Analisa as métricas secundárias.", "Recomenda uma ação.", "Explica por que (cada afirmação marcada como recomendação, hipótese ou conclusão).", "Indica o que verificar antes de executar.", "Registra a decisão no Plano de ação.", "Permite reavaliar depois (Histórico)."];

export async function render(ctx) {
  const aba = ctx.query.aba || "campanha";
  const raiz = h("div"), corpo = h("div");
  const abas = h("div", { class: "abas-internas", role: "tablist" }, [["campanha", "Diagnóstico por campanha"], ["regras", "Regras em vigor"], ["calculadora", "Calculadora do POP"]].map(([a, t]) => h("button", { role: "tab", "aria-selected": String(aba === a), onclick: () => { location.hash = `#/cascata?aba=${a}${ctx.query.campanha ? `&campanha=${ctx.query.campanha}` : ""}`; } }, t)));
  montar(raiz, h("h1", null, "Cascata de decisão"), h("p", { class: "sub" }, h("b", null, "Métrica-mãe decide. Métricas secundárias explicam. O funil localiza. O responsável corrige. A próxima rodada aprende.")), abas, corpo);

  if (aba === "calculadora") { montarCalculadora(corpo); return raiz; }

  if (aba === "regras") {
    const funis = ["global", "low_ticket", "medio_ticket", "high_ticket", "lancamento"];
    montar(corpo, h("div", { class: "card" }, h("h2", null, "Como o motor decide"), h("ol", null, PASSOS.map((p) => h("li", null, p))), h("p", { class: "nota" }, "Motor determinístico e auditável: mesma entrada, mesma saída. Sem inteligência artificial externa. Nunca recomenda escala sem dados suficientes.")),
      funis.map((f) => h("div", { class: "secao" }, h("h2", null, f === "global" ? "Parâmetros globais" : rot("tipo_funil", f)),
        tabela([{ titulo: "Parâmetro", valor: (c) => c.chave }, { titulo: "Valor", num: true, valor: (c) => (c.valor === null ? "—" : `${nf(c.valor, 2)} ${c.unidade || ""}`) }, { titulo: "Fonte", valor: (c) => chip({ POP: "POP", provisorio: "provisório", cliente: "cliente", usuario: "ajustado pela equipe", a_definir: "a definir" }[c.fonte] || c.fonte, c.fonte === "POP" ? "pop" : c.fonte === "a_definir" ? "" : "prov") }, { titulo: "Descrição", valor: (c) => c.descricao || "" }], D().CONFIGURACOES_FUNIS.filter((c) => c.tipo_funil === f)))),
      h("p", null, h("a", { class: "act", href: "#/config" }, "Editar parâmetros em Configurações")));
    return raiz;
  }

  const sel = h("select", { "aria-label": "Campanha" }, h("option", { value: "" }, "Selecione uma campanha…"), D().CAMPANHAS.map((c) => h("option", { value: c.id, selected: c.id === ctx.query.campanha }, `${cliente(c.cliente_id)?.nome || ""} — ${c.nome}`)));
  const saida = h("div");
  const mostrar = async () => {
    const c = campanha(sel.value); if (!c) { montar(saida, estadoVazio("Escolha uma campanha para ver o diagnóstico com as regras e metas em vigor.")); return; }
    const a = ultimaAnalise(c.id); if (!a) { montar(saida, estadoVazio("Esta campanha ainda não tem análises.", h("a", { class: "act primario", href: `#/nova-analise?campanha=${c.id}` }, "Registrar análise"))); return; }
    montar(saida, h("div", { class: "carregando" }, h("span", { class: "spinner" }), "Reavaliando com as regras atuais…"));
    try {
      const corpoPrev = { id: a.id, campanha_id: c.id, periodo_inicio: a.periodo_inicio, periodo_fim: a.periodo_fim, fase_lancamento: a.fase_lancamento || null };
      for (const k of CAMPOS_BASE) corpoPrev[k] = a[k] ?? null;
      const r = await api.preview(corpoPrev);
      const gravado = resultadoMotor(a);
      const mudou = gravado && JSON.stringify(gravado.recomendacao?.acao) !== JSON.stringify(r.resultado.recomendacao?.acao);
      montar(saida, h("p", { class: "nota" }, `Última análise: ${data(a.periodo_inicio)} a ${data(a.periodo_fim)}. O diagnóstico abaixo é recalculado agora com as metas e parâmetros atuais.`),
        mudou ? h("div", { class: "aviso-box" }, `Atenção: a recomendação de hoje (${r.resultado.recomendacao.rotulo}) difere da registrada na época (${gravado.recomendacao.rotulo}) — metas ou parâmetros mudaram.`) : null,
        cartaoDiagnostico(r.resultado), h("p", null, h("a", { class: "act", href: `#/campanhas/${c.id}` }, "Abrir campanha"), " ", h("a", { class: "act primario", href: `#/nova-analise?campanha=${c.id}` }, "+ Nova análise")));
    } catch (e) { montar(saida, h("div", { class: "faixa faixa-erro" }, e.message)); }
  };
  sel.addEventListener("change", mostrar);
  montar(corpo, h("div", { class: "filtros" }, h("div", null, campo("Campanha", sel))), saida);
  mostrar();
  return raiz;
}
