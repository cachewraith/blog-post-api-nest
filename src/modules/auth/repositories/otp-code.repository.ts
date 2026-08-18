import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import { OtpCode } from '../entities/otp-code.entity';

@Injectable()
export class OtpCodeRepository {
  constructor(
    @InjectRepository(OtpCode)
    private readonly repo: Repository<OtpCode>,
  ) {}

  create(data: Partial<OtpCode>): Promise<OtpCode> {
    return this.repo.save(this.repo.create(data));
  }

  /**
   * Most recent unconsumed code for an address. Only one code is live at a
   * time — issuing a new one consumes the previous.
   */
  findActiveByEmail(email: string): Promise<OtpCode | null> {
    return this.repo.findOne({
      where: { email, consumedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  /** How many codes were issued to an address since `since`. */
  countIssuedSince(email: string, since: Date): Promise<number> {
    return this.repo
      .createQueryBuilder('otp')
      .where('otp.email = :email', { email })
      .andWhere('otp.created_at > :since', { since })
      .getCount();
  }

  async consume(id: string): Promise<void> {
    await this.repo.update({ id }, { consumedAt: new Date() });
  }

  async consumeAllForEmail(email: string): Promise<void> {
    await this.repo.update(
      { email, consumedAt: IsNull() },
      { consumedAt: new Date() },
    );
  }

  async incrementAttempts(id: string): Promise<number> {
    await this.repo.increment({ id }, 'attempts', 1);
    const row = await this.repo.findOne({
      where: { id },
      select: { id: true, attempts: true },
    });
    return row?.attempts ?? 0;
  }

  /** Housekeeping: drop codes that expired before `before`. */
  async deleteExpiredBefore(before: Date): Promise<void> {
    await this.repo.delete({ expiresAt: LessThan(before) });
  }
}
