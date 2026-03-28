import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotesService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly noteInclude = {
    customer: { select: { id: true, companyName: true, customerNumber: true } },
    contact: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        customer: { select: { id: true, companyName: true, customerNumber: true } },
      },
    },
    createdBy: { select: { id: true, displayName: true, email: true } },
  };

  async list(query: {
    search?: string;
    entityType?: string;
    customerId?: string;
    contactId?: string;
    sort?: string;
    phoneOnly?: string;
  }) {
    const where: Record<string, unknown> = {};

    if (query.entityType) where.entityType = query.entityType;
    if (query.customerId) where.customerId = query.customerId;
    if (query.contactId) where.contactId = query.contactId;
    if (query.phoneOnly === 'true') where.isPhoneNote = true;
    if (query.phoneOnly === 'false') where.isPhoneNote = false;
    if (query.search) {
      where.OR = [
        { content: { contains: query.search, mode: 'insensitive' } },
        { title: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const orderBy =
      query.sort === 'asc' ? { createdAt: 'asc' as const } : { createdAt: 'desc' as const };

    return this.prisma.note.findMany({
      where,
      include: this.noteInclude,
      orderBy,
      take: 200,
    });
  }

  async getById(id: string) {
    const note = await this.prisma.note.findUnique({
      where: { id },
      include: this.noteInclude,
    });
    if (!note) throw new NotFoundException('Notiz nicht gefunden.');
    return note;
  }

  async create(data: {
    entityType: string;
    customerId?: string;
    contactId?: string;
    title?: string;
    content: string;
    isPhoneNote?: boolean;
    createdByUserId: string;
  }) {
    if (data.entityType === 'CUSTOMER' && !data.customerId) {
      throw new BadRequestException('customerId ist erforderlich fuer Kundennotizen.');
    }
    if (data.entityType === 'CONTACT' && !data.contactId) {
      throw new BadRequestException('contactId ist erforderlich fuer Kontaktnotizen.');
    }

    // If contact, resolve customer automatically
    if (data.entityType === 'CONTACT' && data.contactId) {
      const contact = await this.prisma.customerContact.findUnique({
        where: { id: data.contactId },
        select: { customerId: true },
      });
      if (!contact) throw new BadRequestException('Ansprechpartner nicht gefunden.');
      data.customerId = contact.customerId;
    }

    return this.prisma.note.create({
      data: {
        entityType: data.entityType,
        customerId: data.customerId,
        contactId: data.contactId,
        title: data.title,
        content: data.content,
        isPhoneNote: data.isPhoneNote ?? false,
        createdByUserId: data.createdByUserId,
      },
      include: this.noteInclude,
    });
  }

  async update(id: string, data: { title?: string; content?: string; isPhoneNote?: boolean }) {
    await this.getById(id);
    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.content !== undefined) updateData.content = data.content;
    if (data.isPhoneNote !== undefined) updateData.isPhoneNote = data.isPhoneNote;
    return this.prisma.note.update({
      where: { id },
      data: updateData,
      include: this.noteInclude,
    });
  }

  async remove(id: string) {
    await this.getById(id);
    return this.prisma.note.delete({ where: { id } });
  }
}
