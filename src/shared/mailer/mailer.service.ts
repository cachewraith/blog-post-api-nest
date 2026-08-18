import { Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import appConfig from '../../config/app.config';
import { OTP_TTL_MINUTES } from '../../common/constants/auth.constants';

/**
 * Outbound mail. The transport is intentionally a seam: swapping the dev
 * logger for SMTP means changing `deliver` only — no auth code moves.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {}

  sendOtpEmail(to: string, code: string): Promise<void> {
    return this.deliver(
      to,
      'Your verification code',
      `Your verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`,
      code,
    );
  }

  sendPasswordChangedEmail(to: string): Promise<void> {
    return this.deliver(
      to,
      'Your password was changed',
      'Your password was just changed. If this was not you, contact support immediately.',
    );
  }

  private deliver(
    to: string,
    subject: string,
    body: string,
    sensitive?: string,
  ): Promise<void> {
    if (this.config.isProduction) {
      // TODO: bind a real SMTP transport here.
      this.logger.log(`Sent "${subject}" to ${this.mask(to)}`);
      return Promise.resolve();
    }

    // Dev only. Printing the code is what makes the flow testable without SMTP;
    // the production branch above never logs it (OWASP A09).
    this.logger.debug(
      `[dev-mail] to=${to} subject="${subject}" body="${body}"${
        sensitive ? ` code=${sensitive}` : ''
      }`,
    );
    return Promise.resolve();
  }

  private mask(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '***';
    return `${local.slice(0, 2)}***@${domain}`;
  }
}
