import { IsOptional, IsString } from 'class-validator';

export class UploadDocumentDto {
  @IsString()
  documentType!: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;
}
