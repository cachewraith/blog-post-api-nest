import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

/**
 * All user SQL lives here. Every lookup goes through TypeORM's parameter
 * binding — no string-built predicates anywhere (OWASP A03).
 */
@Injectable()
export class UserRepository {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({ where: { email } });
  }

  /** Same as `findByEmail`, but pulls the normally-hidden password hash. */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.repo.findOne({
      where: { email },
      select: {
        id: true,
        email: true,
        role: true,
        passwordHash: true,
        isEmailVerified: true,
        isActive: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        credentialsChangedAt: true,
        createdAt: true,
      },
    });
  }

  findByPhoneNumber(phoneNumber: string): Promise<User | null> {
    return this.repo.findOne({ where: { phoneNumber } });
  }

  existsByEmailOrPhone(email: string, phoneNumber: string): Promise<boolean> {
    return this.repo.existsBy([{ email }, { phoneNumber }]);
  }

  create(data: Partial<User>): Promise<User> {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: string, data: Partial<User>): Promise<void> {
    await this.repo.update({ id }, data);
  }
}
