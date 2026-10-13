// Ponto de entrada: autenticação, shell (menu/topo), roteador por hash e atualização periódica.
import { api, aoMudarRede, ApiErro } from "./api.js";
import { estado, carregar, limpar, aoMudar, pode, D, vencida } from "./estado.js";
import { h, montar, carregando, toast, hoje, estadoVazio } from "./ui.js";

const raiz = document.getElementById("raiz");
const ROTAS = [
  ["dashboard", "Dashboard", () => import("./views/dashboard.js")],
  ["clientes", "Clientes", () => import("./views/clientes.js")],
  ["campanhas", "Campanhas", () => import("./views/campanhas.js")],
  ["nova-analise", "Nova análise", () => import("./views/analise.js")],
  ["cascata", "Cascata de decisão", () => import("./views/cascata.js")],
  ["simulador", "Simulador financeiro", () => import("./views/simulador.js")],
  ["plano", "Plano de ação", () => import("./views/plano.js")],
  ["historico", "Histórico", () => import("./views/historico.js")],
  ["config", "Configurações", () => import("./views/config.js")],
];
let areaConteudo, tituloEl, redeEl, faixaEl, menuEl, rotaAtual = null, renderSeq = 0;

// ---------------------------------------------------------------- login
async function telaLogin(config) {
  const caixa = h("div", { class: "login" }, h("h1", null, "Cascata de Decisão · Mantora"), h("p", null, "Sistema interno de gestão e decisão de tráfego pago."));
  const msg = h("p", { class: "nota", role: "alert" });
  const entrar = async (credential) => {
    try { msg.textContent = "Entrando…"; await api.entrar(credential); await iniciar(); }
    catch (e) { msg.textContent = e.message; msg.className = "nota no"; }
  };
  if (!config.configurado && !config.devLogin) {
    caixa.append(h("div", { class: "aviso-box" }, "O sistema ainda não foi configurado no servidor (variáveis de ambiente do Google). Veja docs/SETUP.md."));
  } else if (config.devLogin) {
    const email = h("input", { type: "email", placeholder: "e-mail (modo desenvolvimento)", value: "admin@mantora.com", "aria-label": "E-mail" });
    caixa.append(h("p", { class: "aviso-box" }, "Modo de desenvolvimento local."), email, h("p", null, h("button", { class: "act primario", onclick: async () => { try { const t = await api.devToken(email.value); await entrar(t.credential); } catch (e) { msg.textContent = e.message; } } }, "Entrar")));
  } else {
    const alvo = h("div", { style: "display:flex;justify-content:center;margin:16px 0" });
    caixa.append(alvo);
    const s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.async = true;
    s.onload = () => { window.google.accounts.id.initialize({ client_id: config.googleClientId, callback: (r) => entrar(r.credential), ux_mode: "popup" }); window.google.accounts.id.renderButton(alvo, { theme: "outline", size: "large", text: "signin_with", locale: "pt-BR" }); };
    s.onerror = () => { msg.textContent = "Não foi possível carregar o login do Google. Verifique a conexão."; };
    document.head.append(s);
  }
  caixa.append(msg, h("p", { class: "nota" }, h("a", { href: "#/calculadora-local" }, "Abrir a calculadora do POP sem login (dados só neste navegador)")));
  montar(raiz, caixa);
}

function telaPreparar(e) {
  const msg = h("p", { class: "nota", role: "status" });
  const btn = h("button", { class: "act primario", onclick: async () => { btn.disabled = true; msg.textContent = "Preparando a planilha…"; try { await api.setup(); await iniciar(); } catch (er) { msg.textContent = er.status === 403 ? "Somente administradores podem preparar a planilha." : er.message; btn.disabled = false; } } }, "Preparar planilha agora");
  montar(raiz, h("div", { class: "login" }, h("h1", null, "Planilha ainda não preparada"), h("p", null, e.message), btn, msg, h("p", { class: "nota" }, "Cria as abas, colunas, dicionário e parâmetros padrão. Seguro para repetir.")));
}

