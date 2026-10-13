import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createSign } from "node:crypto";
import { MemoryAdapter } from "../server/memory.js";
import { Store } from "../server/store.js";
import { criarApi } from "../server/handlers.js";
import { _limparCacheJwks } from "../server/auth.js";
import { novoId } from "../lib/schema.js";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const idToken = (email) => { const h = b({ alg: "RS256", kid: "k1" }), p = b({ iss: "accounts.google.com", aud: "cid", exp: Math.floor(Date.now() / 1000) + 600, email, email_verified: true, name: email.split("@")[0] }); return `${h}.${p}.${createSign("RSA-SHA256").update(`${h}.${p}`).sign(privateKey).toString("base64url")}`; };
const ENV = { GOOGLE_CLIENT_ID: "cid", SESSION_SECRET: "s".repeat(48), ADMIN_EMAILS: "admin@mantora.com", GOOGLE_SHEET_ID: "x", GOOGLE_SA_EMAIL: "x", GOOGLE_SA_PRIVATE_KEY: "x" };
const fetchFn = async () => ({ ok: true, json: async () => ({ keys: [jwk] }) });

/** Uma "máquina": instância da API com sua própria sessão (cookie), compartilhando a mesma planilha. */
function maquina(adapter, opts = {}) {
  const api = criarApi({ env: (k) => ENV[k], criarStore: () => new Store(adapter, { lockEsperaMs: 3 }), fetchFn, seguro: false, ttlUsuariosMs: 0, ...opts });
  let cookie = null;
  const chamar = async (metodo, caminho, corpo) => {
    const headers = { "x-requested-with": "cascata", "content-type": "application/json", host: "app.test" };
    const r = await api.tratar({ metodo, caminho, corpo, cookie, headers });
    const set = r.cookies?.find((c) => c.startsWith("mt_session=")); if (set) cookie = set.split(";")[0];
    return r;
  };
  return {
    chamar, api,
    entrar: async (email) => { _limparCacheJwks(); const r = await chamar("POST", "/auth/login", { credential: idToken(email) }); return r; },
    semCsrf: (metodo, caminho, corpo) => api.tratar({ metodo, caminho, corpo, cookie, headers: { "content-type": "application/json" } }),
    semSessao: (metodo, caminho, corpo) => api.tratar({ metodo, caminho, corpo, cookie: null, headers: { "x-requested-with": "cascata", "content-type": "application/json" } }),
  };
}
async function ambiente() {
  const adapter = new MemoryAdapter();
  const admin = maquina(adapter);
  await admin.entrar("admin@mantora.com");
  const s = await admin.chamar("POST", "/admin/setup", {}); assert.equal(s.status, 200, JSON.stringify(s.corpo));
  const mk = async (email, perfil) => { const r = await admin.chamar("POST", "/usuarios", { nome: perfil, conta: email, perfil }); assert.equal(r.status, 201, JSON.stringify(r.corpo)); const m = maquina(adapter); const l = await m.entrar(email); assert.equal(l.status, 200); return m; };
  return { adapter, admin, gestor: await mk("gestor@mantora.com", "gestor"), analista: await mk("analista@mantora.com", "analista"), leitor: await mk("leitor@mantora.com", "leitor") };
}
const FUNIL = { impressoes: 100000, cliques: 1800, cliques_link: 1500, visitas_pagina: 1350, inicios_checkout: 300 };

