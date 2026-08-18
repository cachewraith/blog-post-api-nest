import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../../shared/base/base.entity';

/**
 * A one-time code bound to an email address. There is deliberately no
 * `purpose` column — the API exposes a single verify endpoint, so a code is
 * simply proof that the holder controls the mailbox.
 */
@Entity('otp_codes')
@Index('idx_otp_codes_email_created', ['email', 'createdAt'])
export class OtpCode extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  email: string;

  /** SHA-256 of the digits — the plaintext code is never stored. */
  @Column({ name: 'code_hash', type: 'varchar', length: 64 })
  codeHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt: Date | null;

  @Column({ type: 'int', default: 0 })
  attempts: number;
}