// ---------------------------------------------------------------- shell
function montarShell() {
  tituloEl = h("div", { class: "quem", style: "font-weight:600;color:var(--ink)" });
  redeEl = h("span", { class: "estado-rede" }, "");
  faixaEl = h("div");
  menuEl = h("nav", { class: "menu", "aria-label": "Navegação principal" });
  const lateral = h("aside", { class: "lateral" }, h("div", { class: "marca" }, "Cascata de Decisão"), h("div", { class: "marca-sub" }, "Mantora · tráfego pago"), menuEl);
  areaConteudo = h("main", { class: "conteudo", id: "conteudo", tabindex: "-1" });
  const topo = h("header", { class: "topo" }, tituloEl, h("div", { class: "quem" }, redeEl,
    h("button", { class: "act peq", title: "Recarregar dados da planilha", onclick: async () => { await atualizar(true); } }, "↻ Atualizar"),
    h("span", null, `${estado.usuario.nome} · ${estado.usuario.perfil}`),
    h("button", { class: "act peq", onclick: async () => { try { await api.sair(); } catch { /* ok */ } limpar(); rotaAtual = null; location.hash = ""; await iniciar(); } }, "Sair")));
  montar(raiz, h("div", { class: "app" }, lateral, h("div", { class: "principal" }, topo, h("div", { style: "padding:0 20px" }, faixaEl), areaConteudo)));
  desenharMenu();
}
function desenharMenu() {
  const vencidas = D() ? D().DECISOES.filter((d) => vencida(d, hoje())).length : 0;
  montar(menuEl, ROTAS.map(([id, nome]) => h("a", { href: `#/${id}`, "aria-current": rotaAtual === id ? "page" : null }, nome, id === "plano" && vencidas ? h("span", { class: "n", title: "Ações vencidas" }, String(vencidas)) : null)));
}
function desenharFaixa() {
  montar(faixaEl);
  if (estado.offline) faixaEl.append(h("div", { class: "faixa faixa-offline", role: "status" }, `Sem conexão com a planilha: exibindo os dados de ${estado.carregadoEm?.toLocaleString("pt-BR") || "?"} em modo SOMENTE LEITURA. `, h("button", { class: "act peq", onclick: () => atualizar(true) }, "Tentar de novo")));
}
aoMudarRede(({ estado: e, erro }) => { if (!redeEl) return; redeEl.textContent = e === "trabalhando" ? "Sincronizando…" : e === "offline" ? "Sem conexão" : e === "erro" ? "Erro" : (estado.carregadoEm ? `Atualizado ${estado.carregadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""); redeEl.className = `estado-rede ${e === "trabalhando" ? "trab" : ""}`; });
aoMudar(() => { if (menuEl) { desenharMenu(); desenharFaixa(); } });

// ---------------------------------------------------------------- roteador
function parseHash() {
  const [caminho, qs] = (location.hash.replace(/^#\/?/, "") || "dashboard").split("?");
  const [id, ...resto] = caminho.split("/");
  return { id, params: resto, query: Object.fromEntries(new URLSearchParams(qs || "")) };
}
export async function renderRota() {
  if (!estado.usuario) return;
  const { id, params, query } = parseHash();
  const rota = ROTAS.find((r) => r[0] === id);
  if (id === "calculadora-local") { return abrirCalculadoraLocal(); }
  if (!rota) { location.hash = "#/dashboard"; return; }
  rotaAtual = id; desenharMenu();
  tituloEl.textContent = rota[1];
  const seq = ++renderSeq;
  montar(areaConteudo, carregando());
  try {
    const mod = await rota[2]();
    const el = await mod.render({ params, query, recarregar: renderRota, atualizar });
    if (seq !== renderSeq) return;
    montar(areaConteudo, el);
    document.title = `${rota[1]} — Cascata Mantora`;
  } catch (e) {
    if (seq !== renderSeq) return;
    console.error(e);
    montar(areaConteudo, h("div", { class: "faixa faixa-erro", role: "alert" }, `Não foi possível abrir esta tela: ${e.message}`), h("button", { class: "act", onclick: renderRota }, "Tentar de novo"));
  }
}
export async function atualizar(manual = false) {
  try { await carregar(); if (manual) toast("Dados atualizados."); await renderRota(); }
  catch (e) { if (e instanceof ApiErro && e.status === 401) { limpar(); await iniciar(); } else toast(e.message, "erro"); }
}
async function abrirCalculadoraLocal() {
  const { montarCalculadora } = await import("./calc.js");
  const cont = h("div", { class: "wrap" }, h("p", null, h("a", { href: "#/" }, "← Voltar ao login")), h("h1", null, "Calculadora do POP (modo local)"));
  const alvo = h("div"); cont.append(alvo); montar(raiz, cont); montarCalculadora(alvo);
}

// ---------------------------------------------------------------- inicialização
async function iniciar() {
  montar(raiz, carregando());
  let config;
  try { config = await api.config(); } catch (e) { montar(raiz, h("div", { class: "login" }, h("h1", null, "Sem conexão"), h("p", null, e.message), h("button", { class: "act primario", onclick: iniciar }, "Tentar de novo"))); return; }
  if (location.hash.startsWith("#/calculadora-local")) return abrirCalculadoraLocal();
  try { await carregar(); } catch (e) {
    if (e instanceof ApiErro && (e.status === 401 || e.status === 403)) return telaLogin(config);
    if (e instanceof ApiErro && e.codigo === "planilha_nao_preparada") return telaPreparar(e);
    if (e instanceof ApiErro && e.codigo === "planilha_sem_acesso") { montar(raiz, h("div", { class: "login" }, h("h1", null, "Planilha inacessível"), h("p", null, e.message))); return; }
    montar(raiz, h("div", { class: "login" }, h("h1", null, "Não foi possível carregar"), h("p", null, e.message), h("button", { class: "act primario", onclick: iniciar }, "Tentar de novo"))); return;
  }
  montarShell(); desenharFaixa();
  if (!location.hash || location.hash === "#/") location.hash = "#/dashboard"; else await renderRota();
}
window.addEventListener("hashchange", () => { if (estado.usuario) renderRota(); else if (location.hash.startsWith("#/calculadora-local")) abrirCalculadoraLocal(); });

// atualização periódica (só telas de leitura e sem edição em andamento)
setInterval(async () => {
  if (document.hidden || !estado.usuario || document.querySelector(".modal-fundo")) return;
  const editando = document.activeElement && ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName);
  const ok = await carregar({ silencioso: true });
  if (ok && !editando && ["dashboard", "plano"].includes(rotaAtual)) renderRota();
}, 120000);
document.addEventListener("visibilitychange", () => { if (!document.hidden && estado.usuario) carregar({ silencioso: true }); });

iniciar();
