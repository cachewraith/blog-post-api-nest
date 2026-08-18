import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import { RefreshToken } from '../entities/refresh-token.entity';

@Injectable()
export class RefreshTokenRepository {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly repo: Repository<RefreshToken>,
  ) {}

  create(data: Partial<RefreshToken>): Promise<RefreshToken> {
    return this.repo.save(this.repo.create(data));
  }

  findActiveById(id: string): Promise<RefreshToken | null> {
    return this.repo.findOne({ where: { id, revokedAt: IsNull() } });
  }

  /**
   * Bind a session row to the token that was signed for it. Separate from
   * `create` because the token embeds the row id, so the row must exist first.
   */
  async setTokenHash(id: string, tokenHash: string): Promise<void> {
    await this.repo.update({ id }, { tokenHash });
  }

  async revokeById(id: string): Promise<void> {
    await this.repo.update(
      { id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  /** Used on password change and on `all_devices` logout. */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.repo.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async deleteExpiredBefore(before: Date): Promise<void> {
    await this.repo.delete({ expiresAt: LessThan(before) });
  }
}
