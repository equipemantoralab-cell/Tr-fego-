// Camada de dados sobre a planilha: validação, IDs, versionamento otimista, trava de escrita e trilha de auditoria.
//
// Concorrência (a planilha não tem transações): toda escrita faz  lock -> ler -> conferir versão -> gravar -> unlock.
// A trava é uma LINHA anexada na aba _LOCKS. O Google serializa os anexos, então a ordem das linhas decide quem
// detém a trava (o mais antigo não expirado). Isso dá exclusão mútua real entre instâncias da função.
import { TABELAS, ABAS_TECNICAS, VERSAO_ESQUEMA, validarRegistro, paraLinha, deLinha, colunasDe, novoId, col } from "../lib/schema.js";
import { CONFIG_PADRAO } from "../lib/config-defaults.js";

export class ErroNegocio extends Error { constructor(msg, status = 400, extra = {}) { super(msg); this.status = status; Object.assign(this, extra); } }
export class Validacao extends ErroNegocio { constructor(erros) { super(erros.join("; "), 422, { erros }); this.name = "Validacao"; } }
export class NaoEncontrado extends ErroNegocio { constructor(t, id) { super(`${t} ${id} não encontrado`, 404); this.name = "NaoEncontrado"; } }
export class Conflito extends ErroNegocio { constructor(atual, msg) { super(msg || "O registro foi alterado por outra pessoa. Recarregue e tente de novo.", 409, { atual }); this.name = "Conflito"; } }
export class PlanilhaNaoPreparada extends ErroNegocio { constructor(aba) { super(`A planilha ainda não foi preparada${aba ? ` (aba ${aba} ausente)` : ""}. Um administrador deve executar “Preparar planilha”.`, 409, { codigo: "planilha_nao_preparada" }); this.name = "PlanilhaNaoPreparada"; } }
export class RecursoOcupado extends ErroNegocio { constructor() { super("Outra gravação está em andamento neste registro. Tente novamente em instantes.", 503); this.name = "RecursoOcupado"; } }

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const ID_OK = (prefixo) => new RegExp(`^${prefixo}_[a-z0-9]{6,40}$`);

export class Store {
  constructor(adapter, { agora = () => new Date().toISOString(), lockTtlMs = 15000, lockTentativas = 8, lockEsperaMs = 200 } = {}) {
    this.a = adapter; this.agora = agora; this.ttl = lockTtlMs; this.tentativas = lockTentativas; this.espera = lockEsperaMs;
  }

  // ---------------------------------------------------------------- leitura
  async _ler(tabela) {
    const def = TABELAS[tabela];
    const { headers, linhas } = await this.a.lerTudo(def.aba);
    if (!headers) throw new PlanilhaNaoPreparada(def.aba);
    return { headers, linhas };
  }
  _objs(tabela, headers, linhas) {
    return linhas.map((l, i) => ({ ...deLinha(headers, l, tabela), __linha: i + 2 })).filter((o) => o.id !== null && o.id !== undefined);
  }
  async listar(tabela) {
    const { headers, linhas } = await this._ler(tabela);
    return this._objs(tabela, headers, linhas).map(({ __linha, ...o }) => o);
  }
  async listarVarias(tabelas) {
    const r = await this.a.lerVarias(tabelas.map((t) => TABELAS[t].aba));
    const out = {};
    for (const t of tabelas) {
      const { headers, linhas } = r[TABELAS[t].aba];
      if (!headers) throw new PlanilhaNaoPreparada(TABELAS[t].aba);
      out[t] = this._objs(t, headers, linhas).map(({ __linha, ...o }) => o);
    }
    return out;
  }
  async obter(tabela, id) {
    const { headers, linhas } = await this._ler(tabela);
    const o = this._objs(tabela, headers, linhas).find((x) => String(x.id) === String(id));
    if (!o) throw new NaoEncontrado(tabela, id);
    const { __linha, ...r } = o; return r;
  }

