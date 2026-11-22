const { randomUUID, randomBytes } = require('node:crypto');
const { Pool } = require('pg');

// Tests create their own schema even when multiple suites share a test database.
// Only the schema generated here is ever dropped.
async function testDatabase() {
  if (!process.env.TEST_DATABASE_URL) {
    try {
      process.loadEnvFile('.env');
    } catch {
      /* CI supplies its own environment. */
    }
  }
  if (!process.env.TEST_DATABASE_URL)
    throw new Error('Set TEST_DATABASE_URL in .env to a dedicated PostgreSQL test database');
  const url = new URL(process.env.TEST_DATABASE_URL);
  const schema = 'myspace_test_' + randomUUID().replaceAll('-', '');
  const control = new Pool({ connectionString: url.href });
  await control.query('CREATE SCHEMA ' + schema);
  url.searchParams.set('options', '-c search_path=' + schema);
  Object.assign(process.env, {
    DATABASE_URL: url.href,
    NODE_ENV: 'test',
    DEV_LOGIN: 'true',
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD: 'local-test-password',
    CONFIRMATION_SECRET: randomBytes(32).toString('hex'),
  });
  return async () => {
    await control.query('DROP SCHEMA ' + schema + ' CASCADE');
    await control.end();
  };
}
module.exports = { testDatabase };
