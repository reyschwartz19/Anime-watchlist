import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Next reads .env.local; standalone Prisma commands need the same explicit load.
// Existing shell variables win so commands can target an isolated test database.
config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // Never fall back to the app's pooled URL for schema changes.
    url: process.env.DATABASE_URL_UNPOOLED ?? '',
  },
});
