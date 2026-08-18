import { Injectable, NotFoundException } from '@nestjs/common';
import { User } from '../entities/user.entity';
import { UserRepository } from '../repositories/user.repository';

@Injectable()
export class UsersService {
  constructor(private readonly userRepository: UserRepository) {}

  findById(id: string): Promise<User | null> {
    return this.userRepository.findById(id);
  }

  async findByIdOrFail(id: string): Promise<User> {
    const user = await this.userRepository.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findByEmail(email);
  }

  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.userRepository.findByEmailWithPassword(email);
  }

  existsByEmailOrPhone(email: string, phoneNumber: string): Promise<boolean> {
    return this.userRepository.existsByEmailOrPhone(email, phoneNumber);
  }

  create(data: Partial<User>): Promise<User> {
    return this.userRepository.create(data);
  }

  update(id: string, data: Partial<User>): Promise<void> {
    return this.userRepository.update(id, data);
  }
}
