import { Logger, VersioningType } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import appConfig from './config/app.config';
import securityConfig from './config/security.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Stack traces stay out of responses; the exception filter logs them.
    bufferLogs: true,
  });

  const config = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);
  const security = app.get<ConfigType<typeof securityConfig>>(
    securityConfig.KEY,
  );

  // Security headers: CSP, HSTS, nosniff, frame denial (OWASP A05).
  app.use(helmet());

  // Trust exactly one proxy hop. Without a bound, a client could forge
  // X-Forwarded-For and slip the IP-keyed rate limiter (OWASP A04).
  app.set('trust proxy', security.trustProxyHops);

  // Hide the framework fingerprint.
  app.disable('x-powered-by');

  app.enableCors(security.cors);
  app.setGlobalPrefix(config.apiPrefix);

  // URI versioning: routes resolve to /{prefix}/v{version}/{path}. Controllers
  // declare their own `version`, so shipping a v2 of one endpoint means adding
  // a controller — no global change, and v1 keeps serving existing clients.
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: config.defaultApiVersion,
  });

  // Cap request bodies — auth payloads are tiny, so anything larger is abuse.
  app.useBodyParser('json', { limit: security.bodyLimit });
  app.useBodyParser('urlencoded', {
    limit: security.bodyLimit,
    extended: true,
  });

  app.enableShutdownHooks();

  await app.listen(config.port);
  Logger.log(
    `Listening on http://localhost:${config.port}/${config.apiPrefix}/v${config.defaultApiVersion}`,
    'Bootstrap',
  );
}

void bootstrap();
