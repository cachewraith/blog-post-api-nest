import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import jwtConfig from '../../../../config/jwt.config';
import { TokenType } from '../../../../common/enums/token-type.enum';
import {
  AuthenticatedUser,
  VerifiedJwtPayload,
} from '../../../../common/types/jwt-payload.type';
import { UsersService } from '../../users/services/users.service';
import { TokenService } from '../services/token.service';

/**
 * Access-token strategy. A valid signature is not enough: the user is re-read
 * from the database on every request so a disabled account or a role change
 * takes effect immediately rather than at token expiry (OWASP A01).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @Inject(jwtConfig.KEY) config: ConfigType<typeof jwtConfig>,
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.access.secret,
      issuer: config.issuer,
      audience: config.audience,
    });
  }

  async validate(payload: VerifiedJwtPayload): Promise<AuthenticatedUser> {
    if (payload.type !== TokenType.Access) {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.usersService.findById(payload.sub);

    if (!user || !user.isActive || !user.isEmailVerified) {
      throw new UnauthorizedException('Account is not available');
    }

    this.tokenService.assertNotStale(payload, user);

    return { id: user.id, email: user.email, role: user.role };
  }
}
