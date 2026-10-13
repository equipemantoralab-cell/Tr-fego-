// Adaptador de ARQUIVO LOCAL: mesmo contrato da planilha, persistindo em um JSON no disco.
// Uso: uma pessoa, um computador (modo "sem planilha"). Não é compartilhado entre computadores.
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { MemoryAdapter } from "./memory.js";

export class ArquivoAdapter extends MemoryAdapter {
  constructor(caminho, opts) {
    super(opts);
    this.caminho = caminho;
    if (existsSync(caminho)) {
      const j = JSON.parse(readFileSync(caminho, "utf8"));
      for (const [nome, a] of Object.entries(j.abas || {})) this.abas.set(nome, { headers: a.headers, linhas: a.linhas });
    }
  }
  get vazio() { return this.abas.size === 0; }
  _salvar() {
    mkdirSync(dirname(this.caminho), { recursive: true });
    const tmp = `${this.caminho}.tmp`;
    writeFileSync(tmp, JSON.stringify({ formato: "cascata-mantora-local", salvo_em: new Date().toISOString(), abas: Object.fromEntries(this.abas) }));
    renameSync(tmp, this.caminho); // troca atômica: nunca deixa o arquivo pela metade
  }
  async garantirAba(n, h) { const r = await super.garantirAba(n, h); if (r.criada) this._salvar(); return r; }
  async acrescentarColunas(n, c) { await super.acrescentarColunas(n, c); this._salvar(); }
  async anexar(n, l) { const r = await super.anexar(n, l); this._salvar(); return r; }
  async escreverLinha(n, i, v) { await super.escreverLinha(n, i, v); this._salvar(); }
}
