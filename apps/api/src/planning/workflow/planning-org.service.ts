import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrgRefDto, PatchOrgRefDto } from './dto';

/**
 * Lookup-CRUD fuer Standorte und Geschaeftseinheiten.
 *
 * Beide Modelle sind strukturell identisch (id/name/code/active), daher
 * teilen sie sich denselben Service mit Type-Branch ueber `kind`. Spart
 * eine doppelte Klasse plus eigenen Tests.
 */
@Injectable()
export class PlanningOrgService {
  constructor(private readonly prisma: PrismaService) {}

  list(kind: 'location' | 'unit') {
    if (kind === 'location') {
      return this.prisma.planningLocation.findMany({
        orderBy: [{ active: 'desc' }, { code: 'asc' }],
      });
    }
    return this.prisma.planningBusinessUnit.findMany({
      orderBy: [{ active: 'desc' }, { code: 'asc' }],
    });
  }

  async create(kind: 'location' | 'unit', dto: CreateOrgRefDto) {
    try {
      if (kind === 'location') {
        return await this.prisma.planningLocation.create({
          data: {
            name: dto.name.trim(),
            code: dto.code.trim(),
            active: dto.active ?? true,
          },
        });
      }
      return await this.prisma.planningBusinessUnit.create({
        data: {
          name: dto.name.trim(),
          code: dto.code.trim(),
          active: dto.active ?? true,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(`Code "${dto.code}" ist bereits vergeben.`);
      }
      throw e;
    }
  }

  async update(kind: 'location' | 'unit', id: string, dto: PatchOrgRefDto) {
    try {
      if (kind === 'location') {
        const existing = await this.prisma.planningLocation.findUnique({
          where: { id },
        });
        if (!existing) throw new NotFoundException('Standort nicht gefunden.');
        return await this.prisma.planningLocation.update({
          where: { id },
          data: {
            name: dto.name !== undefined ? dto.name.trim() : undefined,
            code: dto.code !== undefined ? dto.code.trim() : undefined,
            active: dto.active === undefined ? undefined : dto.active,
          },
        });
      }
      const existing = await this.prisma.planningBusinessUnit.findUnique({
        where: { id },
      });
      if (!existing) throw new NotFoundException('Einheit nicht gefunden.');
      return await this.prisma.planningBusinessUnit.update({
        where: { id },
        data: {
          name: dto.name !== undefined ? dto.name.trim() : undefined,
          code: dto.code !== undefined ? dto.code.trim() : undefined,
          active: dto.active === undefined ? undefined : dto.active,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(`Code "${dto.code}" ist bereits vergeben.`);
      }
      throw e;
    }
  }

  async remove(kind: 'location' | 'unit', id: string) {
    if (kind === 'location') {
      const existing = await this.prisma.planningLocation.findUnique({
        where: { id },
      });
      if (!existing) throw new NotFoundException('Standort nicht gefunden.');
      await this.prisma.planningLocation.delete({ where: { id } });
    } else {
      const existing = await this.prisma.planningBusinessUnit.findUnique({
        where: { id },
      });
      if (!existing) throw new NotFoundException('Einheit nicht gefunden.');
      await this.prisma.planningBusinessUnit.delete({ where: { id } });
    }
    return { deleted: true };
  }
}
