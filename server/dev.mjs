// Servidor de DESENVOLVIMENTO/TESTE local: serve os arquivos estáticos e a API com uma planilha EM MEMÓRIA.
// NUNCA usar em produção (login simulado). Uso: node server/dev.mjs [--seed] [--port 8788]
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { generateKeyPairSync, createSign } from "node:crypto";
import { MemoryAdapter } from "./memory.js";
import { Store } from "./store.js";
import { criarApi } from "./handlers.js";
import { _limparCacheJwks } from "./auth.js";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const porta = Number(process.argv.includes("--port") ? process.argv[process.argv.indexOf("--port") + 1] : 8788);
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "dev", alg: "RS256", use: "sig" };
const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const tokenDev = (email) => { const h = b({ alg: "RS256", kid: "dev" }), p = b({ iss: "accounts.google.com", aud: "dev-client", exp: Math.floor(Date.now() / 1000) + 600, email, email_verified: true, name: email.split("@")[0] }); return `${h}.${p}.${createSign("RSA-SHA256").update(`${h}.${p}`).sign(privateKey).toString("base64url")}`; };
const ENV = { GOOGLE_CLIENT_ID: "dev-client", SESSION_SECRET: "dev".repeat(20), ADMIN_EMAILS: "admin@mantora.com", GOOGLE_SHEET_ID: "dev", GOOGLE_SA_EMAIL: "dev", GOOGLE_SA_PRIVATE_KEY: "dev" };
export const adaptador = new MemoryAdapter();
const api = criarApi({ env: (k) => ENV[k], criarStore: () => new Store(adaptador, { lockEsperaMs: 5 }), fetchFn: async () => ({ ok: true, json: async () => ({ keys: [jwk] }) }), seguro: false, ttlUsuariosMs: 0 });

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml" };