describe("autenticação e autorização (backend)", () => {
  test("sem sessão: 401 em tudo que é protegido; saúde é pública", async () => {
    const { adapter } = await ambiente(); const m = maquina(adapter);
    for (const [met, cam] of [["GET", "/bootstrap"], ["GET", "/clientes"], ["POST", "/clientes"], ["GET", "/backup"], ["POST", "/admin/setup"], ["GET", "/usuarios"], ["GET", "/historico"]]) {
      assert.equal((await m.semSessao(met, cam, {})).status, 401, `${met} ${cam}`);
    }
    assert.equal((await m.semSessao("GET", "/saude")).status, 200);
  });
  test("escrita sem cabeçalho anti-CSRF é recusada mesmo com sessão", async () => {
    const { gestor } = await ambiente();
    assert.equal((await gestor.semCsrf("POST", "/clientes", { nome: "x" })).status, 403);
  });
  test("conta Google sem cadastro não entra; token inválido não entra", async () => {
    const { adapter } = await ambiente(); const m = maquina(adapter);
    assert.equal((await m.entrar("estranho@gmail.com")).status, 403);
    assert.equal((await m.chamar("POST", "/auth/login", { credential: "lixo" })).status, 401);
    assert.equal((await m.chamar("GET", "/bootstrap")).status, 401);
  });
  test("cookie de sessão é HttpOnly + SameSite=Strict", async () => {
    const adapter = new MemoryAdapter(); const m = maquina(adapter, {});
    const r = await m.entrar("admin@mantora.com");
    assert.ok(r.cookies[0].includes("HttpOnly") && r.cookies[0].includes("SameSite=Strict"));
  });
  test("leitor lê mas não escreve; analista não cria campanha; gestor não gerencia usuários nem restaura backup", async () => {
    const { leitor, analista, gestor } = await ambiente();
    assert.equal((await leitor.chamar("GET", "/clientes")).status, 200);
    assert.equal((await leitor.chamar("POST", "/clientes", { nome: "x" })).status, 403);
    assert.equal((await leitor.chamar("GET", "/usuarios")).status, 403);
    assert.equal((await leitor.chamar("GET", "/historico")).status, 403);
    assert.equal((await analista.chamar("POST", "/campanhas", {})).status, 403);
    assert.equal((await gestor.chamar("POST", "/usuarios", { nome: "x", conta: "x@x.com", perfil: "admin" })).status, 403);
    assert.equal((await gestor.chamar("POST", "/backup/restaurar", { dump: {} })).status, 403);
    assert.equal((await gestor.chamar("POST", "/admin/setup", {})).status, 403);
    assert.equal((await gestor.chamar("GET", "/backup")).status, 200);
  });
  test("usuário desativado perde o acesso imediatamente (perfil revalidado a cada chamada)", async () => {
    const { admin, analista } = await ambiente();
    assert.equal((await analista.chamar("GET", "/clientes")).status, 200);
    const u = (await admin.chamar("GET", "/usuarios")).corpo.registros.find((x) => x.conta === "analista@mantora.com");
    await admin.chamar("PUT", `/usuarios/${u.id}`, { versao: u.versao, status: "inativo" });
    assert.equal((await analista.chamar("GET", "/clientes")).status, 403);
  });
  test("rebaixar o perfil vale na hora (token antigo dizia 'admin')", async () => {
    const { admin, gestor } = await ambiente();
    const u = (await admin.chamar("GET", "/usuarios")).corpo.registros.find((x) => x.conta === "gestor@mantora.com");
    await admin.chamar("PUT", `/usuarios/${u.id}`, { versao: u.versao, perfil: "leitor" });
    assert.equal((await gestor.chamar("POST", "/clientes", { nome: "x" })).status, 403);
  });
});

describe("primeiro acesso (planilha não preparada)", () => {
  test("bootstrap devolve 409 guiado; admin prepara; depois funciona; gestor não prepara", async () => {
    const adapter = new MemoryAdapter(); const admin = maquina(adapter);
    assert.equal((await admin.entrar("admin@mantora.com")).status, 200);
    const r = await admin.chamar("GET", "/bootstrap");
    assert.equal(r.status, 409); assert.equal(r.corpo.codigo, "planilha_nao_preparada");
    assert.equal((await admin.chamar("POST", "/admin/setup", {})).status, 200);
    assert.equal((await admin.chamar("GET", "/bootstrap")).status, 200);
  });
});

