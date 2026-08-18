import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'is_public';

/**
 * Opts a route out of the global JWT guard. Authentication is deny-by-default,
 * so forgetting this decorator fails closed (OWASP A01).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
