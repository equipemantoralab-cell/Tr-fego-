import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { MemoryAdapter } from "../server/memory.js";
import { Store, Conflito, Validacao, NaoEncontrado, RecursoOcupado } from "../server/store.js";
import { novoId } from "../lib/schema.js";

const U = { conta: "ana@mantora.com", perfil: "admin" };
async function novo(opts = {}) {
  const a = new MemoryAdapter(opts.mem);
  const s = new Store(a, { lockEsperaMs: 5, ...opts.store });
  await s.setup(U, { admins: ["ana@mantora.com"] });
  return { a, s };
}

describe("setup / migração de esquema", () => {
  test("cria todas as abas, semeia configurações e admin; é idempotente", async () => {
    const { a, s } = await novo();
    for (const n of ["CLIENTES", "CAMPANHAS", "ANALISES", "DECISOES", "CONFIGURACOES_FUNIS", "PRODUTOS", "HISTORICO_ALTERACOES", "USUARIOS", "_LOCKS", "_META", "DICIONARIO"]) assert.ok(a.abas.has(n), n);
    const cfg1 = (await s.listar("CONFIGURACOES_FUNIS")).length;
    assert.ok(cfg1 > 30);
    const r2 = await s.setup(U, { admins: ["ana@mantora.com"] });
    assert.equal(r2.configsSemeadas, 0); assert.equal(r2.usuariosSemeados, 0); assert.deepEqual(r2.abasCriadas, []);
    assert.equal((await s.listar("CONFIGURACOES_FUNIS")).length, cfg1);
  });
  test("acrescenta colunas novas ao final sem reordenar nem apagar", async () => {
    const { a, s } = await novo();
    const h = a.abas.get("CLIENTES").headers; h.pop(); h.pop(); // simula versão antiga do esquema (sem 2 colunas finais)
    a.abas.get("CLIENTES").headers.push("coluna_manual_da_equipe");
    const r = await s.setup(U);
    assert.ok(r.colunasAcrescentadas.CLIENTES.length === 2);
    assert.ok(a.abas.get("CLIENTES").headers.includes("coluna_manual_da_equipe"));
    assert.ok(r.avisos.some((x) => x.includes("coluna_manual_da_equipe")));
  });
});

describe("clientes: criar, editar, persistência", () => {
  test("cadastro e leitura devolvem os mesmos dados (nulo ≠ zero)", async () => {
    const { s } = await novo();
    const { registro } = await s.criar("CLIENTES", { nome: "Acme", projeto: "Verão", observacoes: "" }, U);
    assert.equal(registro.versao, 1); assert.match(registro.id, /^cli_/);
    const lido = await s.obter("CLIENTES", registro.id);
    assert.equal(lido.nome, "Acme"); assert.equal(lido.observacoes, null); assert.equal(lido.status, "ativo");
  });
  test("validação rejeita obrigatório ausente, enum e campo desconhecido", async () => {
    const { s } = await novo();
    await assert.rejects(() => s.criar("CLIENTES", { projeto: "x" }, U), Validacao);
    await assert.rejects(() => s.criar("CLIENTES", { nome: "x", status: "inexistente" }, U), Validacao);
    await assert.rejects(() => s.criar("CLIENTES", { nome: "x", hack: 1 }, U), Validacao);
  });
  test("criação é idempotente por ID (retentativa não duplica)", async () => {
    const { s } = await novo();
    const id = novoId("cli");
    const r1 = await s.criar("CLIENTES", { nome: "A" }, U, { id });
    const r2 = await s.criar("CLIENTES", { nome: "A" }, U, { id });
    assert.equal(r1.criado, true); assert.equal(r2.criado, false);
    assert.equal((await s.listar("CLIENTES")).length, 1);
  });
  test("criações simultâneas com o mesmo ID geram um único registro", async () => {
    const { s } = await novo({ mem: { latencia: 3 } });
    const id = novoId("cli");
    await Promise.all([1, 2, 3, 4].map(() => s.criar("CLIENTES", { nome: "Dup" }, U, { id })));
    assert.equal((await s.listar("CLIENTES")).length, 1);
  });
  test("atualização incrementa versão e audita diferenças", async () => {
    const { s, a } = await novo();
    const { registro } = await s.criar("CLIENTES", { nome: "A" }, U);
    const r = await s.atualizar("CLIENTES", registro.id, { nome: "B" }, 1, U);
    assert.equal(r.registro.versao, 2); assert.equal(r.registro.nome, "B");
    const hist = await s.listar("HISTORICO_ALTERACOES");
    const ev = hist.find((h) => h.operacao === "atualizar");
    assert.deepEqual(JSON.parse(ev.valores_anteriores), { nome: "A" }); assert.deepEqual(JSON.parse(ev.valores_novos), { nome: "B" });
  });
  test("patch sem mudança não incrementa versão", async () => {
    const { s } = await novo();
    const { registro } = await s.criar("CLIENTES", { nome: "A" }, U);
    const r = await s.atualizar("CLIENTES", registro.id, { nome: "A" }, 1, U);
    assert.equal(r.alterado, false); assert.equal(r.registro.versao, 1);
  });
  test("exige versão e rejeita id inexistente", async () => {
    const { s } = await novo();
    await assert.rejects(() => s.atualizar("CLIENTES", "cli_naoexiste1", { nome: "x" }, 1, U), NaoEncontrado);
    await assert.rejects(() => s.atualizar("CLIENTES", "cli_naoexiste1", { nome: "x" }, undefined, U), Validacao);
  });
});