describe("fluxo operacional completo", () => {
  test("cliente → produto → campanha → análise (diagnóstico gravado) → decisão → reavaliação", async () => {
    const { gestor, analista } = await ambiente();
    const cli = (await gestor.chamar("POST", "/clientes", { nome: "Acme", projeto: "Verão" })).corpo.registro;
    const prod = (await gestor.chamar("POST", "/produtos", { cliente_id: cli.id, nome: "Curso", preco: 97, custo_variavel: 5, taxas_pct: 5, tipo_oferta: "low_ticket" })).corpo.registro;
    assert.ok(prod.margem_estimada > 0);
    const camp = (await gestor.chamar("POST", "/campanhas", { cliente_id: cli.id, nome: "Camp 1", tipo_funil: "low_ticket", produto_id: prod.id, data_inicio: "2026-03-01", cpa_alvo: 40, status: "em_teste" })).corpo.registro;

    const a1 = await analista.chamar("POST", "/analises", { campanha_id: camp.id, periodo_inicio: "2026-03-01", periodo_fim: "2026-03-07", investimento: 380, compras: 10, receita: 970, ...FUNIL });
    assert.equal(a1.status, 201, JSON.stringify(a1.corpo));
    const reg = a1.corpo.registro;
    assert.equal(reg.cpa, 38); assert.equal(reg.roas, 2.5526); assert.equal(reg.versao_motor, "1.0.0");
    assert.ok(reg.diagnostico && reg.recomendacao && reg.justificativa); assert.ok(JSON.parse(reg.resultado_motor).recomendacao);
    assert.equal(reg.responsavel_analise, "analista");

    // execução de uma ação e nova análise depois dela
    const dec = (await gestor.chamar("POST", "/decisoes", { campanha_id: camp.id, analise_id: reg.id, tipo_acao: "novos_criativos", descricao: "Substituir criativos", prioridade: "alta", responsavel: "Copy", status: "em_andamento", data_execucao: "2026-03-08", prazo: "2026-03-10" })).corpo.registro;
    assert.equal(dec.cliente_id, cli.id);
    await analista.chamar("POST", "/analises", { campanha_id: camp.id, periodo_inicio: "2026-03-09", periodo_fim: "2026-03-15", investimento: 260, compras: 10, receita: 970, ...FUNIL });
    const cmp = await gestor.chamar("GET", `/decisoes/${dec.id}/comparacao`);
    assert.equal(cmp.corpo.comparacao.veredito, "melhorou"); assert.equal(cmp.corpo.comparacao.antes.d.cpa, 38); assert.equal(cmp.corpo.comparacao.depois.d.cpa, 26);
    const re = await gestor.chamar("POST", `/decisoes/${dec.id}/reavaliar`, { versao: dec.versao, conclusao_reavaliacao: "CPA caiu de R$ 38 para R$ 26 após trocar criativos; outros fatores não descartados." });
    assert.equal(re.status, 200);
    assert.equal(JSON.parse(re.corpo.registro.desempenho_depois).veredito, "melhorou");
    assert.match(re.corpo.registro.conclusao_reavaliacao, /não descartados/);
  });
  test("persistência: outra máquina/sessão enxerga os mesmos dados após 'atualizar a página'", async () => {
    const { adapter, gestor } = await ambiente();
    await gestor.chamar("POST", "/clientes", { nome: "Compartilhado" });
    const outro = maquina(adapter); await outro.entrar("admin@mantora.com");
    const r = await outro.chamar("GET", "/bootstrap");
    assert.ok(r.corpo.dados.CLIENTES.some((c) => c.nome === "Compartilhado"));
  });
  test("análise: compras vazio ≠ zero (vazio não vira 'sem vendas')", async () => {
    const { gestor, analista } = await ambiente();
    const cli = (await gestor.chamar("POST", "/clientes", { nome: "A" })).corpo.registro;
    const camp = (await gestor.chamar("POST", "/campanhas", { cliente_id: cli.id, nome: "C", tipo_funil: "low_ticket", data_inicio: "2026-03-01", cpa_alvo: 40 })).corpo.registro;
    const vazio = (await analista.chamar("POST", "/analises", { campanha_id: camp.id, periodo_inicio: "2026-03-01", periodo_fim: "2026-03-05", investimento: 200, compras: "", ...FUNIL })).corpo;
    assert.strictEqual(vazio.registro.cpa, null); assert.equal(vazio.registro.situacao, "insuficiente"); assert.notEqual(JSON.parse(vazio.registro.resultado_motor).recomendacao.acao, "pausar");
    const zero = (await analista.chamar("POST", "/analises", { campanha_id: camp.id, periodo_inicio: "2026-03-06", periodo_fim: "2026-03-10", investimento: 200, compras: 0, ...FUNIL })).corpo;
    assert.strictEqual(zero.registro.compras, 0); assert.equal(JSON.parse(zero.registro.resultado_motor).recomendacao.acao, "pausar");
  });
  test("validação: negativo, texto, datas invertidas, campanha inexistente → 422/404", async () => {
    const { gestor, analista } = await ambiente();
    const cli = (await gestor.chamar("POST", "/clientes", { nome: "A" })).corpo.registro;
    const camp = (await gestor.chamar("POST", "/campanhas", { cliente_id: cli.id, nome: "C", tipo_funil: "low_ticket", data_inicio: "2026-03-01", cpa_alvo: 40 })).corpo.registro;
    const base = { campanha_id: camp.id, periodo_inicio: "2026-03-01", periodo_fim: "2026-03-05" };
    assert.equal((await analista.chamar("POST", "/analises", { ...base, investimento: -5 })).status, 422);
    assert.equal((await analista.chamar("POST", "/analises", { ...base, investimento: "abc" })).status, 422);
    assert.equal((await analista.chamar("POST", "/analises", { ...base, periodo_fim: "2026-02-01", investimento: 5 })).status, 422);
    assert.equal((await analista.chamar("POST", "/analises", { ...base, campo_inventado: 1 })).status, 422);
    assert.equal((await analista.chamar("POST", "/analises", { ...base, campanha_id: "cmp_inexistente1", investimento: 5 })).status, 404);
    assert.equal((await gestor.chamar("POST", "/campanhas", { cliente_id: cli.id, nome: "M", tipo_funil: "medio_ticket", data_inicio: "2026-03-01" })).status, 422);
  });
  test("análises não podem ser editadas; só anuladas (com motivo), preservando o histórico", async () => {
    const { gestor, analista } = await ambiente();
    const cli = (await gestor.chamar("POST", "/clientes", { nome: "A" })).corpo.registro;
    const camp = (await gestor.chamar("POST", "/campanhas", { cliente_id: cli.id, nome: "C", tipo_funil: "low_ticket", data_inicio: "2026-03-01", cpa_alvo: 40 })).corpo.registro;
    const a = (await analista.chamar("POST", "/analises", { campanha_id: camp.id, periodo_inicio: "2026-03-01", periodo_fim: "2026-03-05", investimento: 100, compras: 3 })).corpo.registro;
    assert.equal((await gestor.chamar("PUT", `/analises/${a.id}`, { versao: 1, investimento: 1 })).status, 405);
    assert.equal((await analista.chamar("POST", `/analises/${a.id}/anular`, { versao: 1, motivo: "digitei errado" })).status, 403);
    assert.equal((await gestor.chamar("POST", `/analises/${a.id}/anular`, { versao: 1, motivo: "x" })).status, 422);
    const r = await gestor.chamar("POST", `/analises/${a.id}/anular`, { versao: 1, motivo: "dados digitados errado" });
    assert.equal(r.status, 200); assert.equal(r.corpo.registro.status, "anulada"); assert.equal(r.corpo.registro.investimento, 100);
  });
  test("criação idempotente por ID (reenvio após queda de rede não duplica análise)", async () => {
    const { gestor, analista } = await ambiente();
    const cli = (await gestor.chamar("POST", "/clientes", { nome: "A" })).corpo.registro;
    const camp = (await gestor.chamar("POST", "/campanhas", { cliente_id: cli.id, nome: "C", tipo_funil: "low_ticket", data_inicio: "2026-03-01", cpa_alvo: 40 })).corpo.registro;
    const id = novoId("ana"), corpo = { id, campanha_id: camp.id, periodo_inicio: "2026-03-01", periodo_fim: "2026-03-05", investimento: 100, compras: 3 };
    assert.equal((await analista.chamar("POST", "/analises", corpo)).status, 201);
    assert.equal((await analista.chamar("POST", "/analises", corpo)).status, 200);
    assert.equal((await gestor.chamar("GET", "/analises")).corpo.registros.length, 1);
  });
});

