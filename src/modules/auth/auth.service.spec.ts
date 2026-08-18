import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OTP_DISPATCH_MESSAGE } from '../../common/constants/auth.constants';
import { Role } from '../../common/enums/role.enum';
import { TokenType } from '../../common/enums/token-type.enum';
import { hashSecret } from '../../common/utils/hash.util';
import { MailerService } from '../../shared/mailer/mailer.service';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import {
  AuthSessionDto,
  PendingVerificationDto,
} from './dto/auth-response.dto';
import { OtpService } from './otp.service';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';
import { TokenService } from './token.service';

const PASSWORD = 'Str0ngPassw0rd';

describe('AuthService', () => {
  let service: AuthService;
  let users: jest.Mocked<UsersService>;
  let tokens: jest.Mocked<TokenService>;
  let otp: jest.Mocked<OtpService>;
  let refreshTokens: jest.Mocked<RefreshTokenRepository>;
  let passwordHash: string;

  const makeUser = (overrides: Partial<User> = {}): User =>
    ({
      id: 'user-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      phoneNumber: '+8801712345678',
      passwordHash,
      role: Role.User,
      isEmailVerified: true,
      isActive: true,
      credentialsChangedAt: null,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as User;

  beforeAll(async () => {
    passwordHash = await hashSecret(PASSWORD);
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findById: jest.fn(),
            findByEmail: jest.fn(),
            findByEmailWithPassword: jest.fn(),
            existsByEmailOrPhone: jest.fn().mockResolvedValue(false),
            create: jest.fn(),
            update: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: TokenService,
          useValue: {
            issueTokenPair: jest.fn().mockResolvedValue({
              access_token: 'access',
              refresh_token: 'refresh',
              token_type: 'Bearer',
              expires_in: 900,
            }),
            rotate: jest.fn(),
            signResetToken: jest.fn().mockResolvedValue('reset'),
            verifyResetToken: jest.fn(),
            assertNotStale: jest.fn(),
          },
        },
        {
          provide: OtpService,
          useValue: {
            issue: jest.fn().mockResolvedValue(undefined),
            verify: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: MailerService,
          useValue: {
            sendPasswordChangedEmail: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: RefreshTokenRepository,
          useValue: {
            revokeById: jest.fn().mockResolvedValue(undefined),
            revokeAllForUser: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get(AuthService);
    users = module.get(UsersService);
    tokens = module.get(TokenService);
    otp = module.get(OtpService);
    refreshTokens = module.get(RefreshTokenRepository);
  });

  const registerDto = {
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'ada@example.com',
    phone_number: '+8801712345678',
    password: PASSWORD,
    password_confirmation: PASSWORD,
  };

  describe('register', () => {
    it('creates an unverified user, hashes the password, and sends a code', async () => {
      users.create.mockResolvedValue(makeUser({ isEmailVerified: false }));

      const result = await service.register(registerDto);

      const created = users.create.mock.calls[0][0];
      expect(created.isEmailVerified).toBe(false);
      expect(created.passwordHash).not.toBe(PASSWORD);
      expect(created.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(otp.issue).toHaveBeenCalledWith('ada@example.com');
      expect(result.requires_otp_verification).toBe(true);
    });

    it('issues no tokens before verification', async () => {
      users.create.mockResolvedValue(makeUser({ isEmailVerified: false }));

      const result = await service.register(registerDto);

      expect(tokens.issueTokenPair).not.toHaveBeenCalled();
      expect(result).not.toHaveProperty('access_token');
    });

    it('rejects a duplicate without saying which field collided', async () => {
      users.existsByEmailOrPhone.mockResolvedValue(true);

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.register(registerDto)).rejects.toThrow(
        /^An account with these details already exists$/,
      );
    });
  });

  describe('login', () => {
    it('returns a session for correct credentials', async () => {
      users.findByEmailWithPassword.mockResolvedValue(makeUser());

      const result = (await service.login(
        { email: 'ada@example.com', password: PASSWORD },
        {},
      )) as AuthSessionDto;

      expect(result.access_token).toBe('access');
      expect(result.user.email).toBe('ada@example.com');
    });

    it('never returns the password hash', async () => {
      users.findByEmailWithPassword.mockResolvedValue(makeUser());

      const result = (await service.login(
        { email: 'ada@example.com', password: PASSWORD },
        {},
      )) as AuthSessionDto;

      expect(JSON.stringify(result)).not.toContain(passwordHash);
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('gives the same error for an unknown email and a wrong password', async () => {
      users.findByEmailWithPassword.mockResolvedValue(null);
      const unknown = await service
        .login({ email: 'nobody@example.com', password: PASSWORD }, {})
        .catch((e: Error) => e.message);

      users.findByEmailWithPassword.mockResolvedValue(makeUser());
      const wrong = await service
        .login({ email: 'ada@example.com', password: 'Wr0ngPassword' }, {})
        .catch((e: Error) => e.message);

      expect(unknown).toBe(wrong);
      expect(unknown).toBe('Invalid email or password');
    });

    it('rejects a disabled account', async () => {
      users.findByEmailWithPassword.mockResolvedValue(
        makeUser({ isActive: false }),
      );

      await expect(
        service.login({ email: 'ada@example.com', password: PASSWORD }, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('sends a code instead of tokens when the email is unverified', async () => {
      users.findByEmailWithPassword.mockResolvedValue(
        makeUser({ isEmailVerified: false }),
      );

      const result = (await service.login(
        { email: 'ada@example.com', password: PASSWORD },
        {},
      )) as PendingVerificationDto;

      expect(result.requires_otp_verification).toBe(true);
      expect(otp.issue).toHaveBeenCalledWith('ada@example.com');
      expect(tokens.issueTokenPair).not.toHaveBeenCalled();
    });
  });

  describe('verifyOtp', () => {
    it('marks the account verified and returns a session plus a reset token', async () => {
      users.findByEmail.mockResolvedValue(makeUser({ isEmailVerified: false }));

      const result = await service.verifyOtp(
        { email: 'ada@example.com', otp: '123456' },
        {},
      );

      expect(otp.verify).toHaveBeenCalledWith('ada@example.com', '123456');
      expect(users.update).toHaveBeenCalledWith('user-1', {
        isEmailVerified: true,
      });
      expect(result.access_token).toBe('access');
      expect(result.reset_token).toBe('reset');
    });

    it('does not issue anything when the code is rejected', async () => {
      otp.verify.mockRejectedValue(new Error('Invalid or expired code'));

      await expect(
        service.verifyOtp({ email: 'ada@example.com', otp: '000000' }, {}),
      ).rejects.toThrow();
      expect(tokens.issueTokenPair).not.toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    it('answers identically for a known and an unknown address', async () => {
      users.findByEmail.mockResolvedValue(makeUser());
      const known = await service.forgotPassword({ email: 'ada@example.com' });

      users.findByEmail.mockResolvedValue(null);
      const unknown = await service.forgotPassword({
        email: 'nobody@example.com',
      });

      expect(known).toEqual(unknown);
      expect(known.message).toBe(OTP_DISPATCH_MESSAGE);
    });

    it('only sends a code when the account exists and is active', async () => {
      users.findByEmail.mockResolvedValue(makeUser({ isActive: false }));

      await service.forgotPassword({ email: 'ada@example.com' });

      expect(otp.issue).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const resetPayload = {
      sub: 'user-1',
      email: 'ada@example.com',
      role: Role.User,
      type: TokenType.PasswordReset,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600,
    };

    const dto = {
      reset_token: 'reset',
      password: 'N3wStrongPass',
      password_confirmation: 'N3wStrongPass',
    };

    it('stores a new hash, stamps the credential change, and drops all sessions', async () => {
      tokens.verifyResetToken.mockResolvedValue(resetPayload);
      users.findByEmailWithPassword.mockResolvedValue(makeUser());

      await service.resetPassword(dto);

      const update = users.update.mock.calls[0][1];
      expect(update.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(update.passwordHash).not.toBe(passwordHash);
      expect(update.credentialsChangedAt).toBeInstanceOf(Date);
      expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith('user-1');
    });

    it('refuses a token whose subject does not match the email claim', async () => {
      tokens.verifyResetToken.mockResolvedValue(resetPayload);
      users.findByEmailWithPassword.mockResolvedValue(
        makeUser({ id: 'someone-else' }),
      );

      await expect(service.resetPassword(dto)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(users.update).not.toHaveBeenCalled();
    });

    it('refuses to reuse the current password', async () => {
      tokens.verifyResetToken.mockResolvedValue(resetPayload);
      users.findByEmailWithPassword.mockResolvedValue(makeUser());

      await expect(
        service.resetPassword({
          reset_token: 'reset',
          password: PASSWORD,
          password_confirmation: PASSWORD,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('honours the staleness check that makes a reset token single-use', async () => {
      tokens.verifyResetToken.mockResolvedValue(resetPayload);
      users.findByEmailWithPassword.mockResolvedValue(makeUser());
      tokens.assertNotStale.mockImplementation(() => {
        throw new UnauthorizedException('Credentials have changed');
      });

      await expect(service.resetPassword(dto)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(users.update).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    const user = { id: 'user-1' } as User;

    it('revokes only the presented session by default', async () => {
      await service.logout({ user, sessionId: 'session-1' }, false);

      expect(refreshTokens.revokeById).toHaveBeenCalledWith('session-1');
      expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('revokes every session when all_devices is set', async () => {
      await service.logout({ user, sessionId: 'session-1' }, true);

      expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith('user-1');
      expect(refreshTokens.revokeById).not.toHaveBeenCalled();
    });
  });
});
