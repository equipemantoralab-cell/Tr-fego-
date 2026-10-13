// Histórico e inteligência: evolução, ações × resultados, padrões quantitativos e trilha de alterações.
import { api } from "../api.js";
import { h, montar, tabela, rot, chip, estadoVazio, nf, brl, data, dataHora, kpi, pct } from "../ui.js";
import { D, pode, campanha, cliente, analisesDe, decisoesDe, produto } from "../estado.js";
import { graficoLinha } from "../charts.js";
import { serieTemporal, padroes, gargalosFrequentes } from "../../lib/intel.js";

const FUNIL_SEL = (c) => (c.tipo_funil === "medio_ticket" && c.modelo_funil === "leads" ? ["cpl", "CPL", c.cpl_alvo] : ["high_ticket", "lancamento"].includes(c.tipo_funil) || c.modelo_funil === "comercial" ? ["cac", "CAC", c.cac_alvo] : ["cpa", "CPA", c.cpa_alvo ?? (c.produto_id ? produto(c.produto_id)?.cpa_alvo : null)]);
const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

export async function render(ctx) {
  const aba = ctx.query.aba || "evolucao";
  const raiz = h("div"), corpo = h("div");
  const abas = [["evolucao", "Evolução"], ["acoes", "Ações e resultados"], ["padroes", "Padrões"], ["alteracoes", "Alterações"]];
  montar(raiz, h("h1", null, "Histórico e inteligência"), h("p", { class: "sub" }, "Nada é apagado: análises, decisões e resultados ficam registrados para comparação futura."),
    h("div", { class: "abas-internas", role: "tablist" }, abas.map(([a, t]) => h("button", { role: "tab", "aria-selected": String(aba === a), onclick: () => { location.hash = `#/historico?aba=${a}${ctx.query.campanha ? `&campanha=${ctx.query.campanha}` : ""}`; } }, t))), corpo);

  if (aba === "evolucao") {
    const sel = h("select", { "aria-label": "Campanha" }, h("option", { value: "" }, "Selecione uma campanha…"), D().CAMPANHAS.map((c) => h("option", { value: c.id, selected: c.id === ctx.query.campanha }, `${cliente(c.cliente_id)?.nome || ""} — ${c.nome}`)));
    const saida = h("div");
    const mostrar = () => {
      const c = campanha(sel.value); if (!c) return montar(saida, estadoVazio("Escolha uma campanha para ver a evolução dos indicadores."));
      const an = analisesDe(c.id); if (an.length < 1) return montar(saida, estadoVazio("Sem análises registradas."));
      const marc = decisoesDe(c.id).filter((d) => d.data_execucao).map((d) => ({ x: d.data_execucao, rotulo: `Ação executada: ${d.descricao}` }));
      const [mk, mr, mm] = FUNIL_SEL(c);
      const g = (campo, tit, fmt, meta) => graficoLinha({ titulo: tit, pontos: serieTemporal(an, [campo]).map((p) => ({ x: p.data, y: p[campo] })), formato: fmt, meta: meta ?? null, marcadores: marc });
      montar(saida, h("p", { class: "nota" }, `${an.length} análise(s). Linhas verticais = ações executadas. Lacunas = dado não informado.`), h("div", { class: "graficos-g" }, g(mk, mr, "brl", mm), g("investimento", "Investimento", "brl"), g("roas", "ROAS", "x", c.roas_alvo), g("ctr_link", "CTR (link)", "pct"), g("compras", "Compras", "num"), g("leads", "Leads", "num"), g("receita_total", "Receita", "brl"), g("cpm", "CPM", "brl")));
    };
    sel.addEventListener("change", mostrar);
    montar(corpo, h("div", { class: "filtros" }, h("div", null, sel)), saida); mostrar();
  } else if (aba === "acoes") {
    const linhas = D().DECISOES.filter((d) => d.tipo_acao).map((d) => ({ d, dep: parse(d.desempenho_depois), antes: parse(d.desempenho_antes) })).sort((a, b) => String(b.d.criado_em).localeCompare(String(a.d.criado_em)));
    montar(corpo, h("p", { class: "nota" }, "Recomendado × executado × resultado. O veredito vem do comparativo antes/depois e não afirma causa única."),
      tabela([{ titulo: "Ação", valor: (x) => x.d.descricao }, { titulo: "Campanha", valor: (x) => campanha(x.d.campanha_id)?.nome || "—" }, { titulo: "Recomendação", valor: (x) => (x.d.nivel_evidencia ? chip(rot("nivel_evidencia", x.d.nivel_evidencia), `nivel-${x.d.nivel_evidencia}`) : "—") }, { titulo: "Decisão", valor: (x) => rot("decisao_adotada", x.d.decisao_adotada) },
        { titulo: "Executada", valor: (x) => data(x.d.data_execucao) }, { titulo: "Status", valor: (x) => rot("status_acao", x.d.status) },
        { titulo: "Resultado", valor: (x) => (x.dep?.veredito ? h("span", { class: x.dep.veredito === "melhorou" ? "dif-bom" : x.dep.veredito === "piorou" ? "dif-ruim" : "" }, `${{ melhorou: "▲ melhorou", piorou: "▼ piorou", inconclusivo: "◌ inconclusivo", sem_dados: "◌ sem dados" }[x.dep.veredito]}${x.dep.delta_pct != null ? ` (${x.dep.delta_pct > 0 ? "+" : ""}${nf(x.dep.delta_pct, 1)}%)` : ""}`) : "não reavaliada") }],
        linhas, { aoClicar: (x) => { location.hash = `#/plano?campanha=${x.d.campanha_id}`; }, vazioTxt: "Nenhuma ação registrada." }));
  } else if (aba === "padroes") {
    const p = padroes({ decisoes: D().DECISOES, campanhas: D().CAMPANHAS }), g = gargalosFrequentes(D().ANALISES, D().CAMPANHAS);
    montar(corpo, h("div", { class: "aviso-box" }, "Padrões quantitativos extraídos do histórico. Com poucas observações são apenas indicativos — o sistema marca a confiança. São associações, não causalidade."),
      h("div", { class: "secao" }, h("h2", null, "O que aconteceu depois de cada tipo de ação"),
        tabela([{ titulo: "Ação", valor: (x) => x.tipo_acao }, { titulo: "Funil", valor: (x) => rot("tipo_funil", x.tipo_funil) }, { titulo: "Reavaliações", num: true, valor: (x) => String(x.n) }, { titulo: "Melhorou", num: true, valor: (x) => `${x.melhorou} (${pct(x.taxa_melhora * 100, 0)})` }, { titulo: "Piorou", num: true, valor: (x) => String(x.piorou) }, { titulo: "Inconclusivo", num: true, valor: (x) => String(x.inconclusivo) }, { titulo: "Variação mediana", num: true, valor: (x) => (x.mediana_delta_pct === null ? "—" : `${nf(x.mediana_delta_pct, 1)}%`) }, { titulo: "Confiança", valor: (x) => chip(x.confianca) }], p, { vazioTxt: "Ainda não há ações reavaliadas. Registre reavaliações no Plano de ação para formar o histórico." })),
      h("div", { class: "secao" }, h("h2", null, "Gargalos mais apontados pelo motor"),
        tabela([{ titulo: "Funil", valor: (x) => rot("tipo_funil", x.tipo_funil) }, { titulo: "Etapa", valor: (x) => x.rotulo }, { titulo: "Ocorrências", num: true, valor: (x) => String(x.ocorrencias) }, { titulo: "Campanhas", num: true, valor: (x) => String(x.campanhas) }], g, { vazioTxt: "Sem gargalos registrados ainda." })));
  } else {
    if (!pode("ler", "HISTORICO_ALTERACOES")) return h("div", null, estadoVazio("Seu perfil não tem acesso ao registro de alterações."));
    montar(corpo, h("div", { class: "carregando" }, h("span", { class: "spinner" }), "Carregando…"));
    try {
      const todos = (await api.listar("historico")).registros.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
      const f = { q: "", entidade: "" }; const lista = h("div");
      const desenhar = () => montar(lista, tabela([{ titulo: "Quando", valor: (e) => dataHora(e.ts) }, { titulo: "Usuário", valor: (e) => e.usuario }, { titulo: "Operação", valor: (e) => e.operacao }, { titulo: "Entidade", valor: (e) => e.entidade }, { titulo: "Registro", valor: (e) => e.registro_id }, { titulo: "Resultado", valor: (e) => e.resultado }, { titulo: "Alteração", valor: (e) => (e.valores_novos ? Object.keys(parse(e.valores_novos) || {}).slice(0, 5).join(", ") : e.detalhe || "") }], todos.filter((e) => (!f.entidade || e.entidade === f.entidade) && (!f.q || `${e.usuario} ${e.registro_id} ${e.detalhe}`.toLowerCase().includes(f.q))).slice(0, 300), { vazioTxt: "Nenhum evento." }));
      const busca = h("input", { type: "search", placeholder: "Buscar usuário/registro…" }); busca.addEventListener("input", () => { f.q = busca.value.toLowerCase(); desenhar(); });
      const ent = h("select", null, h("option", { value: "" }, "Todas as entidades"), [...new Set(todos.map((e) => e.entidade))].map((x) => h("option", { value: x }, x))); ent.addEventListener("change", () => { f.entidade = ent.value; desenhar(); });
      montar(corpo, h("div", { class: "filtros" }, h("div", null, busca), h("div", null, ent)), h("p", { class: "nota" }, `${todos.length} evento(s) registrados (mostrando até 300). Este registro é permanente.`), lista); desenhar();
    } catch (e) { montar(corpo, h("div", { class: "faixa faixa-erro" }, e.message)); }
  }
  return raiz;
}
