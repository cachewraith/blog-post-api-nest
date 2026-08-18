import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import jwtConfig from '../../../../config/jwt.config';
import { Role } from '../../../../common/enums/role.enum';
import { TokenType } from '../../../../common/enums/token-type.enum';
import { VerifiedJwtPayload } from '../../../../common/types/jwt-payload.type';
import { hashToken } from '../../../../common/utils/crypto.util';
import { User } from '../../users/entities/user.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { RefreshTokenRepository } from '../repositories/refresh-token.repository';
import { TokenService } from './token.service';

const config = {
  access: { secret: 'a'.repeat(40), expiresIn: '15m' },
  refresh: { secret: 'r'.repeat(40), expiresIn: '7d' },
  reset: { secret: 's'.repeat(40), expiresIn: '10m' },
  issuer: 'blog-post-api',
  audience: 'blog-post-api-clients',
};

describe('TokenService', () => {
  let service: TokenService;
  let jwt: JwtService;
  let repo: jest.Mocked<RefreshTokenRepository>;

  const user = {
    id: 'user-1',
    email: 'ada@example.com',
    role: Role.User,
    credentialsChangedAt: null,
  } as User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        JwtService,
        {
          provide: RefreshTokenRepository,
          useValue: {
            create: jest
              .fn()
              .mockImplementation((data: Partial<RefreshToken>) =>
                Promise.resolve({ id: 'session-1', ...data } as RefreshToken),
              ),
            setTokenHash: jest.fn().mockResolvedValue(undefined),
            findActiveById: jest.fn(),
            revokeById: jest.fn().mockResolvedValue(undefined),
            revokeAllForUser: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: jwtConfig.KEY, useValue: config },
      ],
    }).compile();

    service = module.get(TokenService);
    jwt = module.get(JwtService);
    repo = module.get(RefreshTokenRepository);
  });

  describe('issueTokenPair', () => {
    it('signs the access and refresh tokens with different secrets', async () => {
      const pair = await service.issueTokenPair(user);

      const access = jwt.verify<VerifiedJwtPayload>(pair.access_token, {
        secret: config.access.secret,
      });
      expect(access.type).toBe(TokenType.Access);

      // The access secret must not validate the refresh token.
      expect(() =>
        jwt.verify(pair.refresh_token, { secret: config.access.secret }),
      ).toThrow();
    });

    it('binds the refresh token to a session row by storing its hash', async () => {
      const pair = await service.issueTokenPair(user);

      expect(repo.setTokenHash).toHaveBeenCalledWith(
        'session-1',
        hashToken(pair.refresh_token),
      );
    });

    it('carries the session id on the refresh token only', async () => {
      const pair = await service.issueTokenPair(user);

      const refresh = jwt.verify<VerifiedJwtPayload>(pair.refresh_token, {
        secret: config.refresh.secret,
      });
      const access = jwt.verify<VerifiedJwtPayload>(pair.access_token, {
        secret: config.access.secret,
      });

      expect(refresh.sid).toBe('session-1');
      expect(access.sid).toBeUndefined();
    });

    it('reports the access lifetime in seconds', async () => {
      const pair = await service.issueTokenPair(user);

      expect(pair.expires_in).toBe(900);
    });
  });

  describe('verifyResetToken', () => {
    it('accepts a reset token', async () => {
      const token = await service.signResetToken(user);

      await expect(service.verifyResetToken(token)).resolves.toMatchObject({
        sub: 'user-1',
        type: TokenType.PasswordReset,
      });
    });

    it('rejects an access token presented as a reset token', async () => {
      const pair = await service.issueTokenPair(user);

      await expect(service.verifyResetToken(pair.access_token)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a token signed with the wrong secret', async () => {
      const forged = jwt.sign(
        { sub: 'user-1', type: TokenType.PasswordReset },
        {
          secret: 'x'.repeat(40),
          issuer: config.issuer,
          audience: config.audience,
        },
      );

      await expect(service.verifyResetToken(forged)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('gives away nothing about why verification failed', async () => {
      const expired = jwt.sign(
        { sub: 'user-1', type: TokenType.PasswordReset },
        {
          secret: config.reset.secret,
          issuer: config.issuer,
          audience: config.audience,
          expiresIn: -10,
        },
      );
      const forged = jwt.sign(
        { sub: 'user-1', type: TokenType.PasswordReset },
        {
          secret: 'x'.repeat(40),
          issuer: config.issuer,
          audience: config.audience,
        },
      );

      const first = await service
        .verifyResetToken(expired)
        .catch((e: Error) => e.message);
      const second = await service
        .verifyResetToken(forged)
        .catch((e: Error) => e.message);

      expect(first).toBe(second);
    });
  });

  describe('resolveSession', () => {
    const payload = { sid: 'session-1' } as VerifiedJwtPayload;

    it('returns the live session when the presented token matches', async () => {
      repo.findActiveById.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        tokenHash: hashToken('the-token'),
        expiresAt: new Date(Date.now() + 60_000),
      } as RefreshToken);

      await expect(
        service.resolveSession(payload, 'the-token'),
      ).resolves.toMatchObject({ id: 'session-1' });
    });

    it('rejects a revoked or missing session', async () => {
      repo.findActiveById.mockResolvedValue(null);

      await expect(
        service.resolveSession(payload, 'the-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an expired session', async () => {
      repo.findActiveById.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        tokenHash: hashToken('the-token'),
        expiresAt: new Date(Date.now() - 1000),
      } as RefreshToken);

      await expect(
        service.resolveSession(payload, 'the-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('kills every session when a superseded token is replayed', async () => {
      repo.findActiveById.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        tokenHash: hashToken('the-current-token'),
        expiresAt: new Date(Date.now() + 60_000),
      } as RefreshToken);

      await expect(
        service.resolveSession(payload, 'an-old-token'),
      ).rejects.toThrow(UnauthorizedException);
      expect(repo.revokeAllForUser).toHaveBeenCalledWith('user-1');
    });
  });

  describe('assertNotStale', () => {
    const issuedAt = Math.floor(Date.now() / 1000);
    const payload = { iat: issuedAt } as VerifiedJwtPayload;

    it('passes when the account has never changed credentials', () => {
      expect(() => service.assertNotStale(payload, user)).not.toThrow();
    });

    it('passes for a token minted after the change', () => {
      const changed = {
        ...user,
        credentialsChangedAt: new Date((issuedAt - 60) * 1000),
      } as User;

      expect(() => service.assertNotStale(payload, changed)).not.toThrow();
    });

    it('rejects a token minted before the change', () => {
      const changed = {
        ...user,
        credentialsChangedAt: new Date((issuedAt + 60) * 1000),
      } as User;

      expect(() => service.assertNotStale(payload, changed)).toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a token minted in the same second as the change, making a reset token single-use', () => {
      const changed = {
        ...user,
        credentialsChangedAt: new Date(issuedAt * 1000),
      } as User;

      expect(() => service.assertNotStale(payload, changed)).toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('rotate', () => {
    it('revokes the old session before issuing a new one', async () => {
      await service.rotate(user, 'session-old');

      expect(repo.revokeById).toHaveBeenCalledWith('session-old');
      expect(repo.create).toHaveBeenCalled();
    });
  });
});
