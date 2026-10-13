// Autenticação: Google Identity Services (ID token) verificado NO SERVIDOR + sessão própria assinada (cookie HttpOnly).
// Nenhuma senha é armazenada. O navegador nunca recebe credenciais da conta de serviço.
import { createHmac, createPublicKey, createVerify, timingSafeEqual } from "node:crypto";

const b64uJson = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const fromB64u = (s) => Buffer.from(s, "base64url");

let jwksCache = { chaves: null, exp: 0 };
const GOOGLE_JWKS = "https://www.googleapis.com/oauth2/v3/certs";

export class ErroAuth extends Error { constructor(msg, status = 401) { super(msg); this.status = status; this.name = "ErroAuth"; } }

/** Verifica o ID token do Google (assinatura RS256, emissor, audiência, validade, e-mail verificado). */
export async function verificarIdTokenGoogle(credential, { clientId, fetchFn = globalThis.fetch, agora = () => Date.now() }) {
  if (!clientId) throw new ErroAuth("GOOGLE_CLIENT_ID não configurado", 500);
  if (typeof credential !== "string" || credential.split(".").length !== 3) throw new ErroAuth("Credencial inválida");
  const [h, p, s] = credential.split(".");
  let cab, corpo;
  try { cab = JSON.parse(fromB64u(h).toString()); corpo = JSON.parse(fromB64u(p).toString()); } catch { throw new ErroAuth("Credencial malformada"); }
  if (cab.alg !== "RS256") throw new ErroAuth("Algoritmo não aceito");
  if (!jwksCache.chaves || agora() > jwksCache.exp) {
    const r = await fetchFn(GOOGLE_JWKS);
    if (!r.ok) throw new ErroAuth("Não foi possível validar a credencial agora", 503);
    jwksCache = { chaves: (await r.json()).keys || [], exp: agora() + 3600e3 };
  }
  const jwk = jwksCache.chaves.find((k) => k.kid === cab.kid);
  if (!jwk) { jwksCache = { chaves: null, exp: 0 }; throw new ErroAuth("Chave de assinatura desconhecida"); }
  const ok = createVerify("RSA-SHA256").update(`${h}.${p}`).verify(createPublicKey({ key: jwk, format: "jwk" }), fromB64u(s));
  if (!ok) throw new ErroAuth("Assinatura inválida");
  if (!["https://accounts.google.com", "accounts.google.com"].includes(corpo.iss)) throw new ErroAuth("Emissor inválido");
  if (corpo.aud !== clientId) throw new ErroAuth("Audiência inválida");
  if (!(corpo.exp * 1000 > agora())) throw new ErroAuth("Credencial expirada");
  if (corpo.email_verified !== true && corpo.email_verified !== "true") throw new ErroAuth("E-mail não verificado");
  return { email: String(corpo.email).toLowerCase(), nome: corpo.name || corpo.email, sub: corpo.sub };
}
export const _limparCacheJwks = () => { jwksCache = { chaves: null, exp: 0 }; };

// ---- sessão (JWT HS256 próprio)
export function criarSessao(dados, segredo, { ttlSeg = 4 * 3600, agora = () => Date.now() } = {}) {
  if (!segredo || segredo.length < 32) throw new ErroAuth("SESSION_SECRET ausente ou curto (mínimo 32 caracteres)", 500);
  const t = Math.floor(agora() / 1000);
  const cab = b64uJson({ alg: "HS256", typ: "JWT" }), corpo = b64uJson({ ...dados, iat: t, exp: t + ttlSeg });
  const sig = createHmac("sha256", segredo).update(`${cab}.${corpo}`).digest("base64url");
  return `${cab}.${corpo}.${sig}`;
}
export function lerSessao(token, segredo, { agora = () => Date.now() } = {}) {
  if (!token || !segredo) return null;
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  const esperado = createHmac("sha256", segredo).update(`${partes[0]}.${partes[1]}`).digest();
  const dado = fromB64u(partes[2]);
  if (dado.length !== esperado.length || !timingSafeEqual(dado, esperado)) return null;
  try {
    const c = JSON.parse(fromB64u(partes[1]).toString());
    return c.exp * 1000 > agora() ? c : null;
  } catch { return null; }
}
export const cookieSessao = (token, { ttlSeg = 4 * 3600, seguro = true } = {}) => `mt_session=${token}; HttpOnly; ${seguro ? "Secure; " : ""}SameSite=Strict; Path=/; Max-Age=${ttlSeg}`;
export const cookieLimpo = (seguro = true) => `mt_session=; HttpOnly; ${seguro ? "Secure; " : ""}SameSite=Strict; Path=/; Max-Age=0`;
export function lerCookie(cabecalhoCookie, nome = "mt_session") {
  if (!cabecalhoCookie) return null;
  for (const par of cabecalhoCookie.split(";")) { const [k, ...v] = par.trim().split("="); if (k === nome) return v.join("="); }
  return null;
}
