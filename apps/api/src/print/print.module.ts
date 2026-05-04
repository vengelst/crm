import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomersModule } from '../customers/customers.module';
import { ProjectsModule } from '../projects/projects.module';
import { RemindersModule } from '../reminders/reminders.module';
import { DocumentsModule } from '../documents/documents.module';
import { StorageModule } from '../storage/storage.module';
import { PrintController } from './print.controller';
import { PrintService } from './print.service';

@Module({
  imports: [
    PrismaModule,
    CustomersModule,
    ProjectsModule,
    RemindersModule,
    DocumentsModule,
    StorageModule,
  ],
  controllers: [PrintController],
  providers: [PrintService],
})
export class PrintModule {}
