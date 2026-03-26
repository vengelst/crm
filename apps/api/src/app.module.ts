import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { CustomersModule } from './customers/customers.module';
import { ProjectsModule } from './projects/projects.module';
import { WorkersModule } from './workers/workers.module';
import { TimeModule } from './time/time.module';
import { TimesheetsModule } from './timesheets/timesheets.module';
import { DocumentsModule } from './documents/documents.module';
import { SettingsModule } from './settings/settings.module';
import { UsersModule } from './users/users.module';
import { TeamsModule } from './teams/teams.module';
import { DevicesModule } from './devices/devices.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    PrismaModule,
    AuthModule,
    DashboardModule,
    CustomersModule,
    ProjectsModule,
    WorkersModule,
    TeamsModule,
    TimeModule,
    TimesheetsModule,
    DocumentsModule,
    SettingsModule,
    UsersModule,
    DevicesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
