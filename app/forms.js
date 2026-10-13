// Formulário genérico de criação/edição com validação do servidor, aviso de conflito e confirmação de salvamento.
import { api, ApiErro, novoId } from "./api.js";
import { h, modal, toast, campo, entrada, seletor, textarea, lerForm } from "./ui.js";
import { carregar, comConflito } from "./estado.js";
import { TABELAS } from "../lib/schema.js";

const TIPOS_NUM = { num: { modo: "decimal" } };

export function construirCampo(c, valor) {
  const v = valor ?? c.padrao ?? "";
  let el;
  if (c.tipo === "sel") el = seletor(c.nome, c.opcoes, v, { vazio: c.req ? undefined : "—" });
  else if (c.tipo === "area") el = textarea(c.nome, v, { maxlen: c.max });
  else if (c.tipo === "data") el = entrada(c.nome, v, { tipo: "date" });
  else if (c.tipo === "num") el = entrada(c.nome, v, { ...TIPOS_NUM.num, ph: c.ph });
  else el = entrada(c.nome, v, { maxlen: c.max, req: c.req });
  el.dataset.campo = c.nome;
  return campo(c.rotulo + (c.req ? " *" : ""), el, { dica: c.dica, full: c.full });
}

/**
 * @param {object} o { titulo, entidade (slug da API), prefixo (ID), campos[], registro?, padroes?, aoSalvar(registro), rotulos, camposExtra? }
 */
export function abrirFormulario(o) {
  const edicao = !!o.registro;
  const grade = h("div", { class: "fields" }, o.campos.map((c) => construirCampo(c, o.registro?.[c.nome] ?? o.padroes?.[c.nome])));
  const erroBox = h("div", { class: "aviso-box", hidden: true, role: "alert" });
  const form = h("form", { novalidate: true }, grade, erroBox);
  const rotulos = Object.fromEntries(o.campos.map((c) => [c.nome, c.rotulo]));
  if (o.aoMontar) o.aoMontar(form);
  let salvando = false;
  const salvar = async () => {
    if (salvando) return; salvando = true; botao.disabled = true; botao.textContent = "Salvando…"; erroBox.hidden = true;
    try {
      const dados = lerForm(form);
      let r;
      if (edicao) {
        const patch = {};
        for (const [k, v] of Object.entries(dados)) { const antigo = o.registro[k] ?? null; if (String(v ?? "") !== String(antigo ?? "")) patch[k] = v; }
        if (!Object.keys(patch).length) { toast("Nenhuma alteração para salvar.", "aviso"); m.fechar(); return; }
        r = await comConflito((versao) => api.atualizar(o.entidade, o.registro.id, { ...patch, versao: versao ?? o.registro.versao }), { patch, rotulos, modal, h, toast });
      } else {
        r = await api.criar(o.entidade, { id: novoId(o.prefixo), ...Object.fromEntries(Object.entries(dados).filter(([, v]) => v !== null)) });
      }
      m.fechar(); toast(edicao ? "Alterações salvas ✓" : "Cadastro salvo ✓");
      await carregar({ silencioso: true });
      await o.aoSalvar?.(r.registro);
    } catch (e) {
      if (e?.descartado) { m.fechar(); toast("Suas alterações foram descartadas; dados recarregados.", "aviso"); await carregar({ silencioso: true }); await o.aoSalvar?.(e.atual); return; }
      erroBox.hidden = false; erroBox.textContent = "";
      erroBox.append(h("b", null, e instanceof ApiErro && e.erros ? "Corrija os campos abaixo:" : "Não foi possível salvar:"), e.erros ? h("ul", { style: "margin:4px 0 0;padding-left:18px" }, e.erros.map((x) => h("li", null, x))) : h("div", null, e.message));
      botao.disabled = false; botao.textContent = "Salvar"; salvando = false;
    }
  };
  const botao = h("button", { class: "act primario", type: "button", onclick: salvar }, "Salvar");
  form.addEventListener("submit", (e) => { e.preventDefault(); salvar(); });
  const m = modal(o.titulo, form, { largura: o.largura || 720, acoes: [h("button", { class: "act", type: "button", onclick: () => m.fechar() }, "Cancelar"), botao] });
  return m;
}

export const PREFIXO = Object.fromEntries(Object.entries(TABELAS).map(([k, v]) => [k, v.prefixo]));
