import { z } from 'zod';
import { OTP_LENGTH } from '../../../common/constants/auth.constants';

export const verifyOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  otp: z
    .string()
    .trim()
    .regex(
      new RegExp(`^\\d{${OTP_LENGTH}}$`),
      `otp must be ${OTP_LENGTH} digits`,
    ),
});

export type VerifyOtpDto = z.infer<typeof verifyOtpSchema>;
