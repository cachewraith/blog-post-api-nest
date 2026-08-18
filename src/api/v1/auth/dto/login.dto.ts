import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  // No policy check on login — the stored password predates any policy change,
  // and echoing rules here would leak them to an attacker.
  password: z.string().min(1, 'password is required').max(72),
});

export type LoginDto = z.infer<typeof loginSchema>;
