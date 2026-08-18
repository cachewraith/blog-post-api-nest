import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../types/jwt-payload.type';

/**
 * Reads the identity the JWT strategy attached to the request. Handlers must
 * take the acting user from here, never from a body or path parameter, so a
 * client cannot act as someone else (OWASP A01).
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: AuthenticatedUser }>();

    return field ? request.user?.[field] : request.user;
  },
);