  // ---------------------------------------------------------------- trava de escrita
  async _adquirir(recurso) {
    const token = novoId("lk");
    for (let i = 0; i < this.tentativas; i++) {
      const exp = new Date(Date.now() + this.ttl).toISOString();
      const { primeiraLinha } = await this.a.anexar("_LOCKS", [[recurso, token, exp, ""]]);
      const faixa = await this.a.lerFaixa("_LOCKS", primeiraLinha - 60, primeiraLinha);
      const agora = Date.now();
      const ativos = faixa.filter((f) => f.valores[0] === recurso && !f.valores[3] && Date.parse(f.valores[2]) > agora).sort((x, y) => x.linha - y.linha);
      if (ativos[0]?.valores[1] === token) return { recurso, token, linha: primeiraLinha, exp };
      await this.a.escreverLinha("_LOCKS", primeiraLinha, [recurso, token, exp, "1"]); // desiste desta tentativa
      await dormir(this.espera * (1 + i) + Math.random() * this.espera);
    }
    throw new RecursoOcupado();
  }
  async _liberar(l) { try { await this.a.escreverLinha("_LOCKS", l.linha, [l.recurso, l.token, l.exp, "1"]); } catch { /* expira sozinha */ } }
  async comTrava(recurso, fn) {
    const l = await this._adquirir(recurso);
    try { return await fn(); } finally { await this._liberar(l); }
  }

  // ---------------------------------------------------------------- auditoria
  async registrarEvento(e) {
    const def = TABELAS.HISTORICO_ALTERACOES;
    const obj = { id: novoId("evt"), ts: this.agora(), usuario: e.usuario || "sistema", operacao: e.operacao, entidade: e.entidade || "", registro_id: e.registro_id || "",
      valores_anteriores: e.antes ? JSON.stringify(e.antes).slice(0, 20000) : null, valores_novos: e.depois ? JSON.stringify(e.depois).slice(0, 20000) : null,
      resultado: e.resultado || "ok", detalhe: (e.detalhe || "").slice(0, 1000) };
    const headers = (await this.a.cabecalhos(def.aba)) || colunasDe("HISTORICO_ALTERACOES");
    await this.a.anexar(def.aba, [paraLinha(headers, obj)]);
  }
  /** Audita sem nunca derrubar a operação principal (já gravada). Devolve true se registrou. */
  async _auditar(e) { try { await this.registrarEvento(e); return true; } catch (err) { console.error("auditoria falhou", err?.message); return false; } }

  // ---------------------------------------------------------------- escrita
  async _checarRefs(tabela, valor) {
    for (const cd of TABELAS[tabela].colunas) {
      if (cd.tipo !== "r" || !cd.ref || valor[cd.key] == null) continue;
      const { headers, linhas } = await this._ler(cd.ref);
      const i = headers.indexOf("id");
      if (!linhas.some((l) => String(l[i]) === String(valor[cd.key]))) throw new Validacao([`${cd.label}: registro ${valor[cd.key]} não existe em ${cd.ref}`]);
    }
  }

  /**
   * Cria um registro. Idempotente por ID: repetir a mesma criação (retentativa de rede) não duplica.
   * `sistema` permite ao servidor injetar campos derivados (ex.: métricas e diagnóstico das análises).
   */
  async criar(tabela, dados, usuario, { id, sistema = {} } = {}) {
    const def = TABELAS[tabela];
    if (!def) throw new ErroNegocio(`Tabela inválida: ${tabela}`);
    const { valor, erros } = validarRegistro(tabela, dados, "criar");
    if (erros.length) throw new Validacao(erros);
    let rid = id;
    if (def.idNatural) rid = `${valor.tipo_funil}.${valor.chave}`;
    else if (!rid) rid = novoId(def.prefixo);
    else if (!ID_OK(def.prefixo).test(rid)) throw new Validacao([`ID inválido (esperado ${def.prefixo}_xxxxxx)`]);
    await this._checarRefs(tabela, valor);

    return this.comTrava(`${def.aba}:${rid}`, async () => {
      const { headers, linhas } = await this._ler(tabela);
      const iId = headers.indexOf("id");
      const existente = linhas.find((l) => String(l[iId]) === rid);
      if (existente) { const o = deLinha(headers, existente, tabela); return { registro: o, criado: false }; }
      const t = this.agora();
      const obj = { ...valor, ...sistema, id: rid, criado_em: t, atualizado_em: t, versao: 1 };
      if (tabela === "CONFIGURACOES_FUNIS" || tabela === "APRENDIZADOS") obj.atualizado_por = usuario?.conta, obj.usuario = usuario?.conta;
      await this.a.anexar(def.aba, [paraLinha(headers, obj)]);
      const aud = await this._auditar({ usuario: usuario?.conta, operacao: "criar", entidade: tabela, registro_id: rid, depois: this._relevante(obj) });
      return { registro: obj, criado: true, auditoria_pendente: !aud };
    });
  }

