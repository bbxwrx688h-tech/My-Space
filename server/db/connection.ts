import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 12,
  statement_timeout: 15000,
});

// PostgreSQL may close idle connections during maintenance. pg removes the
// failed client from the pool; the next request can open a new connection.
pool.on('error', (error) => console.error('Idle PostgreSQL connection closed:', error.message));

/** All changes in a booking operation, including notifications, share one commit. */
export async function transaction<T>(action: (db: PoolClient) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await action(db);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    if ((error as { code?: string }).code === '23505') {
      throw new ConflictException('אחד הימים כבר הוצע או הוזמן. יש לרענן את הבחירה.');
    }
    if ((error as { code?: string }).code === '57014') {
      throw new ServiceUnavailableException(
        'הפעולה ארכה זמן רב. יש לנסות שוב או לבחור טווח קצר יותר.',
      );
    }
    throw error;
  } finally {
    db.release();
  }
}

export function notify(db: PoolClient, personId: number, message: string) {
  return db.query('INSERT INTO notices(person_id, message) VALUES ($1,$2)', [personId, message]);
}
