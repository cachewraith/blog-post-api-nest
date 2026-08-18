import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MINUTES,
} from '../../common/constants/auth.constants';
import {
  generateOtp,
  hashToken,
  safeCompare,
} from '../../common/utils/hash.util';
import { MailerService } from '../../shared/mailer/mailer.service';
import { OtpCodeRepository } from './repositories/otp-code.repository';

/** Codes an address may request per hour before we stop sending. */
const MAX_ISSUES_PER_HOUR = 5;

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly otpCodeRepository: OtpCodeRepository,
    private readonly mailerService: MailerService,
  ) {}

  /**
   * Issue a code and mail it. Any previously outstanding code for the address
   * is consumed first, so exactly one code is ever live — an attacker cannot
   * widen the guess space by requesting many codes at once.
   *
   * Returns silently when the hourly cap is hit: the caller must not tell the
   * client, or the difference becomes an oracle (OWASP A04).
   */
  async issue(email: string): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 3600 * 1000);
    const recent = await this.otpCodeRepository.countIssuedSince(
      email,
      oneHourAgo,
    );

    if (recent >= MAX_ISSUES_PER_HOUR) {
      this.logger.warn(`OTP issue rate cap reached for ${this.mask(email)}`);
      return;
    }

    await this.otpCodeRepository.consumeAllForEmail(email);

    const code = generateOtp();
    await this.otpCodeRepository.create({
      email,
      codeHash: hashToken(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
      attempts: 0,
    });

    await this.mailerService.sendOtpEmail(email, code);
  }

  /**
   * Check a submitted code and consume it on success. Every failure mode
   * returns the same message so a caller cannot learn whether a code exists,
   * has expired, or was simply wrong.
   */
  async verify(email: string, code: string): Promise<void> {
    const invalid = () => new BadRequestException('Invalid or expired code');

    const record = await this.otpCodeRepository.findActiveByEmail(email);
    if (!record) throw invalid();

    if (record.expiresAt.getTime() <= Date.now()) {
      await this.otpCodeRepository.consume(record.id);
      throw invalid();
    }

    if (!safeCompare(record.codeHash, hashToken(code))) {
      const attempts = await this.otpCodeRepository.incrementAttempts(
        record.id,
      );

      // Burn the code once guessing starts, rather than letting an attacker
      // walk the 10^6 space (OWASP A07).
      if (attempts >= OTP_MAX_ATTEMPTS) {
        await this.otpCodeRepository.consume(record.id);
        this.logger.warn(
          `OTP attempt cap reached for ${this.mask(email)}; code invalidated`,
        );
      }

      throw invalid();
    }

    await this.otpCodeRepository.consume(record.id);
  }

  private mask(email: string): string {
    const [local, domain] = email.split('@');
    return domain ? `${local.slice(0, 2)}***@${domain}` : '***';
  }
}
