// Esquema das abas da planilha (Google Sheets) — fonte única para servidor e navegador.
// A linha 1 de cada aba guarda as CHAVES técnicas (estáveis). Rótulos em português vivem aqui
// e são publicados na aba DICIONARIO. Colunas novas são sempre acrescentadas ao FINAL (migração segura).

import { CAMPOS_BASE, CAMPOS_DERIVADOS, toNum } from "./metrics.js";

export const ENUMS = {
  status_cliente: ["ativo", "pausado", "encerrado"],
  tipo_funil: ["low_ticket", "medio_ticket", "high_ticket", "lancamento"],
  modelo_funil: ["pagina", "vsl", "quiz", "leads", "comercial"],
  status_campanha: ["em_teste", "ativa", "em_escala", "pausada", "encerrada"],
  fase_lancamento: ["captacao", "aquecimento", "carrinho", "recuperacao", "consolidado"],
  situacao: ["normal", "atencao", "critica", "insuficiente"],
  status_analise: ["valida", "anulada"],
  prioridade: ["baixa", "media", "alta", "critica"],
  decisao_adotada: ["pendente", "aceita", "ajustada", "rejeitada"],
  status_acao: ["pendente", "em_andamento", "concluida", "cancelada", "aguardando_reavaliacao"],
  nivel_evidencia: ["recomendacao", "hipotese", "conclusao"],
  perfil: ["admin", "gestor", "analista", "leitor"],
  status_usuario: ["ativo", "inativo"],
  status_produto: ["ativo", "arquivado"],
  tipo_oferta: ["low_ticket", "medio_ticket", "high_ticket", "lancamento", "outro"],
  tipo_acao: [
    "continuar_teste", "manter", "novos_criativos", "revisar_copy", "revisar_pagina", "revisar_checkout", "revisar_oferta",
    "ajustar_segmentacao", "testar_novo_publico", "reduzir_orcamento", "pausar", "escalar_vertical", "escalar_horizontal",
    "corrigir_rastreio", "melhorar_processo_comercial", "registrar_aprendizado", "outro",
  ],
  operacao: ["criar", "atualizar", "anular", "importar", "restaurar", "setup", "login", "falha_login"],
  resultado_op: ["ok", "conflito", "erro", "negado"],
  fonte_config: ["POP", "provisorio", "cliente", "usuario", "a_definir"],
};

// Rótulos das ações (usados em telas e justificativas)
export const ROTULO_ACAO = {
  continuar_teste: "Continuar teste", manter: "Manter campanha", novos_criativos: "Testar novos criativos", revisar_copy: "Revisar copy",
  revisar_pagina: "Revisar página", revisar_checkout: "Revisar checkout", revisar_oferta: "Revisar oferta",
  ajustar_segmentacao: "Ajustar segmentação", testar_novo_publico: "Testar novo público", reduzir_orcamento: "Reduzir orçamento",
  pausar: "Pausar", escalar_vertical: "Escalar verticalmente (aumentar orçamento)", escalar_horizontal: "Escalar horizontalmente (lateralizar)",
  corrigir_rastreio: "Corrigir rastreio/tecnologia", melhorar_processo_comercial: "Melhorar processo comercial",
  registrar_aprendizado: "Registrar aprendizado", outro: "Outra ação",
};

// tipos: s texto | n número | i inteiro | d data (AAAA-MM-DD) | t data-hora ISO | e enum | b booleano | j JSON (texto) | r referência
// opções: req (obrigatório na criação) · sis (gerido pelo servidor) · der (derivado, calculado pelo servidor) · enum · ref · max
const c = (key, label, tipo, o = {}) => ({ key, label, tipo, ...o });
const SIS = { sis: true };

const SISTEMA_VERSAO = [c("criado_em", "Data de cadastro", "t", SIS), c("atualizado_em", "Data de atualização", "t", SIS), c("versao", "Versão do registro", "i", SIS)];

const base = CAMPOS_BASE.map((k) => c(k, k.replace(/_/g, " "), "n", { min: 0 }));
const derivados = CAMPOS_DERIVADOS.map((k) => c(k, k.replace(/_/g, " "), "n", { der: true }));

