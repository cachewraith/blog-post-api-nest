import { registerAs } from '@nestjs/config';

export interface ThrottleConfig {
  ttl: number;
  limit: number;
}

export default registerAs('throttle', (): ThrottleConfig => ({
  ttl: Number(process.env.THROTTLE_TTL ?? 60),
  limit: Number(process.env.THROTTLE_LIMIT ?? 100),
}));
