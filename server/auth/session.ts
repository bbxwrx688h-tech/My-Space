import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { FastifyReply, FastifyRequest } from 'fastify';
import { pool } from '../db/connection';
import { Person } from '../../shared/model';

export const personColumns = 'p.id,p.upn,p.name,p.surname,p.role,p.site';
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
export const devEnabled = () =>
  process.env.NODE_ENV !== 'production' && process.env.DEV_LOGIN === 'true';

export function sessionDigest(request: FastifyRequest) {
  const cookie = request.headers.cookie?.match(/(?:^|;\s*)myspace=([a-f0-9]{64})(?:;|$)/);
  return cookie ? digest(cookie[1]) : null;
}
function cookie(token: string, seconds: number) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `myspace=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${seconds}${secure}`;
}
export async function signIn(personId: number, reply: FastifyReply) {
  const token = randomBytes(32).toString('hex');
  await pool.query('DELETE FROM sessions WHERE expires <= now()');
  await pool.query("INSERT INTO sessions VALUES ($1,$2,now() + interval '12 hours')", [
    digest(token),
    personId,
  ]);
  reply.header('Set-Cookie', cookie(token, 43200));
  return { ok: true };
}
export async function signOut(request: FastifyRequest, reply: FastifyReply) {
  await pool.query('DELETE FROM sessions WHERE digest=$1', [sessionDigest(request)]);
  reply.header('Set-Cookie', cookie('', 0));
}
@Injectable()
export class SessionGuard implements CanActivate {
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<FastifyRequest & { person: Person }>();
    const { rows } = await pool.query<Person>(
      `SELECT ${personColumns} FROM sessions s
      JOIN people p ON p.id=s.person_id WHERE s.digest=$1 AND s.expires>now() AND (p.source<>'dev' OR $2)`,
      [sessionDigest(request), devEnabled()],
    );
    if (!rows[0]) throw new UnauthorizedException('יש להתחבר למערכת');
    request.person = rows[0];
    return true;
  }
}
export const Employee = createParamDecorator(
  (_data, ctx: ExecutionContext): Person => ctx.switchToHttp().getRequest().person,
);
