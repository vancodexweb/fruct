import { plainToInstance } from 'class-transformer';
import {
  IsBooleanString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  validateSync,
} from 'class-validator';

/**
 * Validates process.env at boot. Fail fast with a readable error rather than
 * crashing later on `undefined` deep inside some service.
 */
class EnvironmentVariables {
  @IsIn(['development', 'production', 'test'])
  @IsOptional()
  NODE_ENV: 'development' | 'production' | 'test' = 'development';

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  PORT: number = 3001;

  @IsString()
  DATABASE_URL: string;

  @IsString()
  REDIS_URL: string;

  @IsString()
  JWT_ACCESS_SECRET: string;

  @IsString()
  JWT_REFRESH_SECRET: string;

  @IsString()
  @IsOptional()
  JWT_ACCESS_EXPIRES_IN: string = '15m';

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN: string = '30d';

  // Optional at boot: delivery-calc module degrades to a manual-only mode
  // when this is not set (see DeliveryEstimator TODO).
  @IsString()
  @IsOptional()
  DEEPSEEK_API_KEY?: string;

  @IsUrl({ require_tld: false })
  @IsOptional()
  DEEPSEEK_BASE_URL?: string;

  @IsString()
  @IsOptional()
  TELEGRAM_BOT_TOKEN?: string;

  @IsString()
  @IsOptional()
  DOMAIN?: string;

  @IsString()
  @IsOptional()
  ACME_EMAIL?: string;

  @IsString()
  @IsOptional()
  TENANT_NAME: string = 'Магазин компьютерных кресел';

  @IsString()
  ADMIN_EMAIL: string;

  @IsString()
  @IsOptional()
  ADMIN_FULL_NAME: string = 'Иванов Иван Иванович';

  @IsString()
  @IsOptional()
  ADMIN_INITIAL_PASSWORD?: string;

  @IsString()
  SMTP_HOST: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  SMTP_PORT: number;

  @IsString()
  @IsOptional()
  SMTP_USER?: string;

  @IsString()
  @IsOptional()
  SMTP_PASS?: string;

  @IsBooleanString()
  @IsOptional()
  SMTP_SECURE: string = 'false';

  @IsString()
  MAIL_FROM: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  // dotenv turns every blank "KEY=" line in .env into an empty string, never
  // `undefined` — and .env.example deliberately leaves every optional var
  // blank. class-validator's @IsOptional() only skips validation for
  // `undefined`/`null`, so a stricter validator like @IsUrl() would reject
  // that blank string instead of treating it as "not configured". Dropping
  // empty-string keys here makes them genuinely absent, so @IsOptional()
  // takes over and any class-field default still applies normally.
  const withoutBlanks = Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== ''),
  );
  const validatedConfig = plainToInstance(EnvironmentVariables, withoutBlanks, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    const message = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Некорректная конфигурация окружения: ${message}`);
  }

  return validatedConfig;
}
