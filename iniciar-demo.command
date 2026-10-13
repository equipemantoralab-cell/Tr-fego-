#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null; then echo "Node.js não encontrado. Instale a versão LTS em https://nodejs.org"; read -p "Enter para sair"; exit 1; fi
echo "MODO DEMONSTRAÇÃO com dados de exemplo (arquivo separado: dados/demo.json)"
(sleep 3; (open http://localhost:8788 || xdg-open http://localhost:8788) >/dev/null 2>&1) &
node server/dev.mjs --arquivo dados/demo.json --seed
