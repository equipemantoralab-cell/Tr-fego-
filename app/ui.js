// Utilitários de interface. h() só usa textContent/nós DOM: dados da planilha nunca viram HTML.
export function h(tag, attrs, ...filhos) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "value") el.value = v;
    else if (k === "checked" || k === "disabled" || k === "selected" || k === "open" || k === "hidden") { if (v) el.setAttribute(k, ""); }
    else el.setAttribute(k, v === true ? "" : v);
  }
  const add = (f) => { if (f === null || f === undefined || f === false) return; if (Array.isArray(f)) f.forEach(add); else el.append(f instanceof Node ? f : document.createTextNode(String(f))); };
  filhos.forEach(add);
  return el;
}
export const vazio = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const montar = (el, ...filhos) => { vazio(el); filhos.flat().forEach((f) => f && el.append(f)); return el; };

// ---- formatação
export const brl = (v) => (typeof v === "number" && Number.isFinite(v) ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—");
export const nf = (v, d = 1) => (typeof v === "number" && Number.isFinite(v) ? v.toLocaleString("pt-BR", { maximumFractionDigits: d }) : "—");
export const pct = (v, d = 1) => (typeof v === "number" && Number.isFinite(v) ? `${v.toLocaleString("pt-BR", { maximumFractionDigits: d })}%` : "—");
export const data = (s) => (s ? String(s).slice(0, 10).split("-").reverse().join("/") : "—");
export const dataHora = (s) => { if (!s) return "—"; const d = new Date(s); return Number.isNaN(+d) ? "—" : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); };
export const hoje = () => new Date().toISOString().slice(0, 10);
export const somaDias = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export const ROTULOS = {
  tipo_funil: { low_ticket: "Low ticket", medio_ticket: "Médio ticket", high_ticket: "High ticket", lancamento: "Lançamento" },
  modelo_funil: { pagina: "Página de vendas", vsl: "VSL", quiz: "Quiz", leads: "Captação de leads", comercial: "Conversão comercial" },
  status_campanha: { em_teste: "Em teste", ativa: "Ativa", em_escala: "Em escala", pausada: "Pausada", encerrada: "Encerrada" },
  status_cliente: { ativo: "Ativo", pausado: "Pausado", encerrado: "Encerrado" },
  fase_lancamento: { captacao: "Captação", aquecimento: "Aquecimento", carrinho: "Carrinho aberto", recuperacao: "Recuperação", consolidado: "Consolidado" },
  prioridade: { baixa: "Baixa", media: "Média", alta: "Alta", critica: "Crítica" },
  status_acao: { pendente: "Pendente", em_andamento: "Em andamento", concluida: "Concluída", cancelada: "Cancelada", aguardando_reavaliacao: "Aguardando reavaliação" },
  decisao_adotada: { pendente: "Pendente", aceita: "Aceita", ajustada: "Ajustada", rejeitada: "Rejeitada" },
  nivel_evidencia: { recomendacao: "Recomendação", hipotese: "Hipótese", conclusao: "Conclusão" },
  perfil: { admin: "Administrador", gestor: "Gestor", analista: "Analista", leitor: "Leitor" },
  situacao: { normal: "Situação normal", atencao: "Atenção", critica: "Situação crítica", insuficiente: "Dados insuficientes" },
};
export const rot = (grupo, v) => ROTULOS[grupo]?.[v] ?? v ?? "—";

/** Indicador visual discreto: ícone + texto (nunca só cor). */
export function selo(situacao) {
  const ic = { normal: "●", atencao: "▲", critica: "■", insuficiente: "◌" }[situacao] || "◌";
  return h("span", { class: `selo selo-${situacao || "insuficiente"}`, title: rot("situacao", situacao) }, h("span", { "aria-hidden": "true" }, ic), " ", rot("situacao", situacao || "insuficiente"));
}
export const chip = (texto, cls = "") => h("span", { class: `chip ${cls}` }, texto);

