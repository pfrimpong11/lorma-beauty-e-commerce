import { ValidationPipe, VersioningType, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
  });

  const port = Number.parseInt(process.env.BACKEND_PORT ?? '4000', 10);
  const isProduction = process.env.NODE_ENV === 'production';
  const trustProxy = ['true', '1', 'yes'].includes((process.env.TRUST_PROXY ?? '').toLowerCase());

  // Behind Nginx/Traefik/an LB, Express must trust X-Forwarded-* so that
  // Secure cookies and client IPs in the audit log are correct (§39).
  if (trustProxy) {
    app.set('trust proxy', 1);
    logger.log('Trusting X-Forwarded-* headers (reverse proxy mode)');
  }

  app.use(cookieParser());
  app.use(
    helmet({
      // The API serves JSON only; CSP belongs on the Next.js frontend.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key', 'X-Device-Id'],
    exposedHeaders: ['X-Total-Count'],
  });

  app.setGlobalPrefix('api', { exclude: ['health', 'health/ready', 'health/live'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      // Constraint text is safe for users; the filter reshapes it anyway.
      validationError: { target: false, value: false },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('Lorma Beauty POS API')
      .setDescription('REST API for the Lorma Beauty POS and Retail Management System')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
    logger.log('API documentation available at /api/docs');
  }

  // Let in-flight sales finish before the container goes away.
  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');
  logger.log(`Lorma Beauty POS API listening on port ${port} [${process.env.NODE_ENV}]`);
}

void bootstrap();
