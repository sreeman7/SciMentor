import type { PoolConfig } from 'pg';

export function databaseConnectionConfig(): PoolConfig {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured.');
  const connection = new URL(process.env.DATABASE_URL);
  const hosted = !['localhost', '127.0.0.1', '[::1]'].includes(connection.hostname);
  if (hosted) {
    // URL SSL options override pg's ssl object; configure verification here instead.
    for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'ssl', 'uselibpqcompat']) {
      connection.searchParams.delete(key);
    }
  }
  const certificate = process.env.DATABASE_SSL_CA_BASE64;
  return {
    connectionString: connection.toString(),
    ...(hosted ? { ssl: {
      rejectUnauthorized: true,
      ...(certificate ? { ca: Buffer.from(certificate, 'base64').toString('utf8') } : {}),
    } } : {}),
    max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000,
  };
}
