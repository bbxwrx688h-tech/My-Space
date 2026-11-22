import { readFileSync, readdirSync } from 'node:fs';
import { pool, transaction } from './connection';
import { hashPassword } from '../auth/password';

export async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL');
  await transaction(async (db) => {
    // Serialize deploys so two API instances cannot install the same migration.
    await db.query('SELECT pg_advisory_xact_lock(6349201)');
    await db.query('CREATE TABLE IF NOT EXISTS migrations (file text PRIMARY KEY)');
    for (const file of readdirSync('server/db')
      .filter((f) => /^\d+.*\.sql$/.test(f))
      .sort()) {
      const installed = await db.query('SELECT 1 FROM migrations WHERE file=$1', [file]);
      if (installed.rowCount) continue;
      await db.query(readFileSync('server/db/' + file, 'utf8'));
      await db.query('INSERT INTO migrations VALUES ($1)', [file]);
    }
    const local = await db.query("SELECT id FROM people WHERE source='local'");
    if (!local.rowCount) {
      const password = process.env.ADMIN_PASSWORD;
      if (!password || password.startsWith('replace-with-'))
        throw new Error('Set ADMIN_PASSWORD for first boot');
      await db.query(
        `INSERT INTO people(source, upn, name, surname, role, password_hash)
        VALUES ('local',$1,'מנהל','מערכת','admin',$2)`,
        [process.env.ADMIN_USERNAME || 'admin', hashPassword(password)],
      );
    }
  });
}
if (require.main === module) {
  migrate()
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
