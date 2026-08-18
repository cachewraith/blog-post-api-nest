import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';

/**
 * Rate limiter keyed by client IP plus the submitted email when there is one.
 * Keying on email as well means an attacker rotating IPs still cannot spray
 * one account with password or OTP guesses (OWASP A04/A07).
 */
@Injectable()
export class ThrottleGuard extends ThrottlerGuard {
  protected getTracker(req: Request): Promise<string> {
    const ip = req.ips?.length ? req.ips[0] : req.ip;
    const body = req.body as { email?: unknown } | undefined;
    const email =
      typeof body?.email === 'string' ? body.email.toLowerCase().trim() : '';

    return Promise.resolve(email ? `${ip}:${email}` : `${ip}`);
  }
}
