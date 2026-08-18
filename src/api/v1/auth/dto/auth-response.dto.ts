import { UserResponseDto } from '../../users/dto/user-response.dto';

export interface TokenPairDto {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
}

export interface AuthSessionDto extends TokenPairDto {
  user: UserResponseDto;
}

/** Returned when a step remains before tokens are issued. */
export interface PendingVerificationDto {
  requires_otp_verification: true;
  email: string;
  message: string;
}

/**
 * `POST /auth/verify-otp` serves both the "confirm my account / log me in" and
 * the "I forgot my password" flows, because OTPs carry no purpose. It therefore
 * returns a session *and* a reset token; clients use whichever the flow needs.
 */
export interface VerifyOtpResponseDto extends AuthSessionDto {
  reset_token: string;
}