describe("edição simultânea (dois usuários)", () => {
  test("segunda edição com versão antiga recebe Conflito com o registro atual", async () => {
    const { s } = await novo();
    const { registro } = await s.criar("CLIENTES", { nome: "A" }, U);
    await s.atualizar("CLIENTES", registro.id, { nome: "Do usuário 1" }, 1, U);
    await assert.rejects(() => s.atualizar("CLIENTES", registro.id, { nome: "Do usuário 2" }, 1, { conta: "b@x.com" }),
      (e) => e instanceof Conflito && e.atual.nome === "Do usuário 1" && e.status === 409);
    assert.equal((await s.obter("CLIENTES", registro.id)).nome, "Do usuário 1"); // nada foi sobrescrito
    const hist = await s.listar("HISTORICO_ALTERACOES");
    assert.ok(hist.some((h) => h.resultado === "conflito"));
  });
  test("corrida real: N gravações simultâneas com a mesma versão — exatamente uma vence", async () => {
    const { s } = await novo({ mem: { latencia: 4 } });
    const { registro } = await s.criar("CLIENTES", { nome: "A" }, U);
    const r = await Promise.allSettled([1, 2, 3, 4, 5].map((i) => s.atualizar("CLIENTES", registro.id, { nome: `v${i}` }, 1, U)));
    const ok = r.filter((x) => x.status === "fulfilled"), conf = r.filter((x) => x.status === "rejected" && x.reason instanceof Conflito);
    assert.equal(ok.length, 1, JSON.stringify(r.map((x) => x.status === "rejected" ? x.reason.name : "ok")));
    assert.equal(conf.length, 4);
    assert.equal((await s.obter("CLIENTES", registro.id)).versao, 2);
  });
  test("travas liberadas após cada escrita (não acumulam travas ativas)", async () => {
    const { s, a } = await novo();
    const { registro } = await s.criar("CLIENTES", { nome: "A" }, U);
    await s.atualizar("CLIENTES", registro.id, { nome: "B" }, 1, U);
    assert.ok(a.abas.get("_LOCKS").linhas.every((l) => l[3] === "1"));
  });
  test("trava expirada de instância que caiu não bloqueia para sempre", async () => {
    const { s, a } = await novo({ store: { lockTtlMs: 20 } });
    const { registro } = await s.criar("CLIENTES", { nome: "A" }, U);
    a.abas.get("_LOCKS").linhas.push([`CLIENTES:${registro.id}`, "lk_zumbi", new Date(Date.now() + 30).toISOString(), ""]); // trava ativa de quem morreu
    const r = await s.atualizar("CLIENTES", registro.id, { nome: "B" }, 1, U);
    assert.equal(r.registro.nome, "B");
  });
  test("trava ocupada além das tentativas → RecursoOcupado (503), sem gravar", async () => {
    const { s, a } = await novo({ store: { lockTentativas: 2 } });
    const { registro } = await s.criar("CLIENTES", { nome: "A" }, U);
    a.abas.get("_LOCKS").linhas.push([`CLIENTES:${registro.id}`, "lk_outro", new Date(Date.now() + 60000).toISOString(), ""]);
    await assert.rejects(() => s.atualizar("CLIENTES", registro.id, { nome: "B" }, 1, U), RecursoOcupado);
    assert.equal((await s.obter("CLIENTES", registro.id)).nome, "A");
  });
});

