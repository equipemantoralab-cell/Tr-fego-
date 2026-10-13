// Central de campanhas: visão operacional com filtros. Agregados usam TOTAIS PONDERADOS (nunca média de taxas).
import { h, montar, kpi, brl, nf, data, hoje, somaDias, seletor, campo, rot, ROTULOS, selo, tabela, estadoVazio, chip, opcoesDe } from "../ui.js";
import { D, cliente, ultimaAnalise, resultadoMotor, ABERTAS, vencida, responsaveis, analisesDe } from "../estado.js";
import { totais } from "../../lib/intel.js";

const CHAVE = "mt_filtros_dash";
const padrao = { cliente_id: "", responsavel: "", tipo_funil: "", status: "", periodo: "30", de: "", ate: "", prioridade: "" };
const ler = () => { try { return { ...padrao, ...JSON.parse(sessionStorage.getItem(CHAVE)) }; } catch { return { ...padrao }; } };
const DIAS_SEM_ANALISE = 7; // alerta operacional (valor de trabalho)
const EM_OPERACAO = ["em_teste", "ativa", "em_escala"];

export function janela(f) {
  const fim = hoje();
  if (f.periodo === "todos") return { de: "0000-01-01", ate: "9999-12-31" };
  if (f.periodo === "custom") return { de: f.de || "0000-01-01", ate: f.ate || "9999-12-31" };
  return { de: somaDias(fim, -(Number(f.periodo) - 1)), ate: fim };
}

