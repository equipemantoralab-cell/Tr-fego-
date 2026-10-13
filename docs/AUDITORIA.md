# Etapa 1 — Auditoria do sistema existente

Estado analisado: `main` @ 697a17d (site `trafegotest.netlify.app`).

## Arquitetura atual
- 100% estático: `index.html` (UI + CSS + script inline), `engine.js` (regras puras), `content.js` (tabelas/checklists do POP).
- Sem backend, sem banco, sem autenticação. Sem `package.json` nem `netlify.toml`.
- Persistência: apenas `localStorage` do navegador, chaves `cascata:*`.

## Funcionalidades existentes (preservadas)
Calculadora do POP v1.0 em 6 abas (Low Ticket, Médio Ticket, High Ticket, Lançamento, Aprendizado, Governança):
- cascata de 3 dias, escala/deterioração, diagnóstico de funil, bumps, economia do Médio Ticket, diagnóstico por etapas (página/VSL/quiz),
  assistido/híbrido, economia reversa e pipeline do High Ticket, motivos de perda, projeção/ritmo/origens/carrinho/forecast do Lançamento,
  radar, revisão de portfólio, registros de aprendizado/benchmark, checklists, gerador de mensagem (seção 52), parâmetros POP × provisório.
- Motor determinístico testado: 24 testes (`node --test`), todos passando.

## Dados em localStorage (candidatos à migração)
| Chave | Conteúdo | Destino |
|---|---|---|
| `cascata:ap-log`, `cascata:ap-bench` | registros de aprendizado/benchmark (`entries[]`) | aba `APRENDIZADOS` |
| `cascata:params` | parâmetros editados | `CONFIGURACOES_FUNIS` (fonte `usuario`) |
| `cascata:<modulo>` | entradas de cada calculadora | permanecem locais (rascunho) |
| `cascata:chk:*` | checklists marcados | permanecem locais |
| `cascata:ui` | aba selecionada | permanece local |

## Lacunas frente à nova especificação
Sem multiusuário, sem autenticação, sem entidades (clientes/campanhas/análises/decisões), sem histórico, sem simulador financeiro dedicado.

## Decisões de arquitetura
- Motor de regras e cálculos continuam em módulos ES **isomórficos** (`lib/`), usados no navegador (pré-visualização) e no servidor (valor oficial gravado).
- A calculadora atual vira a visão "Cascata de decisão → Calculadora do POP", sem alterar seu comportamento.
- Backend: uma Netlify Function (`netlify/functions/api.mjs`), sem dependências npm (Sheets REST + JWT via `node:crypto`).
- Desenvolvimento em branch (`evolucao-sheets`); `main` só é alterada após aprovação.
