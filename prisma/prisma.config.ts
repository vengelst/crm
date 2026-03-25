import path from 'node:path';
import { defineConfig } from 'prisma/config';

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55432/crm_monteur';

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, 'schema.prisma'),
  datasource: {
    url: databaseUrl,
  },
});
