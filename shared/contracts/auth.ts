import { z } from 'zod';
import { shortText } from './common';

export const devLoginBody = z.object({ upn: z.string() });

export const adminLoginBody = z.object({
  username: shortText.max(150),
  password: z.string().max(512),
});

export const identityClaims = z.object({
  name: shortText,
  surname: shortText,
  UPN: z.string().trim().email(),
});

export type DevLoginInput = z.infer<typeof devLoginBody>;
export type AdminLoginInput = z.infer<typeof adminLoginBody>;
