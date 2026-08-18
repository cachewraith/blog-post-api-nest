import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';

/**
 * Registers every v1 feature. A new v1 module is added here, not to
 * `AppModule` — which keeps the root wiring to config, database, and one
 * import per API version.
 *
 * Note this module owns no routes of its own: the `v1` URL segment comes from
 * each controller's `version: '1'`, never from this folder's name.
 */
@Module({
  imports: [AuthModule, UsersModule],
})
export class V1Module {}
