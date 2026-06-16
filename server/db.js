import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('DATABASE_URL não configurada. As rotas de banco falharão até o .env ser preenchido.');
}

export const sql = connectionString
  ? postgres(connectionString, {
      ssl: 'require',
      prepare: false,
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10
    })
  : null;

export function requireDb() {
  if (!sql) {
    const error = new Error('DATABASE_URL não configurada no backend.');
    error.status = 500;
    throw error;
  }
  return sql;
}
