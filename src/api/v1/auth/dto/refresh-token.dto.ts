import { z } from 'zod';

export const refreshTokenSchema = z.object({
  refresh_token: z.string().min(1, 'refresh_token is required'),
});

export type RefreshTokenDto = z.infer<typeof refreshTokenSchema>;

export const logoutSchema = z.object({
  refresh_token: z.string().min(1, 'refresh_token is required'),
  /** When true, every session for the user is revoked, not just this one. */
  all_devices: z.boolean().optional().default(false),
});

export type LogoutDto = z.infer<typeof logoutSchema>;
