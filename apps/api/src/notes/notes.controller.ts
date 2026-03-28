import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { RoleCode } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { NotesService } from './notes.service';
import { CreateNoteDto, UpdateNoteDto } from './dto/save-note.dto';

type RequestWithUser = Request & {
  user?: { sub: string; type: string };
};

@Controller('notes')
@Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE, RoleCode.PROJECT_MANAGER)
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get()
  list(
    @Query('search') search?: string,
    @Query('entityType') entityType?: string,
    @Query('customerId') customerId?: string,
    @Query('contactId') contactId?: string,
    @Query('sort') sort?: string,
    @Query('phoneOnly') phoneOnly?: string,
  ) {
    return this.notesService.list({
      search,
      entityType,
      customerId,
      contactId,
      sort,
      phoneOnly,
    });
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.notesService.getById(id);
  }

  @Post()
  create(@Body() body: CreateNoteDto, @Req() request: RequestWithUser) {
    return this.notesService.create({
      ...body,
      createdByUserId: request.user!.sub,
    });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateNoteDto) {
    return this.notesService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.notesService.remove(id);
  }
}
