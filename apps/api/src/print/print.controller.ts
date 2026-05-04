import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { RoleCode } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { PrintBundleDto } from './dto/print-bundle.dto';
import { PrintService } from './print.service';

type RequestWithUser = Request & {
  user?: {
    sub: string;
    type: 'user' | 'worker' | 'kiosk-user';
    permissions?: string[];
  };
};

@Controller('print')
@Roles(RoleCode.SUPERADMIN, RoleCode.OFFICE, RoleCode.PROJECT_MANAGER)
export class PrintController {
  constructor(private readonly printService: PrintService) {}

  /**
   * Build and stream a single PDF bundle composed of selected sections plus
   * the appendix of selected documents.
   *
   * Permissions are enforced inside the service because the required code
   * depends on the request body's `entityType` (and on whether documents are
   * included). The controller-level `@Roles` keeps this hard-closed to
   * worker/kiosk-only tokens.
   */
  @Post('bundle')
  async bundle(
    @Body() dto: PrintBundleDto,
    @Req() request: RequestWithUser,
    @Res() response: Response,
  ): Promise<void> {
    const perms = request.user?.permissions ?? [];
    const { pdf, filename, skippedDocuments } =
      await this.printService.buildBundle(dto, perms);

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeFilename(filename)}"`,
    );
    response.setHeader('Content-Length', pdf.length.toString());
    if (skippedDocuments > 0) {
      response.setHeader('X-Print-Skipped-Documents', String(skippedDocuments));
    }
    response.end(pdf);
  }
}

/**
 * RFC 5987-style filename quoting so umlauts/spaces survive the
 * Content-Disposition round-trip (browsers vary).
 */
function encodeFilename(name: string): string {
  // Strip CR/LF and quotes, then encode non-ASCII for safety.
  return name
    .replace(/[\r\n"]/g, '')
    .replace(/[^\x20-\x7E]/g, (ch) => encodeURIComponent(ch).replace(/%/g, ''));
}
