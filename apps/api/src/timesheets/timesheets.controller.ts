import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request } from 'express';
import { GenerateTimesheetDto } from './dto/generate-timesheet.dto';
import { SendTimesheetEmailDto } from './dto/send-timesheet-email.dto';
import { SignTimesheetDto } from './dto/sign-timesheet.dto';
import { TimesheetsService } from './timesheets.service';
import type { Response } from 'express';

@Controller('timesheets')
export class TimesheetsController {
  constructor(private readonly timesheetsService: TimesheetsService) {}

  @Get('weekly')
  list(
    @Query('workerId') workerId?: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.timesheetsService.list(workerId, projectId);
  }

  @Post('weekly')
  generate(@Body() dto: GenerateTimesheetDto) {
    return this.timesheetsService.generate(dto);
  }

  @Post(':id/worker-sign')
  signWorker(
    @Param('id') id: string,
    @Body() dto: SignTimesheetDto,
    @Req() request: Request,
  ) {
    return this.timesheetsService.signWorker(id, dto, request.ip);
  }

  @Post(':id/customer-sign')
  signCustomer(
    @Param('id') id: string,
    @Body() dto: SignTimesheetDto,
    @Req() request: Request,
  ) {
    return this.timesheetsService.signCustomer(id, dto, request.ip);
  }

  @Get(':id/pdf')
  async downloadPdf(@Param('id') id: string, @Res() response: Response) {
    const pdf = await this.timesheetsService.renderPdf(id);

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="wochenzettel-${id}.pdf"`,
    );

    return response.send(pdf);
  }

  @Post(':id/send-email')
  sendEmail(@Param('id') id: string, @Body() dto: SendTimesheetEmailDto) {
    return this.timesheetsService.sendEmail(id, dto);
  }
}
