import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createSign } from "node:crypto";
import { verificarIdTokenGoogle, criarSessao, lerSessao, lerCookie, cookieSessao, _limparCacheJwks } from "../server/auth.js";
import { permitido } from "../lib/authz.js";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function idToken(over = {}, chave = privateKey) {
  const h = b({ alg: "RS256", kid: "k1", typ: "JWT" });
  const p = b({ iss: "https://accounts.google.com", aud: "cid", exp: Math.floor(Date.now() / 1000) + 600, email: "Ana@Mantora.com", email_verified: true, name: "Ana", sub: "1", ...over });
  const sig = createSign("RSA-SHA256").update(`${h}.${p}`).sign(chave).toString("base64url");
  return `${h}.${p}.${sig}`;
}
const fetchFn = async () => ({ ok: true, json: async () => ({ keys: [jwk] }) });
const v = (t) => verificarIdTokenGoogle(t, { clientId: "cid", fetchFn });

describe("ID token do Google", () => {
  test("aceita token válido e normaliza o e-mail", async () => { _limparCacheJwks(); assert.equal((await v(idToken())).email, "ana@mantora.com"); });
  test("rejeita assinatura de outra chave", async () => { const outra = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey; await assert.rejects(() => v(idToken({}, outra)), /Assinatura/); });
  test("rejeita audiência errada, emissor errado, expirado e e-mail não verificado", async () => {
    await assert.rejects(() => v(idToken({ aud: "outro" })), /Audiência/);
    await assert.rejects(() => v(idToken({ iss: "https://evil.com" })), /Emissor/);
    await assert.rejects(() => v(idToken({ exp: 1 })), /expirada/);
    await assert.rejects(() => v(idToken({ email_verified: false })), /verificado/);
  });
  test("rejeita lixo e algoritmo none", async () => {
    await assert.rejects(() => v("abc"), /inválida/);
    const h = b({ alg: "none", kid: "k1" }), p = b({ aud: "cid" });
    await assert.rejects(() => v(`${h}.${p}.x`), /Algoritmo/);
  });
});

describe("sessão", () => {
  const seg = "x".repeat(40);
  test("assina, lê, expira e detecta adulteração", () => {
    const t = criarSessao({ email: "a@b.com", perfil: "admin" }, seg);
    assert.equal(lerSessao(t, seg).perfil, "admin");
    assert.equal(lerSessao(t, "y".repeat(40)), null);
    const [h, p, s] = t.split("."); const forjado = `${h}.${Buffer.from(JSON.stringify({ email: "a@b.com", perfil: "admin", exp: 9e9 })).toString("base64url")}.${s}`;
    assert.equal(lerSessao(forjado, seg), null);
    assert.equal(lerSessao(t, seg, { agora: () => Date.now() + 5 * 3600e3 }), null);
    assert.throws(() => criarSessao({}, "curto"), /SESSION_SECRET/);
  });
  test("cookie é HttpOnly, Secure e SameSite=Strict", () => {
    const c = cookieSessao("tok");
    assert.ok(c.includes("HttpOnly") && c.includes("Secure") && c.includes("SameSite=Strict"));
    assert.equal(lerCookie("a=1; mt_session=tok; b=2"), "tok");
  });
});

describe("matriz de permissões", () => {
  test("leitor só lê; analista registra análises/ações; só admin gerencia usuários e restaura", () => {
    assert.equal(permitido("leitor", "ler", "CLIENTES"), true);
    assert.equal(permitido("leitor", "criar", "CLIENTES"), false);
    assert.equal(permitido("leitor", "criar", "ANALISES"), false);
    assert.equal(permitido("analista", "criar", "ANALISES"), true);
    assert.equal(permitido("analista", "atualizar", "CAMPANHAS"), false);
    assert.equal(permitido("analista", "anular", "ANALISES"), false);
    assert.equal(permitido("gestor", "criar", "USUARIOS"), false);
    assert.equal(permitido("admin", "criar", "USUARIOS"), true);
    assert.equal(permitido("gestor", "backup", "restaurar"), false);
    assert.equal(permitido("gestor", "backup", "exportar"), true);
    assert.equal(permitido("leitor", "ler", "USUARIOS"), false);
    assert.equal(permitido("leitor", "ler", "HISTORICO_ALTERACOES"), false);
    assert.equal(permitido("desconhecido", "ler", "CLIENTES"), false);
    assert.equal(permitido("admin", "operacao-inexistente", "X"), false);
  });
});
