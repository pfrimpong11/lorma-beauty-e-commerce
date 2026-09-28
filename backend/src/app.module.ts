import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration, { validateEnv } from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { SmsModule } from './sms/sms.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { CounterModule } from './common/services/counter.module';
import { InventoryModule } from './inventory/inventory.module';
import { ProductsModule } from './products/products.module';
import { SalesModule } from './sales/sales.module';
import { CategoriesModule } from './categories/categories.module';
import { CustomersModule } from './customers/customers.module';
import { UsersModule } from './users/users.module';
import { ShiftsModule } from './shifts/shifts.module';
import { ReturnsModule } from './returns/returns.module';
import { SyncModule } from './sync/sync.module';
import { ReportsModule } from './reports/reports.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { StockCountsModule } from './stock-counts/stock-counts.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
      cache: true,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: Number.parseInt(process.env.RATE_LIMIT_TTL ?? '60', 10) * 1000,
        limit: Number.parseInt(process.env.RATE_LIMIT_MAX ?? '120', 10),
      },
    ]),
    PrismaModule,
    AuditModule,
    SmsModule,
    HealthModule,
    AuthModule,
    CounterModule,
    InventoryModule,
    ProductsModule,
    SalesModule,
    CategoriesModule,
    CustomersModule,
    UsersModule,
    ShiftsModule,
    ReturnsModule,
    SyncModule,
    ReportsModule,
    DashboardModule,
    StockCountsModule,
  ],
  providers: [
    // Order matters: throttle, then authenticate, then authorise.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