describe("integridade e falhas", () => {
  test("referência inexistente é rejeitada", async () => {
    const { s } = await novo();
    await assert.rejects(() => s.criar("CAMPANHAS", { cliente_id: "cli_inexistente", nome: "C", tipo_funil: "low_ticket", data_inicio: "2026-01-01" }, U), Validacao);
  });
  test("análises são imutáveis via atualização comum", async () => {
    const { s } = await novo();
    const cli = (await s.criar("CLIENTES", { nome: "A" }, U)).registro;
    const cmp = (await s.criar("CAMPANHAS", { cliente_id: cli.id, nome: "C", tipo_funil: "low_ticket", data_inicio: "2026-01-01" }, U)).registro;
    const ana = (await s.criar("ANALISES", { campanha_id: cmp.id, periodo_inicio: "2026-01-01", periodo_fim: "2026-01-03", investimento: 100 }, U)).registro;
    await assert.rejects(() => s.atualizar("ANALISES", ana.id, { investimento: 1 }, 1, U), /imutáveis/);
  });
  test("zero e vazio são diferentes após ida e volta pela planilha", async () => {
    const { s } = await novo();
    const cli = (await s.criar("CLIENTES", { nome: "A" }, U)).registro;
    const cmp = (await s.criar("CAMPANHAS", { cliente_id: cli.id, nome: "C", tipo_funil: "low_ticket", data_inicio: "2026-01-01" }, U)).registro;
    const ana = (await s.criar("ANALISES", { campanha_id: cmp.id, periodo_inicio: "2026-01-01", periodo_fim: "2026-01-03", investimento: 100, compras: 0, leads: "" }, U)).registro;
    const lido = await s.obter("ANALISES", ana.id);
    assert.strictEqual(lido.compras, 0); assert.strictEqual(lido.leads, null); assert.strictEqual(lido.impressoes, null);
  });
  test("falha temporária de conexão: não grava pela metade e funciona ao repetir", async () => {
    const { s, a } = await novo();
    a.falharProximas(1);
    await assert.rejects(() => s.criar("CLIENTES", { nome: "A" }, U), /indispon|falha/i);
    assert.equal((await s.listar("CLIENTES")).length, 0);
    const id = novoId("cli");
    await s.criar("CLIENTES", { nome: "A" }, U, { id });
    assert.equal((await s.listar("CLIENTES")).length, 1);
  });
  test("falha ao auditar não derruba a gravação principal e sinaliza pendência", async () => {
    const { s, a } = await novo();
    const orig = s.registrarEvento.bind(s); s.registrarEvento = async () => { throw new Error("sheets caiu"); };
    const r = await s.criar("CLIENTES", { nome: "A" }, U);
    assert.equal(r.criado, true); assert.equal(r.auditoria_pendente, true);
    s.registrarEvento = orig;
  });
});

describe("backup e restauração", () => {
  test("exporta tudo; restaurar mescla sem sobrescrever e sem duplicar", async () => {
    const { s } = await novo();
    const c1 = (await s.criar("CLIENTES", { nome: "A" }, U)).registro;
    const dump = await s.exportar();
    assert.equal(dump.abas.CLIENTES.registros.length, 1);
    await s.atualizar("CLIENTES", c1.id, { nome: "A editado" }, 1, U);
    const sec = await novo(); // planilha nova e vazia
    const prev = await sec.s.restaurar(dump, U, { dryRun: true });
    assert.equal(prev.resumo.CLIENTES.a_inserir, 1); assert.equal((await sec.s.listar("CLIENTES")).length, 0);
    await sec.s.restaurar(dump, U, { dryRun: false });
    assert.equal((await sec.s.listar("CLIENTES")).length, 1);
    await sec.s.restaurar(dump, U, { dryRun: false }); // repetir não duplica
    assert.equal((await sec.s.listar("CLIENTES")).length, 1);
    // restaurar sobre a planilha original não sobrescreve o dado mais novo
    await s.restaurar(dump, U, { dryRun: false });
    assert.equal((await s.obter("CLIENTES", c1.id)).nome, "A editado");
  });
  test("arquivo inválido é recusado", async () => {
    const { s } = await novo();
    await assert.rejects(() => s.restaurar({ foo: 1 }, U), Validacao);
  });
});
