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

## Navegação por jornada

A navegação agora segue oito páginas: **Visão geral**, **Clientes e campanhas**, **Planejamento**, **Análise da campanha**, **Plano de ação**, **Testes e aprendizados**, **Relatórios** e **Configurações**.

- O modelo de funil é escolhido no cadastro da campanha. Planejamento e análise exibem somente as ferramentas correspondentes; referências e checklists ficam em Configurações.
- Campanhas novas começam sem números de exemplo. O botão de demonstração cria uma campanha separada com exemplos. Dados de campanhas anteriores permanecem disponíveis, com aviso para conferir o cadastro.
- O cadastro identifica cliente, oferta, objetivo, responsável e ticket. O ticket cadastrado é levado ao planejamento econômico.
- Análises exigem período, cadastro e métricas necessárias. O histórico guarda uma cópia dos números e parâmetros usados e não é alterado pela edição dos campos atuais.
- Em Relatórios, cada diagnóstico pode gerar uma ação vinculada, com responsável e prazo editáveis e status Pendente / Em andamento / Concluída.
- A Visão geral soma campanhas, análises, ações pendentes e atrasadas. Relatórios compara a última análise à anterior da mesma rota; janelas e atribuições devem ser equivalentes.
- **Imprimir / PDF** imprime a página aberta; use Relatórios para exportar o histórico e a execução da campanha.
- `journey.js` concentra as páginas da jornada. O produto continua local, sem autenticação, assinatura ou sincronização.
