import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Accepts only refresh tokens. Used by the refresh and logout routes. */
@Injectable()
export class RefreshTokenGuard extends AuthGuard('jwt-refresh') {}
