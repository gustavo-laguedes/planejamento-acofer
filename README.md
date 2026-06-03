# Planejamento Aco-Fer

Sistema web interno para planejamento de producao, importacao de estoque via CSV, matriz de produtividade e acompanhamento de programado x realizado.

## Estrutura

```text
backend/
  server.js
  db.js
  routes/
  services/
  package.json
  .env.example
frontend/
  index.html
  src/
    main.js
    api.js
    styles.css
    pages/
    components/
  assets/
database/
  001_schema.sql
  002_indexes.sql
  003_seed_optional.sql
```

## Requisitos

- Node.js 20 ou superior
- Banco Neon Postgres
- Um arquivo CSV exportado do Redash/Nasajon

## Configurar banco no Neon

1. Crie um projeto no Neon.
2. Copie a connection string do banco.
3. Execute os SQLs nesta ordem:

```sql
-- database/001_schema.sql
-- database/002_indexes.sql
-- database/003_seed_optional.sql opcional
```

O arquivo `003_seed_optional.sql` cria apenas um registro de produtividade de exemplo para testar a simulacao.

## Configurar backend

```bash
cd backend
npm install
copy .env.example .env
```

Preencha `backend/.env`:

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
cd backend
npm run dev
```

Acesse:

```text
http://localhost:3000
```

O backend serve o frontend estatico automaticamente.

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

Durante a importacao o sistema:

1. Cria um registro em `import_history` com status `processing`.
2. Substitui os dados atuais de `stock_snapshot` dentro de transacao.
3. Insere as linhas novas em lotes.
4. Atualiza o historico com status `success`, total de linhas e data.
5. Em caso de erro, salva status `error` e a mensagem.

## Funcionalidades iniciais

- Login simples via backend.
- Topbar azul petroleo com area para logo.
- Abas horizontais.
- Importacao de CSV com historico.
- Estoque com filtros, resumo, saldo ajustado e correcao manual.
- Matriz de produtividade com criar, editar e inativar.
- Planejamento com simulacao, salvamento e PDF.
- Acompanhamento de programado x realizado.

## Logo

Coloque a imagem em:

```text
frontend/assets/logo-acofer.png
```

Se o arquivo nao existir, o sistema mostra um fallback textual `Aco-Fer`.

## Publicacao futura

Para publicar em `acofer.catrion.com.br`, configure um servidor Node para rodar o backend e aponte o dominio para ele. Mantenha `DATABASE_URL`, `JWT_SECRET` e senha/hash apenas em variaveis de ambiente no servidor.
