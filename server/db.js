import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('DATABASE_URL nao configurada. As rotas de banco falharao ate o .env ser preenchido.');
}

export const sql = connectionString
  ? postgres(connectionString, {
      ssl: 'require',
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10
    })
  : null;

export function requireDb() {
  if (!sql) {
    const error = new Error('DATABASE_URL nao configurada no backend.');
    error.status = 500;
    throw error;
  }
  return sql;
}
