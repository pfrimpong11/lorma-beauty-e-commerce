import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
}

/** Boots the real application graph against the test database. */
export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  await app.init();

  return { app, prisma: app.get(PrismaService) };
}

/**
 * Clear transactional data between suites while keeping the seeded
 * catalogue, so tests start from a known, non-empty shop.
 */
export async function resetTransactions(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "return_items", "returns", "payments", "sale_items", "sales",
      "shift_transactions", "shifts", "sync_queue", "inventory_movements", "audit_logs"
    RESTART IDENTITY CASCADE
  `);
  await prisma.counter.updateMany({ data: { value: 0 } });
}
