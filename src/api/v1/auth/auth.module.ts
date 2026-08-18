import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailerModule } from '../../../shared/mailer/mailer.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';
import { OtpCode } from './entities/otp-code.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { OtpService } from './services/otp.service';
import { OtpCodeRepository } from './repositories/otp-code.repository';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RefreshTokenStrategy } from './strategies/refresh-token.strategy';
import { TokenService } from './services/token.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([RefreshToken, OtpCode]),
    PassportModule,
    // No secret registered here on purpose — every sign/verify call passes its
    // own key, so the three token classes can never be confused.
    JwtModule.register({}),
    UsersModule,
    MailerModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    OtpService,
    OtpCodeRepository,
    RefreshTokenRepository,
    JwtStrategy,
    RefreshTokenStrategy,
  ],
  exports: [AuthService],
})
export class AuthModule {}
