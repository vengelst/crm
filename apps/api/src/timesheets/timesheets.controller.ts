import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request } from 'express';
import { RoleCode } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { GenerateTimesheetDto } from './dto/generate-timesheet.dto';
import { SendTimesheetEmailDto } from './dto/send-timesheet-email.dto';
import { SignTimesheetDto } from './dto/sign-timesheet.dto';
import { TimesheetsService } from './timesheets.service';
import type { Response } from 'express';

type RequestWithUser = Request & {
  user?: {
    sub: string;
    workerId?: string;
    type: 'user' | 'worker' | 'kiosk-user';
  };
};

@Controller('timesheets')
@Roles(
  RoleCode.SUPERADMIN,
  RoleCode.OFFICE,
  RoleCode.PROJECT_MANAGER,
  RoleCode.WORKER,
)
export class TimesheetsController {
  constructor(private readonly timesheetsService: TimesheetsService) {}

  @Get('weekly')
  list(
    @Query('workerId') workerId?: string,
    @Query('projectId') projectId?: string,
    @Query('includeWorkWeeks') includeWorkWeeks?: string,
    @Req() request?: RequestWithUser,
  ) {
    this.rejectKioskUser(request);
    const withWorkWeeks = includeWorkWeeks === 'true';
    // Worker: nur eigene Stundenzettel
    if (request?.user?.type === 'worker') {
      const ownId = request.user.workerId ?? request.user.sub;
      return this.timesheetsService.list(ownId, projectId, withWorkWeeks);
    }
    return this.timesheetsService.list(workerId, projectId, withWorkWeeks);
  }

  @Post('weekly')
  @Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE, RoleCode.PROJECT_MANAGER)
  generate(@Body() dto: GenerateTimesheetDto) {
    return this.timesheetsService.generate(dto);
  }

  @Post(':id/worker-sign')
  async signWorker(
    @Param('id') id: string,
    @Body() dto: SignTimesheetDto,
    @Req() request: RequestWithUser,
  ) {
    this.rejectKioskUser(request);
    if (request.user?.type === 'worker') {
      await this.assertWorkerOwnership(request, id);
    }
    return this.timesheetsService.signWorker(id, dto, request.ip);
  }

  @Post(':id/customer-sign')
  @Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE, RoleCode.PROJECT_MANAGER)
  signCustomer(
    @Param('id') id: string,
    @Body() dto: SignTimesheetDto,
    @Req() request: RequestWithUser,
  ) {
    return this.timesheetsService.signCustomer(id, dto, request.ip);
  }

  @Get(':id/pdf')
  async downloadPdf(
    @Param('id') id: string,
    @Query('lang') lang: string | undefined,
    @Res() response: Response,
    @Req() request: RequestWithUser,
  ) {
    this.rejectKioskUser(request);
    if (request.user?.type === 'worker') {
      await this.assertWorkerOwnership(request, id);
    }
    const pdfLang = lang === 'en' ? 'en' : undefined;
    return this.timesheetsService.renderPdf(id, pdfLang).then((pdf) => {
      response.setHeader('Content-Type', 'application/pdf');
      response.setHeader(
        'Content-Disposition',
        `attachment; filename="wochenzettel-${id}.pdf"`,
      );
      response.send(pdf);
    });
  }

  @Post(':id/send-email')
  @Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE, RoleCode.PROJECT_MANAGER)
  sendEmail(@Param('id') id: string, @Body() dto: SendTimesheetEmailDto) {
    return this.timesheetsService.sendEmail(id, dto);
  }

  @Post(':id/approve')
  @Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE)
  approve(
    @Param('id') id: string,
    @Body() body: { comment?: string },
    @Req() request: RequestWithUser,
  ) {
    return this.timesheetsService.approve(id, {
      comment: body.comment,
      userId: request.user!.sub,
    });
  }

  @Post(':id/mark-billed')
  @Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE)
  markBilled(@Param('id') id: string, @Req() request: RequestWithUser) {
    return this.timesheetsService.markBilled(id, request.user!.sub);
  }

  private async assertWorkerOwnership(
    request: RequestWithUser,
    timesheetId: string,
  ) {
    const ownId = request.user?.workerId ?? request.user?.sub;
    const sheet = await this.timesheetsService.getById(timesheetId);
    if (sheet.workerId !== ownId) {
      throw new ForbiddenException(
        'Zugriff nur auf eigene Stundenzettel erlaubt.',
      );
    }
  }

  private rejectKioskUser(request?: RequestWithUser) {
    if (request?.user?.type === 'kiosk-user') {
      throw new ForbiddenException(
        'Stundenzettel sind fuer Kiosk-Benutzer nicht verfuegbar.',
      );
    }
  }
}