export const TABELAS = {
  CLIENTES: {
    aba: "CLIENTES", prefixo: "cli", titulo: "Clientes", mutavel: true,
    colunas: [
      c("id", "ID único", "s", SIS), c("nome", "Nome do cliente", "s", { req: true, max: 200 }), c("projeto", "Nome do projeto", "s", { max: 200 }),
      c("responsavel", "Responsável", "s", { max: 120 }), c("status", "Status", "e", { enum: "status_cliente", def: "ativo" }),
      c("observacoes", "Observações", "s", { max: 4000 }), ...SISTEMA_VERSAO,
    ],
  },
  PRODUTOS: {
    aba: "PRODUTOS", prefixo: "prd", titulo: "Produtos", mutavel: true,
    colunas: [
      c("id", "ID do produto", "s", SIS), c("cliente_id", "ID do cliente", "r", { req: true, ref: "CLIENTES" }), c("nome", "Nome", "s", { req: true, max: 200 }),
      c("tipo_oferta", "Tipo de oferta", "e", { enum: "tipo_oferta", def: "outro" }), c("preco", "Preço", "n", { req: true, min: 0 }),
      c("custo_variavel", "Custo variável por venda", "n", { min: 0 }), c("taxas_pct", "Taxas (% da receita)", "n", { min: 0, max: 100 }),
      c("taxa_fixa", "Taxa fixa por venda", "n", { min: 0 }), c("impostos_pct", "Impostos estimados (%)", "n", { min: 0, max: 100 }),
      c("reembolso_pct", "Reembolso estimado (%)", "n", { min: 0, max: 100 }), c("receita_adicional_media", "Receita adicional média por comprador", "n", { min: 0 }),
      c("margem_estimada", "Margem de contribuição estimada (por venda)", "n", { der: true }), c("cpa_maximo", "CPA máximo", "n", { min: 0 }),
      c("cpa_alvo", "CPA alvo", "n", { min: 0 }), c("status", "Status", "e", { enum: "status_produto", def: "ativo" }), ...SISTEMA_VERSAO,
    ],
  },
  CAMPANHAS: {
    aba: "CAMPANHAS", prefixo: "cmp", titulo: "Campanhas", mutavel: true,
    colunas: [
      c("id", "ID único da campanha", "s", SIS), c("cliente_id", "ID do cliente", "r", { req: true, ref: "CLIENTES" }), c("nome", "Nome da campanha", "s", { req: true, max: 200 }),
      c("tipo_funil", "Tipo de funil", "e", { req: true, enum: "tipo_funil" }), c("modelo_funil", "Modelo (médio ticket)", "e", { enum: "modelo_funil" }),
      c("produto_id", "ID do produto", "r", { ref: "PRODUTOS" }), c("produto_nome", "Nome do produto", "s", { max: 200 }), c("objetivo", "Objetivo da campanha", "s", { max: 500 }),
      c("data_inicio", "Data de início", "d", { req: true }), c("data_fim", "Data de término prevista", "d"),
      c("status", "Status", "e", { enum: "status_campanha", def: "em_teste" }),
      c("orcamento_diario", "Orçamento diário", "n", { min: 0 }), c("orcamento_total", "Orçamento total previsto", "n", { min: 0 }),
      c("cpa_alvo", "CPA alvo", "n", { min: 0 }), c("roas_alvo", "ROAS alvo", "n", { min: 0 }), c("meta_conversoes", "Meta de conversões", "n", { min: 0 }),
      c("cpl_alvo", "CPL alvo", "n", { min: 0 }), c("cpql_alvo", "CPQL alvo", "n", { min: 0 }), c("cac_alvo", "CAC alvo", "n", { min: 0 }),
      c("meta_leads", "Meta de leads (lançamento)", "n", { min: 0 }), c("ciclo_venda_dias", "Ciclo médio de venda (dias)", "n", { min: 0 }),
      c("fase_lancamento", "Fase do lançamento", "e", { enum: "fase_lancamento" }),
      c("responsavel", "Responsável", "s", { max: 120 }), c("observacoes", "Observações", "s", { max: 4000 }), ...SISTEMA_VERSAO,
    ],
  },
  ANALISES: {
    aba: "ANALISES", prefixo: "ana", titulo: "Análises", mutavel: false, // eventos históricos: nunca sobrescritos
    colunas: [
      c("id", "ID da análise", "s", SIS), c("campanha_id", "ID da campanha", "r", { req: true, ref: "CAMPANHAS" }),
      c("criado_em", "Data e horário", "t", SIS), c("periodo_inicio", "Início do período analisado", "d", { req: true }), c("periodo_fim", "Fim do período analisado", "d", { req: true }),
      ...base, ...derivados,
      c("fase_lancamento", "Fase do lançamento (na análise)", "e", { enum: "fase_lancamento" }),
      c("situacao", "Situação", "e", { enum: "situacao", der: true }), c("diagnostico", "Diagnóstico", "s", { der: true, max: 3000 }),
      c("recomendacao", "Recomendação", "s", { der: true, max: 1000 }), c("justificativa", "Justificativa", "s", { der: true, max: 6000 }),
      c("resultado_motor", "Resultado completo do motor (JSON)", "j", { der: true, max: 45000 }), c("versao_motor", "Versão do motor de regras", "s", { der: true }),
      c("responsavel_analise", "Responsável pela análise", "s", { max: 120 }), c("notas", "Notas", "s", { max: 4000 }),
      c("status", "Status", "e", { enum: "status_analise", def: "valida" }), c("motivo_anulacao", "Motivo da anulação", "s", { max: 1000 }),
      c("substitui_id", "Substitui a análise", "s", {}), c("atualizado_em", "Data de atualização", "t", SIS), c("versao", "Versão do registro", "i", SIS),
    ],
  },
  DECISOES: {
    aba: "DECISOES", prefixo: "dec", titulo: "Decisões e plano de ação", mutavel: true,
    colunas: [
      c("id", "ID da decisão", "s", SIS), c("analise_id", "ID da análise", "r", { ref: "ANALISES" }), c("campanha_id", "ID da campanha", "r", { req: true, ref: "CAMPANHAS" }),
      c("cliente_id", "ID do cliente", "r", { ref: "CLIENTES" }), c("criado_em", "Data", "t", SIS),
      c("tipo_acao", "Tipo de ação", "e", { req: true, enum: "tipo_acao" }), c("problema", "Problema identificado", "s", { max: 2000 }),
      c("acao_recomendada", "Ação recomendada", "s", { max: 2000 }), c("descricao", "Descrição da ação", "s", { req: true, max: 2000 }),
      c("nivel_evidencia", "Nível de evidência", "e", { enum: "nivel_evidencia" }), c("prioridade", "Prioridade", "e", { enum: "prioridade", def: "media" }),
      c("decisao_adotada", "Decisão adotada", "e", { enum: "decisao_adotada", def: "pendente" }), c("justificativa", "Justificativa", "s", { max: 4000 }),
      c("responsavel", "Responsável", "s", { max: 120 }), c("status", "Status", "e", { enum: "status_acao", def: "pendente" }),
      c("prazo", "Prazo", "d"), c("data_execucao", "Data de execução", "d"), c("data_conclusao", "Data de conclusão", "d"),
      c("data_reavaliacao", "Data prevista para reavaliação", "d"), c("resultado_esperado", "Resultado esperado", "s", { max: 2000 }),
      c("resultado_observado", "Resultado observado", "s", { max: 2000 }), c("conclusao_reavaliacao", "Conclusão da reavaliação", "s", { max: 4000 }),
      c("desempenho_antes", "Desempenho antes (JSON)", "j", { max: 8000 }), c("desempenho_depois", "Desempenho depois (JSON)", "j", { max: 8000 }),
      c("atualizado_em", "Data de atualização", "t", SIS), c("versao", "Versão do registro", "i", SIS),
    ],
  },
  CONFIGURACOES_FUNIS: {
    aba: "CONFIGURACOES_FUNIS", prefixo: "cfg", titulo: "Configurações dos funis", mutavel: true, idNatural: true, // id = "<funil>.<chave>"
    colunas: [
      c("id", "ID (funil.chave)", "s", SIS), c("tipo_funil", "Tipo de funil", "s", { req: true }), c("chave", "Chave", "s", { req: true, max: 80 }),
      c("valor", "Valor", "n"), c("unidade", "Unidade", "s", { max: 20 }), c("fonte", "Fonte", "e", { enum: "fonte_config", def: "provisorio" }),
      c("descricao", "Descrição", "s", { max: 500 }), c("atualizado_por", "Atualizado por", "s", SIS),
      c("atualizado_em", "Data de atualização", "t", SIS), c("versao", "Versão do registro", "i", SIS),
    ],
  },
  APRENDIZADOS: {
    aba: "APRENDIZADOS", prefixo: "apr", titulo: "Aprendizados e benchmarks", mutavel: true,
    colunas: [
      c("id", "ID", "s", SIS), c("tipo", "Tipo", "s", { req: true, max: 40 }), c("titulo", "Título", "s", { max: 300 }), c("dados", "Dados (JSON)", "j", { max: 20000 }),
      c("origem", "Origem", "s", { max: 40 }), c("usuario", "Usuário", "s", SIS), ...SISTEMA_VERSAO,
    ],
  },
  USUARIOS: {
    aba: "USUARIOS", prefixo: "usr", titulo: "Usuários", mutavel: true,
    colunas: [
      c("id", "ID", "s", SIS), c("nome", "Nome", "s", { req: true, max: 120 }), c("conta", "Identificador da conta (e-mail Google)", "s", { req: true, max: 200 }),
      c("perfil", "Perfil de acesso", "e", { req: true, enum: "perfil" }), c("status", "Status", "e", { enum: "status_usuario", def: "ativo" }), ...SISTEMA_VERSAO,
    ],
  },
  HISTORICO_ALTERACOES: {
    aba: "HISTORICO_ALTERACOES", prefixo: "evt", titulo: "Histórico de alterações", mutavel: false, somenteLeituraApi: true,
    colunas: [
      c("id", "ID do evento", "s", SIS), c("ts", "Data e horário", "t", SIS), c("usuario", "Usuário", "s", {}), c("operacao", "Tipo de operação", "e", { enum: "operacao" }),
      c("entidade", "Entidade alterada", "s", {}), c("registro_id", "ID do registro", "s", {}),
      c("valores_anteriores", "Valores anteriores relevantes (JSON)", "j", { max: 20000 }), c("valores_novos", "Valores novos relevantes (JSON)", "j", { max: 20000 }),
      c("resultado", "Resultado da operação", "e", { enum: "resultado_op" }), c("detalhe", "Detalhe", "s", { max: 1000 }),
    ],
  },
};

