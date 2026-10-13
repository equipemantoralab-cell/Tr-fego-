# Rodar no seu computador (modo local, sem planilha)

Serve para **uma pessoa, um computador**. Os dados ficam num arquivo da sua pasta. Não é compartilhado com a equipe (isso vem com o Google Sheets — ver `docs/SETUP.md`).

## Passo a passo
1. **Instale o Node.js (versão LTS)**: https://nodejs.org (próximo, próximo, concluir). Só precisa fazer uma vez.
2. **Descompacte** este .zip em uma pasta (ex.: `Documentos\cascata-mantora`).
3. **Dê dois cliques**:
   - **Windows:** `iniciar.bat` (uso real) ou `iniciar-demo.bat` (dados de exemplo para conhecer).
   - **Mac/Linux:** `iniciar.command` ou `iniciar-demo.command` (se o Mac bloquear: botão direito → Abrir).
4. O navegador abre em **http://localhost:8788**. Se não abrir, digite esse endereço.
5. Na tela de login, clique em **Entrar** (e-mail já preenchido: `admin@mantora.com`; é um login de teste local, só funciona neste computador).
6. **Primeira vez (uso real):** clique em **Preparar planilha agora** e depois cadastre clientes → produtos → campanhas → análises.
7. Para **encerrar**, feche a janela preta (terminal).

## Onde ficam os dados
- Uso real: `dados\cascata.json`. Demonstração: `dados\demo.json` (separado; pode apagar).
- **Faça backup copiando o arquivo `dados\cascata.json`**, ou use *Configurações → Dados e backup → Baixar backup*.
- Não apague a pasta `dados` sem copiar o arquivo antes.

## Importante
- Este modo é só para testar e usar sozinha(o). Sem login de verdade e sem compartilhamento: **não deixe o programa acessível a outras pessoas** (ele só aceita conexões do próprio computador).
- Quando o Google Sheets for configurado, dá para levar os dados: baixe o backup aqui e use *Restaurar backup* no sistema online (ele só acrescenta, nunca sobrescreve).
- A calculadora do POP também funciona aqui (menu *Cascata de decisão → Calculadora do POP*).
