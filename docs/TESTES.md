# Testes

`npm test` (Node ≥ 20, sem rede). Banco simulado em memória com o mesmo contrato do Google Sheets.

| Cenário exigido | Onde é testado |
|---|---|
| Cadastro e edição de clientes / campanhas | `store.test.mjs`, `api.test.mjs` (fluxo completo), E2E |
| Registro de análises | `api.test.mjs`, E2E (formulário real) |
| Persistência após atualizar a página / outro computador | `api.test.mjs` (“outra máquina”), E2E |
| Atualização por dois usuários | `store.test.mjs` (corrida de 5), `api.test.mjs` (4 usuários), E2E (modal de conflito) |
| Acesso sem autenticação | `api.test.mjs` (401 em todas as rotas), `auth.test.mjs` |
| Alteração sem permissão | `api.test.mjs`, `auth.test.mjs` (matriz), E2E (leitor) |
| Diagnóstico sem vendas / dados insuficientes / por funil | `rules.test.mjs` (4 funis, ~55 casos) |
| CPA, ROAS, margem, simulação | `finance-intel.test.mjs`, `rules.test.mjs` |
| Registro de decisões; conclusão e reavaliação | `api.test.mjs` (CPA 38 → 26) |
| Histórico preservado | `api.test.mjs` (auditoria, anulação), `store.test.mjs` |
| Falha temporária de conexão | `store.test.mjs`, `api.test.mjs` (503), E2E (offline) |
| Exportação e recuperação de backup | `store.test.mjs`, `api.test.mjs`, E2E (download) |
| Divisão por zero, vazios, entradas inválidas | `finance-intel.test.mjs`, `rules.test.mjs`, `api.test.mjs` |

Os testes de ponta a ponta no navegador (Playwright, 22 verificações) usam `server/dev.mjs --seed`; não fazem parte de `npm test` por exigirem navegador.
**Não testado aqui (precisa de credenciais reais):** chamadas ao Google Sheets/Google Login de verdade. O adaptador REST (`server/sheets.js`) segue o mesmo contrato do adaptador de memória, mas deve ser validado no primeiro deploy (ver `PUBLICACAO.md`, passo "verificação").
