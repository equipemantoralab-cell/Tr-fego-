// Estado compartilhado no navegador. A FONTE DA VERDADE é a planilha (via API); o localStorage guarda só um
// instantâneo para leitura quando a conexão cai ("modo offline: somente leitura").
import { api, ApiErro } from "./api.js";
import { permitido } from "../lib/authz.js";

export const estado = { usuario: null, dados: null, carregadoEm: null, offline: false, ouvintes: new Set() };
export const aoMudar = (fn) => { estado.ouvintes.add(fn); return () => estado.ouvintes.delete(fn); };
const emitir = () => estado.ouvintes.forEach((f) => f(estado));
const CHAVE = "mt_cache_v1";

export async function carregar({ silencioso = false } = {}) {
  try {
    const r = await api.bootstrap();
    estado.usuario = r.usuario; estado.dados = r.dados; estado.carregadoEm = new Date(); estado.offline = false;
    try { localStorage.setItem(CHAVE, JSON.stringify({ usuario: r.usuario, dados: { ...r.dados, USUARIOS: undefined }, em: estado.carregadoEm.toISOString() })); } catch { /* sem cache */ }
    emitir(); return true;
  } catch (e) {
    if (e instanceof ApiErro && e.offline) {
      let c = null; try { c = JSON.parse(localStorage.getItem(CHAVE)); } catch { /* ignora */ }
      if (c?.dados) { estado.usuario = c.usuario; estado.dados = c.dados; estado.carregadoEm = new Date(c.em); estado.offline = true; emitir(); return true; }
    }
    if (!silencioso) throw e;
    return false;
  }
}
export function limpar() { estado.usuario = null; estado.dados = null; try { localStorage.removeItem(CHAVE); } catch { /* ok */ } emitir(); }

export const pode = (op, tabela) => !estado.offline && !!estado.usuario && permitido(estado.usuario.perfil, op, tabela);
export const D = () => estado.dados;
export const porId = (lista) => new Map((lista || []).map((x) => [x.id, x]));
export const cliente = (id) => D().CLIENTES.find((c) => c.id === id);
export const campanha = (id) => D().CAMPANHAS.find((c) => c.id === id);
export const produto = (id) => D().PRODUTOS.find((c) => c.id === id);
export const analisesDe = (campId) => D().ANALISES.filter((a) => a.campanha_id === campId && a.status !== "anulada").sort((x, y) => String(x.periodo_fim).localeCompare(String(y.periodo_fim)));
export const ultimaAnalise = (campId) => analisesDe(campId).slice(-1)[0] || null;
export const decisoesDe = (campId) => D().DECISOES.filter((d) => d.campanha_id === campId);
export const resultadoMotor = (a) => { try { return a?.resultado_motor ? JSON.parse(a.resultado_motor) : null; } catch { return null; } };
export const ABERTAS = ["pendente", "em_andamento", "aguardando_reavaliacao"];
export const vencida = (d, hojeISO) => ABERTAS.includes(d.status) && d.prazo && d.prazo < hojeISO;
export const responsaveis = () => [...new Set([...D().CAMPANHAS.map((c) => c.responsavel), ...D().DECISOES.map((c) => c.responsavel), ...D().CLIENTES.map((c) => c.responsavel)].filter(Boolean))].sort();
export const nomeUsuario = (conta) => D().USUARIOS?.find((u) => u.conta === conta)?.nome || conta;

/**
 * Salva com tratamento de conflito de edição. `enviar(versao)` faz o PUT; em 409 mostra o modal e devolve o
 * resultado da escolha do usuário. Nunca sobrescreve em silêncio.
 */
export async function comConflito(enviar, { patch, rotulos = {}, modal, h, toast }) {
  try { return await enviar(); } catch (e) {
    if (!(e instanceof ApiErro) || !e.conflito) throw e;
    return new Promise((res, rej) => {
      const atual = e.atual;
      const difs = Object.keys(patch).filter((k) => k !== "versao" && JSON.stringify(patch[k] ?? null) !== JSON.stringify(atual?.[k] ?? null));
      const linhas = difs.map((k) => h("tr", null, h("td", null, rotulos[k] || k), h("td", null, String(atual?.[k] ?? "—")), h("td", null, String(patch[k] ?? "—"))));
      const m = modal("Este registro foi alterado por outra pessoa", h("div", null,
        h("p", null, `Alguém salvou uma versão mais nova (v${atual?.versao}) enquanto você editava. Nada foi sobrescrito.`),
        linhas.length ? h("div", { class: "tw" }, h("table", null, h("thead", null, h("tr", null, h("th", null, "Campo"), h("th", null, "Valor atual (outra pessoa)"), h("th", null, "Sua alteração"))), h("tbody", null, linhas))) : h("p", { class: "nota" }, "Suas alterações coincidem com a versão atual."),
      ), { largura: 720, acoes: [
        h("button", { class: "act", onclick: () => { m.fechar(); rej(Object.assign(new Error("descartado"), { descartado: true, atual })); } }, "Descartar as minhas e recarregar"),
        h("button", { class: "act primario", onclick: async () => { m.fechar(); try { res(await enviar(atual.versao)); } catch (e2) { rej(e2); } } }, "Aplicar as minhas sobre a versão atual"),
      ] });
    });
  }
}
