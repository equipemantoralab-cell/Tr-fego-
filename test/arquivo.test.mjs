import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ArquivoAdapter } from "../server/arquivo.js";
import { Store } from "../server/store.js";

const U = { conta: "local@pc", perfil: "admin" };

test("modo arquivo local: dados sobrevivem a reiniciar o programa; arquivo nunca fica pela metade", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cascata-"));
  const caminho = join(dir, "dados", "cascata.json");
  const s1 = new Store(new ArquivoAdapter(caminho), { lockEsperaMs: 2 });
  await s1.setup(U, { admins: [] });
  const { registro } = await s1.criar("CLIENTES", { nome: "Cliente local" }, U);
  await s1.atualizar("CLIENTES", registro.id, { projeto: "P1" }, 1, U);
  const bruto = JSON.parse(readFileSync(caminho, "utf8")); // JSON válido a qualquer momento
  assert.equal(bruto.formato, "cascata-mantora-local"); assert.ok(!existsSync(`${caminho}.tmp`));
  // "reinicia": novo adaptador lendo o mesmo arquivo
  const s2 = new Store(new ArquivoAdapter(caminho), { lockEsperaMs: 2 });
  const lido = await s2.obter("CLIENTES", registro.id);
  assert.equal(lido.nome, "Cliente local"); assert.equal(lido.projeto, "P1"); assert.equal(lido.versao, 2);
  assert.ok((await s2.listar("CONFIGURACOES_FUNIS")).length > 30);
  await assert.rejects(() => s2.atualizar("CLIENTES", registro.id, { nome: "x" }, 1, U), /alterado/); // controle de versão segue valendo
});