describe("edição simultânea e falhas", () => {
  test("dois usuários editam o mesmo cliente: o segundo recebe 409 com o registro atual", async () => {
    const { gestor, admin } = await ambiente();
    const cli = (await gestor.chamar("POST", "/clientes", { nome: "A" })).corpo.registro;
    assert.equal((await gestor.chamar("PUT", `/clientes/${cli.id}`, { versao: 1, nome: "Do gestor" })).status, 200);
    const r = await admin.chamar("PUT", `/clientes/${cli.id}`, { versao: 1, nome: "Do admin" });
    assert.equal(r.status, 409); assert.equal(r.corpo.codigo, "conflito"); assert.equal(r.corpo.atual.nome, "Do gestor"); assert.equal(r.corpo.atual.versao, 2);
    assert.equal((await gestor.chamar("GET", `/clientes/${cli.id}`)).corpo.registro.nome, "Do gestor");
  });
  test("simultâneo de verdade: 4 usuários, mesma versão → 1 sucesso e 3 conflitos", async () => {
    const adapter = new MemoryAdapter({ latencia: 3 });
    const admin = maquina(adapter); await admin.entrar("admin@mantora.com"); await admin.chamar("POST", "/admin/setup", {});
    const cli = (await admin.chamar("POST", "/clientes", { nome: "A" })).corpo.registro;
    const rs = await Promise.all([1, 2, 3, 4].map((i) => admin.chamar("PUT", `/clientes/${cli.id}`, { versao: 1, nome: `v${i}` })));
    assert.equal(rs.filter((r) => r.status === 200).length, 1); assert.equal(rs.filter((r) => r.status === 409).length, 3);
  });
  test("planilha indisponível → 503 claro, dados intactos; volta ao normal depois", async () => {
    const { adapter, gestor } = await ambiente();
    adapter.falharProximas(50);
    const r = await gestor.chamar("POST", "/clientes", { nome: "Durante a falha" });
    assert.equal(r.status, 503); assert.equal(r.corpo.codigo, "planilha_indisponivel");
    adapter.falharProximas(0);
    assert.equal((await gestor.chamar("GET", "/clientes")).corpo.registros.length, 0);
    assert.equal((await gestor.chamar("POST", "/clientes", { nome: "Depois" })).status, 201);
  });
  test("histórico de alterações registra criação, atualização, conflito e login", async () => {
    const { admin, gestor } = await ambiente();
    const cli = (await gestor.chamar("POST", "/clientes", { nome: "A" })).corpo.registro;
    await gestor.chamar("PUT", `/clientes/${cli.id}`, { versao: 1, nome: "B" });
    await gestor.chamar("PUT", `/clientes/${cli.id}`, { versao: 1, nome: "C" });
    const h = (await admin.chamar("GET", "/historico")).corpo.registros;
    const ops = h.map((x) => `${x.operacao}:${x.resultado}`);
    for (const esperado of ["criar:ok", "atualizar:ok", "atualizar:conflito", "login:ok"]) assert.ok(ops.includes(esperado), esperado);
    const upd = h.find((x) => x.operacao === "atualizar" && x.resultado === "ok" && x.registro_id === cli.id);
    assert.equal(upd.usuario, "gestor@mantora.com"); assert.deepEqual(JSON.parse(upd.valores_novos), { nome: "B" });
    assert.equal((await admin.chamar("POST", "/historico", {})).status, 405);
  });
});

