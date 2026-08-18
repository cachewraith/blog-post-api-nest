import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './core/decorators/public.decorator';
import { ResponseMessage } from './core/decorators/response-message.decorator';

/**
 * Version-neutral: the health check answers at `/api/health` regardless of
 * which API versions exist, so probes and load balancers never need updating
 * when a new version ships.
 */
@Controller({ version: VERSION_NEUTRAL })
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** Liveness probe. Reports nothing about versions or dependencies. */
  @Public()
  @Get('health')
  @ResponseMessage('Service is healthy')
  getHealth(): { status: string; uptime: number } {
    return this.appService.getHealth();
  }
}
