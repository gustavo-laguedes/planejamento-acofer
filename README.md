# Planejamento Aco-Fer

Sistema web interno para planejamento de producao, importacao de estoque via CSV, matriz de produtividade, cadastros e acompanhamento de programado x realizado.

## Estrutura

```text
assets/
database/
docs/
pages/
server/
  server.js
  db.js
  routes/
  scripts/
services/
shared/
index.html
app.js
style.css
package.json
.env.example
README.md
```

O `index.html` fica na raiz para o GitHub Pages carregar a aplicacao diretamente, sem cair no `README.md`. O servidor Node tambem serve essa mesma raiz em `http://localhost:3000`.

## Requisitos

- Node.js 20 ou superior
- Banco Neon Postgres
- Um arquivo CSV exportado do Redash/Nasajon

## Configurar banco no Neon

1. Crie um projeto no Neon.
2. Copie a connection string do banco.
3. Configure o `.env` sem versionar credenciais.
4. Rode as migrations idempotentes:

```bash
npm run db:schema
npm run db:validate
```

Os arquivos SQL ficam em `database/`. A migration `006_stock_location_adjustments.sql` cria os ajustes manuais de estoque por material e local sem apagar dados existentes.

## Configurar ambiente

```bash
npm install
copy .env.example .env
```

Preencha `.env`:

```env
PORT=3000
DATABASE_URL=postgresql://USER:PASSWORD@HOST/neondb?sslmode=require
ADMIN_PASSWORD=planacofer26
JWT_SECRET=troque-este-segredo
SESSION_TTL_HOURS=12
```

Em producao, prefira usar `ADMIN_PASSWORD_HASH` com bcrypt e remova `ADMIN_PASSWORD`.

## Rodar

```bash
npm run dev
```

Acesse:

```text
http://localhost:3000
```

## Estoque

A aba Estoque lista uma linha por material cadastrado em `Cadastros > Materiais`. O saldo Nasajon vem do ultimo CSV importado e e vinculado pelos codigos atrelados do material. Os locais cadastrados em `Cadastros > Locais` geram colunas dinamicas de saldo, erro de inventario e inventario fisico preparado para evolucao futura.

Se nao houver CSV importado, os materiais aparecem com saldo `0`. O campo `Erro de inventario` e editavel direto na tabela e fica salvo em `stock_location_adjustments`.

## Login

A senha inicial vem de `ADMIN_PASSWORD`. O valor inicial sugerido e:

```text
planacofer26
```

A senha nao fica no frontend. O login chama `/api/auth/login`, recebe um token JWT e salva a sessao no navegador.

## Importar CSV

1. Faca login.
2. Clique em `Importar CSV` na topbar.
3. Selecione o CSV exportado do Redash/Nasajon.

Durante a importacao o sistema substitui o conteudo de `stock_snapshot` dentro de transacao e registra o historico em `import_history`. Nenhuma migration apaga dados do Neon.

## Logo

Coloque a imagem em:

```text
assets/logo-acofer.png
```

Se o arquivo nao existir, o sistema mostra um fallback textual `Aco-Fer`.
