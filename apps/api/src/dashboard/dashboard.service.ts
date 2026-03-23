import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    const [customers, projects, workers, openTimesheets] = await Promise.all([
      this.prisma.customer.count({
        where: {
          deletedAt: null,
        },
      }),
      this.prisma.project.count({
        where: {
          deletedAt: null,
        },
      }),
      this.prisma.worker.count({
        where: {
          active: true,
        },
      }),
      this.prisma.weeklyTimesheet.count({
        where: {
          status: {
            in: ['DRAFT', 'WORKER_SIGNED', 'CUSTOMER_SIGNED'],
          },
        },
      }),
    ]);

    return {
      customers,
      projects,
      workers,
      openTimesheets,
    };
  }
}
