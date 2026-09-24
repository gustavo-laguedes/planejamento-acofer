import 'dotenv/config';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn(
    'DATABASE_URL não configurada. As rotas de banco falharão até o .env ser preenchido.'
  );
}

// Usa HTTPS/WebSocket da Neon, evitando depender da porta PostgreSQL 5432.
neonConfig.webSocketConstructor = ws;
neonConfig.poolQueryViaFetch = true;

const pool = connectionString
  ? new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 10_000
    })
  : null;

if (pool) {
  pool.on('error', error => {
    console.error('Erro inesperado na conexão com o Neon:', error);
  });
}

const JSON_VALUE = Symbol('neon-json-value');

function json(value) {
  return {
    [JSON_VALUE]: true,
    value
  };
}

function normalizeValue(value) {
  if (value && value[JSON_VALUE]) {
    return JSON.stringify(value.value);
  }

  return value;
}

function compileTemplate(strings, values) {
  let text = strings[0];
  const params = [];

  for (let index = 0; index < values.length; index += 1) {
    params.push(normalizeValue(values[index]));
    text += `$${params.length}${strings[index + 1]}`;
  }

  return {
    text,
    params
  };
}

function rowsFromResult(result) {
  if (Array.isArray(result)) {
    return result.at(-1)?.rows || [];
  }

  return result?.rows || [];
}

function createSqlTag(query, { begin, unsafeQuery = query } = {}) {
  const tag = async (strings, ...values) => {
    const { text, params } = compileTemplate(strings, values);

    const result = await query(text, params);

    return rowsFromResult(result);
  };

  tag.unsafe = async (text, values = []) => {
    const params = Array.isArray(values)
      ? values.map(normalizeValue)
      : [];

    const result = await unsafeQuery(text, params);

    return rowsFromResult(result);
  };

  tag.json = json;

  if (begin) {
    tag.begin = begin;
  }

  return tag;
}

async function queryViaWebSocket(text, params = []) {
  if (!pool) {
    throw new Error('DATABASE_URL não configurada no backend.');
  }

  const client = await pool.connect();

  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

async function beginTransaction(callback) {
  if (!pool) {
    throw new Error('DATABASE_URL não configurada no backend.');
  }

  const client = await pool.connect();

  const tx = createSqlTag((text, params) => {
    return client.query(text, params);
  });

  try {
    await client.query('BEGIN');

    const result = await callback(tx);

    await client.query('COMMIT');

    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error(
        'Falha ao executar ROLLBACK:',
        rollbackError
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

export const sql = pool
  ? createSqlTag(
      (text, params) => pool.query(text, params),
      {
        begin: beginTransaction,
        unsafeQuery: queryViaWebSocket
      }
    )
  : null;

if (sql) {
  sql.end = async () => {
    await pool.end();
  };
}

export function requireDb() {
  if (!sql) {
    const error = new Error(
      'DATABASE_URL não configurada no backend.'
    );

    error.status = 500;

    throw error;
  }

  return sql;
}