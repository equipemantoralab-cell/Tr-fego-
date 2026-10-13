// Rotas da API. Independente de plataforma: recebe {metodo, caminho, query, corpo, cookie, headers} e devolve {status, corpo, cookies}.
// Toda leitura e escrita da planilha passa por aqui — nenhuma rota é aberta sem sessão válida (exceto config/saúde/login).
import { createHash } from "node:crypto";
import { Store, ErroNegocio, Validacao, Conflito, NaoEncontrado, PlanilhaNaoPreparada } from "./store.js";
import { IndisponivelError } from "./memory.js";
import { verificarIdTokenGoogle, criarSessao, lerSessao, lerCookie, cookieSessao, cookieLimpo, ErroAuth } from "./auth.js";
import { permitido } from "../lib/authz.js";
import { TABELAS, validarRegistro } from "../lib/schema.js";
import { normalizarBase, derivar, avisosConsistencia, CAMPOS_BASE } from "../lib/metrics.js";
import { diagnosticar, VERSAO_MOTOR } from "../lib/rules.js";
import { economiaUnitaria } from "../lib/finance.js";
import { compararAntesDepois } from "../lib/intel.js";
import { CONFIG_PADRAO } from "../lib/config-defaults.js";

const ENTIDADES = { clientes: "CLIENTES", produtos: "PRODUTOS", campanhas: "CAMPANHAS", analises: "ANALISES", decisoes: "DECISOES", configuracoes: "CONFIGURACOES_FUNIS", aprendizados: "APRENDIZADOS", usuarios: "USUARIOS", historico: "HISTORICO_ALTERACOES" };
const MAX_CORPO = 400_000;
const TTL_USUARIOS_MS = 30_000;

const resp = (status, corpo, cookies = []) => ({ status, corpo, cookies });
const erro = (status, mensagem, extra = {}) => resp(status, { ok: false, erro: mensagem, ...extra });
const hojeISO = () => new Date().toISOString().slice(0, 10);

/**
 * @param {object} deps  { env(k), criarStore(), fetchFn, agora(): ms, seguro: boolean }
 */
