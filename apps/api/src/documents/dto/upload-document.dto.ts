import { IsIn, IsOptional, IsString } from 'class-validator';
import { VALID_DOCUMENT_TYPE_VALUES } from '../document-types';

export class UploadDocumentDto {
  @IsString()
  @IsIn(VALID_DOCUMENT_TYPE_VALUES)
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
