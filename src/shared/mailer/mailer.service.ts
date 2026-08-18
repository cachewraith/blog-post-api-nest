import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import { OTP_TTL_MINUTES } from '../../common/constants/auth.constants';
import appConfig from '../../config/app.config';
import mailConfig from '../../config/mail.config';

/**
 * Outbound mail. The transport is a seam: `MAIL_MAILER=log` prints to the
 * console, `smtp` sends for real. Auth code calls the same two methods either
 * way and never learns which is active.
 */
@Injectable()
export class MailerService implements OnModuleDestroy {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: Transporter | null;

  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
    @Inject(mailConfig.KEY)
    private readonly mail: ConfigType<typeof mailConfig>,
  ) {
    this.transporter = this.createTransporter();
  }

  onModuleDestroy(): void {
    this.transporter?.close();
  }

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

  /**
   * One connection pool for the process, built once at startup. Opening a
   * fresh SMTP session per email would add a TLS handshake to every OTP and
   * trip Gmail's connection-rate limits under load.
   */
  private createTransporter(): Transporter | null {
    if (this.mail.mailer !== 'smtp') return null;

    return createTransport({
      host: this.mail.host,
      port: this.mail.port,
      // `secure` means implicit TLS from the first byte (465). On 587 we start
      // plaintext and STARTTLS up; `requireTLS` makes that upgrade mandatory
      // so a downgrade attempt aborts instead of sending credentials in the
      // clear (OWASP A02).
      secure: this.mail.encryption === 'ssl' || this.mail.port === 465,
      requireTLS: this.mail.encryption === 'tls',
      auth: { user: this.mail.username, pass: this.mail.password },
      pool: true,
      maxConnections: 3,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  private async deliver(
    to: string,
    subject: string,
    body: string,
    sensitive?: string,
  ): Promise<void> {
    if (!this.transporter) {
      this.logDevMail(to, subject, body, sensitive);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: { name: this.mail.fromName, address: this.mail.fromAddress },
        to,
        subject,
        text: body,
      });
      // The address is masked and the code never appears — a log aggregator is
      // not a place to leak either (OWASP A09).
      this.logger.log(`Sent "${subject}" to ${this.mask(to)}`);
    } catch (error) {
      // Swallowed on purpose. A dead SMTP host must not turn into a 500 that
      // tells the caller whether the address exists, and OTP delivery is
      // retryable by the user (OWASP A07 — no enumeration via error shape).
      this.logger.error(
        `Failed to send "${subject}" to ${this.mask(to)}: ${
          error instanceof Error ? error.message : 'unknown transport error'
        }`,
      );

      if (!this.config.isProduction) {
        this.logDevMail(to, subject, body, sensitive);
      }
    }
  }

  /**
   * Dev fallback. Printing the code is what makes the OTP flow testable
   * without SMTP; production never reaches this path.
   */
  private logDevMail(
    to: string,
    subject: string,
    body: string,
    sensitive?: string,
  ): void {
    if (this.config.isProduction) {
      this.logger.warn(
        `Mail transport disabled in production; dropped "${subject}" to ${this.mask(to)}`,
      );
      return;
    }

    this.logger.debug(
      `[dev-mail] to=${to} subject="${subject}" body="${body}"${
        sensitive ? ` code=${sensitive}` : ''
      }`,
    );
  }

  private mask(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '***';
    return `${local.slice(0, 2)}***@${domain}`;
  }
}
