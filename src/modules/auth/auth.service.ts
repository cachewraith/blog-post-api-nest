import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { OTP_DISPATCH_MESSAGE } from '../../common/constants/auth.constants';
import { hashSecret, verifySecret } from '../../common/utils/hash.util';
import { MailerService } from '../../shared/mailer/mailer.service';
import { toUserResponse } from '../users/dto/user-response.dto';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import {
  AuthSessionDto,
  PendingVerificationDto,
  TokenPairDto,
  VerifyOtpResponseDto,
} from './dto/auth-response.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { OtpService } from './otp.service';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';
import { RefreshContext } from './strategies/refresh-token.strategy';
import { SessionContext, TokenService } from './token.service';

/**
 * A genuine cost-12 bcrypt hash of 32 random bytes that were discarded. When
 * the email is unknown we verify against this instead of returning early, so
 * the failure path costs the same as the success path and response time cannot
 * be used to enumerate accounts (OWASP A07). It must stay a real hash at the
 * configured cost — a malformed string would fail fast and reintroduce the
 * timing difference.
 */
const DUMMY_HASH =
  '$2b$12$NEQSezydWcUZANbS7zfLFeydJhwceV2JX.8nzJTuv51Gjj93rngQ6';

/** Postgres `unique_violation`. */
const PG_UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string } | undefined)?.code ===
      PG_UNIQUE_VIOLATION
  );
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
    private readonly otpService: OtpService,
    private readonly mailerService: MailerService,
    private readonly refreshTokenRepository: RefreshTokenRepository,
  ) {}

  /**
   * Create an unverified account and send its first OTP. No tokens are issued
   * here — the caller must complete `verify-otp` first.
   */
  async register(dto: RegisterDto): Promise<PendingVerificationDto> {
    const email = dto.email;
    const phoneNumber = dto.phone_number;

    if (await this.usersService.existsByEmailOrPhone(email, phoneNumber)) {
      // Deliberately does not say which field collided, so this endpoint
      // cannot be used to test whether an email or phone is registered.
      throw new ConflictException(
        'An account with these details already exists',
      );
    }

    let user: User;
    try {
      user = await this.usersService.create({
        firstName: dto.first_name,
        lastName: dto.last_name,
        email,
        phoneNumber,
        passwordHash: await hashSecret(dto.password),
        isEmailVerified: false,
      });
    } catch (error) {
      // The check above races: two simultaneous registrations can both pass it.
      // The unique indexes are the real guard, so translate their violation
      // into the same response rather than leaking a 500.
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'An account with these details already exists',
        );
      }
      throw error;
    }

    this.logger.log(`Registered user ${user.id}`);
    await this.otpService.issue(email);

    return {
      requires_otp_verification: true,
      email,
      message:
        'Account created. Enter the code sent to your email to activate it.',
    };
  }

  /**
   * Password check. An account that has not verified its email gets a fresh
   * OTP instead of a session.
   */
  async login(
    dto: LoginDto,
    context: SessionContext,
  ): Promise<AuthSessionDto | PendingVerificationDto> {
    const user = await this.usersService.findByEmailWithPassword(dto.email);

    // Run the comparison either way, then decide — same work, same timing.
    const passwordMatches = await verifySecret(
      dto.password,
      user?.passwordHash ?? DUMMY_HASH,
    );

    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new ForbiddenException('This account has been disabled');
    }

    if (!user.isEmailVerified) {
      await this.otpService.issue(user.email);
      return {
        requires_otp_verification: true,
        email: user.email,
        message: 'Email not verified. A new code has been sent to your email.',
      };
    }

    await this.usersService.update(user.id, { lastLoginAt: new Date() });

    return this.buildSession(user, context);
  }

  /**
   * The single OTP entry point. Because codes carry no purpose, verifying one
   * proves mailbox ownership and nothing more — so it both activates the
   * account (signing the caller in) and returns a reset token the
   * forgot-password flow can spend.
   */
  async verifyOtp(
    dto: VerifyOtpDto,
    context: SessionContext,
  ): Promise<VerifyOtpResponseDto> {
    await this.otpService.verify(dto.email, dto.otp);

    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      // A code only exists for a real address; treat a miss as a bad code.
      throw new UnauthorizedException('Invalid or expired code');
    }

    if (!user.isActive) {
      throw new ForbiddenException('This account has been disabled');
    }

    if (!user.isEmailVerified) {
      await this.usersService.update(user.id, { isEmailVerified: true });
      user.isEmailVerified = true;
    }

    const session = await this.buildSession(user, context);

    return {
      ...session,
      reset_token: await this.tokenService.signResetToken(user),
    };
  }

  /**
   * Sends a code to the address if it belongs to an active account. The
   * response is identical either way (OWASP A07).
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(dto.email);

    if (user?.isActive) {
      await this.otpService.issue(user.email);
    } else {
      this.logger.warn(
        `Password reset requested for unknown or disabled address`,
      );
    }

    return { message: OTP_DISPATCH_MESSAGE };
  }

  /**
   * Spend a reset token. Bumping `credentialsChangedAt` is what makes the
   * token single-use: its `iat` then sits at or before the change, and every
   * previously issued token — including this one — stops verifying.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const payload = await this.tokenService.verifyResetToken(dto.reset_token);

    const user = await this.usersService.findByEmailWithPassword(payload.email);
    if (!user || user.id !== payload.sub) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (!user.isActive) {
      throw new ForbiddenException('This account has been disabled');
    }

    this.tokenService.assertNotStale(payload, user);

    if (await verifySecret(dto.password, user.passwordHash)) {
      throw new ConflictException(
        'New password must differ from the current one',
      );
    }

    await this.usersService.update(user.id, {
      passwordHash: await hashSecret(dto.password),
      credentialsChangedAt: new Date(),
      isEmailVerified: true,
    });

    // Belt and braces: the timestamp already retires old tokens, but clearing
    // the session rows means a stolen refresh token cannot even be looked up.
    await this.refreshTokenRepository.revokeAllForUser(user.id);
    await this.mailerService.sendPasswordChangedEmail(user.email);

    this.logger.log(`Password reset completed for user ${user.id}`);

    return {
      message: 'Password updated. Sign in with your new password.',
    };
  }

  /**
   * Exchange a refresh token for a new pair, rotating the session. The token
   * itself was already verified and resolved to a live session by
   * `RefreshTokenStrategy`.
   */
  refresh(
    { user, sessionId }: RefreshContext,
    context: SessionContext,
  ): Promise<TokenPairDto> {
    return this.tokenService.rotate(user, sessionId, context);
  }

  /**
   * Revoke the presented session — this is what logout means for a JWT setup.
   * The access token is not revoked; it dies on its own within minutes.
   */
  async logout(
    { user, sessionId }: RefreshContext,
    allDevices: boolean,
  ): Promise<{ message: string }> {
    if (allDevices) {
      await this.refreshTokenRepository.revokeAllForUser(user.id);
    } else {
      await this.refreshTokenRepository.revokeById(sessionId);
    }

    this.logger.log(`Logout for user ${user.id} (all_devices=${allDevices})`);

    return {
      message: allDevices
        ? 'Signed out on all devices'
        : 'Signed out successfully',
    };
  }

  private async buildSession(
    user: User,
    context: SessionContext,
  ): Promise<AuthSessionDto> {
    const tokens = await this.tokenService.issueTokenPair(user, context);
    return { ...tokens, user: toUserResponse(user) };
  }
}
