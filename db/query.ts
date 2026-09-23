/** Shared parameterized SQL adapter. Batch operations always share one transaction. */
export type QueryResult = { rows: Record<string, unknown>[]; rowCount: number | null };
export type Executor = (sql: string, values: unknown[]) => Promise<QueryResult>;
export function postgresSql(sql: string) {
  let index = 0;
  // Queries are fixed application SQL; user-supplied values are always bound separately.
  return sql.replace(/'(?:''|[^'])*'|\?|\bend\b|\b(?:FROM|JOIN|INTO|UPDATE)\s+(?:groups|members|invites|slots|meetings|announcements|messages|resources|email_jobs)\b/gi, token => {
    if (token.startsWith("'")) return token;
    if (token === '?') return `$${++index}`;
    if (token.toLowerCase() === 'end') return '"end"';
    return token.replace(/\s+/, ' scimentor.');
  });
}
export function createDatabase(execute: Executor, transaction: <T>(fn: (execute: Executor) => Promise<T>) => Promise<T>) {
  function prepare(sql: string) {
    const text = postgresSql(sql);
    let values: unknown[] = [];
    const statement = {
      bind(...args: unknown[]) { values = args; return statement; },
      async first<T>() { return ((await execute(text, values)).rows[0] ?? null) as T | null; },
      async all<T>() { return { results: (await execute(text, values)).rows as T[] }; },
      async run() { return statement.execute(execute); },
      async execute(query: Executor) { const result = await query(text, values); return { meta: { changes: result.rowCount ?? 0 } }; },
    };
    return statement;
  }
  return { prepare, async batch(statements: ReturnType<typeof prepare>[]) {
    return transaction(async query => { const results = []; for (const statement of statements) results.push(await statement.execute(query)); return results; });
  } };
}
