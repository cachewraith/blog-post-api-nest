import { Role } from '../../../../common/enums/role.enum';
import { User } from '../entities/user.entity';

export interface UserResponseDto {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  role: Role;
  is_email_verified: boolean;
  created_at: Date;
}

/**
 * Explicit allowlist projection. New entity columns stay private until someone
 * adds them here on purpose, so a future internal flag cannot leak by default.
 */
export function toUserResponse(user: User): UserResponseDto {
  return {
    id: user.id,
    first_name: user.firstName,
    last_name: user.lastName,
    email: user.email,
    phone_number: user.phoneNumber,
    role: user.role,
    is_email_verified: user.isEmailVerified,
    created_at: user.createdAt,
  };
}
