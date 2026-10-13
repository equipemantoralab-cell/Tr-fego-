// Cliente da API. Toda comunicação com a planilha passa pelo backend; nada é gravado só no navegador.
export class ApiErro extends Error {
  constructor(status, corpo) { super(corpo?.erro || `Erro ${status}`); this.status = status; this.codigo = corpo?.codigo || null; this.atual = corpo?.atual || null; this.erros = corpo?.erros || null; }
  get conflito() { return this.status === 409; }
  get offline() { return this.status === 0 || this.status === 503 || this.status === 502; }
}

const ouvintes = new Set();
export const aoMudarRede = (fn) => { ouvintes.add(fn); return () => ouvintes.delete(fn); };
let pendentes = 0;
const avisar = (estado, extra) => ouvintes.forEach((f) => f({ pendentes, estado, ...extra }));

async function pedir(metodo, caminho, corpo, { tentativas = 1, timeoutMs = 25000 } = {}) {
  let ultimo;
  for (let i = 0; i < tentativas; i++) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
    pendentes++; avisar("trabalhando");
    try {
      const r = await fetch(`/api${caminho}`, {
        method: metodo, credentials: "same-origin", signal: ctl.signal,
        headers: { "x-requested-with": "cascata", ...(corpo !== undefined ? { "content-type": "application/json" } : {}) },
        body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      });
      let js = null; try { js = await r.json(); } catch { js = null; }
      if (!r.ok) throw new ApiErro(r.status, js || {});
      return js;
    } catch (e) {
      ultimo = e instanceof ApiErro ? e : new ApiErro(0, { erro: e.name === "AbortError" ? "Tempo esgotado. Verifique sua conexão." : "Sem conexão com o servidor.", codigo: "sem_conexao" });
      if (!(ultimo.offline) || metodo !== "GET" || i === tentativas - 1) break;
      await new Promise((res) => setTimeout(res, 600 * 2 ** i));
    } finally { clearTimeout(t); pendentes--; avisar(pendentes ? "trabalhando" : "ocioso"); }
  }
  avisar(ultimo.offline ? "offline" : "erro", { erro: ultimo });
  throw ultimo;
}

export const api = {
  config: () => pedir("GET", "/config"),
  entrar: (credential) => pedir("POST", "/auth/login", { credential }),
  sair: () => pedir("POST", "/auth/logout", {}),
  eu: () => pedir("GET", "/auth/me"),
  bootstrap: () => pedir("GET", "/bootstrap", undefined, { tentativas: 3 }),
  listar: (ent) => pedir("GET", `/${ent}`, undefined, { tentativas: 3 }),
  obter: (ent, id) => pedir("GET", `/${ent}/${id}`, undefined, { tentativas: 2 }),
  criar: (ent, corpo) => pedir("POST", `/${ent}`, corpo),
  atualizar: (ent, id, corpo) => pedir("PUT", `/${ent}/${id}`, corpo),
  acao: (ent, id, acao, corpo) => pedir("POST", `/${ent}/${id}/${acao}`, corpo || {}),
  comparacao: (id) => pedir("GET", `/decisoes/${id}/comparacao`),
  preview: (corpo) => pedir("POST", "/analises/preview", corpo),
  backup: () => pedir("GET", "/backup", undefined, { timeoutMs: 60000 }),
  restaurar: (dump, dryRun, incluirUsuarios) => pedir("POST", "/backup/restaurar", { dump, dryRun, incluirUsuarios }, { timeoutMs: 120000 }),
  setup: () => pedir("POST", "/admin/setup", {}, { timeoutMs: 120000 }),
  importar: (corpo) => pedir("POST", "/migracao/importar", corpo, { timeoutMs: 120000 }),
  devToken: (email) => pedir("GET", `/dev/token?email=${encodeURIComponent(email)}`),
};

/** ID gerado no navegador: permite repetir a criação sem duplicar (idempotência no servidor). */
export function novoId(prefixo) {
  const a = Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(36).padStart(2, "0")).join("");
  return `${prefixo}_${Date.now().toString(36)}${a}`.slice(0, 40);
}
