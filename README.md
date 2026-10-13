# Cascata de Decisão de Tráfego Pago — Mantora Lab

Calculadora do POP v1.0 (Low Ticket, Médio Ticket, High Ticket e Lançamento): você informa os dados do funil e recebe decisão, diagnóstico, evidências e responsável.

- Sem backend e sem banco: dados só no navegador (localStorage).
- `index.html` — interface; `engine.js` — motor puro (regras do POP); `content.js` — tabelas, checklists e fluxos transcritos do POP.
- A aba **Cobertura do POP** mapeia cada uma das 55 seções para onde ela está na ferramenta.
- Números que o POP não define são marcados como *provisórios* e editáveis em Governança → Parâmetros.
- Precisa ser servido por HTTP (ex.: `python3 -m http.server`, GitHub Pages ou Netlify); não abre via `file://`.
- Testes: `node --test test/engine.test.mjs`
