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

  async archive(id: string) {
    await this.getById(id);

    return this.prisma.customer.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'INACTIVE',
      },
    });
  }
}
