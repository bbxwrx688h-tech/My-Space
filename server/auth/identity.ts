import { identityClaims } from '../../shared/contracts/auth';
import { pool } from '../db/connection';
import { parse } from '../common/validation/parse';

/** Call from the future AD FS adapter only after validating the provider response.
 * No HTTP endpoint accepts claims asserted by a browser. UPN is the stable key. */
export async function resolveIdentity(source: 'dev' | 'adfs', claims: unknown): Promise<number> {
  const user = parse(identityClaims, claims);
  const result = await pool.query(
    `INSERT INTO people(source,upn,name,surname) VALUES ($1,$2,$3,$4)
    ON CONFLICT (source,upn) DO UPDATE SET name=EXCLUDED.name,surname=EXCLUDED.surname RETURNING id`,
    [source, user.UPN.toLowerCase(), user.name, user.surname],
  );
  return result.rows[0].id;
}
