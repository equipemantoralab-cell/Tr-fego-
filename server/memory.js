// Adaptador em memória com o MESMO contrato do Google Sheets. Usado em testes e desenvolvimento.
// Simula: numeração de linhas (1 = cabeçalho), latência assíncrona (para expor corridas) e falhas de conexão.

export class IndisponivelError extends Error {
  constructor(msg = "Google Sheets indisponível") { super(msg); this.name = "IndisponivelError"; }
}

export class MemoryAdapter {
  constructor({ latencia = 0 } = {}) {
    this.abas = new Map(); // nome -> { headers: [], linhas: [[]] }
    this.latencia = latencia;
    this.falhasPendentes = 0;
    this.chamadas = 0;
  }
  async _tick() {
    this.chamadas++;
    if (this.falhasPendentes > 0) { this.falhasPendentes--; throw new IndisponivelError("falha simulada de conexão"); }
    if (this.latencia) await new Promise((r) => setTimeout(r, Math.random() * this.latencia));
    else await new Promise((r) => setImmediate(r));
  }
  falharProximas(n) { this.falhasPendentes = n; }

  async garantirAba(nome, headers) {
    await this._tick();
    let criada = false;
    if (!this.abas.has(nome)) { this.abas.set(nome, { headers: [...headers], linhas: [] }); criada = true; }
    return { criada };
  }
  async cabecalhos(nome) { await this._tick(); return this.abas.get(nome)?.headers ? [...this.abas.get(nome).headers] : null; }
  async acrescentarColunas(nome, novas) { await this._tick(); this.abas.get(nome).headers.push(...novas); }
  async lerTudo(nome) {
    await this._tick();
    const a = this.abas.get(nome);
    if (!a) return { headers: null, linhas: [] };
    return { headers: [...a.headers], linhas: a.linhas.map((l) => [...l]) };
  }
  async lerVarias(nomes) {
    await this._tick();
    const o = {};
    for (const n of nomes) { const a = this.abas.get(n); o[n] = a ? { headers: [...a.headers], linhas: a.linhas.map((l) => [...l]) } : { headers: null, linhas: [] }; }
    return o;
  }
  /** linhas de dados entre os números de linha da planilha [de, ate] (inclusive; dados começam na linha 2) */
  async lerFaixa(nome, de, ate) {
    await this._tick();
    const a = this.abas.get(nome);
    const out = [];
    for (let r = Math.max(de, 2); r <= ate; r++) if (a.linhas[r - 2]) out.push({ linha: r, valores: [...a.linhas[r - 2]] });
    return out;
  }
  async anexar(nome, linhas) {
    await this._tick();
    const a = this.abas.get(nome);
    const primeiraLinha = a.linhas.length + 2;
    for (const l of linhas) a.linhas.push([...l]);
    return { primeiraLinha };
  }
  async lerLinha(nome, n) { await this._tick(); const l = this.abas.get(nome).linhas[n - 2]; return l ? [...l] : null; }
  async escreverLinha(nome, n, valores) { await this._tick(); this.abas.get(nome).linhas[n - 2] = [...valores]; }
}
