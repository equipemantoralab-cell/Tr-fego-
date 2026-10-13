import { api } from "../api.js";
import { h, montar, tabela, rot, ROTULOS, opcoesDe, chip, estadoVazio, modal, brl, toast } from "../ui.js";
import { D, pode, campanha, ultimaAnalise } from "../estado.js";
import { abrirFormulario, PREFIXO } from "../forms.js";
import { selo } from "../ui.js";

export const CAMPOS_CLIENTE = [
  { nome: "nome", rotulo: "Nome do cliente", req: true, max: 200 }, { nome: "projeto", rotulo: "Nome do projeto", max: 200 },
  { nome: "responsavel", rotulo: "Responsável", max: 120 }, { nome: "status", rotulo: "Status", tipo: "sel", opcoes: opcoesDe(ROTULOS.status_cliente), req: true, padrao: "ativo" },
  { nome: "observacoes", rotulo: "Observações", tipo: "area", full: true, max: 4000 },
];
export const CAMPOS_PRODUTO = (clienteId) => [
  { nome: "nome", rotulo: "Nome do produto", req: true, max: 200 }, { nome: "tipo_oferta", rotulo: "Tipo de oferta", tipo: "sel", opcoes: [...opcoesDe(ROTULOS.tipo_funil), ["outro", "Outro"]], req: true, padrao: "low_ticket" },
  { nome: "preco", rotulo: "Preço (R$)", tipo: "num", req: true }, { nome: "custo_variavel", rotulo: "Custo variável por venda (R$)", tipo: "num" },
  { nome: "taxas_pct", rotulo: "Taxas (% da receita)", tipo: "num" }, { nome: "taxa_fixa", rotulo: "Taxa fixa por venda (R$)", tipo: "num" },
  { nome: "impostos_pct", rotulo: "Impostos estimados (%)", tipo: "num" }, { nome: "reembolso_pct", rotulo: "Reembolso estimado (%)", tipo: "num" },
  { nome: "receita_adicional_media", rotulo: "Receita adicional média por comprador (R$)", tipo: "num", dica: "Order bumps/upsells." },
  { nome: "cpa_maximo", rotulo: "CPA máximo (R$)", tipo: "num", dica: "Use o Simulador financeiro para calcular." }, { nome: "cpa_alvo", rotulo: "CPA alvo (R$)", tipo: "num" },
  { nome: "status", rotulo: "Status", tipo: "sel", opcoes: [["ativo", "Ativo"], ["arquivado", "Arquivado"]], padrao: "ativo" },
  { nome: "cliente_id", rotulo: "Cliente", tipo: "sel", opcoes: D().CLIENTES.map((c) => [c.id, c.nome]), req: true, padrao: clienteId },
];

export async function render(ctx) {
  const raiz = h("div");
  const abrirCliente = (c) => {
    const produtos = D().PRODUTOS.filter((p) => p.cliente_id === c.id), camps = D().CAMPANHAS.filter((x) => x.cliente_id === c.id);
    const m = modal(`Cliente: ${c.nome}`, h("div", null,
      h("div", { class: "barra-acoes" }, chip(rot("status_cliente", c.status)), c.responsavel ? chip(`Resp.: ${c.responsavel}`) : null, h("span", { class: "esp" }),
        pode("atualizar", "CLIENTES") ? h("button", { class: "act", onclick: () => { m.fechar(); abrirFormulario({ titulo: "Editar cliente", entidade: "clientes", prefixo: PREFIXO.CLIENTES, campos: CAMPOS_CLIENTE, registro: c, aoSalvar: ctx.recarregar }); } }, "Editar cliente") : null),
      c.observacoes ? h("p", { class: "nota" }, c.observacoes) : null,
      h("div", { class: "secao" }, h("div", { class: "barra-acoes" }, h("h2", { style: "margin:0" }, `Produtos (${produtos.length})`), h("span", { class: "esp" }),
        pode("criar", "PRODUTOS") ? h("button", { class: "act primario peq", onclick: () => { m.fechar(); abrirFormulario({ titulo: "Novo produto", entidade: "produtos", prefixo: PREFIXO.PRODUTOS, campos: CAMPOS_PRODUTO(c.id), aoSalvar: ctx.recarregar }); } }, "+ Produto") : null),
        tabela([{ titulo: "Produto", valor: (p) => p.nome }, { titulo: "Preço", num: true, valor: (p) => brl(p.preco) }, { titulo: "Margem estimada", num: true, valor: (p) => brl(p.margem_estimada) }, { titulo: "CPA alvo", num: true, valor: (p) => brl(p.cpa_alvo) }, { titulo: "", valor: (p) => h("span", null, pode("atualizar", "PRODUTOS") ? h("button", { class: "act peq", onclick: () => { m.fechar(); abrirFormulario({ titulo: "Editar produto", entidade: "produtos", prefixo: PREFIXO.PRODUTOS, campos: CAMPOS_PRODUTO(c.id), registro: p, aoSalvar: ctx.recarregar }); } }, "Editar") : null, " ", h("a", { class: "act peq", href: `#/simulador?produto=${p.id}`, onclick: () => m.fechar() }, "Simular")) }], produtos, { vazioTxt: "Nenhum produto. Cadastre para calcular margem e CPA máximo." })),
      h("div", { class: "secao" }, h("div", { class: "barra-acoes" }, h("h2", { style: "margin:0" }, `Campanhas (${camps.length})`)),
        tabela([{ titulo: "Campanha", valor: (x) => x.nome }, { titulo: "Funil", valor: (x) => rot("tipo_funil", x.tipo_funil) }, { titulo: "Status", valor: (x) => rot("status_campanha", x.status) }, { titulo: "Situação", valor: (x) => selo(ultimaAnalise(x.id)?.situacao || "insuficiente") }], camps, { aoClicar: (x) => { m.fechar(); location.hash = `#/campanhas/${x.id}`; }, vazioTxt: "Sem campanhas." }))), { largura: 860 });
  };
  const lista = D().CLIENTES;
  montar(raiz, h("h1", null, "Clientes"), h("p", { class: "sub" }, "Cadastro de clientes, produtos e campanhas. Os dados são compartilhados com toda a equipe."),
    h("div", { class: "barra-acoes" }, h("span", { class: "esp" }), pode("criar", "CLIENTES") ? h("button", { class: "act primario", onclick: () => abrirFormulario({ titulo: "Novo cliente", entidade: "clientes", prefixo: PREFIXO.CLIENTES, campos: CAMPOS_CLIENTE, aoSalvar: ctx.recarregar }) }, "+ Novo cliente") : null),
    tabela([{ titulo: "Cliente", valor: (c) => c.nome }, { titulo: "Projeto", valor: (c) => c.projeto || "—" }, { titulo: "Responsável", valor: (c) => c.responsavel || "—" }, { titulo: "Status", valor: (c) => chip(rot("status_cliente", c.status)) }, { titulo: "Campanhas", num: true, valor: (c) => String(D().CAMPANHAS.filter((x) => x.cliente_id === c.id).length) }], lista, { aoClicar: abrirCliente, vazioTxt: "Nenhum cliente cadastrado." }));
  if (ctx.query.id) { const c = lista.find((x) => x.id === ctx.query.id); if (c) abrirCliente(c); }
  return raiz;
}
