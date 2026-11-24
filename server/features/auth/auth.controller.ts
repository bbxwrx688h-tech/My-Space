import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { adminLoginBody, devLoginBody } from '../../../shared/contracts/auth';
import { pool } from '../../db/connection';
import { parse } from '../../common/validation/parse';
import { resolveIdentity } from '../../auth/identity';
import { matchesPassword } from '../../auth/password';
import { devEnabled, signIn, signOut } from '../../auth/session';

const devPeople = [
  { name: 'נועה', surname: 'לוי', UPN: 'noa@example.test' },
  { name: 'אורי', surname: 'כהן', UPN: 'uri@example.test' },
  { name: 'תמר', surname: 'ברק', UPN: 'tamar@example.test' },
];

@Controller('auth')
export class AuthController {
  @Get('options') options() {
    return {
      employees: devEnabled()
        ? devPeople.map((p) => ({ upn: p.UPN, label: p.name + ' ' + p.surname }))
        : [],
    };
  }
  @Post('dev') async dev(@Body() body: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    if (!devEnabled()) throw new NotFoundException();
    const { upn } = parse(devLoginBody, body);
    const claims = devPeople.find((p) => p.UPN === upn);
    if (!claims) throw new UnauthorizedException('חשבון הפיתוח אינו זמין');
    return signIn(await resolveIdentity('dev', claims), reply);
  }
  @Post('admin') async admin(
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const input = parse(adminLoginBody, body);
    const { rows } = await pool.query(
      "SELECT id,password_hash FROM people WHERE source='local' AND upn=$1",
      [input.username],
    );
    if (!rows[0] || !matchesPassword(input.password, rows[0].password_hash)) {
      throw new UnauthorizedException('שם המשתמש או הסיסמה שגויים');
    }
    return signIn(rows[0].id, reply);
  }
  @Post('adfs') adfs() {
    throw new ServiceUnavailableException('הכניסה הארגונית טרם חוברה לשירות ההזדהות.');
  }
  @Post('logout') async logout(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await signOut(req, reply);
    return { ok: true };
  }
}
