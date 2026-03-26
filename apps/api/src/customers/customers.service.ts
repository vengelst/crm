import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SaveCustomerDto } from './dto/save-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.customer.findMany({
      where: {
        deletedAt: null,
      },
      include: {
        branches: true,
        contacts: true,
      },
      orderBy: {
        companyName: 'asc',
      },
    });
  }

  async getById(id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        branches: true,
        contacts: true,
        projects: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('Kunde nicht gefunden.');
    }

    return customer;
  }

  async create(dto: SaveCustomerDto) {
    if (!dto.companyName || !dto.customerNumber) {
      throw new BadRequestException(
        'companyName und customerNumber sind Pflichtfelder.',
      );
    }

    const existing = await this.prisma.customer.findFirst({
      where: { customerNumber: dto.customerNumber, deletedAt: null },
    });
    if (existing) {
      throw new BadRequestException('Kundennummer bereits vergeben.');
    }

    const customerNumber = dto.customerNumber;
    const companyName = dto.companyName;

    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          customerNumber,
          companyName,
          legalForm: dto.legalForm,
          status: dto.status,
          billingEmail: dto.billingEmail,
          phone: dto.phone,
          email: dto.email,
          website: dto.website,
          vatId: dto.vatId,
          addressLine1: dto.addressLine1,
          addressLine2: dto.addressLine2,
          postalCode: dto.postalCode,
          city: dto.city,
          country: dto.country,
          notes: dto.notes,
        },
      });

      const createdBranches = dto.branches?.length
        ? await Promise.all(
            dto.branches.map((branch) =>
              tx.customerBranch.create({
                data: {
                  customerId: customer.id,
                  name: branch.name,
                  addressLine1: branch.addressLine1,
                  addressLine2: branch.addressLine2,
                  postalCode: branch.postalCode,
                  city: branch.city,
                  country: branch.country,
                  phone: branch.phone,
                  email: branch.email,
                  notes: branch.notes,
                  active: branch.active ?? true,
                },
              }),
            ),
          )
        : [];

      const branchIdByName = new Map(
        createdBranches.map((branch) => [branch.name, branch.id]),
      );

      if (dto.contacts?.length) {
        await Promise.all(
          dto.contacts.map((contact) =>
            tx.customerContact.create({
              data: {
                customerId: customer.id,
                branchId:
                  contact.branchId ??
                  (contact.branchName
                    ? branchIdByName.get(contact.branchName)
                    : undefined),
                firstName: contact.firstName,
                lastName: contact.lastName,
                role: contact.role,
                email: contact.email,
                phoneMobile: contact.phoneMobile,
                phoneLandline: contact.phoneLandline,
                isAccountingContact: contact.isAccountingContact ?? false,
                isProjectContact: contact.isProjectContact ?? false,
                isSignatory: contact.isSignatory ?? false,
                notes: contact.notes,
              },
            }),
          ),
        );
      }

      return tx.customer.findUniqueOrThrow({
        where: { id: customer.id },
        include: {
          branches: true,
          contacts: true,
        },
      });
    });
  }

  async update(id: string, dto: SaveCustomerDto) {
    await this.getById(id);

    if (dto.customerNumber) {
      const existing = await this.prisma.customer.findFirst({
        where: {
          customerNumber: dto.customerNumber,
          deletedAt: null,
          NOT: { id },
        },
      });
      if (existing) {
        throw new BadRequestException('Kundennummer bereits vergeben.');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.branches) {
        await tx.customerBranch.deleteMany({
          where: { customerId: id },
        });
      }

      if (dto.contacts) {
        await tx.customerContact.deleteMany({
          where: { customerId: id },
        });
      }

      await tx.customer.update({
        where: { id },
        data: {
          customerNumber: dto.customerNumber,
          companyName: dto.companyName,
          legalForm: dto.legalForm,
          status: dto.status,
          billingEmail: dto.billingEmail,
          phone: dto.phone,
          email: dto.email,
          website: dto.website,
          vatId: dto.vatId,
          addressLine1: dto.addressLine1,
          addressLine2: dto.addressLine2,
          postalCode: dto.postalCode,
          city: dto.city,
          country: dto.country,
          notes: dto.notes,
        },
      });

      if (dto.branches?.length) {
        await Promise.all(
          dto.branches.map((branch) =>
            tx.customerBranch.create({
              data: {
                customerId: id,
                name: branch.name,
                addressLine1: branch.addressLine1,
                addressLine2: branch.addressLine2,
                postalCode: branch.postalCode,
                city: branch.city,
                country: branch.country,
                phone: branch.phone,
                email: branch.email,
                notes: branch.notes,
                active: branch.active ?? true,
              },
            }),
          ),
        );
      }

      if (dto.contacts?.length) {
        const branches = await tx.customerBranch.findMany({
          where: {
            customerId: id,
          },
        });
        const branchIdByName = new Map(
          branches.map((branch) => [branch.name, branch.id]),
        );

        await Promise.all(
          dto.contacts.map((contact) =>
            tx.customerContact.create({
              data: {
                customerId: id,
                branchId:
                  contact.branchId ??
                  (contact.branchName
                    ? branchIdByName.get(contact.branchName)
                    : undefined),
                firstName: contact.firstName,
                lastName: contact.lastName,
                role: contact.role,
                email: contact.email,
                phoneMobile: contact.phoneMobile,
                phoneLandline: contact.phoneLandline,
                isAccountingContact: contact.isAccountingContact ?? false,
                isProjectContact: contact.isProjectContact ?? false,
                isSignatory: contact.isSignatory ?? false,
                notes: contact.notes,
              },
            }),
          ),
        );
      }

      return tx.customer.findUniqueOrThrow({
        where: { id },
        include: {
          branches: true,
          contacts: true,
        },
      });
    });
  }

  async getFinancials(id: string) {
    await this.getById(id);

    const projects = await this.prisma.project.findMany({
      where: { customerId: id, deletedAt: null },
      include: {
        assignments: { include: { worker: true } },
        timeEntries: { orderBy: { occurredAtClient: 'asc' } },
      },
    });

    let totalHours = 0;
    let totalOvertimeHours = 0;
    let totalBaseRevenue = 0;
    let totalOvertimeRevenue = 0;
    let totalCosts = 0;

    const projectSummaries: {
      projectId: string;
      projectNumber: string;
      title: string;
      hours: number;
      overtimeHours: number;
      revenue: number;
      costs: number;
      margin: number;
    }[] = [];

    for (const project of projects) {
      // Stunden berechnen (CLOCK_IN/OUT-Paare)
      const workerHoursMap = new Map<string, number>();
      // Schluessel: "workerId|YYYY-WW" → Stunden je Monteur je Woche
      const workerWeekHoursMap = new Map<string, number>();

      const entriesByWorker = new Map<string, typeof project.timeEntries>();
      for (const entry of project.timeEntries) {
        const list = entriesByWorker.get(entry.workerId) ?? [];
        list.push(entry);
        entriesByWorker.set(entry.workerId, list);
      }

      for (const [workerId, entries] of entriesByWorker) {
        let pendingClockIn: Date | null = null;
        for (const entry of entries) {
          if (entry.entryType === 'CLOCK_IN') {
            pendingClockIn = entry.occurredAtClient;
          } else if (entry.entryType === 'CLOCK_OUT' && pendingClockIn) {
            const hours =
              (entry.occurredAtClient.getTime() - pendingClockIn.getTime()) /
              3_600_000;
            if (hours > 0 && hours < 24) {
              workerHoursMap.set(
                workerId,
                (workerHoursMap.get(workerId) ?? 0) + hours,
              );
              const weekKey = isoWeekKey(pendingClockIn);
              const compositeKey = `${workerId}|${weekKey}`;
              workerWeekHoursMap.set(
                compositeKey,
                (workerWeekHoursMap.get(compositeKey) ?? 0) + hours,
              );
            }
            pendingClockIn = null;
          }
        }
      }

      const projHours = [...workerHoursMap.values()].reduce((s, h) => s + h, 0);

      // Umsatz je Monteur je Woche
      const weeklyFlatRate = project.weeklyFlatRate ?? null;
      const includedHours = project.includedHoursPerWeek ?? 40;
      const hourlyRate = project.hourlyRateUpTo40h ?? 0;
      const overtimeRate = project.overtimeRate ?? 0;

      let projBaseRevenue = 0;
      let projOvertimeRevenue = 0;
      let projOvertimeHours = 0;

      for (const [, wHours] of workerWeekHoursMap) {
        if (weeklyFlatRate !== null) {
          projBaseRevenue += weeklyFlatRate;
          const oh = Math.max(0, wHours - includedHours);
          projOvertimeHours += oh;
          projOvertimeRevenue += oh * overtimeRate;
        } else {
          const reg = Math.min(wHours, 40);
          const oh = Math.max(0, wHours - 40);
          projOvertimeHours += oh;
          projBaseRevenue += reg * hourlyRate;
          projOvertimeRevenue += oh * overtimeRate;
        }
      }

      // Monteurkosten
      let projCosts = 0;
      for (const assignment of project.assignments) {
        const w = assignment.worker;
        const h = workerHoursMap.get(w.id) ?? 0;
        if (w.internalHourlyRate != null) {
          projCosts += h * w.internalHourlyRate;
        }
      }

      const projRevenue = projBaseRevenue + projOvertimeRevenue;

      totalHours += projHours;
      totalOvertimeHours += projOvertimeHours;
      totalBaseRevenue += projBaseRevenue;
      totalOvertimeRevenue += projOvertimeRevenue;
      totalCosts += projCosts;

      projectSummaries.push({
        projectId: project.id,
        projectNumber: project.projectNumber,
        title: project.title,
        hours: Math.round(projHours * 100) / 100,
        overtimeHours: Math.round(projOvertimeHours * 100) / 100,
        revenue: Math.round(projRevenue * 100) / 100,
        costs: Math.round(projCosts * 100) / 100,
        margin: Math.round((projRevenue - projCosts) * 100) / 100,
      });
    }

    const totalRevenue = totalBaseRevenue + totalOvertimeRevenue;

    return {
      customerId: id,
      totalHours: Math.round(totalHours * 100) / 100,
      overtimeHours: Math.round(totalOvertimeHours * 100) / 100,
      baseRevenue: Math.round(totalBaseRevenue * 100) / 100,
      overtimeRevenue: Math.round(totalOvertimeRevenue * 100) / 100,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalCosts: Math.round(totalCosts * 100) / 100,
      margin: Math.round((totalRevenue - totalCosts) * 100) / 100,
      projects: projectSummaries,
    };
  }

  async remove(id: string) {
    await this.getById(id);

    // Pruefen ob Projekte existieren
    const projectCount = await this.prisma.project.count({
      where: { customerId: id, deletedAt: null },
    });
    if (projectCount > 0) {
      throw new BadRequestException(
        `Kunde kann nicht geloescht werden, da noch ${projectCount} Projekt(e) zugeordnet sind. Bitte zuerst die Projekte entfernen.`,
      );
    }

    // Abhaengige Daten loeschen (Branches, Contacts, DocumentLinks)
    await this.prisma.$transaction(async (tx) => {
      await tx.documentLink.deleteMany({
        where: { entityType: 'CUSTOMER', entityId: id },
      });
      await tx.customerContact.deleteMany({ where: { customerId: id } });
      await tx.customerBranch.deleteMany({ where: { customerId: id } });
      await tx.customer.delete({ where: { id } });
    });

    return { deleted: true };
  }
}

function isoWeekKey(date: Date): string {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
