import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import jwtConfig from '../../../config/jwt.config';
import { TokenType } from '../../../common/enums/token-type.enum';
import { VerifiedJwtPayload } from '../../../common/interfaces/jwt-payload.interface';
import { User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/users.service';
import { RefreshTokenRepository } from '../repositories/refresh-token.repository';
import { TokenService } from '../token.service';

/** What the refresh routes get on `request.user`. */
export interface RefreshContext {
  user: User;
  sessionId: string;
}

/**
 * Refresh-token strategy. Signature verification alone proves nothing useful
 * here — the token must also name a session row that is still active and still
 * holds this exact token, which is what makes logout and rotation real
 * (OWASP A07).
 *
 * The token is read from the request body rather than the Authorization
 * header, so it never lands in proxy access logs the way a URL or a
 * misconfigured header dump would.
 */
@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    @Inject(jwtConfig.KEY) config: ConfigType<typeof jwtConfig>,
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
    private readonly refreshTokenRepository: RefreshTokenRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refresh_token'),
      ignoreExpiration: false,
      secretOrKey: config.refresh.secret,
      issuer: config.issuer,
      audience: config.audience,
      passReqToCallback: true,
    });
  }

  async validate(
    request: Request,
    payload: VerifiedJwtPayload,
  ): Promise<RefreshContext> {
    if (payload.type !== TokenType.Refresh || !payload.sid) {
      throw new UnauthorizedException('Invalid token type');
    }

    const presented = (request.body as { refresh_token?: string })
      ?.refresh_token;
    if (!presented) {
      throw new UnauthorizedException('refresh_token is required');
    }

    const session = await this.tokenService.resolveSession(payload, presented);
    const user = await this.usersService.findById(session.userId);

    if (!user || !user.isActive) {
      await this.refreshTokenRepository.revokeById(session.id);
      throw new UnauthorizedException('Session expired or revoked');
    }

    this.tokenService.assertNotStale(payload, user);

    return { user, sessionId: session.id };
  }
}
