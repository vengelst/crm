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

  /**
   * Atomically increment the CUSTOMER counter and return the next number.
   * Uses UPDATE ... RETURNING inside a transaction to prevent race conditions.
   * Retries up to 3 times on unique-constraint violations.
   */
  private async nextCustomerNumber(
    tx: Parameters<Parameters<typeof this.prisma.$transaction>[0]>[0],
  ): Promise<string> {
    const result = await tx.$queryRawUnsafe<
      { prefix: string; current: number }[]
    >(
      `UPDATE "Counter" SET "current" = "current" + 1 WHERE "id" = 'CUSTOMER' RETURNING "prefix", "current"`,
    );
    if (!result.length) {
      throw new BadRequestException('Counter CUSTOMER nicht gefunden.');
    }
    return `${result[0].prefix}${result[0].current}`;
  }

  async create(dto: SaveCustomerDto) {
    if (!dto.companyName) {
      throw new BadRequestException('companyName ist Pflichtfeld.');
    }

    // Manual customer number: validate uniqueness outside transaction
    if (dto.customerNumber?.trim()) {
      const existing = await this.prisma.customer.findFirst({
        where: { customerNumber: dto.customerNumber.trim(), deletedAt: null },
      });
      if (existing) {
        throw new BadRequestException('Kundennummer bereits vergeben.');
      }
    }

    const companyName = dto.companyName;
    const MAX_RETRIES = 3;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const customerNumber =
            dto.customerNumber?.trim() || (await this.nextCustomerNumber(tx));
          return this._createInTx(tx, dto, customerNumber, companyName);
        });
      } catch (e: unknown) {
        // Prisma unique constraint violation: P2002
        const isPrismaUnique =
          e &&
          typeof e === 'object' &&
          'code' in e &&
          (e as { code: string }).code === 'P2002';
        if (
          isPrismaUnique &&
          attempt < MAX_RETRIES - 1 &&
          !dto.customerNumber?.trim()
        ) {
          continue; // retry with next counter value
        }
        throw e;
      }
    }

    throw new BadRequestException('Kundennummer konnte nicht vergeben werden.');
  }

  private async _createInTx(
    tx: Parameters<Parameters<typeof this.prisma.$transaction>[0]>[0],
    dto: SaveCustomerDto,
    customerNumber: string,
    companyName: string,
  ) {
    {
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
    }
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

    // Branch-Lookup-Validierung VOR der Transaktion: wenn ein Kontakt
    // einen `branchName` (statt `branchId`) referenziert, muss der Name
    // unter den Branches dieses Kunden eindeutig sein. Mehrdeutige
    // Treffer werden mit 400 abgewiesen — sonst wuerde das Resultat
    // davon abhaengen, welche Branch zuerst angelegt wurde.
    if (dto.contacts && dto.branches) {
      const nameOccurrences = new Map<string, number>();
      for (const b of dto.branches) {
        if (!b.name) continue;
        nameOccurrences.set(b.name, (nameOccurrences.get(b.name) ?? 0) + 1);
      }
      const duplicateNames = [...nameOccurrences.entries()]
        .filter(([, count]) => count > 1)
        .map(([name]) => name);
      const ambiguousReferences = (dto.contacts ?? [])
        .filter((c) => !c.branchId && c.branchName)
        .map((c) => c.branchName as string)
        .filter((name) => duplicateNames.includes(name));
      if (ambiguousReferences.length > 0) {
        const unique = Array.from(new Set(ambiguousReferences));
        throw new BadRequestException(
          `Mehrdeutige branchName-Referenzen: ${unique.join(', ')}. Bitte branchId verwenden oder Standorte eindeutig benennen.`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
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

      // ── Branches: diff-basiert (Update existing, Create new, Delete missing).
      // Vorher wurde alles geloescht und neu angelegt — das hat IDs gewechselt
      // und damit `Project.branchId`-Referenzen still gekappt (onDelete:
      // SetNull). Diff-basiert bleibt die ID der unveraenderten Standorte
      // erhalten.
      if (dto.branches) {
        const existingBranches = await tx.customerBranch.findMany({
          where: { customerId: id },
        });
        const existingById = new Map(existingBranches.map((b) => [b.id, b]));
        const dtoIds = new Set(
          dto.branches.map((b) => b.id).filter((x): x is string => !!x),
        );

        // Update vorhandene mit `id`
        for (const dtoBranch of dto.branches) {
          if (dtoBranch.id && existingById.has(dtoBranch.id)) {
            await tx.customerBranch.update({
              where: { id: dtoBranch.id },
              data: {
                name: dtoBranch.name,
                addressLine1: dtoBranch.addressLine1,
                addressLine2: dtoBranch.addressLine2,
                postalCode: dtoBranch.postalCode,
                city: dtoBranch.city,
                country: dtoBranch.country,
                phone: dtoBranch.phone,
                email: dtoBranch.email,
                notes: dtoBranch.notes,
                active: dtoBranch.active ?? true,
              },
            });
          }
        }

        // Neue ohne `id` anlegen
        for (const dtoBranch of dto.branches) {
          if (!dtoBranch.id) {
            await tx.customerBranch.create({
              data: {
                customerId: id,
                name: dtoBranch.name,
                addressLine1: dtoBranch.addressLine1,
                addressLine2: dtoBranch.addressLine2,
                postalCode: dtoBranch.postalCode,
                city: dtoBranch.city,
                country: dtoBranch.country,
                phone: dtoBranch.phone,
                email: dtoBranch.email,
                notes: dtoBranch.notes,
                active: dtoBranch.active ?? true,
              },
            });
          }
        }

        // Wegfallende Branches (im DTO nicht mehr aufgelistet) loeschen.
        // FK auf Project.branchId hat onDelete=SetNull — Projekte werden
        // also genullt, was beim absichtlichen Entfernen erwuenscht ist.
        const toDeleteIds = existingBranches
          .filter((b) => !dtoIds.has(b.id))
          .map((b) => b.id);
        if (toDeleteIds.length > 0) {
          await tx.customerBranch.deleteMany({
            where: { id: { in: toDeleteIds } },
          });
        }
      }

      // ── Contacts: diff-basiert. Kritisch: Project.primaryCustomerContactId
      // hat onDelete=SetNull. Wenn ein bestehender Kontakt unveraendert bleibt,
      // muss seine ID erhalten bleiben — sonst werden alle daran haengenden
      // Projekte still ihre Hauptansprechperson verlieren.
      if (dto.contacts) {
        const existingContacts = await tx.customerContact.findMany({
          where: { customerId: id },
        });
        const existingById = new Map(existingContacts.map((c) => [c.id, c]));
        const dtoIds = new Set(
          dto.contacts.map((c) => c.id).filter((x): x is string => !!x),
        );

        // BranchName→ID Aufloesung (nach Branch-Sync, damit neue Branches
        // bereits IDs haben). Eindeutigkeit ist oben validiert.
        const branchesAfterSync = await tx.customerBranch.findMany({
          where: { customerId: id },
        });
        const branchIdByName = new Map(
          branchesAfterSync.map((b) => [b.name, b.id]),
        );

        // Update existing
        for (const dtoContact of dto.contacts) {
          if (dtoContact.id && existingById.has(dtoContact.id)) {
            await tx.customerContact.update({
              where: { id: dtoContact.id },
              data: {
                branchId:
                  dtoContact.branchId ??
                  (dtoContact.branchName
                    ? (branchIdByName.get(dtoContact.branchName) ?? null)
                    : null),
                firstName: dtoContact.firstName,
                lastName: dtoContact.lastName,
                role: dtoContact.role,
                email: dtoContact.email,
                phoneMobile: dtoContact.phoneMobile,
                phoneLandline: dtoContact.phoneLandline,
                isAccountingContact: dtoContact.isAccountingContact ?? false,
                isProjectContact: dtoContact.isProjectContact ?? false,
                isSignatory: dtoContact.isSignatory ?? false,
                notes: dtoContact.notes,
              },
            });
          }
        }

        // Create new (ohne id)
        for (const dtoContact of dto.contacts) {
          if (!dtoContact.id) {
            await tx.customerContact.create({
              data: {
                customerId: id,
                branchId:
                  dtoContact.branchId ??
                  (dtoContact.branchName
                    ? branchIdByName.get(dtoContact.branchName)
                    : undefined),
                firstName: dtoContact.firstName,
                lastName: dtoContact.lastName,
                role: dtoContact.role,
                email: dtoContact.email,
                phoneMobile: dtoContact.phoneMobile,
                phoneLandline: dtoContact.phoneLandline,
                isAccountingContact: dtoContact.isAccountingContact ?? false,
                isProjectContact: dtoContact.isProjectContact ?? false,
                isSignatory: dtoContact.isSignatory ?? false,
                notes: dtoContact.notes,
              },
            });
          }
        }

        // Loeschen, was im DTO nicht mehr ist. Project.primaryCustomerContactId
        // wird dadurch fuer entfernte Kontakte korrekt auf NULL gesetzt
        // (onDelete=SetNull) — das ist hier explizit gewuenscht, weil der
        // Anwender den Kontakt aktiv aus der Liste genommen hat.
        const toDeleteIds = existingContacts
          .filter((c) => !dtoIds.has(c.id))
          .map((c) => c.id);
        if (toDeleteIds.length > 0) {
          await tx.customerContact.deleteMany({
            where: { id: { in: toDeleteIds } },
          });
        }
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

  async removeMany(ids: string[]) {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (uniqueIds.length === 0) {
      throw new BadRequestException(
        'Mindestens ein Kunde muss zum Loeschen ausgewaehlt sein.',
      );
    }

    const targets = await this.prisma.customer.findMany({
      where: {
        id: { in: uniqueIds },
        deletedAt: null,
      },
      select: { id: true, companyName: true },
    });
    if (targets.length !== uniqueIds.length) {
      throw new NotFoundException(
        'Mindestens ein ausgewaehlter Kunde wurde nicht gefunden.',
      );
    }

    const projectCounts = await this.prisma.project.groupBy({
      by: ['customerId'],
      where: {
        customerId: { in: uniqueIds },
        deletedAt: null,
      },
      _count: { _all: true },
    });
    if (projectCounts.length > 0) {
      const nameById = new Map(targets.map((item) => [item.id, item.companyName]));
      const blocked = projectCounts
        .map((entry) => {
          const name = nameById.get(entry.customerId) ?? entry.customerId;
          return `${name} (${entry._count._all})`;
        })
        .join(', ');
      throw new BadRequestException(
        `Kunden mit aktiven Projekten koennen nicht geloescht werden: ${blocked}.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.documentLink.deleteMany({
        where: {
          entityType: 'CUSTOMER',
          entityId: { in: uniqueIds },
        },
      });
      await tx.customerContact.deleteMany({
        where: { customerId: { in: uniqueIds } },
      });
      await tx.customerBranch.deleteMany({
        where: { customerId: { in: uniqueIds } },
      });
      await tx.customer.deleteMany({
        where: { id: { in: uniqueIds } },
      });
    });

    return { deletedCount: uniqueIds.length };
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
