import { Module } from '@nestjs/common';
import { V1Module } from './api/v1/v1.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CommonModule } from './common/common.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';

/**
 * Root wiring only: configuration, infrastructure, cross-cutting behaviour,
 * and one import per API version. Feature modules register in their version
 * module, never here.
 */
@Module({
  imports: [ConfigModule, CommonModule, DatabaseModule, V1Module],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
