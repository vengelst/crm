import { Module } from '@nestjs/common';
import { TimeController } from './time.controller';
import { TimeService } from './time.service';
import { PrismaModule } from '../prisma/prisma.module';
import { DevicesModule } from '../devices/devices.module';

@Module({
  imports: [PrismaModule, DevicesModule],
  controllers: [TimeController],
  providers: [TimeService],
})
export class TimeModule {}