  _relevante(o) { const r = {}; for (const [k, v] of Object.entries(o)) if (v !== null && v !== "" && !["resultado_motor"].includes(k)) r[k] = typeof v === "string" && v.length > 300 ? v.slice(0, 300) + "…" : v; return r; }

  /**
   * Atualiza (patch) com controle de versão otimista. `versaoEsperada` é obrigatória.
   * Em caso de divergência lança Conflito com o registro atual, para a tela mostrar e recarregar.
   */
  async atualizar(tabela, id, patch, versaoEsperada, usuario, { sistema = {}, permitido } = {}) {
    const def = TABELAS[tabela];
    if (!def) throw new ErroNegocio(`Tabela inválida: ${tabela}`);
    if (!Number.isInteger(versaoEsperada)) throw new Validacao(["versao é obrigatória para atualizar"]);
    const { valor, erros } = validarRegistro(tabela, patch, "atualizar");
    if (erros.length) throw new Validacao(erros);
    if (def.mutavel === false && !permitido) throw new ErroNegocio(`${def.titulo} são imutáveis (registros históricos).`, 405);
    if (def.idNatural) delete valor.tipo_funil, delete valor.chave;
    await this._checarRefs(tabela, valor);

    return this.comTrava(`${def.aba}:${id}`, async () => {
      const { headers, linhas } = await this._ler(tabela);
      const iId = headers.indexOf("id");
      const idx = linhas.findIndex((l) => String(l[iId]) === String(id));
      if (idx < 0) throw new NaoEncontrado(tabela, id);
      const atual = deLinha(headers, linhas[idx], tabela);
      if (Number(atual.versao) !== versaoEsperada) {
        await this._auditar({ usuario: usuario?.conta, operacao: "atualizar", entidade: tabela, registro_id: id, resultado: "conflito", detalhe: `esperada v${versaoEsperada}, atual v${atual.versao}` });
        throw new Conflito(atual);
      }
      const antes = {}, depois = {};
      for (const [k, v] of Object.entries({ ...valor, ...sistema })) if (JSON.stringify(atual[k] ?? null) !== JSON.stringify(v ?? null)) { antes[k] = atual[k] ?? null; depois[k] = v ?? null; }
      if (Object.keys(depois).length === 0) return { registro: atual, alterado: false };
      const novo = { ...atual, ...depois, atualizado_em: this.agora(), versao: Number(atual.versao) + 1 };
      if (tabela === "CONFIGURACOES_FUNIS") novo.atualizado_por = usuario?.conta;
      const numero = idx + 2;
      const conferir = await this.a.lerLinha(def.aba, numero); // protege contra reordenação manual da planilha
      if (!conferir || String(conferir[iId]) !== String(id)) throw new Conflito(atual, "A planilha foi reorganizada durante a gravação. Recarregue e tente de novo.");
      await this.a.escreverLinha(def.aba, numero, paraLinha(headers, novo));
      const aud = await this._auditar({ usuario: usuario?.conta, operacao: depois.status === "anulada" ? "anular" : "atualizar", entidade: tabela, registro_id: id, antes, depois });
      return { registro: novo, alterado: true, auditoria_pendente: !aud };
    });
  }

