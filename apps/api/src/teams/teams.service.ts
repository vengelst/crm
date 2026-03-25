import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SaveTeamDto } from './dto/save-team.dto';

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.workerTeam.findMany({
      include: {
        members: {
          include: {
            worker: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getById(id: string) {
    const team = await this.prisma.workerTeam.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            worker: true,
          },
        },
      },
    });

    if (!team) {
      throw new NotFoundException('Team nicht gefunden.');
    }

    return team;
  }

  async create(dto: SaveTeamDto) {
    if (!dto.name) {
      throw new BadRequestException('Teamname ist Pflichtfeld.');
    }

    return this.prisma.workerTeam.create({
      data: {
        name: dto.name,
        notes: dto.notes,
        active: dto.active ?? true,
        members: dto.members?.length
          ? {
              create: dto.members.map((m) => ({
                workerId: m.workerId,
                role: m.role,
              })),
            }
          : undefined,
      },
      include: {
        members: { include: { worker: true } },
      },
    });
  }

  async update(id: string, dto: SaveTeamDto) {
    await this.getById(id);

    if (dto.members) {
      await this.prisma.workerTeamMember.deleteMany({
        where: { teamId: id },
      });
    }

    return this.prisma.workerTeam.update({
      where: { id },
      data: {
        name: dto.name,
        notes: dto.notes,
        active: dto.active,
        members: dto.members?.length
          ? {
              create: dto.members.map((m) => ({
                workerId: m.workerId,
                role: m.role,
              })),
            }
          : undefined,
      },
      include: {
        members: { include: { worker: true } },
      },
    });
  }

  async remove(id: string) {
    await this.getById(id);

    await this.prisma.workerTeamMember.deleteMany({
      where: { teamId: id },
    });

    return this.prisma.workerTeam.delete({
      where: { id },
    });
  }
}
