import { Role } from '../enums/role.enum';
import { TokenType } from '../enums/token-type.enum';

/** Claims we sign. `sub` is the user id. */
export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  type: TokenType;
  /** Session id — only present on refresh tokens, ties the token to a DB row. */
  sid?: string;
}

/** Payload after verification, with the registered claims JWT adds. */
export type VerifiedJwtPayload = JwtPayload & { iat: number; exp: number };

/** Shape attached to `request.user` by the JWT strategies. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}
