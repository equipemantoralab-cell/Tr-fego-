// Autorização por perfil. Toda rota protegida consulta esta matriz NO SERVIDOR.
// perfis: admin (tudo) · gestor (operação + configuração) · analista (registra análises/ações) · leitor (somente leitura)
export const PERFIS = ["admin", "gestor", "analista", "leitor"];

const OP = {
  "ler:*": ["admin", "gestor", "analista", "leitor"],
  "ler:HISTORICO_ALTERACOES": ["admin", "gestor"],
  "ler:USUARIOS": ["admin"],

  "criar:CLIENTES": ["admin", "gestor"], "atualizar:CLIENTES": ["admin", "gestor"],
  "criar:PRODUTOS": ["admin", "gestor"], "atualizar:PRODUTOS": ["admin", "gestor"],
  "criar:CAMPANHAS": ["admin", "gestor"], "atualizar:CAMPANHAS": ["admin", "gestor"],
  "criar:ANALISES": ["admin", "gestor", "analista"], "anular:ANALISES": ["admin", "gestor"],
  "criar:DECISOES": ["admin", "gestor", "analista"], "atualizar:DECISOES": ["admin", "gestor", "analista"],
  "criar:CONFIGURACOES_FUNIS": ["admin", "gestor"], "atualizar:CONFIGURACOES_FUNIS": ["admin", "gestor"],
  "criar:APRENDIZADOS": ["admin", "gestor", "analista"], "atualizar:APRENDIZADOS": ["admin", "gestor", "analista"],
  "criar:USUARIOS": ["admin"], "atualizar:USUARIOS": ["admin"],

  "preview:ANALISES": ["admin", "gestor", "analista", "leitor"],
  "backup:exportar": ["admin", "gestor"],
  "backup:restaurar": ["admin"],
  "admin:setup": ["admin"],
  "migracao:importar": ["admin", "gestor"],
};

export function permitido(perfil, operacao, tabela) {
  const chave = tabela ? `${operacao}:${tabela}` : operacao;
  const lista = OP[chave] || OP[`${operacao}:*`];
  return !!lista && lista.includes(perfil);
}
