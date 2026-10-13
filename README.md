# Cascata de Decisão de Tráfego Pago — Mantora

Sistema interno de gestão, diagnóstico e acompanhamento de campanhas de tráfego pago.
**Métrica-mãe decide. Métricas secundárias explicam. O funil localiza. O responsável corrige. A próxima rodada aprende.**

- Dashboard operacional, clientes, campanhas, análises, cascata de decisão (motor de regras + calculadora do POP), simulador financeiro, plano de ação, histórico/inteligência e configurações.
- Dados compartilhados no **Google Sheets** (via Netlify Function); login Google com perfis (admin, gestor, analista, leitor).
- Entrada manual de dados; sem integração com Meta Ads, ClickUp ou plataformas de anúncios.

Documentação: [`docs/SETUP.md`](docs/SETUP.md) · [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) · [`docs/TESTES.md`](docs/TESTES.md) · [`docs/PUBLICACAO.md`](docs/PUBLICACAO.md) · [`docs/AUDITORIA.md`](docs/AUDITORIA.md)

```
npm test                      # testes automatizados
node server/dev.mjs --seed    # ambiente local com planilha em memória (não usar em produção)
```
