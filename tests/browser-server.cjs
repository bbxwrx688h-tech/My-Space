const { testDatabase } = require('./database.cjs');

async function main() {
  const cleanup = await testDatabase();
  const { buildApp } = require('../dist/server/main');
  const { pool } = require('../dist/server/db/connection');
  let app;
  try {
    app = await buildApp(true);
    await app.listen(3191, '127.0.0.1');
  } catch (error) {
    await pool.end();
    await cleanup();
    throw error;
  }
  // Playwright terminates this server after the run. Its schema is disposable.
  let closing = false;
  async function close() {
    if (closing) return;
    closing = true;
    await app.close();
    await pool.end();
    await cleanup();
  }
  process.once('SIGTERM', close);
  process.once('SIGINT', close);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
