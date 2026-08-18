import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * RBAC check. The role comes from the verified token payload, which the JWT
 * strategy re-reads from the database — never from the request body
 * (OWASP A01).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();

    return !!user && required.includes(user.role);
  }
}
