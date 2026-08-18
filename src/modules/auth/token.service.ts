import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import jwtConfig from '../../config/jwt.config';
import { TokenType } from '../../common/enums/token-type.enum';
import {
  JwtPayload,
  VerifiedJwtPayload,
} from '../../common/interfaces/jwt-payload.interface';
import { durationToSeconds } from '../../common/utils/duration.util';
import { hashToken } from '../../common/utils/hash.util';
import { TokenPairDto } from './dto/auth-response.dto';
import { RefreshToken } from './entities/refresh-token.entity';
import { User } from '../users/entities/user.entity';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';

export interface SessionContext {
  userAgent?: string | null;
  ipAddress?: string | null;
}

/** Minting and verification of every JWT the API issues. */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    @Inject(jwtConfig.KEY)
    private readonly config: ConfigType<typeof jwtConfig>,
  ) {}

  get accessTokenTtlSeconds(): number {
    return durationToSeconds(this.config.access.expiresIn);
  }

  /**
   * Create a session row and sign the pair bound to it. The refresh token
   * carries the row id (`sid`), which is what logout deletes.
   */
  async issueTokenPair(
    user: User,
    context: SessionContext = {},
  ): Promise<TokenPairDto> {
    const refreshTtl = durationToSeconds(this.config.refresh.expiresIn);
    const session = await this.refreshTokenRepository.create({
      userId: user.id,
      // Placeholder; replaced below once the signed token exists.
      tokenHash: '',
      expiresAt: new Date(Date.now() + refreshTtl * 1000),
      userAgent: context.userAgent?.slice(0, 255) ?? null,
      ipAddress: context.ipAddress?.slice(0, 45) ?? null,
    });

    return this.signPairForSession(user, session);
  }

  /**
   * Refresh-token rotation: the presented session is revoked and a fresh one
   * issued, so a stolen token is usable at most once (OWASP A07).
   */
  async rotate(
    user: User,
    currentSessionId: string,
    context: SessionContext = {},
  ): Promise<TokenPairDto> {
    await this.refreshTokenRepository.revokeById(currentSessionId);
    return this.issueTokenPair(user, context);
  }

  /**
   * Short-lived proof that the holder verified an OTP for this account.
   * Single use is enforced by `User.credentialsChangedAt`: completing a reset
   * bumps that timestamp past the token's `iat`, retiring it and every other
   * token minted earlier.
   */
  signResetToken(user: User): Promise<string> {
    return this.jwtService.signAsync(
      this.payloadFor(user, TokenType.PasswordReset),
      {
        secret: this.config.reset.secret,
        expiresIn: durationToSeconds(this.config.reset.expiresIn),
        issuer: this.config.issuer,
        audience: this.config.audience,
      },
    );
  }

  async verifyResetToken(token: string): Promise<VerifiedJwtPayload> {
    const payload = await this.verify(token, this.config.reset.secret);

    if (payload.type !== TokenType.PasswordReset) {
      throw new UnauthorizedException('Invalid reset token');
    }

    return payload;
  }

  /**
   * Look up the session a refresh token names and confirm the token presented
   * is the one stored for it. A revoked, expired, or superseded session fails
   * here even though the JWT signature is still valid.
   */
  async resolveSession(
    payload: VerifiedJwtPayload,
    presentedToken: string,
  ): Promise<RefreshToken> {
    const session = await this.refreshTokenRepository.findActiveById(
      payload.sid!,
    );

    if (!session || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Session expired or revoked');
    }

    if (session.tokenHash !== hashToken(presentedToken)) {
      // The session exists but this is not its current token — a replayed
      // pre-rotation token. Kill the whole family.
      await this.refreshTokenRepository.revokeAllForUser(session.userId);
      throw new UnauthorizedException('Session expired or revoked');
    }

    return session;
  }

  /**
   * Reject tokens minted at or before the last credential change, so a
   * password reset retires previously issued access tokens too.
   */
  assertNotStale(payload: VerifiedJwtPayload, user: User): void {
    if (!user.credentialsChangedAt) return;

    const changedAtSeconds = Math.floor(
      user.credentialsChangedAt.getTime() / 1000,
    );

    if (payload.iat <= changedAtSeconds) {
      throw new UnauthorizedException(
        'Credentials have changed, sign in again',
      );
    }
  }

  private async signPairForSession(
    user: User,
    session: RefreshToken,
  ): Promise<TokenPairDto> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(this.payloadFor(user, TokenType.Access), {
        secret: this.config.access.secret,
        expiresIn: this.accessTokenTtlSeconds,
        issuer: this.config.issuer,
        audience: this.config.audience,
        jwtid: randomUUID(),
      }),
      this.jwtService.signAsync(
        { ...this.payloadFor(user, TokenType.Refresh), sid: session.id },
        {
          secret: this.config.refresh.secret,
          expiresIn: durationToSeconds(this.config.refresh.expiresIn),
          issuer: this.config.issuer,
          audience: this.config.audience,
          jwtid: randomUUID(),
        },
      ),
    ]);

    await this.refreshTokenRepository.setTokenHash(
      session.id,
      hashToken(refreshToken),
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: this.accessTokenTtlSeconds,
    };
  }

  private payloadFor(user: User, type: TokenType): JwtPayload {
    return {
      sub: user.id,
      email: user.email,
      role: user.role,
      type,
    };
  }

  private async verify(
    token: string,
    secret: string,
  ): Promise<VerifiedJwtPayload> {
    try {
      return await this.jwtService.verifyAsync<VerifiedJwtPayload>(token, {
        secret,
        issuer: this.config.issuer,
        audience: this.config.audience,
      });
    } catch {
      // Never surface the jsonwebtoken reason — it distinguishes "expired"
      // from "bad signature" (OWASP A05).
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
