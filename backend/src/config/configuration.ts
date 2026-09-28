import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';
import { Transform } from 'class-transformer';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

const toBool = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? ['true', '1', 'yes'].includes(value.toLowerCase()) : Boolean(value);

const toInt = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : Number.parseInt(String(value), 10);

/**
 * Fail-fast environment contract. The process refuses to boot when a
 * required variable is missing or a secret is left at a placeholder length,
 * so a misconfigured container never comes up half-working.
 */
export class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  BACKEND_PORT = 4000;

  @IsString()
  @MinLength(1)
  DATABASE_URL!: string;

  @IsString()
  @MinLength(32, { message: 'JWT_ACCESS_SECRET must be at least 32 characters' })
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(32, { message: 'JWT_REFRESH_SECRET must be at least 32 characters' })
  JWT_REFRESH_SECRET!: string;

  @IsString()
  @IsOptional()
  JWT_ACCESS_TTL = '15m';

  @IsString()
  @IsOptional()
  JWT_REFRESH_TTL = '7d';

  @Transform(toInt)
  @IsInt()
  @Min(10)
  @Max(15)
  @IsOptional()
  BCRYPT_ROUNDS = 12;

  @IsString()
  @IsOptional()
  CORS_ORIGINS = 'http://localhost:3000';

  @Transform(toBool)
  @IsBoolean()
  @IsOptional()
  TRUST_PROXY = false;

  @Transform(toBool)
  @IsBoolean()
  @IsOptional()
  COOKIE_SECURE = false;

  @IsString()
  @IsOptional()
  COOKIE_DOMAIN?: string;

  /**
   * SameSite policy for the refresh cookie.
   *
   * Defaults to 'none' when cookies are Secure, because the browser and
   * the API are normally different origins. Behind a same-origin proxy
   * (a tunnel, a reverse proxy) set this to 'lax' — the cookie is then
   * first-party and does not need the permissive setting.
   */
  @IsEnum(['lax', 'strict', 'none'] as unknown as object)
  @IsOptional()
  COOKIE_SAMESITE?: 'lax' | 'strict' | 'none';

  @Transform(toInt)
  @IsInt()
  @IsOptional()
  RATE_LIMIT_TTL = 60;

  @Transform(toInt)
  @IsInt()
  @IsOptional()
  RATE_LIMIT_MAX = 120;

  @IsString()
  @IsOptional()
  LOG_LEVEL = 'info';

  @IsString()
  @IsOptional()
  CURRENCY = 'GHS';
  /**
   * SMS. All optional: a shop with no gateway configured still trades, and
   * messages are recorded as queued rather than lost.
   */
  @IsOptional()
  @IsString()
  SMS_PROVIDER?: string;

  @IsOptional()
  @IsString()
  ARKESEL_API_KEY?: string;

  @IsOptional()
  @IsString()
  SMS_SENDER_ID?: string;
}

export function validateEnv(raw: Record<string, unknown>): EnvironmentVariables {
  const config = plainToInstance(EnvironmentVariables, raw, {
    enableImplicitConversion: false,
    exposeDefaultValues: true,
  });

  const errors = validateSync(config, { skipMissingProperties: false });

  if (errors.length > 0) {
    const detail = errors
      .map((e) => `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${detail}`);
  }

  if (
    config.NODE_ENV === Environment.Production &&
    config.JWT_ACCESS_SECRET === config.JWT_REFRESH_SECRET
  ) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ in production');
  }

  return config;
}

export default () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: Number.parseInt(process.env.BACKEND_PORT ?? '4000', 10),
  currency: process.env.CURRENCY ?? 'GHS',
  trustProxy: ['true', '1', 'yes'].includes((process.env.TRUST_PROXY ?? '').toLowerCase()),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET!,
    refreshSecret: process.env.JWT_REFRESH_SECRET!,
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  },
  cookie: {
    secure: ['true', '1', 'yes'].includes((process.env.COOKIE_SECURE ?? '').toLowerCase()),
    domain: process.env.COOKIE_DOMAIN || undefined,
    sameSite: (process.env.COOKIE_SAMESITE || undefined) as
      | 'lax'
      | 'strict'
      | 'none'
      | undefined,
  },
  bcryptRounds: Number.parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10),
  rateLimit: {
    ttl: Number.parseInt(process.env.RATE_LIMIT_TTL ?? '60', 10),
    limit: Number.parseInt(process.env.RATE_LIMIT_MAX ?? '120', 10),
  },
  logLevel: process.env.LOG_LEVEL ?? 'info',
});
