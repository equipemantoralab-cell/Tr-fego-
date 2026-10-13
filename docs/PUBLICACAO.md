# Publicação e rollback

## Estratégia
- A versão anterior (calculadora v1, 100% estática) está na `main` @ `697a17d` e na tag `v1-calculadora`.
- A nova versão vive na branch `evolucao-sheets`. **Não entra na `main` até aprovação.**
- No Netlify, a URL de deploy da branch (`evolucao-sheets--trafegotest.netlify.app`) permite validar sem tocar na produção. Cadastre-a nas "Origens JavaScript autorizadas" do OAuth.

## Passo a passo
1. Configure Google + variáveis (`SETUP.md`).
2. Faça o deploy da branch; abra a URL; entre com um administrador.
3. **Verificação** (primeiro uso real do Google Sheets): Configurações → *Preparar / verificar a planilha*; cadastre um cliente e uma campanha; registre uma análise; confira na planilha as linhas em `CLIENTES`, `ANALISES` e `HISTORICO_ALTERACOES`; abra o site em outro navegador/computador e confirme os mesmos dados.
4. Teste o conflito: abra o mesmo cliente em dois navegadores, salve nos dois.
5. Baixe um backup (Configurações → Dados e backup).
6. Aprovado: merge da branch na `main` (deploy de produção).

## Rollback
- **Imediato (Netlify):** Deploys → selecione o último deploy bom → *Publish deploy*. Não depende de Git.
- **Via Git:** `git revert -m 1 <merge>` na `main`, ou republique a tag `v1-calculadora`.
- **Dados:** a planilha não é alterada por rollback de código. O backup JSON restaura (apenas acrescenta) registros ausentes.
- Sem as variáveis de ambiente, o site abre em "não configurado" e a calculadora do POP continua acessível em `#/calculadora-local` (modo local, como na v1).