  // ---------------------------------------------------------------- configuração inicial e migração de esquema
  /**
   * Cria abas que faltam, acrescenta colunas novas ao FINAL (nunca remove/reordena) e semeia configurações padrão.
   * Seguro para rodar várias vezes.
   */
  async setup(usuario, { admins = [] } = {}) {
    const relatorio = { abasCriadas: [], colunasAcrescentadas: {}, configsSemeadas: 0, usuariosSemeados: 0, avisos: [] };
    for (const [nome, def] of Object.entries(TABELAS)) {
      const esperado = def.colunas.map((x) => x.key);
      const { criada } = await this.a.garantirAba(def.aba, esperado);
      if (criada) { relatorio.abasCriadas.push(def.aba); continue; }
      const atuais = (await this.a.cabecalhos(def.aba)) || [];
      const faltam = esperado.filter((k) => !atuais.includes(k));
      if (faltam.length) { await this.a.acrescentarColunas(def.aba, faltam); relatorio.colunasAcrescentadas[def.aba] = faltam; }
      const desconhecidas = atuais.filter((k) => !esperado.includes(k));
      if (desconhecidas.length) relatorio.avisos.push(`${def.aba}: colunas não previstas preservadas (${desconhecidas.join(", ")})`);
    }
    for (const [nome, def] of Object.entries(ABAS_TECNICAS)) { const { criada } = await this.a.garantirAba(nome, def.colunas); if (criada) relatorio.abasCriadas.push(nome); }

    // dicionário legível (substitui o conteúdo gerado; é derivado do esquema)
    const dic = [];
    for (const [nome, def] of Object.entries(TABELAS)) for (const cd of def.colunas) dic.push([def.aba, cd.key, cd.label, cd.tipo, cd.der ? "calculado pelo sistema" : cd.sis ? "gerido pelo sistema" : cd.req ? "obrigatório" : ""]);
    const atualDic = await this.a.lerTudo("DICIONARIO");
    if (atualDic.linhas.length !== dic.length) {
      const base = atualDic.linhas.length;
      if (base === 0) await this.a.anexar("DICIONARIO", dic);
      else relatorio.avisos.push("DICIONARIO já existe com tamanho diferente; não foi regravado (apague as linhas para regenerar).");
    }
    const meta = await this.a.lerTudo("_META");
    if (!meta.linhas.some((l) => l[0] === "versao_esquema")) await this.a.anexar("_META", [["versao_esquema", VERSAO_ESQUEMA], ["criado_em", this.agora()]]);

    // configurações padrão (não sobrescreve valores já existentes)
    const cfgAtual = new Set((await this.listar("CONFIGURACOES_FUNIS")).map((x) => x.id));
    for (const cfg of CONFIG_PADRAO) {
      const id = `${cfg.tipo_funil}.${cfg.chave}`;
      if (cfgAtual.has(id)) continue;
      await this.criar("CONFIGURACOES_FUNIS", cfg, usuario); relatorio.configsSemeadas++;
    }
    // administradores iniciais
    const usuarios = await this.listar("USUARIOS");
    for (const email of admins) {
      if (usuarios.some((u) => u.conta?.toLowerCase() === email.toLowerCase())) continue;
      await this.criar("USUARIOS", { nome: email.split("@")[0], conta: email.toLowerCase(), perfil: "admin" }, usuario); relatorio.usuariosSemeados++;
    }
    await this._auditar({ usuario: usuario?.conta, operacao: "setup", entidade: "planilha", detalhe: JSON.stringify(relatorio).slice(0, 900) });
    return relatorio;
  }

  // ---------------------------------------------------------------- backup / restauração
  async exportar() {
    const abas = {};
    const nomes = Object.keys(TABELAS);
    const dados = await this.listarVarias(nomes);
    for (const n of nomes) abas[n] = { colunas: colunasDe(n), registros: dados[n] };
    return { formato: "cascata-mantora-backup", versao_esquema: VERSAO_ESQUEMA, gerado_em: this.agora(), abas };
  }
  /**
   * Restaura MESCLANDO: só insere IDs ausentes; nunca sobrescreve nem apaga. dryRun mostra o que seria feito.
   */
  async restaurar(dump, usuario, { dryRun = true, incluirUsuarios = false } = {}) {
    if (dump?.formato !== "cascata-mantora-backup" || typeof dump.abas !== "object") throw new Validacao(["arquivo de backup inválido"]);
    const resumo = {};
    const tabelas = Object.keys(TABELAS).filter((t) => dump.abas[t] && (incluirUsuarios || t !== "USUARIOS") && t !== "HISTORICO_ALTERACOES");
    for (const t of tabelas) {
      const def = TABELAS[t];
      const { headers, linhas } = await this._ler(t);
      const iId = headers.indexOf("id");
      const existentes = new Set(linhas.map((l) => String(l[iId])));
      const novos = (dump.abas[t].registros || []).filter((r) => r?.id && !existentes.has(String(r.id)));
      resumo[t] = { no_backup: (dump.abas[t].registros || []).length, ja_existem: (dump.abas[t].registros || []).length - novos.length, a_inserir: novos.length };
      if (!dryRun && novos.length) {
        await this.a.anexar(def.aba, novos.map((r) => paraLinha(headers, r)));
      }
    }
    if (!dryRun) await this._auditar({ usuario: usuario?.conta, operacao: "restaurar", entidade: "planilha", detalhe: JSON.stringify(resumo).slice(0, 900) });
    return { dryRun, resumo };
  }
}
