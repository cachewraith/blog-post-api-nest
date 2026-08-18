import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../core/decorators/public.decorator';
import { ResponseMessage } from '../../core/decorators/response-message.decorator';
import { RefreshTokenGuard } from '../../core/guards/refresh-token.guard';
import { ZodValidationPipe } from '../../core/pipes/zod-validation.pipe';
import { AuthService } from './auth.service';
import {
  AuthSessionDto,
  PendingVerificationDto,
  TokenPairDto,
  VerifyOtpResponseDto,
} from './dto/auth-response.dto';
import { forgotPasswordSchema } from './dto/forgot-password.dto';
import type { ForgotPasswordDto } from './dto/forgot-password.dto';
import { loginSchema } from './dto/login.dto';
import type { LoginDto } from './dto/login.dto';
import { logoutSchema } from './dto/refresh-token.dto';
import type { LogoutDto } from './dto/refresh-token.dto';
import { registerSchema } from './dto/register.dto';
import type { RegisterDto } from './dto/register.dto';
import { resetPasswordSchema } from './dto/reset-password.dto';
import type { ResetPasswordDto } from './dto/reset-password.dto';
import { verifyOtpSchema } from './dto/verify-otp.dto';
import type { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshContext } from './strategies/refresh-token.strategy';
import { SessionContext } from './token.service';

/**
 * Every route here is `@Public()` — they are the entry points that mint
 * credentials, so the global JWT guard must not run. The tighter `@Throttle`
 * budgets replace the app-wide default because these are the endpoints worth
 * brute-forcing (OWASP A04/A07).
 *
 * Validation pipes are attached to `@Body()` rather than via `@UsePipes`,
 * which would also run the schema against the `@Req()` argument.
 *
 * The version is declared here, not assumed from a global prefix: a breaking
 * change to any of these routes ships as an `AuthV2Controller` with
 * `version: '2'` alongside this one, and existing clients keep working.
 */
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 3600_000 } })
  @ResponseMessage('Registration successful, verification code sent')
  register(
    @Body(new ZodValidationPipe(registerSchema)) dto: RegisterDto,
  ): Promise<PendingVerificationDto> {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @ResponseMessage('Login successful')
  login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
    @Req() request: Request,
  ): Promise<AuthSessionDto | PendingVerificationDto> {
    return this.authService.login(dto, sessionContext(request));
  }

  /**
   * The one and only OTP endpoint. Codes carry no purpose, so this same route
   * finishes registration, signs in an unverified user, and unlocks a password
   * reset — the response carries both a session and a `reset_token`.
   */
  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @ResponseMessage('Verification successful')
  verifyOtp(
    @Body(new ZodValidationPipe(verifyOtpSchema)) dto: VerifyOtpDto,
    @Req() request: Request,
  ): Promise<VerifyOtpResponseDto> {
    return this.authService.verifyOtp(dto, sessionContext(request));
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 3600_000 } })
  @ResponseMessage('Request received')
  forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @ResponseMessage('Password updated')
  resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.resetPassword(dto);
  }

  /** The guard reads and fully validates `refresh_token` from the body. */
  @Public()
  @UseGuards(RefreshTokenGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 900_000 } })
  @ResponseMessage('Token refreshed')
  refresh(@Req() request: Request): Promise<TokenPairDto> {
    return this.authService.refresh(
      request.user as RefreshContext,
      sessionContext(request),
    );
  }

  @Public()
  @UseGuards(RefreshTokenGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Signed out')
  logout(
    @Body(new ZodValidationPipe(logoutSchema)) dto: LogoutDto,
    @Req() request: Request,
  ): Promise<{ message: string }> {
    return this.authService.logout(
      request.user as RefreshContext,
      dto.all_devices,
    );
  }
}

/** Session metadata recorded against a refresh-token row for auditing. */
function sessionContext(request: Request): SessionContext {
  return {
    userAgent: request.get('user-agent') ?? null,
    ipAddress: request.ips?.length ? request.ips[0] : (request.ip ?? null),
  };
}
