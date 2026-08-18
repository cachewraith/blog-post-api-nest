import { z } from 'zod';

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
});

export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;
