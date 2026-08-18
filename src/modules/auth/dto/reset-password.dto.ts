import { z } from 'zod';
import { passwordSchema } from './password.schema';

export const resetPasswordSchema = z
  .object({
    /** Short-lived token handed back by POST /auth/verify-otp. */
    reset_token: z.string().min(1, 'reset_token is required'),
    password: passwordSchema,
    password_confirmation: z.string(),
  })
  .refine((data) => data.password === data.password_confirmation, {
    path: ['password_confirmation'],
    message: 'password_confirmation must match password',
  });

export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;