export async function render(ctx) {
  const f = ler();
  const raiz = h("div");
  const corpo = h("div");
  const salvar = () => { sessionStorage.setItem(CHAVE, JSON.stringify(f)); desenhar(); };

  const filtro = (rotulo, el) => campo(rotulo, el);
  const sel = (nome, opcoes, vazio) => { const s = seletor(nome, opcoes, f[nome], { vazio }); s.addEventListener("change", () => { f[nome] = s.value; salvar(); }); return s; };
  const pSel = seletor("periodo", [["7", "Últimos 7 dias"], ["30", "Últimos 30 dias"], ["90", "Últimos 90 dias"], ["todos", "Todo o histórico"], ["custom", "Personalizado"]], f.periodo);
  pSel.addEventListener("change", () => { f.periodo = pSel.value; salvar(); });
  const dDe = h("input", { type: "date", value: f.de }), dAte = h("input", { type: "date", value: f.ate });
  dDe.addEventListener("change", () => { f.de = dDe.value; f.periodo = "custom"; salvar(); }); dAte.addEventListener("change", () => { f.ate = dAte.value; f.periodo = "custom"; salvar(); });
  const filtros = h("div", { class: "filtros", role: "search" },
    filtro("Período", pSel), f.periodo === "custom" ? [filtro("De", dDe), filtro("Até", dAte)] : null,
    filtro("Cliente", sel("cliente_id", D().CLIENTES.map((c) => [c.id, c.nome]), "Todos")),
    filtro("Responsável", sel("responsavel", responsaveis().map((r) => [r, r]), "Todos")),
    filtro("Tipo de funil", sel("tipo_funil", opcoesDe(ROTULOS.tipo_funil), "Todos")),
    filtro("Status", sel("status", opcoesDe(ROTULOS.status_campanha), "Todos")),
    filtro("Prioridade das ações", sel("prioridade", opcoesDe(ROTULOS.prioridade), "Todas")),
    h("div", null, h("button", { class: "act", onclick: () => { Object.assign(f, padrao); salvar(); renderizarTudo(); } }, "Limpar")));

  function desenhar() {
    const { de, ate } = janela(f), hj = hoje();
    const decisoesAbertas = D().DECISOES.filter((d) => ABERTAS.includes(d.status));
    let camps = D().CAMPANHAS.filter((c) => (!f.cliente_id || c.cliente_id === f.cliente_id) && (!f.responsavel || c.responsavel === f.responsavel) && (!f.tipo_funil || c.tipo_funil === f.tipo_funil) && (!f.status || c.status === f.status));
    if (f.prioridade) { const ids = new Set(decisoesAbertas.filter((d) => d.prioridade === f.prioridade).map((d) => d.campanha_id)); camps = camps.filter((c) => ids.has(c.id)); }
    const ids = new Set(camps.map((c) => c.id));
    const analises = D().ANALISES.filter((a) => ids.has(a.campanha_id) && a.status !== "anulada" && a.periodo_fim >= de && a.periodo_fim <= ate);
    const tot = totais(analises);
    const decs = decisoesAbertas.filter((d) => ids.has(d.campanha_id));
    const vencidas = decs.filter((d) => vencida(d, hj));
    const clientesAtivos = D().CLIENTES.filter((c) => c.status === "ativo" && (!f.cliente_id || c.id === f.cliente_id)).length;
    const info = camps.map((c) => { const a = ultimaAnalise(c.id), r = resultadoMotor(a); const dias = a ? Math.floor((Date.parse(`${hj}T12:00:00Z`) - Date.parse(`${a.periodo_fim}T12:00:00Z`)) / 86400000) : null; return { c, a, r, dias, situacao: a?.situacao || null }; });
    const operando = info.filter((x) => EM_OPERACAO.includes(x.c.status));
    const atencao = operando.filter((x) => x.situacao === "critica" || x.situacao === "atencao");
    const kp = (rot_, v, sub, cls) => kpi(rot_, v, sub, cls);
    const cpa = tot.cpa_agregado, roas = tot.roas_agregado;

    // campanhas que exigem decisão imediata
    const urgentes = info.map((x) => {
      const motivos = [];
      if (x.situacao === "critica") motivos.push("situação crítica");
      if (x.situacao === "atencao") motivos.push("atenção");
      const dv = vencidas.filter((d) => d.campanha_id === x.c.id).length; if (dv) motivos.push(`${dv} ação(ões) vencida(s)`);
      const dc = decs.filter((d) => d.campanha_id === x.c.id && d.prioridade === "critica").length; if (dc) motivos.push(`${dc} ação(ões) crítica(s)`);
      if (EM_OPERACAO.includes(x.c.status) && x.dias !== null && x.dias > DIAS_SEM_ANALISE) motivos.push(`sem análise há ${x.dias} dias`);
      if (EM_OPERACAO.includes(x.c.status) && x.a === null) motivos.push("nunca analisada");
      const peso = (x.situacao === "critica" ? 100 : x.situacao === "atencao" ? 40 : 0) + dv * 30 + dc * 20 + (motivos.some((m) => m.startsWith("sem análise") || m === "nunca analisada") ? 10 : 0);
      return { ...x, motivos, peso };
    }).filter((x) => x.motivos.length && (EM_OPERACAO.includes(x.c.status) || x.motivos.some((m) => m.includes("vencida") || m.includes("crítica")))).sort((a, b) => b.peso - a.peso);

    montar(corpo,
      h("div", { class: "kpis-g" },
        kp("Clientes ativos", String(clientesAtivos)), kp("Campanhas em operação", String(operando.length), `${info.filter((x) => x.c.status === "pausada").length} pausada(s)`),
        kp("Em teste", String(info.filter((x) => x.c.status === "em_teste").length)), kp("Em escala", String(info.filter((x) => x.c.status === "em_escala").length)),
        kp("Precisam de atenção", String(atencao.length), `${atencao.filter((x) => x.situacao === "critica").length} crítica(s)`, atencao.length ? "alerta" : ""),
        kp("Decisões pendentes", String(decs.filter((d) => d.status === "pendente").length), `${decs.length} ação(ões) em aberto`), kp("Ações vencidas", String(vencidas.length), null, vencidas.length ? "alerta" : "")),
      h("div", { class: "kpis-g" },
        kp("Investimento no período", tot.investimento === null ? "—" : brl(tot.investimento), `${data(de === "0000-01-01" ? null : de)} a ${data(ate === "9999-12-31" ? null : ate)}`),
        kp("Receita atribuída (informada)", tot.receita_atribuida === null ? "—" : brl(tot.receita_atribuida), `${tot.analises_com_receita} de ${tot.analises} análise(s) com receita`),
        kp("CPA agregado", cpa.valor === null ? "—" : brl(cpa.valor), cpa.n ? `ponderado: Σ investimento ÷ Σ compras, ${cpa.n} análise(s) com compras informadas` : "sem compras informadas no período"),
        kp("ROAS agregado", roas.valor === null ? "—" : `${nf(roas.valor, 2)}x`, roas.n ? `ponderado: Σ receita ÷ Σ investimento, ${roas.n} análise(s)` : "sem receita informada no período")),
      h("div", { class: "secao" }, h("h2", null, `Exigem decisão imediata (${urgentes.length})`),
        urgentes.length ? tabela([{ titulo: "Campanha", valor: (x) => x.c.nome }, { titulo: "Cliente", valor: (x) => cliente(x.c.cliente_id)?.nome || "—" }, { titulo: "Situação", valor: (x) => selo(x.situacao || "insuficiente") }, { titulo: "Motivo", valor: (x) => x.motivos.join(" · ") }, { titulo: "Recomendação do motor", valor: (x) => x.r?.recomendacao?.rotulo || "—" }], urgentes, { aoClicar: (x) => { location.hash = `#/campanhas/${x.c.id}`; } })
          : estadoVazio("Nenhuma campanha exige decisão imediata com os filtros atuais. ✓")),
      h("div", { class: "secao" }, h("h2", null, `Campanhas (${info.length})`),
        tabela([{ titulo: "Campanha", valor: (x) => x.c.nome }, { titulo: "Cliente", valor: (x) => cliente(x.c.cliente_id)?.nome || "—" }, { titulo: "Funil", valor: (x) => rot("tipo_funil", x.c.tipo_funil) + (x.c.modelo_funil ? ` · ${rot("modelo_funil", x.c.modelo_funil)}` : "") }, { titulo: "Status", valor: (x) => chip(rot("status_campanha", x.c.status)) }, { titulo: "Responsável", valor: (x) => x.c.responsavel || "—" }, { titulo: "Última análise", valor: (x) => (x.a ? data(x.a.periodo_fim) : "nunca") }, { titulo: "Situação", valor: (x) => selo(x.situacao || "insuficiente") }],
          info, { aoClicar: (x) => { location.hash = `#/campanhas/${x.c.id}`; }, vazioTxt: D().CAMPANHAS.length ? "Nenhuma campanha com estes filtros." : "Nenhuma campanha cadastrada ainda. Comece em Clientes → Campanhas." })));
  }
  function renderizarTudo() { montar(raiz, h("h1", null, "Dashboard"), h("p", { class: "sub" }, "Situação operacional das campanhas. Indicadores agregados usam totais ponderados."), h("div", null, h("p", { class: "nota" }, "Dados não informados nunca são tratados como zero.")), filtrosAtual(), corpo); desenhar(); }
  const filtrosAtual = () => filtros;
  // refaz filtros quando o período muda para/de "personalizado"
  pSel.addEventListener("change", () => ctx.recarregar());
  renderizarTudo();
  return raiz;
}
