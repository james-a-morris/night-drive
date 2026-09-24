import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createStore } from '../../server/store.ts';

export async function createTestStore(t) {
  if (!process.env.TEST_DATABASE_URL) {
    const store = await createStore({ databaseUrl: null, sqlitePath: ':memory:' });
    t.after(() => store.close());
    return store;
  }

  // Each test owns a schema; never use or clear the application's tables.
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  let store;
  t.after(async () => {
    try {
      await store?.close();
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await admin.end();
    }
  });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${schema}`);
  store = await createStore({ databaseUrl: url.toString() });
  return store;
}