describe("backup, restauração e migração", () => {
  test("exportar → restaurar em planilha nova (prévia, depois aplicação) → sem duplicar", async () => {
    const { gestor, admin } = await ambiente();
    await gestor.chamar("POST", "/clientes", { nome: "Backup 1" }); await gestor.chamar("POST", "/clientes", { nome: "Backup 2" });
    const dump = (await gestor.chamar("GET", "/backup")).corpo;
    assert.equal(dump.abas.CLIENTES.registros.length, 2); assert.equal(dump.abas.USUARIOS, undefined); // gestor não exporta usuários
    const novaPlanilha = new MemoryAdapter(); const adm2 = maquina(novaPlanilha); await adm2.entrar("admin@mantora.com"); await adm2.chamar("POST", "/admin/setup", {});
    const prev = await adm2.chamar("POST", "/backup/restaurar", { dump, dryRun: true });
    assert.equal(prev.corpo.resumo.CLIENTES.a_inserir, 2); assert.equal((await adm2.chamar("GET", "/clientes")).corpo.registros.length, 0);
    await adm2.chamar("POST", "/backup/restaurar", { dump, dryRun: false });
    await adm2.chamar("POST", "/backup/restaurar", { dump, dryRun: false });
    assert.equal((await adm2.chamar("GET", "/clientes")).corpo.registros.length, 2);
    assert.equal((await adm2.chamar("POST", "/backup/restaurar", { dump: { x: 1 } })).status, 422);
  });
  test("migração do localStorage: prévia não grava; aplicar grava; reaplicar não duplica; parâmetros mapeados", async () => {
    const { gestor } = await ambiente();
    const dados = { aprendizados: [{ tipo: "aprendizado", titulo: "Leva 1", dados: { hook: "x" } }, { tipo: "benchmark", titulo: "Concorrente A", dados: {} }], parametros: { preEscalaVendasMin: "5", ctrSaudavel: "1", parametroInexistente: "9" } };
    const prev = (await gestor.chamar("POST", "/migracao/importar", { ...dados, dryRun: true })).corpo;
    assert.equal(prev.aprendizados.a_criar, 2); assert.equal(prev.parametros.a_atualizar, 1); assert.deepEqual(prev.parametros.ignorados, ["parametroInexistente"]);
    assert.equal((await gestor.chamar("GET", "/aprendizados")).corpo.registros.length, 0);
    const ap = (await gestor.chamar("POST", "/migracao/importar", { ...dados, dryRun: false })).corpo;
    assert.equal(ap.aprendizados.criados, 2); assert.equal(ap.parametros.atualizados, 1);
    const de_novo = (await gestor.chamar("POST", "/migracao/importar", { ...dados, dryRun: false })).corpo;
    assert.equal(de_novo.aprendizados.criados, 0); assert.equal(de_novo.aprendizados.ja_existiam, 2);
    assert.equal((await gestor.chamar("GET", "/aprendizados")).corpo.registros.length, 2);
    const cfg = (await gestor.chamar("GET", "/configuracoes")).corpo.registros.find((c) => c.id === "low_ticket.compras_pre_escala_min");
    assert.equal(cfg.valor, 5); assert.equal(cfg.fonte, "usuario");
  });
  test("configurações dos funis são editáveis por gestor e alteram o motor", async () => {
    const { gestor, analista } = await ambiente();
    const cli = (await gestor.chamar("POST", "/clientes", { nome: "A" })).corpo.registro;
    const camp = (await gestor.chamar("POST", "/campanhas", { cliente_id: cli.id, nome: "C", tipo_funil: "low_ticket", data_inicio: "2026-03-01", cpa_alvo: 40 })).corpo.registro;
    const body = { campanha_id: camp.id, periodo_inicio: "2026-03-01", periodo_fim: "2026-03-06", investimento: 150, compras: 5, receita: 600, ...FUNIL };
    const antes = (await analista.chamar("POST", "/analises/preview", body)).corpo.resultado;
    assert.ok(antes.qualidade_dados.itens.length);
    const cfg = (await gestor.chamar("GET", "/configuracoes")).corpo.registros.find((c) => c.id === "low_ticket.dias_teste");
    assert.equal((await gestor.chamar("PUT", `/configuracoes/${cfg.id}`, { versao: cfg.versao, valor: 10, fonte: "cliente" })).status, 200);
    const depois = (await analista.chamar("POST", "/analises/preview", body)).corpo.resultado;
    assert.equal(depois.situacao, "insuficiente"); assert.match(depois.recomendacao.texto, /faltam/);
    assert.equal((await analista.chamar("PUT", `/configuracoes/${cfg.id}`, { versao: 2, valor: 1 })).status, 403);
  });
});
