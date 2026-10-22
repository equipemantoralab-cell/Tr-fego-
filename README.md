# Cascata de Decisão de Tráfego Pago — Mantora Lab

Calculadora do POP v1.0 (Low Ticket, Médio Ticket, High Ticket e Lançamento): você informa os dados do funil e recebe decisão, diagnóstico, evidências e responsável.

- Sem backend e sem banco: dados só no navegador (localStorage).
- `index.html` — interface; `engine.js` — motor puro (regras do POP); `content.js` — tabelas, checklists e fluxos transcritos do POP.
- Números que o POP não define são marcados como *provisórios* e editáveis em Governança → Parâmetros.
- Precisa ser servido por HTTP (ex.: `python3 -m http.server`, GitHub Pages ou Netlify); não abre via `file://`.
- Testes: `node --test test/engine.test.mjs`

## Operação por cliente e campanha

- Seletor de campanhas com números, parâmetros, checklists e aprendizados separados.
- A atualização recupera as chaves `cascata:*` da versão anterior em **Campanha original**, sem removê-las.
- Campanhas novas começam com os exemplos do método. Substitua os números antes de decidir.
- **Exportar backup** baixa todas as campanhas em JSON. **Importar backup** adiciona cópias, preservando as campanhas existentes. Limite de importação: 5 MB / 200 campanhas por arquivo.
- **Ir direto para** abre e focaliza um módulo na aba atual.
- **Imprimir / PDF** imprime a aba aberta com o nome da campanha. Escolha “Salvar como PDF” no navegador.
- Interface neutra, com a marca e a fonte Mantora preservadas; navegação por abas também via setas, Home e End.
- Validação de números negativos, texto em campos numéricos e percentuais fora de 0–100; falhas de salvamento e cópia são informadas.

`workspace.js` gerencia persistência local e validação dos backups. Verificação completa: `node --test test/*.test.mjs`.

### Próxima etapa para comercialização

Esta versão continua local, sem login, cobrança ou sincronização entre usuários/dispositivos. Para comercializar como plataforma compartilhada, a próxima etapa é adicionar contas e organizações, permissões por cliente, banco de dados com isolamento por organização, histórico de alterações e gestão de assinatura. O backup atual permite validar o uso interno antes dessa evolução.
