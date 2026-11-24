import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { fieldLabels } from '../../../shared/contracts/common';

/** Parse untrusted input with a shared Zod schema and return a Hebrew error. */
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const path = result.error.issues[0]?.path ?? [];
    const field = String([...path].reverse().find((part) => fieldLabels[String(part)]) ?? '');
    throw new BadRequestException(
      fieldLabels[field]
        ? `יש לבדוק את השדה ${fieldLabels[field]}`
        : 'הנתונים שהוזנו אינם תקינים. יש לבדוק את השדות.',
    );
  }
  return result.data;
}
