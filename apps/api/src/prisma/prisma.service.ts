import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

const connectionString =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:55432/crm_monteur';

const pool = new Pool({ connectionString });

const adapter = new PrismaPg(pool);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async enableShutdownHooks(app: INestApplication) {
    void app;
    return Promise.resolve();
  }
}