export function criarApi(deps) {
  const env = deps.env;
  const agora = deps.agora || (() => Date.now());
  const seguro = deps.seguro !== false;
  let cacheUsuarios = { dados: null, exp: 0 };
  const admins = () => (env("ADMIN_EMAILS") || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

  async function usuarios(store) {
    if (cacheUsuarios.dados && agora() < cacheUsuarios.exp) return cacheUsuarios.dados;
    const dados = await store.listar("USUARIOS");
    cacheUsuarios = { dados, exp: agora() + (deps.ttlUsuariosMs ?? TTL_USUARIOS_MS) };
    return dados;
  }
  const invalidarUsuarios = () => { cacheUsuarios = { dados: null, exp: 0 }; };

  async function resolverUsuario(store, email) {
    const lista = await usuarios(store).catch((e) => { if (admins().includes(email)) return []; throw e; });
    const u = lista.find((x) => x.conta?.toLowerCase() === email);
    if (u) return u.status === "ativo" ? { conta: email, nome: u.nome, perfil: u.perfil } : null;
    if (admins().includes(email)) return { conta: email, nome: email.split("@")[0], perfil: "admin", virtual: true };
    return null;
  }

  function checarOrigem(req) {
    if (req.metodo === "GET") return null;
    if (req.headers["x-requested-with"] !== "cascata") return erro(403, "Requisição não autorizada (cabeçalho ausente).", { codigo: "csrf" });
    const origem = req.headers.origin;
    if (origem && req.headers.host && new URL(origem).host !== req.headers.host) return erro(403, "Origem não permitida.", { codigo: "origem" });
    if (!String(req.headers["content-type"] || "").includes("application/json")) return erro(415, "Use application/json.");
    return null;
  }

  async function tratar(req) {
    try {
      const partes = req.caminho.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
      const [raiz, a2, a3] = partes;
      if (req.corpoBruto && req.corpoBruto.length > MAX_CORPO) return erro(413, "Corpo muito grande.");

      // ---------- públicas
      if (req.metodo === "GET" && raiz === "saude") return resp(200, { ok: true, versao_motor: VERSAO_MOTOR });
      if (req.metodo === "GET" && raiz === "config") return resp(200, { ok: true, googleClientId: env("GOOGLE_CLIENT_ID") || null, configurado: !!(env("GOOGLE_SHEET_ID") && env("GOOGLE_SA_EMAIL") && env("GOOGLE_SA_PRIVATE_KEY") && env("SESSION_SECRET") && env("GOOGLE_CLIENT_ID")) });
      const bloqueio = checarOrigem(req); if (bloqueio) return bloqueio;

      if (req.metodo === "POST" && raiz === "auth" && a2 === "login") {
        const store = deps.criarStore();
        let g;
        try { g = await verificarIdTokenGoogle(req.corpo?.credential, { clientId: env("GOOGLE_CLIENT_ID"), fetchFn: deps.fetchFn, agora }); }
        catch (e) { await store.registrarEvento({ usuario: "desconhecido", operacao: "falha_login", resultado: "negado", detalhe: String(e.message).slice(0, 200) }).catch(() => {}); throw e; }
        const u = await resolverUsuario(store, g.email);
        if (!u) { await store.registrarEvento({ usuario: g.email, operacao: "falha_login", resultado: "negado", detalhe: "conta sem acesso" }).catch(() => {}); return erro(403, "Esta conta Google não tem acesso ao sistema. Peça a um administrador para cadastrá-la.", { codigo: "sem_acesso" }); }
        const token = criarSessao({ email: u.conta, nome: u.nome, perfil: u.perfil }, env("SESSION_SECRET"), { agora });
        await store.registrarEvento({ usuario: u.conta, operacao: "login", resultado: "ok" }).catch(() => {});
        return resp(200, { ok: true, usuario: { conta: u.conta, nome: u.nome, perfil: u.perfil } }, [cookieSessao(token, { seguro })]);
      }
      if (req.metodo === "POST" && raiz === "auth" && a2 === "logout") return resp(200, { ok: true }, [cookieLimpo(seguro)]);

      // ---------- autenticadas
      const sessao = lerSessao(lerCookie(req.cookie), env("SESSION_SECRET"), { agora });
      if (!sessao) return erro(401, "Sessão ausente ou expirada. Entre novamente.", { codigo: "nao_autenticado" });
      const store = deps.criarStore();
      const usuario = await resolverUsuario(store, sessao.email); // revalida perfil/status a cada requisição
      if (!usuario) return resp(403, { ok: false, erro: "Acesso revogado ou inexistente.", codigo: "sem_acesso" }, [cookieLimpo(seguro)]);
      const negar = (op, tabela) => (permitido(usuario.perfil, op, tabela) ? null : erro(403, `Seu perfil (${usuario.perfil}) não permite esta operação.`, { codigo: "sem_permissao" }));

      if (req.metodo === "GET" && raiz === "auth" && a2 === "me") return resp(200, { ok: true, usuario });

      if (req.metodo === "GET" && raiz === "bootstrap") {
        const dados = await store.listarVarias(["CLIENTES", "PRODUTOS", "CAMPANHAS", "ANALISES", "DECISOES", "CONFIGURACOES_FUNIS", "APRENDIZADOS"]);
        const extra = usuario.perfil === "admin" ? { usuarios: await store.listar("USUARIOS") } : {};
        return resp(200, { ok: true, usuario, agora: new Date(agora()).toISOString(), dados: { ...dados, ...extra } });
      }

      if (raiz === "admin" && a2 === "setup" && req.metodo === "POST") {
        const n = negar("admin:setup"); if (n) return n;
        const r = await store.setup(usuario, { admins: admins() }); invalidarUsuarios();
        return resp(200, { ok: true, relatorio: r });
      }
      if (raiz === "backup" && a2 === "restaurar" && req.metodo === "POST") {
        const n = negar("backup:restaurar"); if (n) return n;
        const r = await store.restaurar(req.corpo?.dump, usuario, { dryRun: req.corpo?.dryRun !== false, incluirUsuarios: !!req.corpo?.incluirUsuarios }); invalidarUsuarios();
        return resp(200, { ok: true, ...r });
      }
      if (raiz === "backup" && req.metodo === "GET") {
        const n = negar("backup:exportar"); if (n) return n;
        const dump = await store.exportar();
        if (usuario.perfil !== "admin") delete dump.abas.USUARIOS;
        return resp(200, dump);
      }
      if (raiz === "migracao" && a2 === "importar" && req.metodo === "POST") {
        const n = negar("migracao:importar"); if (n) return n;
        return resp(200, { ok: true, ...(await importarLocal(store, usuario, req.corpo || {})) });
      }

      if (raiz === "analises" && a2 === "preview" && req.metodo === "POST") {
        const n = negar("preview", "ANALISES"); if (n) return n;
        const r = await prepararAnalise(store, req.corpo || {});
        return resp(200, { ok: true, derivadas: r.derivadas, resultado: r.resultado, avisos: r.avisos });
      }

      const tabela = ENTIDADES[raiz];
      if (!tabela) return erro(404, "Rota não encontrada.");
      const def = TABELAS[tabela];

      // ---- leitura
      if (req.metodo === "GET") {
        const n = negar("ler", tabela); if (n) return n;
        if (a2 && a3 === "comparacao" && tabela === "DECISOES") return resp(200, { ok: true, comparacao: await comparacaoDecisao(store, await store.obter("DECISOES", a2)) });
        if (a2) return resp(200, { ok: true, registro: await store.obter(tabela, a2) });
        return resp(200, { ok: true, registros: await store.listar(tabela) });
      }
      if (def.somenteLeituraApi) return erro(405, "Esta aba é somente leitura.");

      // ---- ações especiais
      if (req.metodo === "POST" && a2 && a3 === "anular" && tabela === "ANALISES") {
        const n = negar("anular", tabela); if (n) return n;
        const motivo = String(req.corpo?.motivo || "").trim();
        if (motivo.length < 5) throw new Validacao(["Informe o motivo da anulação (mín. 5 caracteres)"]);
        const r = await store.atualizar("ANALISES", a2, { status: "anulada", motivo_anulacao: motivo }, Number(req.corpo?.versao), usuario, { permitido: true });
        return resp(200, { ok: true, ...r });
      }
      if (req.metodo === "POST" && a2 && a3 === "reavaliar" && tabela === "DECISOES") {
        const n = negar("atualizar", tabela); if (n) return n;
        const dec = await store.obter("DECISOES", a2);
        const cmp = await comparacaoDecisao(store, dec);
        const patch = { desempenho_antes: JSON.stringify(cmp.antes?.d ?? null), desempenho_depois: JSON.stringify({ ...(cmp.depois?.d ?? {}), veredito: cmp.veredito, delta_pct: cmp.comparacoes?.find((c) => c.principal)?.delta_pct ?? null, confianca: cmp.confianca, meta_atingida: cmp.meta_atingida }) };
        if (req.corpo?.conclusao_reavaliacao) patch.conclusao_reavaliacao = req.corpo.conclusao_reavaliacao;
        if (req.corpo?.resultado_observado) patch.resultado_observado = req.corpo.resultado_observado;
        const r = await store.atualizar("DECISOES", a2, patch, Number(req.corpo?.versao), usuario);
        return resp(200, { ok: true, comparacao: cmp, ...r });
      }

      // ---- criar
      if (req.metodo === "POST" && !a2) {
        const n = negar("criar", tabela); if (n) return n;
        const corpo = { ...(req.corpo || {}) }; const id = corpo.id; delete corpo.id;
        if (tabela === "ANALISES") return await criarAnalise(store, usuario, corpo, id);
        const sistema = await complementar(store, tabela, corpo, null, usuario);
        const r = await store.criar(tabela, corpo, usuario, { id, sistema });
        if (tabela === "USUARIOS") invalidarUsuarios();
        return resp(r.criado ? 201 : 200, { ok: true, ...r });
      }
      // ---- atualizar
      if (req.metodo === "PUT" && a2) {
        if (def.mutavel === false) return erro(405, `${def.titulo} são registros históricos e não podem ser editados. Anule e registre uma nova análise.`, { codigo: "imutavel" });
        const n = negar("atualizar", tabela); if (n) return n;
        const { versao, ...patch } = req.corpo || {};
        const atual = await store.obter(tabela, a2);
        const sistema = await complementar(store, tabela, patch, atual, usuario);
        const r = await store.atualizar(tabela, a2, patch, Number(versao), usuario, { sistema });
        if (tabela === "USUARIOS") invalidarUsuarios();
        return resp(200, { ok: true, ...r });
      }
      return erro(405, "Método não permitido.");
    } catch (e) { return traduzir(e); }
  }

  // ---------------------------------------------------------------- regras específicas por entidade
  async function complementar(store, tabela, dados, atual, usuario) {
    const sis = {};
    if (tabela === "PRODUTOS") {
      const m = { ...atual, ...dados };
      const eco = economiaUnitaria({ preco: m.preco, receita_adicional_media: m.receita_adicional_media, reembolso_pct: m.reembolso_pct, taxas_pct: m.taxas_pct, taxa_fixa: m.taxa_fixa, impostos_pct: m.impostos_pct, custo_variavel: m.custo_variavel });
      sis.margem_estimada = eco.ok ? Math.round(eco.margem_contribuicao * 100) / 100 : null;
    }
    if (tabela === "CAMPANHAS") {
      const m = { ...atual, ...dados };
      if (m.tipo_funil === "medio_ticket" && !m.modelo_funil) throw new Validacao(["Modelo (página, VSL, quiz, leads ou comercial) é obrigatório no médio ticket"]);
      if (m.data_fim && m.data_inicio && m.data_fim < m.data_inicio) throw new Validacao(["Data de término anterior à data de início"]);
    }
    if (tabela === "DECISOES") {
      const m = { ...atual, ...dados };
      if (m.status === "concluida" && !m.data_conclusao && !dados.data_conclusao) sis.data_conclusao = hojeISO();
      if (!m.cliente_id && m.campanha_id) { const c = await store.obter("CAMPANHAS", m.campanha_id).catch(() => null); if (c) sis.cliente_id = c.cliente_id; }
    }
    return sis;
  }

  const PERMITIDOS_ANALISE = new Set(["id", "campanha_id", "periodo_inicio", "periodo_fim", "fase_lancamento", "responsavel_analise", "notas", "substitui_id", ...CAMPOS_BASE]);
  async function prepararAnalise(store, corpo) {
    const desconhecidos = Object.keys(corpo).filter((k) => !PERMITIDOS_ANALISE.has(k));
    if (desconhecidos.length) throw new Validacao([`campo não aceito: ${desconhecidos.join(", ")} (métricas derivadas e diagnóstico são calculados pelo sistema)`]);
    const campanhaId = corpo.campanha_id;
    if (!campanhaId) throw new Validacao(["campanha_id é obrigatório"]);
    const { valores, erros } = normalizarBase(corpo);
    if (erros.length) throw new Validacao(erros);
    if (!corpo.periodo_inicio || !corpo.periodo_fim) throw new Validacao(["Período analisado (início e fim) é obrigatório"]);
    if (corpo.periodo_fim < corpo.periodo_inicio) throw new Validacao(["O fim do período não pode ser anterior ao início"]);
    const [campanha, todas, configs] = await Promise.all([store.obter("CAMPANHAS", campanhaId), store.listar("ANALISES"), store.listar("CONFIGURACOES_FUNIS")]);
    const produto = campanha.produto_id ? await store.obter("PRODUTOS", campanha.produto_id).catch(() => null) : null;
    const historico = todas.filter((a) => a.campanha_id === campanhaId && a.status !== "anulada");
    const analise = { ...valores, id: corpo.id || "novo", periodo_inicio: corpo.periodo_inicio, periodo_fim: corpo.periodo_fim, fase_lancamento: corpo.fase_lancamento || null };
    const resultado = diagnosticar({ campanha, produto, analise, historico, configs });
    const derivadas = derivar(valores);
    const avisos = [...avisosConsistencia(valores), ...resultado.avisos];
    if (corpo.periodo_fim > new Date(agora() + 86400000).toISOString().slice(0, 10)) avisos.push("O fim do período está no futuro.");
    if (corpo.periodo_inicio < campanha.data_inicio) avisos.push("O período começa antes da data de início da campanha.");
    return { campanha, valores, derivadas, resultado, avisos };
  }

  async function criarAnalise(store, usuario, corpo, id) {
    const p = await prepararAnalise(store, { ...corpo, id });
    const { derivadas, resultado } = p;
    const dados = { campanha_id: corpo.campanha_id, periodo_inicio: corpo.periodo_inicio, periodo_fim: corpo.periodo_fim, ...p.valores, fase_lancamento: corpo.fase_lancamento ?? null, responsavel_analise: corpo.responsavel_analise ?? usuario.nome, notas: corpo.notas ?? null, substitui_id: corpo.substitui_id ?? null };
    const { cac_inclui_custo_comercial, ...derivadasGravar } = derivadas;
    const resultadoGravar = { ...resultado, avisos: p.avisos };
    let json = JSON.stringify(resultadoGravar);
    if (json.length > 44000) json = JSON.stringify({ ...resultadoGravar, etapas: [], justificativa: resultado.justificativa.slice(0, 8) });
    const sistema = {
      ...derivadasGravar, situacao: resultado.situacao,
      diagnostico: `${resultado.resumo}${resultado.gargalo ? ` Provável gargalo (hipótese): ${resultado.gargalo.rotulo}.` : ""}`.slice(0, 2900),
      recomendacao: `${resultado.recomendacao.rotulo} (${resultado.recomendacao.nivel_evidencia}): ${resultado.recomendacao.texto}`.slice(0, 990),
      justificativa: resultado.justificativa.map((j) => `[${j.nivel}] ${j.texto}`).join("\n").slice(0, 5900),
      resultado_motor: json, versao_motor: resultado.versao_motor,
    };
    const r = await store.criar("ANALISES", dados, usuario, { id, sistema });
    return resp(r.criado ? 201 : 200, { ok: true, ...r, resultado: resultadoGravar, avisos: p.avisos });
  }

  async function comparacaoDecisao(store, dec) {
    if (!dec.data_execucao) return { veredito: "sem_dados", texto: "Informe a data de execução da ação para comparar antes e depois.", comparacoes: [], ressalvas: [] };
    const [campanha, analises] = await Promise.all([store.obter("CAMPANHAS", dec.campanha_id), store.listar("ANALISES")]);
    const meta = campanha.tipo_funil === "high_ticket" || campanha.tipo_funil === "lancamento" ? campanha.cac_alvo : campanha.modelo_funil === "leads" ? campanha.cpl_alvo : campanha.cpa_alvo;
    return compararAntesDepois({ analises: analises.filter((a) => a.campanha_id === dec.campanha_id), dataExecucao: dec.data_execucao, tipoFunil: campanha.tipo_funil, modeloFunil: campanha.modelo_funil, meta });
  }

  // ---------------------------------------------------------------- migração de dados locais (localStorage) → planilha
  const MAPA_PARAMS = { ctrSaudavel: "global.ctr_saudavel_pct", ctrExcelente: "global.ctr_excelente_pct", connectMin: "global.connect_min_pct", pagCheckoutMin: "global.visita_checkout_min_pct", checkoutCompraMin: "global.checkout_compra_min_pct", preEscalaVendasMin: "low_ticket.compras_pre_escala_min", medioMultInicio: "medio_ticket.mult_inicio", medioMultPausa: "medio_ticket.mult_pausa", ritmoMin: "lancamento.ritmo_min", ritmoMax: "lancamento.ritmo_max", carrinhoPagCheckoutMin: "lancamento.carrinho_visita_checkout_min_pct", carrinhoCheckoutCompraMin: "lancamento.carrinho_checkout_compra_min_pct" };
  async function importarLocal(store, usuario, { aprendizados = [], parametros = {}, dryRun = true }) {
    const rel = { dryRun, aprendizados: { recebidos: aprendizados.length, a_criar: 0, ja_existiam: 0, criados: 0, invalidos: [] }, parametros: { recebidos: Object.keys(parametros).length, a_atualizar: 0, atualizados: 0, ignorados: [], conflitos: [] } };
    const existentes = new Set((await store.listar("APRENDIZADOS")).map((x) => x.id));
    for (const a of aprendizados.slice(0, 500)) {
      const dados = { tipo: String(a.tipo || "aprendizado").slice(0, 40), titulo: String(a.titulo || "").slice(0, 300) || null, dados: JSON.stringify(a.dados ?? {}).slice(0, 19000), origem: "migracao_localstorage" };
      const id = `apr_${createHash("sha256").update(JSON.stringify([dados.tipo, dados.titulo, dados.dados])).digest("hex").slice(0, 24)}`; // determinístico: reimportar não duplica
      if (existentes.has(id)) { rel.aprendizados.ja_existiam++; continue; }
      const v = validarRegistro("APRENDIZADOS", dados); if (v.erros.length) { rel.aprendizados.invalidos.push(v.erros[0]); continue; }
      rel.aprendizados.a_criar++;
      if (!dryRun) { const r = await store.criar("APRENDIZADOS", dados, usuario, { id }); if (r.criado) rel.aprendizados.criados++; }
    }
    const cfgs = await store.listar("CONFIGURACOES_FUNIS"); const porId = new Map(cfgs.map((c) => [c.id, c]));
    for (const [k, v] of Object.entries(parametros)) {
      const alvo = MAPA_PARAMS[k]; const val = Number(String(v).replace(",", "."));
      if (!alvo || !Number.isFinite(val)) { rel.parametros.ignorados.push(k); continue; }
      const atual = porId.get(alvo); if (!atual) { rel.parametros.ignorados.push(k); continue; }
      if (atual.valor === val) continue;
      if (atual.fonte === "usuario" && atual.valor !== null) { rel.parametros.conflitos.push(`${alvo}: já alterado na planilha (${atual.valor}); mantido`); continue; }
      rel.parametros.a_atualizar++;
      if (!dryRun) { await store.atualizar("CONFIGURACOES_FUNIS", alvo, { valor: val, fonte: "usuario" }, atual.versao, usuario); rel.parametros.atualizados++; }
    }
    if (!dryRun) await store._auditar({ usuario: usuario.conta, operacao: "importar", entidade: "migracao_localstorage", detalhe: JSON.stringify({ a: rel.aprendizados.criados, p: rel.parametros.atualizados }) });
    return rel;
  }

  function traduzir(e) {
    if (e instanceof Conflito) return resp(409, { ok: false, erro: e.message, codigo: "conflito", atual: e.atual });
    if (e instanceof Validacao) return resp(422, { ok: false, erro: e.message, codigo: "validacao", erros: e.erros });
    if (e instanceof NaoEncontrado) return resp(404, { ok: false, erro: e.message, codigo: "nao_encontrado" });
    if (e instanceof ErroAuth) return resp(e.status, { ok: false, erro: e.message, codigo: "auth" });
    if (e instanceof PlanilhaNaoPreparada) return resp(409, { ok: false, erro: e.message, codigo: "planilha_nao_preparada" });
    if (e instanceof ErroNegocio) return resp(e.status, { ok: false, erro: e.message, codigo: e.name });
    if (e?.status === 400 && /Unable to parse range|not found/i.test(e.message || "")) return resp(409, { ok: false, erro: "A planilha ainda não foi preparada (abas ausentes). Um administrador deve executar “Preparar planilha”.", codigo: "planilha_nao_preparada" });
    if (e instanceof IndisponivelError) return resp(503, { ok: false, erro: "A planilha (Google Sheets) está indisponível no momento. Seus dados não foram alterados; tente novamente em instantes.", codigo: "planilha_indisponivel" });
    if (e?.name === "AcessoNegadoSheets") return resp(502, { ok: false, erro: "O servidor não conseguiu acessar a planilha. Verifique se ela foi compartilhada com a conta de serviço.", codigo: "planilha_sem_acesso" });
    console.error("erro inesperado:", e?.stack || e);
    return resp(500, { ok: false, erro: "Erro interno. Tente novamente; se persistir, avise o administrador.", codigo: "interno" });
  }

  return { tratar, _invalidarUsuarios: invalidarUsuarios };
}

export { CONFIG_PADRAO };
