import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssignWorkerDto } from './dto/assign-worker.dto';
import { SaveProjectDto } from './dto/save-project.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.project.findMany({
      where: {
        deletedAt: null,
      },
      include: {
        customer: true,
        branch: true,
        assignments: {
          include: {
            worker: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  async getById(id: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        customer: true,
        branch: true,
        primaryCustomerContact: true,
        assignments: {
          include: {
            worker: true,
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

    if (!project) {
      throw new NotFoundException('Projekt nicht gefunden.');
    }

    return project;
  }

  async create(dto: SaveProjectDto) {
    if (!dto.projectNumber || !dto.customerId || !dto.title) {
      throw new BadRequestException(
        'projectNumber, customerId und title sind Pflichtfelder.',
      );
    }

    return this.prisma.project.create({
      data: {
        projectNumber: dto.projectNumber,
        customerId: dto.customerId,
        branchId: dto.branchId,
        title: dto.title,
        description: dto.description,
        serviceType: dto.serviceType,
        status: dto.status,
        priority: dto.priority ?? 0,
        siteName: dto.siteName,
        siteAddressLine1: dto.siteAddressLine1,
        sitePostalCode: dto.sitePostalCode,
        siteCity: dto.siteCity,
        siteCountry: dto.siteCountry,
        accommodationAddress: dto.accommodationAddress,
        plannedStartDate: dto.plannedStartDate
          ? new Date(dto.plannedStartDate)
          : undefined,
        plannedEndDate: dto.plannedEndDate
          ? new Date(dto.plannedEndDate)
          : undefined,
        internalProjectManagerUserId: dto.internalProjectManagerUserId,
        primaryCustomerContactId: dto.primaryCustomerContactId,
        pauseRuleId: dto.pauseRuleId,
        notes: dto.notes,
      },
      include: {
        customer: true,
        branch: true,
      },
    });
  }

  async update(id: string, dto: SaveProjectDto) {
    await this.getById(id);

    return this.prisma.project.update({
      where: { id },
      data: {
        projectNumber: dto.projectNumber,
        customerId: dto.customerId,
        branchId: dto.branchId,
        title: dto.title,
        description: dto.description,
        serviceType: dto.serviceType,
        status: dto.status,
        priority: dto.priority,
        siteName: dto.siteName,
        siteAddressLine1: dto.siteAddressLine1,
        sitePostalCode: dto.sitePostalCode,
        siteCity: dto.siteCity,
        siteCountry: dto.siteCountry,
        accommodationAddress: dto.accommodationAddress,
        plannedStartDate: dto.plannedStartDate
          ? new Date(dto.plannedStartDate)
          : undefined,
        plannedEndDate: dto.plannedEndDate
          ? new Date(dto.plannedEndDate)
          : undefined,
        internalProjectManagerUserId: dto.internalProjectManagerUserId,
        primaryCustomerContactId: dto.primaryCustomerContactId,
        pauseRuleId: dto.pauseRuleId,
        notes: dto.notes,
      },
      include: {
        customer: true,
        branch: true,
        assignments: true,
      },
    });
  }

  async assignWorker(projectId: string, dto: AssignWorkerDto) {
    await this.getById(projectId);

    return this.prisma.projectAssignment.create({
      data: {
        projectId,
        workerId: dto.workerId,
        roleName: dto.roleName,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        notes: dto.notes,
      },
      include: {
        worker: true,
        project: true,
      },
    });
  }

  async remove(id: string) {
    await this.getById(id);

    return this.prisma.project.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'CANCELED',
      },
    });
  }
}
