import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { SaveWorkerDto } from './dto/save-worker.dto';

@Injectable()
export class WorkersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private async nextWorkerNumber(
    tx: Parameters<Parameters<typeof this.prisma.$transaction>[0]>[0],
  ): Promise<string> {
    const existingWorkers = await tx.worker.findMany({
      select: { workerNumber: true },
    });
    const maxExisting = existingWorkers.reduce((max, worker) => {
      const match = /^M-(\d+)$/.exec(worker.workerNumber);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 101);

    const counter = await tx.counter.upsert({
      where: { id: 'WORKER' },
      update: {},
      create: {
        id: 'WORKER',
        prefix: 'M-',
        current: maxExisting,
      },
      select: { current: true, prefix: true },
    });

    if (counter.current < maxExisting || counter.prefix !== 'M-') {
      await tx.counter.update({
        where: { id: 'WORKER' },
        data: {
          prefix: 'M-',
          current: Math.max(counter.current, maxExisting),
        },
      });
    }

    const result = await tx.$queryRawUnsafe<
      { prefix: string; current: number }[]
    >(
      `UPDATE "Counter" SET "current" = "current" + 1, "prefix" = 'M-' WHERE "id" = 'WORKER' RETURNING "prefix", "current"`,
    );
    if (!result.length) {
      throw new BadRequestException('Counter WORKER nicht gefunden.');
    }
    return `${result[0].prefix}${result[0].current}`;
  }

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
          include: {
            project: true,
          },
          orderBy: {
            occurredAtServer: 'desc',
          },
          take: 100,
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
    if (!dto.firstName || !dto.lastName || !dto.pin) {
      throw new BadRequestException(
        'firstName, lastName und pin sind Pflichtfelder.',
      );
    }
    const firstName = dto.firstName;
    const lastName = dto.lastName;
    const pin = dto.pin;

    if (dto.workerNumber?.trim()) {
      const existing = await this.prisma.worker.findUnique({
        where: { workerNumber: dto.workerNumber.trim() },
      });
      if (existing) {
        throw new BadRequestException('Monteurnummer bereits vergeben.');
      }
    }

    await this.ensureActivePinIsUnique(pin);

    const pinHash = await hash(pin, 10);
    const MAX_RETRIES = 3;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const workerNumber =
            dto.workerNumber?.trim() || (await this.nextWorkerNumber(tx));

          return tx.worker.create({
            data: {
              workerNumber,
              firstName,
              lastName,
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
        });
      } catch (e: unknown) {
        const isPrismaUnique =
          e &&
          typeof e === 'object' &&
          'code' in e &&
          (e as { code: string }).code === 'P2002';
        if (
          isPrismaUnique &&
          attempt < MAX_RETRIES - 1 &&
          !dto.workerNumber?.trim()
        ) {
          continue;
        }
        throw e;
      }
    }

    throw new BadRequestException(
      'Monteurnummer konnte nicht vergeben werden.',
    );
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

  async remove(id: string, forceDelete = false) {
    await this.getById(id);

    // Schutz: solange Zeitbuchungen historisch oder offen existieren,
    // verhindern wir das Loeschen — Auswertungen wuerden sonst Luecken
    // bekommen. Die Meldung trennt jetzt klar zwischen "noch nicht
    // geschlossen" und "historisch", damit Anwender wissen, wieso sie
    // den Datensatz nicht entfernen koennen.
    if (!forceDelete) {
      const totalEntries = await this.prisma.timeEntry.count({
        where: { workerId: id },
      });
      if (totalEntries > 0) {
        const openClockIns = await this.prisma.timeEntry.count({
          where: { workerId: id, entryType: 'CLOCK_IN' },
        });
        const closedEntries = await this.prisma.timeEntry.count({
          where: { workerId: id, entryType: 'CLOCK_OUT' },
        });
        const hasOpen = openClockIns > closedEntries;
        const reason = hasOpen
          ? `noch ${openClockIns - closedEntries} offene Zeitbuchung(en) und insgesamt ${totalEntries} historische Eintraege`
          : `${totalEntries} historische Zeitbuchung(en)`;
        throw new BadRequestException(
          `Monteur kann nicht geloescht werden: ${reason}. Fuer erzwungenes Loeschen '?force=true' verwenden.`,
        );
      }
    }

    const worker = await this.prisma.worker.findUnique({
      where: { id },
      select: { photoPath: true },
    });
    if (!worker) {
      throw new NotFoundException('Monteur nicht gefunden.');
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

    if (worker.photoPath) {
      await this.storage.deleteObjectWithFallback(worker.photoPath);
    }

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

    const kioskUsers = await this.prisma.user.findMany({
      where: {
        isActive: true,
        kioskCodeHash: { not: null },
      },
      select: { kioskCodeHash: true },
    });

    for (const user of kioskUsers) {
      if (!user.kioskCodeHash) {
        continue;
      }
      if (await compare(pin, user.kioskCodeHash)) {
        throw new BadRequestException(
          'PIN kollidiert mit einem Benutzer-Kiosk-Code. Bitte anderen PIN waehlen.',
        );
      }
    }
  }

  // ── Profilbild ──────────────────────────────────────
  async setPhoto(id: string, file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Datei fehlt.');
    }
    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('Nur Bilddateien sind erlaubt.');
    }

    const worker = await this.prisma.worker.findUnique({ where: { id } });
    if (!worker) {
      throw new NotFoundException('Monteur nicht gefunden.');
    }

    if (worker.photoPath) {
      await this.storage.deleteObjectWithFallback(worker.photoPath);
    }

    const ext = extname(file.originalname) || '.png';
    const key = `workers/${id}/photo-${randomUUID()}${ext}`;

    await this.storage.uploadObject(key, file.buffer, file.size, file.mimetype);

    await this.prisma.worker.update({
      where: { id },
      data: { photoPath: key },
    });

    return { path: key };
  }

  async getPhotoStream(
    id: string,
  ): Promise<{ stream: Readable | null; contentType: string | null }> {
    const worker = await this.prisma.worker.findUnique({
      where: { id },
      select: { photoPath: true },
    });
    if (!worker?.photoPath) {
      return { stream: null, contentType: null };
    }

    const ext = extname(worker.photoPath).toLowerCase();
    const contentType =
      ext === '.png'
        ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : ext === '.webp'
            ? 'image/webp'
            : ext === '.gif'
              ? 'image/gif'
              : 'application/octet-stream';

    const stream = await this.storage.getObjectStreamWithFallback(
      worker.photoPath,
    );
    return { stream, contentType };
  }

  async deletePhoto(id: string) {
    const worker = await this.prisma.worker.findUnique({
      where: { id },
      select: { photoPath: true },
    });
    if (!worker) {
      throw new NotFoundException('Monteur nicht gefunden.');
    }
    if (worker.photoPath) {
      await this.storage.deleteObjectWithFallback(worker.photoPath);
      await this.prisma.worker.update({
        where: { id },
        data: { photoPath: null },
      });
    }
    return { deleted: true };
  }
}
