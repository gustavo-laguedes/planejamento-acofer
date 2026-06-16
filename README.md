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
config.js
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
CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxx
CLERK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxx
CLERK_ISSUER=https://your-clerk-domain.clerk.accounts.dev
FRONTEND_ORIGIN=http://localhost:3000
CLERK_INVITATION_REDIRECT_URL=http://localhost:3000
SUPER_ADMIN_EMAIL=gustavo@acofer.com.br
SUPER_ADMIN_NAME=Gustavo Guedes
```

O `DATABASE_URL` continua apontando para o Neon. O Clerk passa a ser a autenticacao principal, e a tabela `app_users` guarda dados complementares como nome, funcao e status.

## Deploy: Render + GitHub Pages

O frontend usa `config.js` para descobrir o backend em producao:

```js
window.APP_CONFIG = {
  API_BASE_URL: 'https://planejamento-acofer-api.onrender.com'
};
```

Em `localhost`, o sistema ignora `API_BASE_URL` e continua usando `/api`. Em producao, as chamadas sao feitas para `API_BASE_URL + /api`, por exemplo `https://planejamento-acofer-api.onrender.com/api`.

### Backend no Render

Crie um Web Service apontando para este repositorio:

```text
Build Command: npm install
Start Command: npm start
```

Use a URL publica do Render como base da API:

```text
https://planejamento-acofer-api.onrender.com
```

Configure as variaveis de ambiente no Render:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/neondb?sslmode=require
CLERK_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxxx
CLERK_ISSUER=https://your-clerk-domain.clerk.accounts.dev
CLERK_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxxxxxxx
SUPER_ADMIN_EMAIL=gustavo@acofer.com.br
SUPER_ADMIN_NAME=Gustavo Guedes
FRONTEND_ORIGIN=https://acofer.catrion.com.br
CLERK_INVITATION_REDIRECT_URL=https://acofer.catrion.com.br
```

O CORS permite sempre `http://localhost:3000` e tambem as origens listadas em `FRONTEND_ORIGIN`. Para mais de uma origem de frontend, separe por virgula.

### Frontend no GitHub Pages

Publique a branch/pasta raiz do repositorio no GitHub Pages. Antes de publicar, confirme que `config.js` contem:

```js
API_BASE_URL: 'https://planejamento-acofer-api.onrender.com'
```

O arquivo `CNAME` ja aponta para `acofer.catrion.com.br`.

### Checklist de deploy

- Migrations aplicadas no banco: `npm run db:schema`.
- Render com `npm start` e health check acessivel em `/api/health`.
- `FRONTEND_ORIGIN=https://acofer.catrion.com.br` configurado no Render.
- `CLERK_INVITATION_REDIRECT_URL=https://acofer.catrion.com.br` configurado no Render e no painel do Clerk.
- `config.js` publicado no GitHub Pages com a URL do Render.
- Login testado em `https://acofer.catrion.com.br`.

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

## Autenticacao Clerk

1. Crie uma aplicacao no Clerk.
2. Em `User & Authentication > Email, phone, username`, habilite login por e-mail e senha.
3. Para permitir login por usuario ou e-mail, habilite `Username` no Clerk. O sistema envia o valor digitado no campo `Usuario ou E-mail` como identificador.
4. Em `Paths`, configure a URL da aplicacao como redirect de convites, por exemplo `http://localhost:3000`.
5. Copie `Publishable key` para `CLERK_PUBLISHABLE_KEY`.
6. Copie `Secret key` para `CLERK_SECRET_KEY`.
7. Copie o dominio/issuer da instancia Clerk para `CLERK_ISSUER`, no formato `https://...clerk.accounts.dev`.
8. Defina `SUPER_ADMIN_EMAIL` e `SUPER_ADMIN_NAME` com o primeiro usuario administrador.
9. Rode as migrations:

```bash
npm run db:schema
```

O Super Admin inicial nao pode ser removido nem desativado. Para o primeiro acesso, crie esse usuario no painel do Clerk com o mesmo e-mail de `SUPER_ADMIN_EMAIL`, ou convide-o pelo painel do Clerk. Apos o login, o sistema cria/vincula automaticamente o perfil interno com acesso total.

Super Admins veem o botao `Gestao de Usuarios` na topbar. O cadastro cria um convite no Clerk, o Clerk envia o e-mail, o usuario define a senha e, ao entrar, o perfil interno e vinculado pelo e-mail.

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
