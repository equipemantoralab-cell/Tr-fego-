# Configuração (Google Sheets + Netlify)

O sistema precisa de 4 coisas no Google e 6 variáveis no Netlify. Tempo estimado: 20–30 min. **Nada disto é feito pelo código**: são credenciais da sua conta.

## 1. Planilha (banco de dados compartilhado)
1. Crie uma planilha **vazia e privada** em sua conta Google (ex.: "Cascata Mantora — Dados").
2. Copie o **ID** da URL: `https://docs.google.com/spreadsheets/d/`**`ESTE_TRECHO`**`/edit` → variável `GOOGLE_SHEET_ID`.
3. Não compartilhe com "qualquer pessoa com o link". Só a conta de serviço (passo 2) terá acesso.

## 2. Conta de serviço (o servidor lê/escreve a planilha)
1. [Google Cloud Console](https://console.cloud.google.com) → crie/seleciona um projeto → **APIs e serviços → Biblioteca → Google Sheets API → Ativar**.
2. **IAM e administrador → Contas de serviço → Criar** (ex.: `cascata-sheets`). Não precisa de papéis do projeto.
3. Na conta criada: **Chaves → Adicionar chave → JSON**. Baixe o arquivo.
4. Do JSON, use apenas dois campos:
   - `client_email` → `GOOGLE_SA_EMAIL`
   - `private_key` → `GOOGLE_SA_PRIVATE_KEY` (cole o texto inteiro, com `-----BEGIN…-----`; as quebras `\n` literais também funcionam)
5. **Compartilhe a planilha** com o e-mail da conta de serviço como **Editor**.
6. Guarde/apague o JSON baixado em local seguro; ele não deve ir para o Git.

> Limite do Netlify: todas as variáveis juntas devem ter ~4 KB. Por isso **não** cole o JSON inteiro em uma variável; use só e-mail + chave privada.

## 3. Login (Google Identity Services)
1. Cloud Console → **APIs e serviços → Tela de consentimento OAuth**: tipo **Interno** (Workspace) ou **Externo** em modo de teste com os e-mails da equipe como testadores.
2. **Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web.**
3. **Origens JavaScript autorizadas**: `https://trafegotest.netlify.app` (e, para testar branches, a URL de deploy, ex.: `https://evolucao-sheets--trafegotest.netlify.app`).
4. Copie o **ID do cliente** → `GOOGLE_CLIENT_ID` (é público; o segredo do cliente **não** é usado).

## 4. Variáveis de ambiente no Netlify
Site → **Site configuration → Environment variables** (escopo **Functions** habilitado):

| Variável | Valor |
|---|---|
| `GOOGLE_SHEET_ID` | ID da planilha |
| `GOOGLE_SA_EMAIL` | `client_email` da conta de serviço |
| `GOOGLE_SA_PRIVATE_KEY` | `private_key` da conta de serviço |
| `GOOGLE_CLIENT_ID` | ID do cliente OAuth |
| `SESSION_SECRET` | texto aleatório com 32+ caracteres (`openssl rand -base64 48`) |
| `ADMIN_EMAILS` | e-mails (Google) dos primeiros administradores, separados por vírgula |

Variáveis só valem para deploys feitos **depois** de salvas: faça um novo deploy.

## 5. Primeiro acesso
1. Abra o site → entre com uma conta de `ADMIN_EMAILS`.
2. **Configurações → Dados e backup → Preparar / verificar a planilha** (cria as 11 abas, colunas, dicionário e parâmetros padrão; pode ser repetido).
3. **Configurações → Usuários**: cadastre a equipe (conta Google + perfil). Perfis: administrador, gestor, analista, leitor.
4. **Configurações → Parâmetros dos funis**: revise os valores `provisório` e preencha os `a definir` com o histórico real de cada cliente.
5. **Migração** (se usava a calculadora v1 neste navegador): **Dados e backup → Migração**: baixar cópia → ver prévia → importar. Nada local é apagado.

## Desenvolvimento local
```
node server/dev.mjs --seed      # planilha EM MEMÓRIA com dados de exemplo; login simulado (somente local)
npm test                        # testes automatizados (sem rede)
```
O servidor `server/dev.mjs` **nunca** deve ser publicado; a produção usa `netlify/functions/api.mjs`.
