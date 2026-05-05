import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { BackupSchedulerService } from './backup-scheduler.service';

/**
 * SettingsService und BackupSchedulerService haben einen Zyklus:
 *   - SettingsService.updateBackupConfig ruft BackupSchedulerService.reschedule
 *   - BackupSchedulerService nutzt SettingsService.createBackup + getBackupConfig
 *
 * Beide werden mit `forwardRef` gewrapt. Das ist die offizielle Loesung
 * fuer beidseitige Abhaengigkeiten innerhalb eines Moduls.
 */
@Module({
  imports: [PrismaModule],
  controllers: [SettingsController],
  providers: [SettingsService, BackupSchedulerService],
  exports: [SettingsService, BackupSchedulerService],
})
export class SettingsModule {}
