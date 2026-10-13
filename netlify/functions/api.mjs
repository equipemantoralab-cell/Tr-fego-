// Netlify Function (API). Serve /api/* — ver docs/SETUP.md para as variáveis de ambiente.
import { criarApi } from "../../server/handlers.js";
import { Store } from "../../server/store.js";
import { SheetsAdapter } from "../../server/sheets.js";

const env = (k) => globalThis.Netlify?.env?.get(k) ?? process.env[k];

// Reaproveitado entre invocações "quentes" (cache do token do Google).
let adaptador = null;
const criarStore = () => {
  adaptador ||= new SheetsAdapter({ spreadsheetId: env("GOOGLE_SHEET_ID"), clientEmail: env("GOOGLE_SA_EMAIL"), privateKey: env("GOOGLE_SA_PRIVATE_KEY") });
  return new Store(adaptador);
};
const api = criarApi({ env, criarStore, fetchFn: fetch, seguro: true });

export default async (req) => {
  const url = new URL(req.url);
  const bruto = req.method === "GET" || req.method === "HEAD" ? "" : await req.text();
  let corpo = null;
  if (bruto) { try { corpo = JSON.parse(bruto); } catch { return json(400, { ok: false, erro: "JSON inválido." }); } }
  const r = await api.tratar({
    metodo: req.method, caminho: url.pathname.replace(/^\/api/, ""), query: Object.fromEntries(url.searchParams), corpo, corpoBruto: bruto,
    cookie: req.headers.get("cookie"), headers: Object.fromEntries(req.headers),
  });
  const h = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  for (const c of r.cookies || []) h.append("set-cookie", c);
  return new Response(JSON.stringify(r.corpo), { status: r.status, headers: h });
};
const json = (s, o) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json; charset=utf-8" } });

export const config = { path: "/api/*" };