// ---- toasts, modal, confirmação
let caixaToast;
export function toast(msg, tipo = "ok", ms = 4000) {
  if (!caixaToast) { caixaToast = h("div", { class: "toasts", "aria-live": "polite" }); document.body.append(caixaToast); }
  const t = h("div", { class: `toast toast-${tipo}`, role: tipo === "erro" ? "alert" : "status" }, msg);
  caixaToast.append(t); setTimeout(() => t.remove(), ms);
}
export function modal(titulo, conteudo, { largura = 640, acoes = [] } = {}) {
  const fundo = h("div", { class: "modal-fundo", role: "dialog", "aria-modal": "true", "aria-label": titulo });
  const fechar = () => { fundo.remove(); document.body.classList.remove("sem-rolagem"); document.removeEventListener("keydown", esc); };
  const esc = (e) => { if (e.key === "Escape") fechar(); };
  const caixa = h("div", { class: "modal", style: `max-width:${largura}px` },
    h("div", { class: "modal-topo" }, h("h2", null, titulo), h("button", { class: "act", "aria-label": "Fechar", onclick: fechar }, "✕")),
    h("div", { class: "modal-corpo" }, conteudo),
    acoes.length ? h("div", { class: "modal-rodape" }, acoes) : null);
  fundo.addEventListener("mousedown", (e) => { if (e.target === fundo) fechar(); });
  fundo.append(caixa); document.body.append(fundo); document.body.classList.add("sem-rolagem"); document.addEventListener("keydown", esc);
  caixa.querySelector("input,select,textarea,button.primario")?.focus();
  return { fechar, caixa };
}
export const confirmar = (titulo, texto, rotulo = "Confirmar") => new Promise((res) => {
  const m = modal(titulo, h("p", null, texto), { largura: 460, acoes: [
    h("button", { class: "act", onclick: () => { m.fechar(); res(false); } }, "Cancelar"),
    h("button", { class: "act primario", onclick: () => { m.fechar(); res(true); } }, rotulo)] });
});
export const carregando = (txt = "Carregando…") => h("div", { class: "carregando", role: "status" }, h("span", { class: "spinner", "aria-hidden": "true" }), txt);
export const estadoVazio = (txt, acao) => h("div", { class: "empty" }, txt, acao ? h("div", { style: "margin-top:10px" }, acao) : null);

// ---- formulários
export function campo(rotulo, input, { dica, full } = {}) {
  return h("div", { class: full ? "full" : "" }, h("label", null, rotulo), input, dica ? h("div", { class: "nota" }, dica) : null);
}
export const entrada = (nome, valor, o = {}) => h("input", { name: nome, type: o.tipo || "text", inputmode: o.modo, value: valor ?? "", placeholder: o.ph, min: o.min, max: o.max, step: o.step, maxlength: o.maxlen, required: o.req, disabled: o.disabled });
export const seletor = (nome, opcoes, valor, o = {}) => h("select", { name: nome, disabled: o.disabled }, (o.vazio !== undefined ? [h("option", { value: "" }, o.vazio)] : []), opcoes.map(([v, r]) => h("option", { value: v, selected: v === valor }, r)));
export const textarea = (nome, valor, o = {}) => h("textarea", { name: nome, maxlength: o.maxlen, rows: o.linhas || 3, disabled: o.disabled }, valor ?? "");
/** Lê um formulário em objeto; "" vira null (não informado). */
export function lerForm(form) {
  const o = {};
  for (const el of form.querySelectorAll("[name]")) {
    if (el.disabled) continue;
    if (el.type === "checkbox") o[el.name] = el.checked;
    else o[el.name] = el.value.trim() === "" ? null : el.value.trim();
  }
  return o;
}
export const opcoesDe = (obj) => Object.entries(obj);

// ---- tabela
export function tabela(colunas, linhas, { vazioTxt = "Nada para mostrar.", aoClicar, classe = "" } = {}) {
  if (!linhas.length) return estadoVazio(vazioTxt);
  return h("div", { class: "tw" }, h("table", { class: classe },
    h("thead", null, h("tr", null, colunas.map((c) => h("th", { class: c.num ? "num" : "" }, c.titulo)))),
    h("tbody", null, linhas.map((l) => h("tr", { class: aoClicar ? "clicavel" : "", tabindex: aoClicar ? "0" : null, onclick: aoClicar ? () => aoClicar(l) : null, onkeydown: aoClicar ? (e) => { if (e.key === "Enter") aoClicar(l); } : null },
      colunas.map((c) => h("td", { class: c.num ? "num" : "" }, c.valor(l))))))));
}
export const kpi = (rotulo, valor, sub, cls = "") => h("div", { class: `kpi ${cls}` }, h("small", null, rotulo), h("b", null, valor), sub ? h("small", { class: "sub" }, sub) : null);
