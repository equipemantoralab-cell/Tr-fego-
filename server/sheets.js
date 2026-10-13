// Adaptador do Google Sheets (API REST v4) com conta de serviço. Sem dependências npm.
// Credenciais: GOOGLE_SA_EMAIL + GOOGLE_SA_PRIVATE_KEY (variáveis de ambiente do Netlify). Nunca vão ao navegador.
import { createSign } from "node:crypto";
import { IndisponivelError } from "./memory.js";

const b64u = (b) => Buffer.from(b).toString("base64url");
export const letraColuna = (n) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const q = (aba) => `'${aba.replace(/'/g, "''")}'`;

export class SheetsAdapter {
  constructor({ spreadsheetId, clientEmail, privateKey, fetchFn = globalThis.fetch, agora = () => Date.now(), timeoutMs = 12000, tentativas = 3 }) {
    if (!spreadsheetId || !clientEmail || !privateKey) throw new Error("Credenciais do Google Sheets ausentes (GOOGLE_SHEET_ID, GOOGLE_SA_EMAIL, GOOGLE_SA_PRIVATE_KEY).");
    this.id = spreadsheetId; this.email = clientEmail;
    this.chave = privateKey.replace(/\\n/g, "\n");
    this.fetch = fetchFn; this.agora = agora; this.timeoutMs = timeoutMs; this.tentativas = tentativas;
    this.token = null; this.tokenExp = 0; this.titulosCache = null;
  }

  async _token() {
    if (this.token && this.agora() < this.tokenExp - 60000) return this.token;
    const t = Math.floor(this.agora() / 1000);
    const cab = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const corpo = b64u(JSON.stringify({ iss: this.email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: t, exp: t + 3600 }));
    const sig = createSign("RSA-SHA256").update(`${cab}.${corpo}`).sign(this.chave).toString("base64url");
    const r = await this._http("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${cab}.${corpo}.${sig}` }) }, false);
    this.token = r.access_token; this.tokenExp = this.agora() + (r.expires_in || 3600) * 1000;
    return this.token;
  }

  async _http(url, init, auth = true) {
    let ultimo;
    for (let i = 0; i < this.tentativas; i++) {
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), this.timeoutMs);
      try {
        const headers = { ...(init.headers || {}) };
        if (auth) headers.authorization = `Bearer ${await this._token()}`;
        const res = await this.fetch(url, { ...init, headers, signal: ctl.signal });
        if (res.status === 429 || res.status >= 500) { ultimo = new IndisponivelError(`Google respondeu ${res.status}`); }
        else {
          const txt = await res.text(); let js = {};
          try { js = txt ? JSON.parse(txt) : {}; } catch { /* corpo não JSON */ }
          if (!res.ok) { const e = new Error(js?.error?.message || `Erro ${res.status} do Google`); e.status = res.status; if (res.status === 401 || res.status === 403) e.name = "AcessoNegadoSheets"; throw e; }
          return js;
        }
      } catch (e) {
        if (e.name === "AcessoNegadoSheets" || e.status) throw e;
        ultimo = new IndisponivelError(e.name === "AbortError" ? "Tempo esgotado ao falar com o Google Sheets" : `Falha de rede: ${e.message}`);
      } finally { clearTimeout(to); }
      await new Promise((r) => setTimeout(r, 300 * 2 ** i + Math.random() * 150));
    }
    throw ultimo;
  }

  _v(path, qs = "") { return `https://sheets.googleapis.com/v4/spreadsheets/${this.id}${path}${qs}`; }

  async _titulos(forcar = false) {
    if (this.titulosCache && !forcar) return this.titulosCache;
    const r = await this._http(this._v("", "?fields=sheets.properties.title"), { method: "GET" });
    this.titulosCache = (r.sheets || []).map((s) => s.properties.title);
    return this.titulosCache;
  }

  async garantirAba(nome, headers) {
    const titulos = await this._titulos();
    let criada = false;
    if (!titulos.includes(nome)) {
      await this._http(this._v(":batchUpdate"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requests: [{ addSheet: { properties: { title: nome, gridProperties: { frozenRowCount: 1 } } } }] }) });
      this.titulosCache.push(nome); criada = true;
      await this._http(this._v(`/values/${encodeURIComponent(`${q(nome)}!A1:${letraColuna(headers.length)}1`)}`, "?valueInputOption=RAW"), { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ values: [headers] }) });
    }
    return { criada };
  }
  async cabecalhos(nome) {
    const r = await this._http(this._v(`/values/${encodeURIComponent(`${q(nome)}!1:1`)}`, "?valueRenderOption=UNFORMATTED_VALUE"), { method: "GET" });
    return r.values?.[0] || null;
  }
  async acrescentarColunas(nome, novas) {
    const atuais = (await this.cabecalhos(nome)) || [];
    const ini = atuais.length + 1;
    await this._http(this._v(`/values/${encodeURIComponent(`${q(nome)}!${letraColuna(ini)}1:${letraColuna(ini + novas.length - 1)}1`)}`, "?valueInputOption=RAW"), { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ values: [novas] }) });
  }
  _parse(vr) { const v = vr?.values || []; return { headers: v[0] || null, linhas: v.slice(1) }; }
  async lerTudo(nome) {
    return this._parse(await this._http(this._v(`/values/${encodeURIComponent(q(nome))}`, "?valueRenderOption=UNFORMATTED_VALUE"), { method: "GET" }));
  }
  async lerVarias(nomes) {
    const qs = "?valueRenderOption=UNFORMATTED_VALUE&" + nomes.map((n) => `ranges=${encodeURIComponent(q(n))}`).join("&");
    const r = await this._http(this._v("/values:batchGet", qs), { method: "GET" });
    const out = {};
    nomes.forEach((n, i) => (out[n] = this._parse(r.valueRanges?.[i])));
    return out;
  }
  async lerFaixa(nome, de, ate) {
    const r = await this._http(this._v(`/values/${encodeURIComponent(`${q(nome)}!A${Math.max(de, 2)}:ZZ${ate}`)}`, "?valueRenderOption=UNFORMATTED_VALUE"), { method: "GET" });
    return (r.values || []).map((valores, i) => ({ linha: Math.max(de, 2) + i, valores }));
  }
  async anexar(nome, linhas) {
    const r = await this._http(this._v(`/values/${encodeURIComponent(`${q(nome)}!A1`)}:append`, "?valueInputOption=RAW&insertDataOption=INSERT_ROWS"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ values: linhas }) });
    const m = /!?[A-Z]+(\d+)(?::[A-Z]+\d+)?$/.exec(r.updates?.updatedRange || "");
    if (!m) throw new Error("Resposta inesperada do Google ao anexar linha");
    return { primeiraLinha: Number(m[1]) };
  }
  async lerLinha(nome, n) {
    const r = await this._http(this._v(`/values/${encodeURIComponent(`${q(nome)}!A${n}:ZZ${n}`)}`, "?valueRenderOption=UNFORMATTED_VALUE"), { method: "GET" });
    return r.values?.[0] || null;
  }
  async escreverLinha(nome, n, valores) {
    await this._http(this._v(`/values/${encodeURIComponent(`${q(nome)}!A${n}:${letraColuna(valores.length)}${n}`)}`, "?valueInputOption=RAW"), { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ values: [valores] }) });
  }
}
