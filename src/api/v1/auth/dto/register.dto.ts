import { z } from 'zod';
import { passwordSchema } from './password.schema';

export const registerSchema = z
  .object({
    first_name: z.string().trim().min(1).max(100),
    last_name: z.string().trim().min(1).max(100),
    email: z.string().trim().toLowerCase().email().max(255),
    // E.164: optional +, leading digit 1-9, 7-14 more digits.
    phone_number: z
      .string()
      .trim()
      .regex(
        /^\+?[1-9]\d{7,14}$/,
        'phone_number must be a valid international number, e.g. +8801712345678',
      ),
    password: passwordSchema,
    password_confirmation: z.string(),
  })
  .refine((data) => data.password === data.password_confirmation, {
    path: ['password_confirmation'],
    message: 'password_confirmation must match password',
  });

export type RegisterDto = z.infer<typeof registerSchema>;
