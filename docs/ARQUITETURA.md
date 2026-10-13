# Arquitetura, segurança e limitações

```
Navegador (app/*.js, estático)  ──/api/*──▶  Netlify Function (netlify/functions/api.mjs)
        │                                         │ sessão (cookie HttpOnly) + perfil revalidado a cada chamada
        │ lib/ (regras e cálculos, isomórficos)   ▼
        └─ pré-visualização local            server/store.js  ──▶ Google Sheets API (conta de serviço)
```
- **`lib/`** — regras puras usadas no navegador (prévia) e no servidor (valor oficial gravado): `metrics.js` (derivadas), `rules.js` (motor), `finance.js`, `intel.js`, `schema.js`, `config-defaults.js`.
- **`server/`** — `handlers.js` (rotas), `store.js` (persistência), `sheets.js`/`memory.js` (adaptadores), `auth.js`/`authz.js`.
- **`app/`** — interface; `calc.js` é a calculadora do POP v1, preservada.

## Abas da planilha
`CLIENTES, PRODUTOS, CAMPANHAS, ANALISES, DECISOES (plano de ação), CONFIGURACOES_FUNIS, APRENDIZADOS, USUARIOS, HISTORICO_ALTERACOES` + técnicas `_LOCKS, _META, DICIONARIO` (rótulos e tipos de cada coluna).
A linha 1 guarda chaves técnicas estáveis. Colunas novas entram **sempre no final**; o servidor mapeia por nome, não por posição.

## Segurança
- Planilha privada, compartilhada só com a conta de serviço. Credenciais só em variáveis de ambiente do servidor.
- Login Google: o **servidor** valida o ID token (assinatura RS256, emissor, audiência, validade, e-mail verificado) e emite sessão própria (JWT HS256, cookie `HttpOnly; Secure; SameSite=Strict`, 4 h).
- **Autorização no backend** (`lib/authz.js`): perfil e status do usuário são relidos da aba USUARIOS a cada requisição (cache de 30 s); desativar/rebaixar vale quase na hora.
- Escritas exigem cabeçalho `X-Requested-With`, `Content-Type: application/json` e origem igual ao host (proteção CSRF).
- Validação de tipos, limites, enums e referências no servidor; campos desconhecidos são rejeitados; textos nunca viram HTML no navegador.
- Sem exclusão: análises são imutáveis (só "anulação" com motivo); nada é apagado automaticamente.
- Auditoria: toda criação/atualização/anulação/importação/restauração/login (e falhas) vai para `HISTORICO_ALTERACOES`.

## Concorrência (a planilha não tem transações)
1. Cada registro tem `versao`. Atualizar exige a versão lida; divergência → HTTP 409 com o registro atual e tela de resolução (descartar ou reaplicar sobre a versão atual). Nada é sobrescrito em silêncio.
2. Cada escrita faz `lock → ler → conferir versão → gravar → liberar`. A trava é uma linha anexada em `_LOCKS`; o Google serializa os anexos, então o dono é o mais antigo não expirado (TTL 15 s, expira sozinho se a função cair).
3. Criação idempotente: o ID nasce no navegador; repetir o envio não duplica.
4. Antes de gravar, relê a linha e confere o `id` (protege contra reordenação manual).

## Dados ausentes
Vazio = "não informado" (`null`); `0` = zero. Divisão por zero/null → métrica indefinida (nunca 0 nem ∞). Análise sem a conversão do período (compras/leads/vendas) é marcada como insuficiente, e análises anteriores sem ela são excluídas do acumulado para não inflar CPA/CPL/CAC. Agregações do dashboard são **ponderadas** (Σ numerador ÷ Σ denominador).

## Motor de decisão
Determinístico, sem IA externa, versão `1.0.0` gravada em cada análise. Passos: métrica-mãe → qualidade dos dados → comparação com meta → gargalo → métricas secundárias → recomendação → justificativa → verificações antes de executar. Cada afirmação é marcada **conclusão** (dado suficiente), **hipótese** (causa provável) ou **recomendação** (ação sugerida). Escala nunca é recomendada sem: janela de teste cumprida, compras mínimas, análises consecutivas na meta e ROAS no alvo. Parâmetros editáveis em Configurações; fontes: `POP` (número do documento), `provisorio`, `a definir` (regra desativada).

## Limitações (Google Sheets como banco)
- Sem transações reais; a trava reduz, mas não elimina, janelas de corrida extremas (ex.: relógio dos servidores).
- Cota da API: ~60 leituras/gravações por minuto por conta de serviço. Cada escrita usa 5–8 chamadas; uso intenso simultâneo causa lentidão (o sistema exibe "planilha indisponível" e permite repetir).
- Todos os dados são carregados no navegador: ideal até alguns milhares de análises. Depois, arquivar campanhas ou migrar para um banco (a camada `server/store.js` é o único ponto a trocar).
- Edições manuais na planilha não são validadas nem auditadas; não reordene/apague linhas nem altere a linha 1.
- O código do frontend é público (estático); apenas os **dados** são protegidos. Limites de taxa (rate limit) não estão implementados no app: configure no Netlify se necessário.
- A auditoria é gravada **depois** da escrita principal; se falhar, a gravação permanece e a falha fica no log do servidor.
- Offline: leitura do último instantâneo; nenhuma escrita é feita ou enfileirada.