// Abas técnicas (fora do CRUD): travas de concorrência, metadados e dicionário
export const ABAS_TECNICAS = {
  _LOCKS: { colunas: ["recurso", "token", "expira_em", "liberado"] },
  _META: { colunas: ["chave", "valor"] },
  DICIONARIO: { colunas: ["aba", "chave", "rotulo", "tipo", "descricao"] },
};
export const VERSAO_ESQUEMA = 3;

export const colunasDe = (tabela) => TABELAS[tabela].colunas.map((x) => x.key);
export const col = (tabela, key) => TABELAS[tabela].colunas.find((x) => x.key === key);

const ISO_DATA = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TS = /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/;
const dataValida = (s) => ISO_DATA.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`)) && new Date(`${s}T12:00:00Z`).toISOString().startsWith(s);

/**
 * Valida e normaliza dados de entrada para uma tabela.
 * modo "criar": exige campos req e aplica padrões. modo "atualizar": só os campos presentes (patch).
 * Campos de sistema/derivados são ignorados (o servidor os define). Devolve {valor, erros}.
 */
export function validarRegistro(tabela, dados, modo = "criar") {
  const def = TABELAS[tabela];
  const erros = [], valor = {};
  if (!def) return { valor, erros: [`tabela desconhecida: ${tabela}`] };
  if (typeof dados !== "object" || dados === null || Array.isArray(dados)) return { valor, erros: ["corpo inválido"] };
  for (const k of Object.keys(dados)) if (!def.colunas.some((x) => x.key === k)) erros.push(`campo desconhecido: ${k}`);
  for (const cd of def.colunas) {
    if (cd.sis || cd.der) continue;
    const presente = Object.prototype.hasOwnProperty.call(dados, cd.key);
    if (!presente) {
      if (modo === "criar") {
        if (cd.req) erros.push(`${cd.label} é obrigatório`);
        else if (cd.def !== undefined) valor[cd.key] = cd.def;
      }
      continue;
    }
    let v = dados[cd.key];
    if (v === "" || v === undefined) v = null;
    if (v === null) {
      if (cd.req) erros.push(`${cd.label} é obrigatório`);
      else valor[cd.key] = null;
      continue;
    }
    switch (cd.tipo) {
      case "n": case "i": {
        const n = toNum(v);
        if (n === null || Number.isNaN(n)) { erros.push(`${cd.label}: número inválido`); break; }
        if (cd.tipo === "i" && !Number.isInteger(n)) { erros.push(`${cd.label}: deve ser inteiro`); break; }
        if (cd.min !== undefined && n < cd.min) { erros.push(`${cd.label}: mínimo ${cd.min}`); break; }
        if (cd.max !== undefined && n > cd.max) { erros.push(`${cd.label}: máximo ${cd.max}`); break; }
        valor[cd.key] = n; break;
      }
      case "d": if (typeof v === "string" && dataValida(v)) valor[cd.key] = v; else erros.push(`${cd.label}: data inválida (use AAAA-MM-DD)`); break;
      case "t": if (typeof v === "string" && ISO_TS.test(v)) valor[cd.key] = v; else erros.push(`${cd.label}: data/hora inválida`); break;
      case "b": if (typeof v === "boolean") valor[cd.key] = v; else erros.push(`${cd.label}: deve ser verdadeiro/falso`); break;
      case "e": if (ENUMS[cd.enum].includes(v)) valor[cd.key] = v; else erros.push(`${cd.label}: valor inválido (${ENUMS[cd.enum].join(", ")})`); break;
      case "j": {
        const txt = typeof v === "string" ? v : JSON.stringify(v);
        if (cd.max && txt.length > cd.max) erros.push(`${cd.label}: muito grande`); else valor[cd.key] = txt; break;
      }
      default: {
        if (typeof v !== "string" && typeof v !== "number") { erros.push(`${cd.label}: texto inválido`); break; }
        const t = String(v).trim();
        if (cd.max && t.length > cd.max) erros.push(`${cd.label}: máximo ${cd.max} caracteres`);
        else valor[cd.key] = t;
      }
    }
  }
  return { valor, erros };
}

/** Linha da planilha (array) a partir de um objeto, na ordem dos cabeçalhos. null → célula vazia. */
export function paraLinha(headers, obj) {
  return headers.map((h) => (obj[h] === null || obj[h] === undefined ? "" : obj[h]));
}

/** Objeto a partir de uma linha da planilha. Célula vazia → null; número/booleano preservados. */
export function deLinha(headers, linha, tabela) {
  const o = {};
  headers.forEach((h, i) => {
    let v = linha?.[i];
    if (v === "" || v === undefined || v === null) { o[h] = null; return; }
    const cd = tabela ? col(tabela, h) : null;
    if (cd && (cd.tipo === "n" || cd.tipo === "i") && typeof v === "string") { const n = toNum(v); v = Number.isNaN(n) ? v : n; }
    if (cd && cd.tipo === "s" && typeof v === "number") v = String(v);
    o[h] = v;
  });
  return o;
}

/** Gera ID estável e único: prefixo + tempo base36 + aleatório. Funciona no navegador e no Node. */
export function novoId(prefixo) {
  const rnd = (globalThis.crypto?.getRandomValues ? Array.from(globalThis.crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(36).padStart(2, "0")).join("") : Math.random().toString(36).slice(2, 12));
  return `${prefixo}_${Date.now().toString(36)}${rnd}`.slice(0, 40);
}