async function semear() {
  _limparCacheJwks();
  let cookie = null;
  const ch = async (metodo, caminho, corpo) => { const r = await api.tratar({ metodo, caminho, corpo, cookie, headers: { "x-requested-with": "cascata", "content-type": "application/json" } }); const s = r.cookies?.find((c) => c.startsWith("mt_session=")); if (s) cookie = s.split(";")[0]; if (r.status >= 400) throw new Error(`${metodo} ${caminho}: ${JSON.stringify(r.corpo)}`); return r.corpo; };
  await ch("POST", "/auth/login", { credential: tokenDev("admin@mantora.com") });
  await ch("POST", "/admin/setup", {});
  for (const [n, e, p] of [["Gestora", "gestor@mantora.com", "gestor"], ["Analista", "analista@mantora.com", "analista"], ["Leitor", "leitor@mantora.com", "leitor"]]) await ch("POST", "/usuarios", { nome: n, conta: e, perfil: p });
  const cli = (await ch("POST", "/clientes", { nome: "Studio Aurora", projeto: "Lançamentos 2026", responsavel: "Bia" })).registro;
  const cli2 = (await ch("POST", "/clientes", { nome: "Clínica Vida", projeto: "Captação premium", responsavel: "Caio" })).registro;
  const prod = (await ch("POST", "/produtos", { cliente_id: cli.id, nome: "Curso Express", tipo_oferta: "low_ticket", preco: 97, custo_variavel: 4, taxas_pct: 5, impostos_pct: 6, reembolso_pct: 5, receita_adicional_media: 14, cpa_alvo: 45 })).registro;
  const lt = (await ch("POST", "/campanhas", { cliente_id: cli.id, produto_id: prod.id, nome: "Curso Express — Conversão", tipo_funil: "low_ticket", data_inicio: "2026-03-01", status: "em_teste", orcamento_diario: 150, cpa_alvo: 45, roas_alvo: 2.5, responsavel: "Bia" })).registro;
  const ht = (await ch("POST", "/campanhas", { cliente_id: cli2.id, nome: "Consulta Premium — Leads", tipo_funil: "high_ticket", data_inicio: "2026-02-01", status: "ativa", cac_alvo: 1500, cpl_alvo: 70, ciclo_venda_dias: 30, responsavel: "Caio" })).registro;
  const ln = (await ch("POST", "/campanhas", { cliente_id: cli.id, nome: "Lançamento Maio", tipo_funil: "lancamento", data_inicio: "2026-03-01", data_fim: "2026-03-14", status: "ativa", fase_lancamento: "captacao", cpl_alvo: 3.5, meta_leads: 10000, cac_alvo: 200, meta_conversoes: 200, responsavel: "Bia" })).registro;
  const FUNIL = { impressoes: 100000, cliques: 1800, cliques_link: 1500, visitas_pagina: 1350, inicios_checkout: 300 };
  const A = (campanha_id, ini, fim, extra) => ch("POST", "/analises", { campanha_id, periodo_inicio: ini, periodo_fim: fim, ...extra });
  await A(lt.id, "2026-03-01", "2026-03-07", { investimento: 380, compras: 10, receita: 970, receita_order_bumps: 140, ...FUNIL });
  const a2 = (await A(lt.id, "2026-03-08", "2026-03-14", { investimento: 520, compras: 9, receita: 873, ...FUNIL, inicios_checkout: 200 })).registro;
  const dec = (await ch("POST", "/decisoes", { campanha_id: lt.id, analise_id: a2.id, tipo_acao: "novos_criativos", descricao: "Substituir criativos de menor CTR", problema: "CPA acima da meta após a semana 2", prioridade: "alta", responsavel: "Copy", status: "em_andamento", data_execucao: "2026-03-15", prazo: "2026-03-17", nivel_evidencia: "hipotese", resultado_esperado: "CPA abaixo de R$ 45" })).registro;
  await ch("POST", "/decisoes", { campanha_id: ht.id, tipo_acao: "melhorar_processo_comercial", descricao: "Rever SLA de primeiro contato", prioridade: "critica", responsavel: "Comercial", status: "pendente", prazo: "2026-03-10" });
  await A(lt.id, "2026-03-16", "2026-03-22", { investimento: 300, compras: 9, receita: 873, receita_order_bumps: 90, ...FUNIL });
  await A(ht.id, "2026-02-01", "2026-03-10", { investimento: 5200, custo_comercial: 800, leads: 140, leads_qualificados: 52, agendamentos: 30, comparecimentos: 22, vendas_comercial: 2 });
  await A(ln.id, "2026-03-01", "2026-03-06", { investimento: 9000, leads: 3000, impressoes: 900000, cliques_link: 15000 });
  return { lt, ht, ln, dec };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--seed")) await semear().then(() => console.log("dados de exemplo carregados")); 
  else { _limparCacheJwks(); }
  http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
      if (url.pathname.startsWith("/api/")) {
        const chunks = []; for await (const c of req) chunks.push(c); const bruto = Buffer.concat(chunks).toString();
        let caminho = url.pathname.replace(/^\/api/, "");
        if (caminho === "/dev/token") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ ok: true, credential: tokenDev(url.searchParams.get("email") || "admin@mantora.com") })); }
        let r = await api.tratar({ metodo: req.method, caminho, query: {}, corpo: bruto ? JSON.parse(bruto) : null, corpoBruto: bruto, cookie: req.headers.cookie, headers: req.headers });
        if (caminho === "/config") r = { ...r, corpo: { ...r.corpo, devLogin: true, configurado: true } };
        const h = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
        if (r.cookies?.length) h["set-cookie"] = r.cookies;
        res.writeHead(r.status, h); return res.end(JSON.stringify(r.corpo));
      }
      let p = normalize(join(RAIZ, url.pathname === "/" ? "index.html" : url.pathname));
      if (!p.startsWith(RAIZ) || p.includes("/.git") || p.includes("/node_modules")) { res.writeHead(403); return res.end(); }
      const dado = await readFile(p); res.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" }); res.end(dado);
    } catch (e) { res.writeHead(e.code === "ENOENT" ? 404 : 500); res.end(e.code === "ENOENT" ? "não encontrado" : String(e.message)); }
  }).listen(porta, () => console.log(`dev em http://localhost:${porta}`));
}
export { semear };
