import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

const configSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN is required'),
  EMBY_URL: z.string().url('EMBY_URL must be a valid URL'),
  EMBY_USERNAME: z.string().min(1, 'EMBY_USERNAME is required'),
  EMBY_PASSWORD: z.string().min(1, 'EMBY_PASSWORD is required'),
  EMBY_PUBLIC_URL: z.string().url().optional(),
  GUILD_ID: z.string().optional(),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = parsed.data;
