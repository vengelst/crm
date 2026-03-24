import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { SaveWorkerDto } from './dto/save-worker.dto';

@Injectable()
export class WorkersService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.worker.findMany({
      include: {
        assignments: {
          include: {
            project: true,
          },
        },
        pins: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: {
        lastName: 'asc',
      },
    });
  }

  async getById(id: string) {
    const worker = await this.prisma.worker.findUnique({
      where: { id },
      include: {
        assignments: {
          include: {
            project: true,
          },
        },
        timeEntries: {
          orderBy: {
            occurredAtServer: 'desc',
          },
          take: 25,
        },
        weeklyTimesheets: {
          orderBy: {
            generatedAt: 'desc',
          },
          take: 10,
        },
      },
    });

    if (!worker) {
      throw new NotFoundException('Monteur nicht gefunden.');
    }

    return worker;
  }

  async create(dto: SaveWorkerDto) {
    if (!dto.workerNumber || !dto.firstName || !dto.lastName || !dto.pin) {
      throw new BadRequestException(
        'workerNumber, firstName, lastName und pin sind Pflichtfelder.',
      );
    }

    const pinHash = await hash(dto.pin, 10);

    return this.prisma.worker.create({
      data: {
        workerNumber: dto.workerNumber,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        phoneMobile: dto.phoneMobile ?? dto.phone,
        phoneOffice: dto.phoneOffice,
        addressLine1: dto.addressLine1,
        addressLine2: dto.addressLine2,
        postalCode: dto.postalCode,
        city: dto.city,
        country: dto.country,
        active: dto.active ?? true,
        internalHourlyRate: dto.internalHourlyRate,
        languageCode: dto.languageCode,
        notes: dto.notes,
        pins: {
          create: {
            pinHash,
          },
        },
      },
      include: {
        pins: {
          where: {
            isActive: true,
          },
          take: 1,
        },
      },
    });
  }

  async update(id: string, dto: SaveWorkerDto) {
    await this.getById(id);

    const worker = await this.prisma.worker.update({
      where: { id },
      data: {
        workerNumber: dto.workerNumber,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        phoneMobile: dto.phoneMobile ?? dto.phone,
        phoneOffice: dto.phoneOffice,
        addressLine1: dto.addressLine1,
        addressLine2: dto.addressLine2,
        postalCode: dto.postalCode,
        city: dto.city,
        country: dto.country,
        active: dto.active,
        internalHourlyRate: dto.internalHourlyRate,
        languageCode: dto.languageCode,
        notes: dto.notes,
      },
    });

    if (dto.pin) {
      await this.resetPin(id, dto.pin);
    }

    return worker;
  }

  async resetPin(id: string, pin: string) {
    if (!pin) {
      throw new BadRequestException('Neuer PIN fehlt.');
    }

    await this.getById(id);

    const pinHash = await hash(pin, 10);

    return this.prisma.$transaction(async (tx) => {
      await tx.workerPin.updateMany({
        where: {
          workerId: id,
          isActive: true,
        },
        data: {
          isActive: false,
          validTo: new Date(),
        },
      });

      return tx.workerPin.create({
        data: {
          workerId: id,
          pinHash,
        },
      });
    });
  }

  async remove(id: string) {
    await this.getById(id);

    return this.prisma.worker.update({
      where: { id },
      data: {
        active: false,
      },
    });
  }
}
