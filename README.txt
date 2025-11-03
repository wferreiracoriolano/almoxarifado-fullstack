# Almoxarifado • Fullstack (Express + SQLite + Upload de Imagens)

## Como rodar localmente
1) Instale Node.js 18+.
2) Dentro da pasta do projeto, rode:
   npm install
   npm start
3) Acesse http://localhost:3000
   Login padrão: admin / admin (ADMIN)

## Recursos
- Itens com imagem (upload) e estoque mínimo
- Alerta quando retirada (baixa) ou aprovação de solicitação deixar o estoque abaixo do mínimo
- Papéis: ADMIN, ALMOX, SOLICITANTE
- Solicitações: criar, aprovar, recusar (baixa automática no estoque)
- API e Frontend no mesmo servidor

## Deploy (sugestão Render.com)
- Crie um novo serviço Web no Render, conecte o repositório ou faça deploy por tar/zip.
- Build Command: (vazio)
- Start Command: node server.js
- Defina a env JWT_SECRET com um valor forte.
