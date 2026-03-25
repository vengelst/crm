import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
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
        timeEntries: {
          orderBy: { occurredAtServer: 'desc' },
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

    const existing = await this.prisma.worker.findUnique({
      where: { workerNumber: dto.workerNumber },
    });
    if (existing) {
      throw new BadRequestException('Monteurnummer bereits vergeben.');
    }

    await this.ensureActivePinIsUnique(dto.pin);

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

    if (dto.workerNumber) {
      const existing = await this.prisma.worker.findFirst({
        where: { workerNumber: dto.workerNumber, NOT: { id } },
      });
      if (existing) {
        throw new BadRequestException('Monteurnummer bereits vergeben.');
      }
    }

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
    await this.ensureActivePinIsUnique(pin, id);

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

    // Pruefen ob offene Zeitbuchungen existieren
    const openEntries = await this.prisma.timeEntry.count({
      where: { workerId: id },
    });
    if (openEntries > 0) {
      throw new BadRequestException(
        `Monteur kann nicht geloescht werden, da noch ${openEntries} Zeitbuchung(en) vorhanden sind.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.documentLink.deleteMany({
        where: { entityType: 'WORKER', entityId: id },
      });
      await tx.workerTeamMember.deleteMany({ where: { workerId: id } });
      await tx.projectAssignment.deleteMany({ where: { workerId: id } });
      await tx.workerPin.deleteMany({ where: { workerId: id } });
      await tx.worker.delete({ where: { id } });
    });

    return { deleted: true };
  }

  private async ensureActivePinIsUnique(pin: string, excludeWorkerId?: string) {
    const workers = await this.prisma.worker.findMany({
      where: {
        active: true,
        ...(excludeWorkerId
          ? {
              NOT: {
                id: excludeWorkerId,
              },
            }
          : {}),
      },
      include: {
        pins: {
          where: {
            isActive: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
    });

    for (const worker of workers) {
      const [activePin] = worker.pins;
      if (!activePin) {
        continue;
      }

      const matches = await compare(pin, activePin.pinHash);
      if (matches) {
        throw new BadRequestException(
          'PIN bereits vergeben. Bitte anderen PIN waehlen.',
        );
      }
    }
  }
}
