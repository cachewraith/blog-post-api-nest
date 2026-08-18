import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Role } from '../../../common/enums/role.enum';

@Entity('users')
export class User extends BaseEntity {
  @Column({ name: 'first_name', type: 'varchar', length: 100 })
  firstName: string;

  @Column({ name: 'last_name', type: 'varchar', length: 100 })
  lastName: string;

  @Index('uq_users_email', { unique: true })
  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Index('uq_users_phone_number', { unique: true })
  @Column({ name: 'phone_number', type: 'varchar', length: 20 })
  phoneNumber: string;

  /**
   * bcrypt digest. `select: false` keeps it out of every query that does not
   * ask for it explicitly, so it cannot leak through a serialised entity
   * (OWASP A02).
   */
  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    select: false,
  })
  passwordHash: string;

  @Column({ type: 'enum', enum: Role, default: Role.User })
  role: Role;

  @Column({ name: 'is_email_verified', type: 'boolean', default: false })
  isEmailVerified: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /**
   * Any token issued at or before this instant is rejected. Bumped on password
   * change so a stolen refresh token dies with the old password.
   */
  @Column({
    name: 'credentials_changed_at',
    type: 'timestamptz',
    nullable: true,
  })
  credentialsChangedAt: Date | null;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }
}
